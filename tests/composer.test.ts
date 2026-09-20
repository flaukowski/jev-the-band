import test from 'node:test';
import assert from 'node:assert/strict';
import {
  composePhrase,
  eventRequest,
  phrasePlanRequest,
  readEvents,
  maxAttacks,
  applyPerformanceChoices,
} from '../server/composer.js';
import { Room } from '../server/room.js';
import { defaultDecision, fxNames, type JevRequest, type Trace } from '../shared/music.js';
import { listeningState } from '../server/listening.js';
import { drumSampleLifetime, effectsAtBeat } from '../shared/performance.js';
import { musicalContext } from '../server/musical-context.js';
function reply(request: JevRequest, overrides: Record<string, string> = {}): Trace {
  const selected: Record<string, string> = {
    action: 'vary',
    intent: 'answer_peer',
    root: '0',
    mode: 'minor',
    entry: '0',
    attacks: request.questions.left ? '8' : '12',
    register: 'high',
    sound: 'play',
    style: 'pocket_funk',
    arc: 'build',
    palette: 'chromatic',
    texture: 'single_line',
    ...overrides,
  };
  return {
    id: `trace-${Math.random()}`,
    role: 'guitar',
    frame: 0,
    at: Date.now(),
    source: 'jev',
    latencyMs: 0,
    request,
    requestHash: 'fixture',
    cost: 0,
    answers: Object.fromEntries(
      Object.entries(request.questions).map(([key, q]) => {
        const value =
          selected[key] ?? (/^[sc]\d+$/.test(key) ? 'rest' : Object.keys(q.criteria)[0]);
        assert.ok(value in q.criteria, `${key}: ${value}`);
        return [
          key,
          {
            choice: value,
            probabilities: Object.fromEntries(
              Object.keys(q.criteria).map((v) => [v, v === value ? 1 : 0]),
            ),
          },
        ];
      }),
    ),
  };
}
test('live notes directly preserve Jev pitch, tuplets, duration, velocity, bend and provenance; every attack sees its predecessors', async () => {
  const room = new Room('A strange little waltz', 'live', '').view();
  const calls: Trace[] = [];
  const part = await composePhrase('guitar', room, 0, 'test', async (request) => {
    const trace = reply(
      request,
      calls.length > 1
        ? {
            pitch: String(59 + calls.length),
            advance: calls.length === 2 ? '0.2' : String(1 / 3),
            duration: '0.125',
            velocity: '0.38',
            articulation: 'bend',
            bend: '2',
          }
        : {},
    );
    calls.push(trace);
    return trace;
  });
  assert.equal(calls.length, maxAttacks + 2);
  assert.equal(part.phraseFormat, 'events-v1');
  assert.equal(part.notes.length, maxAttacks);
  assert.deepEqual(
    part.notes.slice(0, 3).map((n) => [n.midi, n.beat]),
    [
      [61, 0],
      [62, 0.2],
      [63, 0.533333],
    ],
  );
  assert.equal(part.notes[0].duration, 0.125);
  assert.equal(part.notes[0].velocity, 0.38);
  assert.equal(part.notes[0].bend, 2);
  assert.equal(part.notes[0].provenance?.traceId, calls[2].id);
  for (let i = 2; i < calls.length; i++)
    assert.deepEqual(
      (calls[i].request.state as { alreadyComposed: unknown }).alreadyComposed,
      part.notes.slice(0, i - 2),
    );
  assert.ok(!('rhythm' in calls[0].request.questions));
  assert.ok('0.125' in calls[2].request.questions.advance.criteria);
});
test('drums receive no automatic backbeat; selected rests have no invented accompaniment', async () => {
  const room = new Room('Silence', 'live', '').view();
  const part = await composePhrase('drums', room, 0, 'test', async (q) =>
    reply(q, { pulse: '2', c0: '49' }),
  );
  assert.deepEqual(
    part.notes.map((n) => [n.midi, n.beat]),
    [
      [49, 0],
      [49, 4],
    ],
  );
  const silent = await composePhrase('bass', room, 0, 'test', async (q) =>
    reply(q, { action: 'rest' }),
  );
  assert.deepEqual(silent.notes, []);
});
test('keyboard chooses every chord pitch and cannot exceed five held notes per hand', () => {
  const room = new Room('Voices', 'live', '').view();
  const plan = reply(phrasePlanRequest('keys', room, 0, 'test'), {
    texture: 'two_hand_chords',
    chord: 'major9',
  });
  const q = eventRequest('keys', room, 0, 'test', plan.answers, 0, []);
  const overrides: Record<string, string> = { leftCount: '0', rightCount: '5', duration: '8' };
  for (let i = 0; i < 5; i++) overrides[`right${i}`] = String([60, 62, 64, 67, 71][i]);
  const first = reply(q, overrides);
  const notes = readEvents('keys', first, 0, defaultDecision(), []);
  assert.deepEqual(
    notes.map((n) => n.midi),
    [60, 62, 64, 67, 71],
  );
  const laterRequest = eventRequest('keys', room, 0, 'test', plan.answers, 4, notes);
  assert.ok('60' in laterRequest.questions.right0.criteria);
  assert.ok(!('72' in laterRequest.questions.right0.criteria));
  const later = reply(laterRequest, { leftCount: '0', rightCount: '1', right0: '60' });
  const restruck = readEvents('keys', later, 4, defaultDecision(), notes);
  assert.equal(restruck.length, 6);
  assert.equal(restruck[0].duration, 4);
  assert.equal(notes[0].duration, 8, 'do not mutate prior request state');
});
test('bootstrap harmony reaches the opener before any sound', () => {
  const room = new Room('Minor morning', 'live', '');
  room.state.initialRoot = 0;
  room.state.initialMode = 'minor';
  assert.equal(listeningState(room.view(), 'bass').music.rootPitchClass, 0);
  assert.equal(listeningState(room.view(), 'bass').music.mode, 'minor');
});
test('a failed attack rejects the atomic phrase, without procedural completion', async () => {
  let count = 0;
  await assert.rejects(
    composePhrase('guitar', new Room('test', 'live', '').view(), 0, 'test', async (q) => {
      const trace = reply(q);
      if (++count === 3) trace.source = 'fallback';
      return trace;
    }),
    /Note decisions unavailable/,
  );
});
test('held phrases cannot be offered again after three deliberate holds; waiting for a turn is not a hold', () => {
  const room = new Room('change', 'live', '');
  room.state.frames = [
    {
      id: 0,
      at: 0,
      durationMs: 5000,
      bpm: 96,
      root: 2,
      mode: 'dorian',
      lighting: { wash: 'amber dusk', beam: 'off', laser: 'off', intensity: 0, motion: 0 },
      ending: false,
      chapter: 'test',
      parts: [
        {
          role: 'guitar',
          notes: [],
          decision: defaultDecision(),
          solo: false,
          repeated: 3,
          source: 'jev',
          performance: {
            style: 'pocket_funk',
            arc: 'settle',
            texture: 'single_line',
            chord: 'major',
            palette: 'diatonic',
            tensionPhrases: 0,
            motifAge: 3,
          },
        },
      ],
    },
  ];
  assert.ok(
    !('hold' in phrasePlanRequest('guitar', room.view(), 4, 'test').questions.action.criteria),
  );
  room.state.frames[0].parts[0].performance!.motifAge = 0;
  assert.ok(
    'hold' in phrasePlanRequest('guitar', room.view(), 4, 'test').questions.action.criteria,
  );
});

