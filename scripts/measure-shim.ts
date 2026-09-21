/**
 * measure-shim.ts — the decision shim, prototyped and timed.
 *
 * Jev sends one request containing many independent closed questions and aborts
 * at 1.8 s. A local model answering them one at a time cannot make that. This is
 * the shape that can: questions that offer the SAME option set are asked in one
 * pass, and the per-position logprobs keep a separate distribution for each.
 *
 * Grouping is not a trick played on the schema. The composer states that its
 * questions within one call are independent and that the note questions are
 * "parallel choices against the SAME past", so asking them together is what the
 * design already says they are. Every answer is still validated by this repo's
 * own parseAnswers before any timing is reported.
 */
import { readFileSync } from 'node:fs';
import { parseAnswers } from '../server/jev.js';
import type { ChoiceQuestion, JevRequest } from '../shared/music.js';

const ENDPOINT = process.env.KB_ENDPOINT || 'http://127.0.0.1:11434/v1/chat/completions';
const MODEL = process.env.KB_MODEL || 'kannaka-brain-7b-v1:latest';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const FLOOR = Math.exp(-18);
/** Group questions that share an option set once there are at least this many. */
const BATCH_MIN = 3;

type Dist = { probabilities: Record<string, number>; choice: string; top: number };

const post = async (body: unknown) => {
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

/** Qwen merges a separator into the following letter: ',E' is one token, one note. */
const letterOf = (raw: unknown): string | null => {
  const s = String(raw ?? '').replace(/[^A-Za-z]/g, '');
  return s.length === 1 ? s.toUpperCase() : null;
};

function distribution(top: { token: string; logprob: number }[], options: string[]): Dist {
  const weights = new Map<string, number>();
  for (const entry of top) {
    const letter = letterOf(entry.token);
    if (!letter) continue;
    const index = LETTERS.indexOf(letter);
    if (index < 0 || index >= options.length) continue;
    if (!weights.has(options[index]!)) weights.set(options[index]!, Math.exp(entry.logprob));
  }
  let total = 0;
  for (const o of options) total += weights.get(o) ?? FLOOR;
  const probabilities: Record<string, number> = {};
  for (const o of options) probabilities[o] = (weights.get(o) ?? FLOOR) / total;
  let choice = options[0]!;
  for (const o of options) if (probabilities[o]! > probabilities[choice]!) choice = o;
  return { probabilities, choice, top: probabilities[choice]! };
}

const menuOf = (q: ChoiceQuestion) =>
  Object.entries(q.criteria)
    .map(([, d], i) => `${LETTERS[i]}) ${d}`)
    .join('\n');

const captured = JSON.parse(readFileSync('scripts/jev-requests.json', 'utf8')) as Record<
  string,
  JevRequest
>;
const role = process.argv[2] || 'guitar';
const concurrency = Number(process.argv[3] || 8);
const request = captured[role]!;
const questions = request.questions as Record<string, ChoiceQuestion>;
const sys =
  `You are a musician in an improvising band, answering closed questions.\n` +
  `Answer with letters only.\n\nROLE: ${role}\nMUSICAL STATE:\n${JSON.stringify(request.state, null, 1)}\n`;

// Group by identical option set.
const groups = new Map<string, string[]>();
for (const [key, q] of Object.entries(questions)) {
  const signature = JSON.stringify(Object.keys(q.criteria));
  groups.set(signature, [...(groups.get(signature) ?? []), key]);
}
const batched = [...groups.values()].filter((keys) => keys.length >= BATCH_MIN);
const singles = [...groups.values()].filter((keys) => keys.length < BATCH_MIN).flat();

async function askBatch(keys: string[]): Promise<Record<string, Dist>> {
  const q = questions[keys[0]!]!;
  const options = Object.keys(q.criteria);
  const payload = await post({
    model: MODEL,
    messages: [
      { role: 'system', content: sys },
      {
        role: 'user',
        content:
          `Answer all ${keys.length} of these at once. They are independent, parallel choices against the same past.\n\n` +
          keys.map((k, i) => `${i + 1}. ${k}: ${questions[k]!.instructions}`).join('\n') +
          `\n\nOptions (the same for every one):\n${menuOf(q)}\n\n` +
          `Answer with exactly ${keys.length} letters separated by commas, in order:`,
      },
    ],
    max_tokens: keys.length * 3,
    temperature: 0,
    logprobs: true,
    top_logprobs: 20,
  });
  const content = payload.choices?.[0]?.logprobs?.content ?? [];
  const out: Record<string, Dist> = {};
  let position = 0;
  for (const token of content) {
    if (!letterOf(token.token)) continue;
    if (position >= keys.length) break;
    out[keys[position]!] = distribution(token.top_logprobs ?? [], options);
    position++;
  }
  // A short answer must not silently become a missing key; parseAnswers is the judge.
  return out;
}

async function askSingle(key: string): Promise<Record<string, Dist>> {
  const q = questions[key]!;
  const payload = await post({
    model: MODEL,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: `${q.instructions}\n\n${menuOf(q)}\n\nAnswer (one letter):` },
    ],
    max_tokens: 1,
    temperature: 0,
    logprobs: true,
    top_logprobs: 20,
  });
  const top = payload.choices?.[0]?.logprobs?.content?.[0]?.top_logprobs ?? [];
  return { [key]: distribution(top, Object.keys(q.criteria)) };
}

const started = performance.now();
const jobs: (() => Promise<Record<string, Dist>>)[] = [
  ...batched.map((keys) => () => askBatch(keys)),
  ...singles.map((key) => () => askSingle(key)),
];
const collected: Record<string, Dist> = {};
for (let i = 0; i < jobs.length; i += concurrency) {
  for (const part of await Promise.all(jobs.slice(i, i + concurrency).map((j) => j())))
    Object.assign(collected, part);
}
const wall = performance.now() - started;

const answers = Object.fromEntries(
  Object.entries(collected).map(([k, v]) => [k, { choice: v.choice, probabilities: v.probabilities }]),
);
let accepted = true;
let why = '';
try {
  parseAnswers({ answers }, request);
} catch (error) {
  accepted = false;
  why = (error as Error).message;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const tops = Object.values(collected).map((d) => d.top);
const noteKeys = Object.keys(questions).filter((k) => /^note\d$/.test(k));
const melodyTops = noteKeys.filter((k) => collected[k]).map((k) => collected[k]!.top);

console.log(`\n=== ${role} — grouped shim  (${Object.keys(questions).length} questions)`);
console.log(
  `  calls:             ${jobs.length}  (${batched.length} batched of ${batched.map((b) => b.length).join('+')}, ${singles.length} single)`,
);
console.log(`  answered:          ${Object.keys(collected).length}/${Object.keys(questions).length}`);
console.log(`  parseAnswers:      ${accepted ? 'ACCEPTED' : `REJECTED — ${why}`}`);
console.log(
  `  wall clock:        ${(wall / 1000).toFixed(2)} s   [budget 1.80 s]   ${wall < 1800 ? 'WITHIN BUDGET' : `over by ${((wall - 1800) / 1000).toFixed(2)} s`}`,
);
console.log(
  `  top probability:   all ${mean(tops).toFixed(3)}   melody ${melodyTops.length ? mean(melodyTops).toFixed(3) : 'n/a'}`,
);
console.log(`  degenerate(>=.97): ${tops.filter((t) => t >= 0.97).length} of ${tops.length}`);
