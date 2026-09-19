import { createHash, randomUUID } from 'node:crypto';
import {
  actions,
  articulations,
  developments,
  fxNames,
  defaultDecision,
  lightRecipes,
  lightingSchema,
  modes,
  musicians,
  patches,
  personas,
  rhythms,
  type Answer,
  type ChoiceQuestion,
  type Decision,
  type JevRequest,
  type Lighting,
  type Musician,
  type Role,
  type Snapshot,
  type Trace,
} from '../shared/music.js';
import { endingPressure } from '../shared/score.js';
import { listeningState } from './listening.js';

export const choice = (
  instructions: string,
  values: readonly string[] | Record<string, string>,
): ChoiceQuestion => ({
  type: 'choice',
  instructions,
  criteria: Array.isArray(values)
    ? Object.fromEntries(values.map((v) => [v, v.replaceAll('_', ' ')]))
    : (values as Record<string, string>),
});
export function requestFor(role: Role, room: Snapshot, phrase: number, model: string): JevRequest {
  const elapsed = Math.max(0, (Date.now() - room.startedAt) / 1000);
  const state = {
    persona: personas[role],
    phrase,
    elapsedSeconds: Math.round(elapsed),
    endingPressure: endingPressure(elapsed),
    seedPrompt: phrase < 4 ? room.prompt : undefined,
    brief:
      "Original instrumental jam. You hear only notes already performed, with a reaction delay; you cannot know another player's next choice. Only one musician may revise a phrase at a boundary. Others carry their parts while they listen. Your ownMemory is private. Develop a recognizable motif: repeat its opening, answer its ending, leave breaths, land on a target note. Runs are punctuation. Support leaves space around a foreground melody. Solo is sustained across vary/develop; support, space, rest or resolve ends it. Choose a commitment to let your idea settle. Note anchors are parallel choices against the SAME past, not a conversation with each other.",
    ...listeningState(room, role),
  };
  if (role === 'lights')
    return {
      model,
      state,
      questions: {
        wash: choice('Choose a color wash that expresses the present music.', lightRecipes.wash),
        beam: choice(
          'Choose a moving-head composition; frame soloists and follow space.',
          lightRecipes.beam,
        ),
        laser: choice(
          'Choose a complementary laser layer. Off is often tasteful.',
          lightRecipes.laser,
        ),
        intensity: choice('Choose overall brightness.', ['low', 'medium', 'high']),
        motion: choice('Choose smooth movement speed; no strobing.', ['slow', 'medium', 'fast']),
      },
    };
  const questions: Record<string, ChoiceQuestion> = {
    action: choice(
      'What will you play? hold repeats; vary/develop transform your own motif; solo steps forward with a melodic voice; support ends your solo; space breathes; rest is silence; resolve lands. Respond only to what you have heard.',
      actions,
    ),
    rhythm: choice('Choose the rhythmic shape of your next phrase.', {
      pocket: 'Syncopated eighth-note groove',
      offbeat: 'Anticipated offbeats with air on the downbeat',
      flow: 'Continuous eighth-note movement',
      sparse: 'Four separated gestures',
      sustain: 'Two long whole-note gestures',
      clave: 'Interlocking 3-2-like syncopated accents',
      lyrical: 'Singable question and answer, varied note lengths and breaths',
      thirty_seconds: 'Longer anchors with a short 32nd-note run at the end',
      triplets: 'Triplet gestures between spacious anchors',
      quintuplets: 'Five evenly spaced notes per beat, used as short bursts',
      sextuplets: 'A six-note flourish followed by a landing',
      broken: 'Uneven sixteenth-note syncopation and rests',
    }),
    development: choice(
      'How does your private previous motif become this one? Prefer small changes; new_theme is a deliberate departure. answer retains the first four anchors and replaces the ending.',
      developments,
    ),
    articulation: choice(
      'Choose how notes speak. Bend and slide are expressive guitar gestures; legato connects, staccato leaves air.',
      articulations,
    ),
    swing: choice('Swing straight subdivisions; tuplets keep their own spacing.', [
      'straight',
      'light',
      'deep',
    ]),
    commitment: choice(
      'How long should your idea settle before another decision? Brief is about 3 phrases; settle 4; patient 6, with independent scheduling.',
      ['brief', 'settle', 'patient'],
    ),
    density: choice('Choose note density; complement the other players.', [
      'low',
      'medium',
      'high',
    ]),
    dynamic: choice('Choose performance intensity.', ['soft', 'warm', 'bold']),
    tempo: choice(
      'Suggest a very small change in shared tempo. Mostly stay; ease or push only if the musical moment invites it.',
      ['ease', 'stay', 'push'],
    ),
    harmony: choice(
      'Propose staying in the current key, moving up a fourth, or up a fifth. A partner must agree; let each key breathe.',
      ['stay', 'up_fourth', 'up_fifth'],
    ),
    ending: choice(
      'Should the band begin a satisfying ending now? Before 300 seconds choose continue. After 300 seconds increasingly prefer end as endingPressure rises, if the phrase has found resolution.',
      ['continue', 'end'],
    ),
  };
  if (role !== 'drums')
    for (let i = 0; i < 8; i++)
      questions[`note${i}`] = choice(
        `Choose scale degree for motif position ${i + 1} of 8. Respond to the previous motif and the other players. Degree 0 is tonic, 1 second, 2 third, 3 fourth, 4 fifth, 5 sixth, 6 seventh, 7 upper tonic. These are parallel choices; use the previous phrase for continuity.`,
        Object.fromEntries(
          ['tonic', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'upper tonic'].map(
            (v, i) => [String(i), v],
          ),
        ),
      );
  if (role === 'keys') {
    questions.left = choice(
      'Choose left-hand keyboard. Maximum five simultaneous notes in this hand.',
      patches,
    );
    questions.right = choice('Choose right-hand keyboard; may differ from left.', patches);
  }
  for (const effect of fxNames)
    questions[effect] = choice(
      `Turn ${effect} on or off on YOUR independent effects rig. envelope is a velocity-sensitive filter sweep, wah is an automatic cyclic sweep. Effects never affect other instruments. Use restraint.`,
      ['off', 'on'],
    );
  return { model, state, questions };
}
export function bootstrapRequest(prompt: string, model: string): JevRequest {
  return {
    model,
    state: {
      persona: personas.bass,
      prompt,
      task: 'Invite the band into a new original jam. Pick who starts alone, a tempo, a tonic and a mode matching this title or description.',
    },
    questions: {
      opener: choice('Who should introduce the first groove?', musicians),
      bpm: choice('Starting tempo in BPM.', ['78', '88', '96', '104', '112', '120']),
      root: choice('Tonic pitch class.', {
        '0': 'C',
        '2': 'D',
        '4': 'E',
        '5': 'F',
        '7': 'G',
        '9': 'A',
      }),
      mode: choice('Starting scale color.', modes),
    },
  };
}
export function parseAnswers(payload: unknown, request: JevRequest): Record<string, Answer> {
  if (!payload || typeof payload !== 'object' || !('answers' in payload))
    throw new Error('Missing decision answers');
  const raw = (payload as { answers: Record<string, unknown> }).answers;
  const answers: Record<string, Answer> = {};
  for (const [key, q] of Object.entries(request.questions)) {
    const a = raw?.[key] as Answer | undefined;
    if (
      !a ||
      typeof a.choice !== 'string' ||
      !(a.choice in q.criteria) ||
      !a.probabilities ||
      typeof a.probabilities !== 'object'
    )
      throw new Error(`Invalid answer: ${key}`);
    const probabilities: Record<string, number> = {};
    for (const option of Object.keys(q.criteria)) {
      const p = a.probabilities[option];
      if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1)
        throw new Error(`Invalid distribution: ${key}`);
      probabilities[option] = p;
    }
    if (Math.abs(Object.values(probabilities).reduce((a, b) => a + b, 0) - 1) > 0.03)
      throw new Error(`Distribution does not sum to one: ${key}`);
    answers[key] = {
      choice: a.choice,
      probabilities,
      ...(typeof a.confidence === 'number' &&
      Number.isFinite(a.confidence) &&
      a.confidence >= 0 &&
      a.confidence <= 1
        ? { confidence: a.confidence }
        : {}),
    };
  }
  return answers;
}
export function toDecision(answers: Record<string, Answer>): Decision {
  const d = defaultDecision();
  for (const field of [
    'action',
    'rhythm',
    'density',
    'dynamic',
    'tempo',
    'harmony',
    'left',
    'right',
    'development',
    'articulation',
    'swing',
    'commitment',
  ] as const)
    if (answers[field]) (d as unknown as Record<string, unknown>)[field] = answers[field].choice;
  d.degrees = d.degrees.map((v, i) =>
    answers[`note${i}`] ? Number(answers[`note${i}`].choice) : v,
  );
  d.ending = answers.ending?.choice === 'end';
  for (const effect of fxNames)
    if (answers[effect]) d.effects[effect] = answers[effect].choice === 'on';
  return d;
}
export function toLighting(a: Record<string, Answer>): Lighting {
  return lightingSchema.parse({
    wash: a.wash.choice,
    beam: a.beam.choice,
    laser: a.laser.choice,
    intensity: { low: 0.25, medium: 0.6, high: 0.95 }[a.intensity.choice],
    motion: { slow: 0.15, medium: 0.45, fast: 0.8 }[a.motion.choice],
  });
}
export async function callJev(
  request: JevRequest,
  role: Role,
  frame: number,
  apiKey: string,
  parentSignal?: AbortSignal,
): Promise<Trace> {
  const start = performance.now();
  const trace: Trace = {
    id: randomUUID(),
    role,
    frame,
    at: Date.now(),
    source: 'jev',
    latencyMs: 0,
    request,
    answers: {},
    requestHash: createHash('sha256').update(JSON.stringify(request)).digest('hex'),
    cost: null,
  };
  try {
    const response = await fetch('https://openrouter.ai/api/alpha/decisions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'JEV the band',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.any([AbortSignal.timeout(1800), ...(parentSignal ? [parentSignal] : [])]),
    });
    if (!response.ok) throw new Error(`Decision service HTTP ${response.status}`);
    const payload = await response.json();
    // Preserve billed usage even when decision validation fails. Never return headers or opaque errors.
    trace.cost =
      typeof payload.usage?.cost === 'number' &&
      Number.isFinite(payload.usage.cost) &&
      payload.usage.cost >= 0
        ? payload.usage.cost
        : null;
    trace.providerId = typeof payload.id === 'string' ? payload.id.slice(0, 200) : undefined;
    trace.answers = parseAnswers(payload, request);
  } catch (error) {
    trace.source = 'fallback';
    trace.error =
      error instanceof Error &&
      /^(Invalid |Missing |Distribution |Decision service HTTP)/.test(error.message)
        ? error.message
        : 'Decision request timed out or could not connect';
  }
  trace.latencyMs = Math.round(performance.now() - start);
  return trace;
}