test('guitar chooses each of six string pitches and strum timing; a new attack releases the same strings', () => {
  const room = new Room('Warm C major strums', 'live', '').view();
  const plan = reply(phrasePlanRequest('guitar', room, 0, 'test'), {
    texture: 'strummed_chords',
    chord: 'major',
    position: 'open',
  });
  const notes = [40, 48, 52, 55, 60, 64];
  const overrides = {
    ...Object.fromEntries(notes.map((n, i) => ['string' + i, String(n)])),
    stroke: 'down',
    spread: '0.025',
    duration: '8',
  };
  const trace = reply(eventRequest('guitar', room, 0, 'test', plan.answers, 0, []), overrides);
  const first = readEvents('guitar', trace, 0, defaultDecision(), []);
  assert.equal(first.length, 6);
  assert.deepEqual(
    first.map((n) => n.midi),
    notes,
  );
  first.forEach((n, i) => {
    assert.equal(n.beat, i * 0.025);
    assert.equal(n.string, i);
    assert.equal(n.provenance?.traceId, trace.id);
  });
  const next = reply(eventRequest('guitar', room, 0, 'test', plan.answers, 4, first), {
    ...overrides,
    duration: '4',
  });
  const both = readEvents('guitar', next, 4, defaultDecision(), first);
  assert.equal(both.length, 12);
  both.slice(0, 6).forEach((n, i) => assert.equal(n.beat + n.duration, both[6 + i].beat));
  const double = reply(phrasePlanRequest('guitar', room, 0, 'test'), {
    texture: 'double_stops',
    stringPair: '2_3',
  });
  assert.deepEqual(
    Object.keys(eventRequest('guitar', room, 0, 'test', double.answers, 0, []).questions).filter(
      (k) => k.startsWith('string'),
    ),
    ['string2', 'string3'],
  );
});

