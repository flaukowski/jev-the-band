/**
 * measure-batched.ts — does batching the melody close the 1.8 s gap?
 *
 * The per-question harness lands a guitar phrase at ~2.95 s against Jev's
 * 1.8 s abort. The eight note questions are the obvious target: the composer
 * itself calls them "parallel choices against the SAME past", so asking them
 * in one pass is not a shortcut around the design, it is the design.
 *
 * One call emits eight letters. Logprobs are read at EACH position, so every
 * note still gets its own distribution — the thing that must not be lost, since
 * the melody is where the entropy lives.
 */
import { readFileSync } from 'node:fs';
import { parseAnswers } from '../server/jev.js';
import type { ChoiceQuestion, JevRequest } from '../shared/music.js';

const ENDPOINT = process.env.KB_ENDPOINT || 'http://127.0.0.1:11434/v1/chat/completions';
const MODEL = process.env.KB_MODEL || 'kannaka-brain-7b-v1:latest';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const FLOOR = Math.exp(-18);

const post = async (body: unknown) => {
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

/**
 * The letter inside a token, or null.
 *
 * Qwen's tokenizer merges a separator with the letter that follows it, so a
 * comma-separated melody arrives as ['A', ',E', ',D', ',G'] — still exactly one
 * token per note, which is what keeps per-position logprobs available. A parser
 * that demanded a bare single character found none of them and silently
 * produced an empty melody.
 */
function letterOf(raw: unknown): string | null {
  const stripped = String(raw ?? '').replace(/[^A-Za-z]/g, '');
  return stripped.length === 1 ? stripped.toUpperCase() : null;
}

function distribution(top: { token: string; logprob: number }[], options: string[]) {
  const weights = new Map<string, number>();
  for (const entry of top) {
    const token = letterOf(entry.token);
    if (!token) continue;
    const index = LETTERS.indexOf(token);
    if (index < 0 || index >= options.length) continue;
    if (!weights.has(options[index]!)) weights.set(options[index]!, Math.exp(entry.logprob));
  }
  let total = 0;
  for (const o of options) total += weights.get(o) ?? FLOOR;
  const probabilities: Record<string, number> = {};
  for (const o of options) probabilities[o] = (weights.get(o) ?? FLOOR) / total;
  let best = options[0]!;
  for (const o of options) if (probabilities[o]! > probabilities[best]!) best = o;
  return { probabilities, choice: best, top: probabilities[best]! };
}

const system = (request: JevRequest, role: string) =>
  `You are a musician in an improvising band, answering closed questions.\n` +
  `Answer with letters only.\n\nROLE: ${role}\nMUSICAL STATE:\n${JSON.stringify(request.state, null, 1)}\n`;

const single = (q: ChoiceQuestion) =>
  `${q.instructions}\n\n${Object.entries(q.criteria)
    .map(([, d], i) => `${LETTERS[i]}) ${d}`)
    .join('\n')}\n\nAnswer (one letter):`;

const captured = JSON.parse(readFileSync('scripts/jev-requests.json', 'utf8')) as Record<
  string,
  JevRequest
>;
const role = process.argv[2] || 'guitar';
const concurrency = Number(process.argv[3] || 8);
const request = captured[role]!;
const sys = system(request, role);

const noteKeys = Object.keys(request.questions).filter((k) => /^note\d$/.test(k));
const otherKeys = Object.keys(request.questions).filter((k) => !/^note\d$/.test(k));
const degrees = Object.keys((request.questions[noteKeys[0]!] as ChoiceQuestion).criteria);

const started = performance.now();

// One call for the whole melody: eight positions, eight distributions.
const melody = (async () => {
  const q = request.questions[noteKeys[0]!] as ChoiceQuestion;
  const menu = Object.entries(q.criteria)
    .map(([, d], i) => `${LETTERS[i]}) ${d}`)
    .join('\n');
  const payload = await post({
    model: MODEL,
    messages: [
      { role: 'system', content: sys },
      {
        role: 'user',
        content:
          `Choose the scale degree for all ${noteKeys.length} positions of your motif, in order. ` +
          `These are parallel choices against the same past. Respond to the previous motif and the other players.\n\n` +
          // Comma-separated on purpose. Run together, the tokenizer merges letters
          // into multi-letter chunks and the per-position logprobs are gone; with
          // separators each note is its own token and keeps its own distribution.
          `${menu}\n\nAnswer with exactly ${noteKeys.length} letters separated by commas, e.g. A,C,B,E,A,G,C,A :`,
      },
    ],
    max_tokens: noteKeys.length * 3,
    temperature: 0,
    logprobs: true,
    top_logprobs: 20,
  });
  const content = payload.choices?.[0]?.logprobs?.content ?? [];
  const out: Record<string, ReturnType<typeof distribution>> = {};
  let position = 0;
  for (const token of content) {
    if (!letterOf(token.token)) continue;
    if (position >= noteKeys.length) break;
    out[noteKeys[position]!] = distribution(token.top_logprobs ?? [], degrees);
    position++;
  }
  return { out, emitted: position, raw: payload.choices?.[0]?.message?.content ?? '' };
})();

// Everything else, still one question per call, at the best concurrency found.
const rest = (async () => {
  const out: Record<string, ReturnType<typeof distribution>> = {};
  for (let i = 0; i < otherKeys.length; i += concurrency) {
    const slice = otherKeys.slice(i, i + concurrency);
    await Promise.all(
      slice.map(async (k) => {
        const q = request.questions[k] as ChoiceQuestion;
        const payload = await post({
          model: MODEL,
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: single(q) },
          ],
          max_tokens: 1,
          temperature: 0,
          logprobs: true,
          top_logprobs: 20,
        });
        const top = payload.choices?.[0]?.logprobs?.content?.[0]?.top_logprobs ?? [];
        out[k] = distribution(top, Object.keys(q.criteria));
      }),
    );
  }
  return out;
})();

const [m, r] = await Promise.all([melody, rest]);
const wall = performance.now() - started;

const answers: Record<string, { choice: string; probabilities: Record<string, number> }> = {};
for (const [k, v] of Object.entries(r)) answers[k] = { choice: v.choice, probabilities: v.probabilities };
for (const [k, v] of Object.entries(m.out))
  answers[k] = { choice: v.choice, probabilities: v.probabilities };

let accepted = true;
let why = '';
try {
  parseAnswers({ answers }, request);
} catch (error) {
  accepted = false;
  why = (error as Error).message;
}

const tops = Object.values(answers).map((a) => Math.max(...Object.values(a.probabilities)));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const noteTops = noteKeys.filter((k) => answers[k]).map((k) => Math.max(...Object.values(answers[k]!.probabilities)));

console.log(`\n=== ${role}, melody batched  (${Object.keys(request.questions).length} questions)`);
console.log(`  calls:             ${otherKeys.length} + 1 batched = ${otherKeys.length + 1}  (was ${Object.keys(request.questions).length})`);
console.log(`  melody letters:    ${m.emitted}/${noteKeys.length} emitted   raw ${JSON.stringify(m.raw)}`);
console.log(`  parseAnswers:      ${accepted ? 'ACCEPTED' : `REJECTED — ${why}`}`);
console.log(`  wall clock:        ${(wall / 1000).toFixed(2)} s   [budget 1.80 s]  ${wall < 1800 ? 'WITHIN' : 'OVER'}`);
console.log(`  top probability:   mean ${mean(tops).toFixed(3)}  melody mean ${noteTops.length ? mean(noteTops).toFixed(3) : 'n/a'}`);
console.log(`  degenerate(>=.97): ${tops.filter((t) => t >= 0.97).length} of ${tops.length}`);
