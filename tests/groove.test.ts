import test from 'node:test';
import assert from 'node:assert/strict';
import { availableMoves, baseGroove, composeDrums } from '../server/groove.js';
import { phrasePlanRequest } from '../server/composer.js';
import { Room } from '../server/room.js';
import {
  random,
  defaultDecision,
  type JevRequest,
  type Musician,
  type Note,
  type Part,
  type Snapshot,
  type Trace,
} from '../shared/music.js';

function reply(request: JevRequest, settings: Record<string, string> = {}): Trace {
  return {
    id: 'groove-' + Math.random(),
    role: 'drums',
    frame: 0,
    at: Date.now(),
    source: 'jev',
    latencyMs: 0,
    cost: 0,
    requestHash: 'fixture',
    request,
    answers: Object.fromEntries(
      Object.entries(request.questions).map(([key, q]) => {
        const options = Object.keys(q.criteria);
        const wanted = settings[key] ?? settings[key.replace(/\d+$/, '')];
        const value = wanted !== undefined && options.includes(wanted) ? wanted : options[0];
        return [
          key,
          {
            choice: value,
            probabilities: Object.fromEntries(options.map((o) => [o, +(o === value)])),
          },
        ];
      }),
    ),
  };
}
const hit = (beat: number, midi: number, velocity = 0.62): Note => ({
  beat,
  midi,
  duration: 0.25,
  velocity,
});
// A plain two-bar rock beat on a sixteenth grid.
const groove: Note[] = [0, 1, 2, 3, 4, 5, 6, 7]
  .flatMap((b) => [
    hit(b, 42),
    hit(b + 0.5, 42),
    ...(b % 2 ? [hit(b, 38, 0.8)] : [hit(b, 36, 0.8)]),
  ])
  .sort((a, b) => a.beat - b.beat || a.midi - b.midi);
const drummer = (
  extra: Partial<NonNullable<Part['performance']>> = {},
  part: Partial<Part> = {},
): Part => ({
  role: 'drums',
  notes: groove.map((n) => ({ ...n })),
  decision: defaultDecision(),
  solo: false,
  repeated: 0,
  source: 'jev',
  performance: {
    style: 'pocket_funk',
    arc: 'settle',
    texture: 'groove',
    palette: 'diatonic',
    chord: 'minor7',
    tensionPhrases: 0,
    motifAge: 0,
    drumPulse: 4,
    drumSwing: 0,
    grooveAge: 1,
    ...extra,
  },
  ...part,
});
const plan = (move: string) => ({
  move: { choice: move, probabilities: { [move]: 1 } },
  pulse: { choice: '4', probabilities: { '4': 1 } },
  swingAmount: { choice: '0', probabilities: { '0': 1 } },
});
const lane = (notes: Note[], midis: number[]) =>
  notes.filter((n) => midis.includes(n.midi)).map((n) => [n.beat, n.midi, n.velocity]);

test('the groove is the theme: a new drummer writes one, a young groove cannot be abandoned, and recordings made before the harness still work', () => {
  assert.deepEqual(Object.keys(availableMoves(undefined, false)), ['new_groove']);
  const legacy = drummer({ drumPulse: undefined });
  assert.deepEqual(
    Object.keys(availableMoves(legacy, false)),
    ['new_groove'],
    'an older part has no grid memory',
  );
  assert.deepEqual(baseGroove(legacy), legacy.notes);
  const young = Object.keys(availableMoves(drummer(), false));
  assert.ok(!young.includes('new_groove') && young.includes('vary_kick') && young.includes('fill'));
  assert.ok(Object.keys(availableMoves(drummer({ grooveAge: 4 }), false)).includes('new_groove'));
  assert.deepEqual(Object.keys(availableMoves(drummer(), true)), ['keep', 'drop', 'fill']);
  const room = new Room('Kit', 'live', '').view();
  const request = phrasePlanRequest('drums', room, 0, 't');
  assert.deepEqual(Object.keys(request.questions.move.criteria), ['new_groove']);
  assert.ok(!('move' in phrasePlanRequest('bass', room, 0, 't').questions));
});

