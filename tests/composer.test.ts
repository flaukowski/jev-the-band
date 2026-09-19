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
import { defaultDecision, type JevRequest, type Trace } from '../shared/music.js';
import { listeningState } from '../server/listening.js';
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
        const value = selected[key] ?? Object.keys(q.criteria)[0];
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
      calls.length
        ? {
            pitch: String(60 + calls.length),
            advance: calls.length === 1 ? '0.2' : String(1 / 3),
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
  assert.equal(calls.length, maxAttacks + 1);
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
  assert.equal(part.notes[0].provenance?.traceId, calls[1].id);
  for (let i = 1; i < calls.length; i++)
    assert.deepEqual(
      (calls[i].request.state as { alreadyComposed: unknown }).alreadyComposed,
      part.notes.slice(0, i - 1),
    );
  assert.ok(!('rhythm' in calls[0].request.questions));
  assert.ok('0.125' in calls[1].request.questions.advance.criteria);
});
test('drums receive no automatic backbeat; selected rests have no invented accompaniment', async () => {
  const room = new Room('Silence', 'live', '').view();
  const part = await composePhrase('drums', room, 0, 'test', async (q) =>
    reply(q, { pitch: '49', cymbal: 'rest', body: 'rest', advance: '4' }),
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
  const plan = reply(phrasePlanRequest('keys', room, 0, 'test'));
  const q = eventRequest('keys', room, 0, 'test', plan.answers, 0, []);
  const overrides: Record<string, string> = { leftCount: '0', rightCount: '5', duration: '8' };
  for (let i = 0; i < 5; i++) overrides[`right${i}`] = String(60 + i);
  const first = reply(q, overrides);
  const notes = readEvents('keys', first, 0, defaultDecision(), []);
  assert.deepEqual(
    notes.map((n) => n.midi),
    [60, 61, 62, 63, 64],
  );
  const laterRequest = eventRequest('keys', room, 0, 'test', plan.answers, 4, notes);
  assert.deepEqual(laterRequest.questions.right0.criteria, {
    rest: 'All available fingers in this hand are already occupied',
  });
  const later = reply(laterRequest, { leftCount: '0', rightCount: '5' });
  assert.equal(readEvents('keys', later, 4, defaultDecision(), notes).length, 5);
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
test('held phrases cannot be offered again after several unchanged frames', () => {
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
        },
      ],
    },
  ];
  assert.ok(
    !('hold' in phrasePlanRequest('guitar', room.view(), 4, 'test').questions.action.criteria),
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
