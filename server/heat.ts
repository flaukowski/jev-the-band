import {
  clamp,
  hash,
  random,
  type Answer,
  type ChoiceQuestion,
  type Part,
  type Snapshot,
  type Trace,
} from '../shared/music.js';

// Jev returns a probability distribution for every decision. Always taking its top choice makes
// near-identical musical states produce identical plans forever. Heat decodes the SAME
// distribution more adventurously the longer a player's direction has stayed put, and cools
// again once the player actually departs. Raw answers are never altered.

/** Audible dimensions of a player's direction. Changing two of them is a real departure. */
export const directionFields = [
  'style',
  'arc',
  'palette',
  'texture',
  'register',
  'mode',
  'volume',
  'right',
  'feel',
] as const;
/** Every plan field decoded with heat. Votes (tempo, harmony, ending), root and phrase length are not. */
export const heatedFields = [
  ...directionFields,
  'action',
  'intent',
  'density',
  'dynamic',
  'entry',
  'position',
  'stringPair',
  'pulse',
  'swingAmount',
  'left',
  'right',
  'timbreBar1',
  'timbreBar2',
  'energy',
  'volume',
  'feel',
  'keyMove',
] as const;

// Personas get bored at different speeds: the guitarist first, the rhythm section last.
const restlessness = { guitar: 1.25, keys: 1.1, bass: 0.8, drums: 0.7 } as const;
export function noveltyPressure(own: Part | undefined, room: Snapshot, now = Date.now()): number {
  const elapsed = Math.max(0, (now - (room.themeStartedAt ?? room.startedAt)) / 1000);
  const stale = own?.performance?.staleChunks ?? 0;
  // Two bars per chunk: about 0.22 after one unchanged chunk, 0.63 after four, 0.86 after eight.
  const staleness = 1 - Math.exp((-stale * (own ? restlessness[own.role] : 1)) / 4);
  return (
    Math.round(clamp(0.08 + 0.3 * clamp(elapsed / 240, 0, 1) + 0.62 * staleness, 0, 1) * 100) / 100
  );
}

/** Temperature, nucleus and a decaying penalty for the player's own recent choices. */
export function sampleWithHeat(
  answer: Answer,
  pressure: number,
  rng: () => number,
  recent: readonly string[] = [],
): string {
  const ranked = Object.entries(answer.probabilities)
    .filter(([, p]) => p > 0)
    .sort((a, b) => b[1] - a[1]);
  if (ranked.length < 2) return ranked[0]?.[0] ?? answer.choice;
  const nucleus = 0.7 + 0.28 * pressure;
  const temperature = 0.6 + 1.6 * pressure;
  const candidates: [string, number][] = [];
  let mass = 0;
  for (const [value, p] of ranked) {
    const repeats = recent.filter((v) => v === value).length;
    candidates.push([value, Math.pow(p, 1 / temperature) * Math.pow(1 - 0.5 * pressure, repeats)]);
    mass += p;
    if (mass >= nucleus) break;
  }
  let draw = rng() * candidates.reduce((sum, [, w]) => sum + w, 0);
  for (const [value, w] of candidates) {
    draw -= w;
    if (draw <= 0) return value;
  }
  return candidates[0][0];
}

/** Decode a plan trace with heat. Returns the applied answers; the raw trace answers are untouched. */
export function applyHeat(
  trace: Trace,
  pressure: number,
  rng: () => number,
  recent: Record<string, string[]> = {},
  fields: readonly string[] = heatedFields,
): Record<string, Answer> {
  const applied = structuredClone(trace.appliedAnswers ?? trace.answers);
  for (const field of fields) {
    const answer = applied[field];
    if (!answer) continue;
    // Moving the whole band is a big gesture: only a genuinely restless player may try it.
    const bandMove = field === 'keyMove' || field === 'tempo';
    const heat = bandMove ? (pressure < 0.45 ? 0 : pressure * 0.8) : pressure;
    const picked = sampleWithHeat(answer, heat, rng, recent[field]);
    if (picked !== answer.choice) {
      answer.choice = picked;
      delete answer.confidence;
    }
  }
  trace.appliedAnswers = applied;
  trace.selectionMethod = 'seeded-model-distribution';
  trace.heat = pressure;
  return applied;
}