test('theme and variation changes one limb and leaves the rest of the groove untouched', async () => {
  const requests: JevRequest[] = [];
  const result = await composeDrums(
    't',
    {},
    plan('vary_cymbals'),
    drummer(),
    async (request) => {
      requests.push(request);
      // Keep every step as it is, except open the hat on the and-of-four of bar two.
      const keep: Record<string, string> = {};
      for (const [key, q] of Object.entries(request.questions))
        if (key.startsWith('e'))
          keep[key] = /currently plays closed hi-hat/.test(q.instructions) ? '42' : 'rest';
      return reply(request, { ...keep, e30: '46', v30: '0.8' });
    },
    random(1),
  );
  assert.equal(requests.length, 1, 'one request for a variation');
  assert.match(requests[0].questions.e0.instructions, /currently plays closed hi-hat/);
  assert.match(requests[0].questions.e1.instructions, /currently plays nothing/);
  assert.deepEqual(
    lane(result.notes, [36, 38]),
    lane(groove, [36, 38]),
    'kick and snare are untouched',
  );
  const hats = result.notes.filter((n) => [42, 46].includes(n.midi));
  assert.equal(hats.length, 16);
  assert.deepEqual(
    hats.filter((n) => n.midi === 46).map((n) => [n.beat, n.velocity]),
    [[7.5, 0.8]],
  );
  assert.equal(hats[0].velocity, 0.62, 'an unchanged hit keeps its accent');
  assert.equal(result.upNext, undefined, 'a variation becomes the new theme');
  assert.equal(result.grooveAge, 2);
});

test('a fill is a moment: Jev writes every hit, the groove returns with the chosen landing, and the fill never loops', async () => {
  const result = await composeDrums(
    't',
    {},
    plan('fill'),
    drummer(),
    async (request) =>
      reply(request, {
        span: '2',
        grid: '3',
        contour: 'down_the_toms',
        landing: 'crash',
        f: '50',
        f0: 'flam',
        f5: 'rest',
        v: '0.8',
      }),
    random(1),
  );
  assert.deepEqual(
    result.notes.filter((n) => n.beat < 5.9),
    groove.filter((n) => n.beat < 5.9),
    'the groove plays up to the fill',
  );
  const fill = result.notes.filter((n) => n.beat >= 5.9);
  assert.ok(
    fill.every((n) => [38, 50].includes(n.midi)),
    'only the hits Jev chose',
  );
  assert.deepEqual(
    fill.filter((n) => n.midi === 50).map((n) => Number(n.beat.toFixed(3))),
    [6.333, 6.667, 7, 7.333],
    'a triplet fill over a sixteenth groove, with the chosen gap',
  );
  assert.equal(fill.filter((n) => n.midi === 38).length, 2, 'a flam is a grace note and an accent');
  const [back, base] = result.upNext!;
  assert.deepEqual(base, groove);
  assert.deepEqual([back[0].beat, back[0].midi], [0, 49]);
  assert.ok(
    !back.some((n) => n.beat === 0 && n.midi === 42),
    'the crash replaces the hat on the downbeat',
  );
  assert.equal(back.length, groove.length);

  // Composing again immediately still pays the owed landing and still treats the groove as the theme.
  const after = drummer(
    { pendingLanding: 'crash' },
    { notes: result.notes, upNext: result.upNext },
  );
  assert.deepEqual(baseGroove(after), groove);
  const kept = await composeDrums('t', {}, plan('keep'), after, async (r) => reply(r), random(1));
  assert.deepEqual([kept.notes[0].midi, kept.upNext], [49, [groove]]);
});

test('drops and builds are parameterised by Jev and keep its own remaining hits', async () => {
  const drop = await composeDrums(
    't',
    {},
    plan('drop'),
    drummer(),
    async (request) => reply(request, { span: '4', what: 'kick_and_snare', landing: 'none' }),
    random(1),
  );
  assert.deepEqual(
    drop.notes.filter((n) => n.beat >= 4).map((n) => n.midi),
    Array(8).fill(42),
  );
  assert.deepEqual(
    drop.notes.filter((n) => n.beat < 4),
    groove.filter((n) => n.beat < 4),
  );
  assert.deepEqual(drop.upNext, [groove, groove]);
  const build = await composeDrums(
    't',
    {},
    plan('build'),
    drummer(),
    async (request) =>
      reply(request, {
        span: '2',
        voice: '38',
        shape: 'eighths_to_sixteenths',
        under: 'kick',
        landing: 'splash',
      }),
    random(1),
  );
  const roll = build.notes.filter(
    (n) => n.beat >= 6 && n.midi === 38 && n.provenance?.slot === 'build',
  );
  assert.deepEqual(
    roll.map((n) => n.beat),
    [6, 6.5, 7, 7.25, 7.5, 7.75],
  );
  assert.ok(
    roll.every((n, i) => !i || n.velocity > roll[i - 1].velocity),
    'a crescendo',
  );
  assert.ok(
    build.notes.some((n) => n.beat === 6 && n.midi === 36) &&
      !build.notes.some((n) => n.beat >= 6 && n.midi === 42),
  );
  assert.equal(build.upNext![0][0].midi, 55);
});

