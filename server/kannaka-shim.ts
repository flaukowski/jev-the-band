/**
 * kannaka-shim.ts — a Jev that runs on your own machine.
 *
 * Jev's decision layer is a wire contract, not a model: a POST carrying closed
 * questions, a response carrying a distribution over each question's own
 * options, and five mechanical rules in `parseAnswers`. Anything that answers
 * that shape can hold an instrument. This answers it with a locally served
 * model — kannaka-brain on Ollama by default.
 *
 * It is a ROUTING PROXY rather than a replacement. A request it is configured
 * to take, it answers; anything else it forwards upstream untouched. That is
 * what lets one role move in-house without the band noticing, and it is why
 * nothing in `server/room.ts` changes: Jev is pointed at one endpoint, and the
 * endpoint decides who answers.
 *
 * Measured on 2026-09-21 (7B q4_K_M, Ollama, concurrency 8): LUX answers its
 * eight questions in 1.17 s against Jev's 1.8 s abort, with room to spare.
 * The four musicians do not fit yet — 2.4 to 2.7 s — so the default route is
 * the lighting desk alone. Widen KANNAKA_ROLES when the hardware earns it.
 *
 * The distribution is READ from the model's own logprobs over the option
 * letters, never asked for in prose. A model asked to state its confidence
 * states a number; a model read at the logits reveals one.
 */

import type { ChoiceQuestion, JevRequest } from '../shared/music.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** An option the model never put in its top-k. Small, deliberately not zero. */
const FLOOR = Math.exp(-18);
/** Ask questions together once this many share an option set. */
export const BATCH_MIN = 3;

export interface TopLogprob {
  token: string;
  logprob: number;
}
export interface CompletionToken {
  token: string;
  top_logprobs: TopLogprob[];
}
export interface Completion {
  text: string;
  tokens: CompletionToken[];
}
/** The one impure thing, injected so the shim is testable without a model. */
export type Complete = (
  system: string,
  user: string,
  maxTokens: number,
) => Promise<Completion>;

export interface Distribution {
  probabilities: Record<string, number>;
  choice: string;
}

/**
 * The letter inside one token, or null.
 *
 * Qwen's tokenizer merges a separator into the letter after it, so a
 * comma-separated answer arrives as ['A', ',F', ',D'] — one token per answer,
 * which is exactly what keeps a separate distribution for each. Run the letters
 * together instead and the tokenizer merges THEM ('ED', 'FG'), the per-position
 * logprobs are gone, and the batch silently yields nothing. Both failures were
 * observed; this is why answers are comma-separated and parsed loosely.
 */
export function letterOf(raw: unknown): string | null {
  const stripped = String(raw ?? '').replace(/[^A-Za-z]/g, '');
  return stripped.length === 1 ? stripped.toUpperCase() : null;
}

/**
 * Turn the model's top-k over the option letters into a distribution that
 * `parseAnswers` will accept: every option present, finite, summing to one.
 */
export function distribute(top: TopLogprob[], options: string[]): Distribution {
  const weights = new Map<string, number>();
  for (const entry of top) {
    const letter = letterOf(entry.token);
    if (!letter) continue;
    const index = LETTERS.indexOf(letter);
    if (index < 0 || index >= options.length) continue;
    const option = options[index]!;
    // First occurrence wins: top-k is ordered, and 'a' after 'A' is the same choice.
    if (!weights.has(option)) weights.set(option, Math.exp(entry.logprob));
  }
  let total = 0;
  for (const option of options) total += weights.get(option) ?? FLOOR;
  const probabilities: Record<string, number> = {};
  for (const option of options) probabilities[option] = (weights.get(option) ?? FLOOR) / total;
  let choice = options[0]!;
  for (const option of options) if (probabilities[option]! > probabilities[choice]!) choice = option;
  return { probabilities, choice };
}

export const menuOf = (q: ChoiceQuestion): string =>
  Object.entries(q.criteria)
    .map(([, description], i) => `${LETTERS[i]}) ${description}`)
    .join('\n');

/**
 * Split the questions into batches that share an option set, plus singles.
 *
 * Grouping is not a liberty taken with the schema. The composer states that the
 * questions within one call are independent, and calls the note questions
 * "parallel choices against the SAME past", so asking them together is what
 * they already are. It buys real time — and it costs real variety, measured at
 * mean top probability 0.60 rising to 0.75 when grouped — so only groups of
 * BATCH_MIN or more are worth the trade.
 */
export function groupQuestions(questions: Record<string, ChoiceQuestion>): {
  batches: string[][];
  singles: string[];
} {
  const bySignature = new Map<string, string[]>();
  for (const [key, q] of Object.entries(questions)) {
    const signature = JSON.stringify(Object.keys(q.criteria));
    bySignature.set(signature, [...(bySignature.get(signature) ?? []), key]);
  }
  const batches: string[][] = [];
  const singles: string[] = [];
  for (const keys of bySignature.values())
    if (keys.length >= BATCH_MIN) batches.push(keys);
    else singles.push(...keys);
  return { batches, singles };
}