test('drummer fills both bars on the elected triplet grid and sees its first bar before composing its second', async () => {
  const calls: Trace[] = [];
  const part = await composePhrase(
    'drums',
    new Room('Shuffle', 'live', '').view(),
    0,
    'test',
    async (q) => {
      const t = reply(q, { pulse: '3', c0: '42', c1: '42', c11: '42', k0: 'on', s6: '38' });
      calls.push(t);
      return t;
    },
  );
  assert.equal(calls.length, 4);
  assert.ok(part.notes.some((n) => n.beat === 1 / 3));
  assert.ok(part.notes.some((n) => n.beat === 4 + 11 / 3));
  assert.deepEqual(
    (calls[3].request.state as { alreadyComposed: unknown }).alreadyComposed,
    part.notes.filter((n) => n.beat < 4),
  );
  assert.equal(part.notes.length, 10);
  assert.equal(drumSampleLifetime('drums', 0.125, 4), 3.98);
  assert.equal(drumSampleLifetime('guitar', 0.125, 4), 0.125);
});

test('style memory requires a release after sustained building and release targets chosen chord tones', async () => {
  const room = new Room('Find the pocket', 'live', '');
  const part = await composePhrase('guitar', room.view(), 0, 'test', async (q) =>
    reply(q, { action: 'rest' }),
  );
  part.performance!.tensionPhrases = 2;
  room.state.frames = [
    {
      id: 0,
      at: Date.now() - 1000,
      durationMs: 8000,
      bpm: 60,
      root: 0,
      mode: 'minor',
      parts: [part],
      lighting: { wash: 'amber dusk', beam: 'off', laser: 'off', intensity: 0, motion: 0 },
      chapter: 'test',
      ending: false,
    },
  ];
  const q = phrasePlanRequest('guitar', room.view(), 4, 'test');
  assert.deepEqual(Object.keys(q.questions.arc.criteria), ['settle', 'release', 'space']);
  assert.ok(!('hold' in q.questions.action.criteria));
  const plan = reply(q, { arc: 'release', chord: 'major', palette: 'chromatic' });
  const pitches = Object.keys(
    eventRequest('guitar', room.view(), 4, 'test', plan.answers, 6, [], 10).questions.pitch
      .criteria,
  ).map(Number);
  assert.ok(pitches.every((n) => [0, 4, 7].includes(n % 12)));
  assert.equal(musicalContext(room.view(), 'guitar').feedback.releaseDue, true);
  assert.equal(musicalContext(room.view(), 'bass').ownDirection, null);
  assert.doesNotMatch(
    JSON.stringify(musicalContext(room.view(), 'bass').recent),
    /performance|tensionPhrases|palette/,
  );
});

