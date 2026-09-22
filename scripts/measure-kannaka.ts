/**
 * measure-kannaka.ts — can a locally served model be a Jev?
 *
 * Two numbers decide it, and nothing else:
 *   1. wall clock to a COMPLETE answer set that this repo's own parseAnswers accepts
 *   2. whether the distributions are non-degenerate, because the music comes out
 *      of the sampling, not out of the argmax
 *
 * Method. Every question is a closed multiple choice, so each option is labelled
 * with a letter and the model is asked for exactly one token. The top logprobs
 * over those letters, softmaxed and renormalised, ARE the distribution — this is
 * read out of the model rather than asked of it, which is the one thing a local
 * model can do more honestly than a hosted chat endpoint.
 *
 * The shared musical state goes in a constant system prefix so the KV cache is
 * reused across the questions of one request; only the question varies.
 *
 * Validation is deliberately not mine: the assembled answers are handed to the
 * real parseAnswers from server/jev.ts. If it throws, the run failed.
 */
import { readFileSync } from 'node:fs';
import { parseAnswers } from '../server/jev.js';
import type { ChoiceQuestion, JevRequest } from '../shared/music.js';

const ENDPOINT = process.env.KB_ENDPOINT || 'http://127.0.0.1:11434/v1/chat/completions';
const MODEL = process.env.KB_MODEL || 'kannaka-brain-7b-v1:latest';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const FLOOR = Math.exp(-18); // an option the model never considered: small, not zero

interface Asked {
  key: string;
  ms: number;
  probabilities: Record<string, number>;
  choice: string;
  top: number;
  entropy: number;
  effective: number;
  covered: number;
  options: number;
}

function systemPrefix(request: JevRequest, role: string): string {
  return (
    `You are a musician in an improvising band, answering one closed question at a time.\n` +
    `Answer with a single letter and nothing else.\n\n` +
    `ROLE: ${role}\n` +
    `MUSICAL STATE:\n${JSON.stringify(request.state, null, 1)}\n`
  );
}

function ask(key: string, q: ChoiceQuestion): string {
  const options = Object.entries(q.criteria);
  const lines = options.map(([, desc], i) => `${LETTERS[i]}) ${desc}`).join('\n');
  return `${q.instructions}\n\n${lines}\n\nAnswer (one letter):`;
}

async function askOne(system: string, key: string, q: ChoiceQuestion): Promise<Asked> {
  const options = Object.keys(q.criteria);
  if (options.length > LETTERS.length) throw new Error(`too many options: ${key}`);
  const started = performance.now();
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: ask(key, q) },
      ],
      max_tokens: 1,
      temperature: 0,
      logprobs: true,
      top_logprobs: 20,
    }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} on ${key}`);
  const payload = await response.json();
  const ms = performance.now() - started;
  const top = payload.choices?.[0]?.logprobs?.content?.[0]?.top_logprobs ?? [];

  // Collect the logprob of each option's letter. Case-insensitive, first hit wins.
  const weights = new Map<string, number>();
  for (const entry of top) {
    const token = String(entry.token ?? '').trim();
    if (token.length !== 1) continue;
    const index = LETTERS.indexOf(token.toUpperCase());
    if (index < 0 || index >= options.length) continue;
    const option = options[index]!;
    if (!weights.has(option)) weights.set(option, Math.exp(entry.logprob));
  }
  const covered = weights.size;
  let total = 0;
  for (const option of options) total += weights.get(option) ?? FLOOR;
  const probabilities: Record<string, number> = {};
  for (const option of options) probabilities[option] = (weights.get(option) ?? FLOOR) / total;

  let best = options[0]!;
  for (const option of options) if (probabilities[option]! > probabilities[best]!) best = option;
  const entropy = -options.reduce((sum, o) => {
    const p = probabilities[o]!;
    return sum + (p > 0 ? p * Math.log(p) : 0);
  }, 0);

  return {
    key,
    ms,
    probabilities,
    choice: best,
    top: probabilities[best]!,
    entropy,
    effective: Math.exp(entropy),
    covered,
    options: options.length,
  };
}

async function run(name: string, request: JevRequest, concurrency: number) {
  const system = systemPrefix(request, name);
  const keys = Object.keys(request.questions);
  const results: Asked[] = [];
  const started = performance.now();
  for (let i = 0; i < keys.length; i += concurrency) {
    const slice = keys.slice(i, i + concurrency);
    results.push(
      ...(await Promise.all(
        slice.map((k) => askOne(system, k, request.questions[k] as ChoiceQuestion)),
      )),
    );
  }
  const wall = performance.now() - started;

  // The real gate. Not my opinion of the answers — the repo's.
  const answers = Object.fromEntries(
    results.map((r) => [r.key, { choice: r.choice, probabilities: r.probabilities }]),
  );
  let accepted = true;
  let why = '';
  try {
    parseAnswers({ answers }, request);
  } catch (error) {
    accepted = false;
    why = (error as Error).message;
  }

  const sorted = [...results].sort((a, b) => a.top - b.top);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const degenerate = results.filter((r) => r.top >= 0.97).length;

  console.log(`\n=== ${name}  (${keys.length} questions, concurrency ${concurrency})`);
  console.log(`  parseAnswers:      ${accepted ? 'ACCEPTED' : `REJECTED — ${why}`}`);
  console.log(`  wall clock:        ${(wall / 1000).toFixed(2)} s   [budget 1.80 s]`);
  console.log(`  per question:      mean ${mean(results.map((r) => r.ms)).toFixed(0)} ms`);
  console.log(
    `  top probability:   mean ${mean(results.map((r) => r.top)).toFixed(3)}  ` +
      `min ${sorted[0]!.top.toFixed(3)}  max ${sorted.at(-1)!.top.toFixed(3)}`,
  );
  console.log(
    `  effective options: mean ${mean(results.map((r) => r.effective)).toFixed(2)} ` +
      `of ${mean(results.map((r) => r.options)).toFixed(1)} offered`,
  );
  console.log(`  degenerate (>=.97): ${degenerate} of ${results.length}`);
  console.log(`  letters seen in top-20: mean ${mean(results.map((r) => r.covered)).toFixed(1)}`);
  console.log('  least certain:');
  for (const r of sorted.slice(0, 3))
    console.log(
      `     ${r.key.padEnd(12)} top ${r.top.toFixed(3)} -> ${r.choice.padEnd(12)} ` +
        `eff ${r.effective.toFixed(2)}/${r.options}`,
    );
  console.log('  most certain:');
  for (const r of sorted.slice(-3).reverse())
    console.log(
      `     ${r.key.padEnd(12)} top ${r.top.toFixed(3)} -> ${r.choice.padEnd(12)} ` +
        `eff ${r.effective.toFixed(2)}/${r.options}`,
    );
  return { name, wall, accepted, results };
}

const captured = JSON.parse(readFileSync('scripts/jev-requests.json', 'utf8')) as Record<
  string,
  JevRequest
>;
const which = process.argv[2] || 'guitar';
const concurrency = Number(process.argv[3] || 1);
await run(which, captured[which]!, concurrency);