export function systemPrompt(request: JevRequest): string {
  const persona = (request.state as { persona?: { name?: string; philosophy?: string } })?.persona;
  return (
    `You are ${persona?.name ?? 'a member'} of an improvising band, answering closed questions.\n` +
    `${persona?.philosophy ?? ''}\n` +
    `Answer with letters only. No words, no explanation.\n\n` +
    `MUSICAL STATE:\n${JSON.stringify(request.state, null, 1)}\n`
  );
}

const singlePrompt = (q: ChoiceQuestion) =>
  `${q.instructions}\n\n${menuOf(q)}\n\nAnswer (one letter):`;

const batchPrompt = (keys: string[], questions: Record<string, ChoiceQuestion>) => {
  const q = questions[keys[0]!]!;
  return (
    `Answer all ${keys.length} of these at once. They are independent, parallel choices against the same past.\n\n` +
    keys.map((k, i) => `${i + 1}. ${questions[k]!.instructions}`).join('\n') +
    `\n\nOptions, the same for every one:\n${menuOf(q)}\n\n` +
    `Answer with exactly ${keys.length} letters separated by commas, in order:`
  );
};

/** Run jobs `concurrency` at a time, preserving nothing but their merged results. */
async function pooled<T>(
  jobs: (() => Promise<Record<string, T>>)[],
  concurrency: number,
): Promise<Record<string, T>> {
  const merged: Record<string, T> = {};
  for (let i = 0; i < jobs.length; i += concurrency)
    for (const part of await Promise.all(jobs.slice(i, i + concurrency).map((job) => job())))
      Object.assign(merged, part);
  return merged;
}

export interface AnswerOptions {
  complete: Complete;
  concurrency?: number;
}

/**
 * Answer a whole JevRequest locally.
 *
 * The one behaviour worth stating out loud: a batch that comes back short is
 * REPAIRED, not shipped. The model was asked for eight letters and gave seven
 * in two of four measured roles; the missing key then never appears, and
 * `parseAnswers` rejects the entire answer set — correctly, because a dropped
 * note is not a note anybody chose. So a short batch is detected and its
 * missing questions are re-asked one at a time. That gives back some of the
 * time the batch saved, which is the honest price of the optimisation.
 */
export async function answerLocally(
  request: JevRequest,
  options: AnswerOptions,
): Promise<{ answers: Record<string, Distribution>; repaired: string[] }> {
  const questions = request.questions as Record<string, ChoiceQuestion>;
  const system = systemPrompt(request);
  const concurrency = options.concurrency ?? 8;
  const { batches, singles } = groupQuestions(questions);
  const repaired: string[] = [];

  const askSingle = (key: string) => async (): Promise<Record<string, Distribution>> => {
    const q = questions[key]!;
    const completion = await options.complete(system, singlePrompt(q), 1);
    const top = completion.tokens[0]?.top_logprobs ?? [];
    return { [key]: distribute(top, Object.keys(q.criteria)) };
  };

  const askBatch = (keys: string[]) => async (): Promise<Record<string, Distribution>> => {
    const optionKeys = Object.keys(questions[keys[0]!]!.criteria);
    const completion = await options.complete(
      system,
      batchPrompt(keys, questions),
      keys.length * 3,
    );
    const out: Record<string, Distribution> = {};
    let position = 0;
    for (const token of completion.tokens) {
      if (!letterOf(token.token)) continue;
      if (position >= keys.length) break;
      out[keys[position]!] = distribute(token.top_logprobs ?? [], optionKeys);
      position++;
    }
    return out;
  };

  const answers = await pooled<Distribution>(
    [...batches.map(askBatch), ...singles.map(askSingle)],
    concurrency,
  );

  // Repair, then verify the repair. A question with no answer must never leave here.
  const missing = Object.keys(questions).filter((key) => !answers[key]);
  if (missing.length > 0) {
    repaired.push(...missing);
    Object.assign(answers, await pooled<Distribution>(missing.map(askSingle), concurrency));
  }
  return { answers, repaired };
}

/** The role this request belongs to, read off the persona the composer sent. */
export function personaName(request: JevRequest): string {
  const persona = (request.state as { persona?: { name?: unknown } })?.persona;
  return String(persona?.name ?? '').toUpperCase();
}

/**
 * Should this shim answer, or forward it?
 *
 * Fails toward the upstream provider on purpose. An unrecognised persona is a
 * request this shim was not asked to take, and quietly answering it with a
 * model that cannot make the deadline would degrade the band silently — which
 * is exactly the failure mode this whole contract is careful about.
 */
export function shouldAnswerLocally(request: JevRequest, roles: Set<string>): boolean {
  const name = personaName(request);
  return name.length > 0 && roles.has(name);
}

/** Roles this shim takes, from KANNAKA_ROLES. Default: the lighting desk only. */
export function rolesFromEnv(env: Record<string, string | undefined> = process.env): Set<string> {
  const raw = env.KANNAKA_ROLES?.trim() || 'LUX';
  return new Set(
    raw
      .split(',')
      .map((r) => r.trim().toUpperCase())
      .filter(Boolean),
  );
}