test('every pedal is independently selectable in either bar, including all on', async () => {
  const room = new Room('Psychedelic pedalboard', 'live', '').view();
  const on = Object.fromEntries(fxNames.map((f) => [f, 'on']));
  const off = Object.fromEntries(fxNames.map((f) => [f + 'Bar2', 'off']));
  const part = await composePhrase('guitar', room, 0, 'test', async (q) =>
    reply(q, { ...on, ...off, advance: '4' }),
  );
  assert.ok(fxNames.every((f) => effectsAtBeat(part, 0)[f] && effectsAtBeat(part, 3.999)[f]));
  assert.ok(fxNames.every((f) => !effectsAtBeat(part, 4)[f]));
  assert.ok(part.effectsTimeline?.every((c) => c.traceId));
  assert.deepEqual(part.decision.effects, effectsAtBeat(part, 0));
});

test('polyphonic decoding uses distinct Jev-supported pitches instead of collapsing voices onto one key', () => {
  const trace = reply({
    model: 'test',
    state: { plan: { arc: 'settle' } },
    questions: Object.fromEntries(
      [0, 1, 2].map((i) => [
        'right' + i,
        {
          type: 'choice' as const,
          instructions: 'Exact voice pitch',
          criteria: { '60': 'C', '64': 'E', '67': 'G', '72': 'C5' },
        },
      ]),
    ),
  });
  for (const answer of Object.values(trace.answers))
    answer.probabilities = { '60': 0.7, '64': 0.2, '67': 0.1, '72': 0 };
  applyPerformanceChoices(trace, () => 0);
  assert.deepEqual(
    Object.values(trace.appliedAnswers!).map((a) => a.choice),
    ['60', '64', '67'],
  );
  assert.deepEqual(
    Object.values(trace.answers).map((a) => a.choice),
    ['60', '60', '60'],
  );
});

test('creative sampling preserves raw answers, excludes zero probability and replays the selected choice', () => {
  const trace = reply(
    {
      model: 'test',
      state: {},
      questions: {
        pitch: {
          type: 'choice',
          instructions: 'pitch',
          criteria: { '60': 'C', '62': 'D', '64': 'E' },
        },
      },
    },
    { pitch: '60' },
  );
  trace.answers.pitch = {
    choice: '60',
    probabilities: { '60': 0.6, '62': 0.4, '64': 0 },
    confidence: 0.3,
  };
  const raw = structuredClone(trace.answers);
  applyPerformanceChoices(trace, () => 0.99);
  assert.deepEqual(trace.answers, raw);
  assert.equal(trace.appliedAnswers!.pitch.choice, '62');
  assert.equal(trace.appliedAnswers!.pitch.confidence, undefined);
  const replay = structuredClone(trace);
  applyPerformanceChoices(replay, () => 0.99);
  assert.deepEqual(replay.appliedAnswers, trace.appliedAnswers);
});

test('working lighting cannot hide three failed musical compositions behind an endless fallback loop', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000000 });
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const request = JSON.parse(init.body as string) as JevRequest;
    if (!request.questions.opener && !request.questions.wash)
      return new Response('', { status: 503 });
    return new Response(
      JSON.stringify({
        answers: reply(request, { opener: 'bass', bpm: '96', root: '0', mode: 'minor' }).answers,
      }),
    );
  });
  const room = new Room('Still listening', 'live', 'fixture-key');
  await room.start();
  for (let i = 0; i < 25 && room.state.status !== 'ended'; i++) {
    t.mock.timers.tick(1000);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.equal(room.state.status, 'ended');
  assert.match(room.state.error!, /three phrases/);
  assert.ok(room.state.traces.some((trace) => trace.role === 'lights' && trace.source === 'jev'));
  assert.ok(
    room.state.frames.every((frame) => frame.parts.every((part) => part.notes.length === 0)),
  );
  room.stop();
});