test('the tuplet feel is a deliberate move, not a timer', async () => {
  const seen: number[] = [];
  const shifted = await composeDrums(
    't',
    {},
    plan('change_subdivision'),
    drummer(),
    async (request) => {
      seen.push(Object.keys(request.questions).filter((k) => k.startsWith('k')).length);
      return reply(request, { k: 'on' });
    },
    random(1),
  );
  assert.equal(shifted.pulse, 3);
  assert.deepEqual(seen, [12, 12], 'two bars on a triplet grid');
  assert.equal(shifted.grooveAge, 0);
  const back = await composeDrums(
    't',
    {},
    plan('change_subdivision'),
    drummer({ drumPulse: 3 }),
    async (r) => reply(r),
    random(1),
  );
  assert.equal(back.pulse, 4);
});

test('in a live room a fill sounds once and the groove comes back on the repeats', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000000 });
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const request = JSON.parse(init.body as string) as JevRequest & { state: any };
    const name = request.state.persona?.name ?? request.state.context?.persona?.name;
    const trace = reply(request, {
      opener: 'drums',
      bpm: '96',
      action: 'vary',
      phraseBars: '2',
      sound: 'play',
      move: 'fill',
      span: '1',
      grid: '4',
      landing: 'crash',
      f: '45',
      k: name === 'KIT' ? 'on' : 'off',
      c: '42',
    });
    return new Response(JSON.stringify({ answers: trace.answers, usage: { cost: 0 } }));
  });
  const room = new Room('Fill', 'live', 'fixture', 'test', 6000);
  const frames: NonNullable<Snapshot['frame']>[] = [];
  room.on('state', (state) => {
    if (state.frame && state.frame.id !== frames.at(-1)?.id)
      frames.push(structuredClone(state.frame));
  });
  await room.start();
  for (let second = 0; second < 70; second++) {
    t.mock.timers.tick(1000);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  room.stop();
  const kit = (f: NonNullable<Snapshot['frame']>) =>
    f.parts.find((p) => p.role === ('drums' as Musician))!;
  const index = frames.findIndex(
    (f) => kit(f)?.performance?.drumMove === 'fill' && !kit(f).continued,
  );
  assert.ok(index > 0, 'a fill was played');
  const [fill, first, second] = [frames[index], frames[index + 1], frames[index + 2]].map(kit);
  assert.ok(fill.notes.some((n) => n.midi === 45 && n.beat >= 7));
  assert.ok(first.continued && first.notes[0].midi === 49, 'the groove lands on the crash');
  assert.ok(!first.notes.some((n) => n.midi === 45), 'the fill is not looped');
  assert.ok(
    second.continued && !second.notes.some((n) => n.midi === 49 || n.midi === 45),
    'then the plain groove',
  );
  assert.equal(second.upNext, undefined);
});

test('groove grammar: kinds of move cannot repeat forever, and a moment is never followed by another', () => {
  const after = (...moves: string[]) =>
    Object.keys(availableMoves(drummer({ grooveAge: 6, recentChoices: { move: moves } }), false));
  assert.ok(after('vary_snare').includes('vary_snare'), 'one variation may be developed further');
  const tired = after('vary_snare', 'vary_kick');
  assert.ok(
    !tired.some((m) => m.startsWith('vary_')) && tired.includes('fill') && tired.includes('keep'),
  );
  assert.ok(!after('keep', 'keep').includes('keep'));
  const afterFill = after('keep', 'fill');
  assert.ok(
    !afterFill.includes('fill') && !afterFill.includes('drop') && !afterFill.includes('build'),
  );
  const settled = after('change_subdivision');
  assert.ok(!settled.includes('change_subdivision') && !settled.includes('new_groove'));
  assert.ok(after('keep', 'vary_kick', 'keep').length === 9, 'otherwise everything is open');
});