/** Two or more changed direction fields is a departure and cools the player down. */
export function nextStaleness(previous: Part | undefined, plan: Record<string, Answer>): number {
  const before = previous?.performance;
  if (!before) return 0;
  const was: Record<string, string | undefined> = {
    style: before.style,
    arc: before.arc,
    palette: before.palette,
    chord: before.chord,
    texture: before.texture,
    register: before.register,
    mode: previous.tonalIntent?.mode,
    volume: before.volume,
    right: previous.decision.right,
    feel: before.feel,
  };
  const changed = directionFields.filter(
    (f) => plan[f] && was[f] !== undefined && String(was[f]) !== plan[f].choice,
  ).length;
  return changed >= 2 ? 0 : (before.staleChunks ?? 0) + 1;
}

export function rememberChoices(
  previous: Part | undefined,
  plan: Record<string, Answer>,
): Record<string, string[]> {
  const recent = previous?.performance?.recentChoices ?? {};
  return Object.fromEntries(
    [...heatedFields, ...(previous?.role === 'drums' || plan.feel ? (['tempo'] as const) : [])]
      .filter((f) => plan[f])
      .map((f) => [f, [...(recent[f] ?? []), plan[f].choice].slice(-8)]),
  );
}

// Jev is a classifier: given a near-identical state it returns a near-identical, sharply peaked
// answer (rhodes 0.94, warm 0.99), so no sampling temperature can move it. What a real player
// does is get bored. Fatigue retires an over-used option from the menu for one decision, so
// Jev must pick its best ALTERNATIVE. The incumbent returns as soon as something else was played.
export const patience: Record<string, number> = {
  left: 3,
  right: 3,
  volume: 3,
  register: 3,
  timbreBar1: 3,
  timbreBar2: 3,
  contour: 3,
  density: 3,
  attacks: 3,
  texture: 4,
  chord: 4,
  arc: 3,
  palette: 5,
  pulse: 5,
  feel: 5,
  style: 6,
  // Only the drummer's tempo choice is remembered, so only the drummer tires of one tempo.
  tempo: 6,
};
export function fatigue(
  own: Part | undefined,
  room: Snapshot,
  phrase: number,
  questions: Record<string, ChoiceQuestion>,
  now = Date.now(),
): Record<string, string> {
  const retired: Record<string, string> = {};
  if (!own) return retired;
  const warmth = 0.6 + 0.4 * clamp((now - (room.themeStartedAt ?? room.startedAt)) / 180000, 0, 1);
  for (const [field, limit] of Object.entries(patience)) {
    const history = own.performance?.recentChoices?.[field] ?? [];
    const incumbent = history.at(-1);
    const question = questions[field];
    if (!incumbent || !question || !(incumbent in question.criteria)) continue;
    if (Object.keys(question.criteria).length < 2) continue;
    let run = 0;
    while (run < history.length && history[history.length - 1 - run] === incumbent) run++;
    if (run < limit) continue;
    const chance = Math.min(0.9, 0.3 + 0.2 * (run - limit)) * warmth;
    if (random(room.seed + phrase * 131 + hash(own.role + field))() >= chance) continue;
    delete question.criteria[incumbent];
    retired[field] =
      `${incumbent.replaceAll('_', ' ')}: you have used it ${run} phrases running, so it is resting. Choose the best fresh alternative.`;
  }
  // Nobody has moved the key for a long time: the option to stay eventually tires too.
  const keyAge = room.keyAgeFrames ?? 0;
  if (
    questions.keyMove &&
    Object.keys(questions.keyMove.criteria).length > 1 &&
    keyAge >= 24 &&
    random(room.seed + phrase * 173 + hash(own.role))() < Math.min(0.5, 0.1 + (keyAge - 24) * 0.02)
  ) {
    delete questions.keyMove.criteria.stay;
    retired.keyMove = `The band has sat in one key for ${keyAge * 2} bars. Lead it somewhere new.`;
  }
  return retired;
}
