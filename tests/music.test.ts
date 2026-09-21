import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultDecision,
  lightRecipes,
  lightingSchema,
  musicians,
  rhythms,
  roles,
  wallOverlays,
  type Lighting,
  type Note,
} from '../shared/music.js';
import {
  compile,
  endingPressure,
  nextRoot,
  nextTempo,
  rehearsal,
  validateNotes,
} from '../shared/score.js';
import { bootstrapRequest, callJev, parseAnswers, requestFor, toLighting } from '../server/jev.js';
import { Room } from '../server/room.js';

test('every instrument produces bounded notes for every action/rhythm over 120 evolving phrases', () => {
  for (let frame = 0; frame < 120; frame++)
    for (const role of musicians)
      for (const rhythm of rhythms) {
        const d = rehearsal(role, frame, 719, null);
        d.rhythm = rhythm;
        const part = compile(role, d, frame % 12, 'dorian', 19 + frame);
        assert.doesNotThrow(() => validateNotes(part.notes, role));
        assert.ok(part.notes.every((n) => n.beat + n.duration <= 8.001));
      }
});
test('keyboard validation counts sustained overlap, separately per hand', () => {
  const note = (midi: number, hand: 'left' | 'right', beat = 0): Note => ({
    midi,
    hand,
    beat,
    duration: 3,
    velocity: 0.6,
  });
  assert.doesNotThrow(() =>
    validateNotes(
      [
        ...Array.from({ length: 5 }, (_, i) => note(50 + i, 'left')),
        ...Array.from({ length: 5 }, (_, i) => note(65 + i, 'right')),
      ],
      'keys',
    ),
  );
  assert.throws(
    () =>
      validateNotes(
        [...Array.from({ length: 5 }, (_, i) => note(60 + i, 'right')), note(70, 'right', 1)],
        'keys',
      ),
    /five simultaneous/,
  );
  assert.doesNotThrow(() =>
    validateNotes(
      [...Array.from({ length: 5 }, (_, i) => note(60 + i, 'right')), note(70, 'right', 3)],
      'keys',
    ),
  );
});
test('hold retains the motif while following a new shared key; support ends a solo', () => {
  const first = compile('guitar', { ...defaultDecision(), action: 'solo' }, 0, 'dorian', 19);
  const hold = compile(
    'guitar',
    { ...defaultDecision(), action: 'hold', degrees: [7, 7, 7, 7, 7, 7, 7, 7] },
    2,
    'dorian',
    19,
    first,
  );
  assert.deepEqual(hold.decision.degrees, first.decision.degrees);
  assert.equal(hold.solo, true);
  assert.equal(hold.notes[0].midi, first.notes[0].midi + 2);
  assert.equal(
    compile('guitar', { ...defaultDecision(), action: 'support' }, 2, 'dorian', 19, hold).solo,
    false,
  );
});
test('two musicians can independently solo', () => {
  assert.ok(
    ['guitar', 'keys']
      .map((role) =>
        compile(
          role as 'guitar' | 'keys',
          { ...defaultDecision(), action: 'solo' },
          2,
          'dorian',
          1,
        ),
      )
      .every((p) => p.solo),
  );
});
test('tempo never drifts beyond ten percent, even under sustained pressure', () => {
  let bpm = 96;
  for (let i = 0; i < 500; i++) bpm = nextTempo(bpm, 96, [{ ...defaultDecision(), tempo: 'push' }]);
  assert.ok(bpm <= 105.6);
  for (let i = 0; i < 1000; i++)
    bpm = nextTempo(bpm, 96, [{ ...defaultDecision(), tempo: 'ease' }]);
  assert.ok(bpm >= 86.4);
});
test('key changes require a second player and a four-phrase settling period', () => {
  const d = { ...defaultDecision(), harmony: 'up_fourth' as const };
  assert.equal(nextRoot(2, [d], 8, 0), 2);
  assert.equal(nextRoot(2, [d, d], 8, 0), 7);
  assert.equal(nextRoot(2, [d, d], 3, 0), 2);
});
test('ending pressure opens at five minutes and increases monotonically', () => {
  assert.equal(endingPressure(299), 0);
  assert.equal(endingPressure(300), 0);
  assert.ok(endingPressure(450) > endingPressure(330));
  assert.equal(endingPressure(600), 1);
});
test('malformed responses cannot become accepted model decisions', () => {
  const room = new Room('test', 'rehearsal', '');
  const request = requestFor('lights', room.view(), 0, 'test');
  assert.throws(() => parseAnswers({}, request), /Missing/);
  const answers = Object.fromEntries(
    Object.entries(request.questions).map(([key, q]) => {
      const entries = Object.keys(q.criteria);
      return [
        key,
        {
          choice: entries[0],
          probabilities: Object.fromEntries(entries.map((v, i) => [v, i === 0 ? 1 : 0])),
        },
      ];
    }),
  );
  assert.equal(Object.keys(parseAnswers({ answers }, request)).length, 8);
  answers.wash.choice = 'invented';
  assert.throws(() => parseAnswers({ answers }, request), /Invalid/);
});
test('Lux chooses the wall picture, an overlay and the sky in its one existing request', () => {
  const room = new Room('test', 'rehearsal', '');
  const request = requestFor('lights', room.view(), 0, 'test');
  assert.deepEqual(Object.keys(request.questions.visual.criteria), [...lightRecipes.visual]);
  assert.deepEqual(Object.keys(request.questions.overlay.criteria), [...wallOverlays]);
  assert.deepEqual(Object.keys(request.questions.sky.criteria), [...lightRecipes.sky]);
  const pick = (choice: string) => ({ choice, probabilities: { [choice]: 1 } });
  const base = {
    wash: pick('deep blue'),
    beam: pick('off'),
    laser: pick('off'),
    intensity: pick('medium'),
    motion: pick('slow'),
  };
  const look = toLighting({
    ...base,
    visual: pick('piano roll'),
    overlay: pick('decision stream'),
    sky: pick('alien abduction'),
  });
  assert.deepEqual(
    [look.visual, look.overlay, look.sky],
    ['piano roll', 'decision stream', 'alien abduction'],
  );
  assert.ok(lightRecipes.visual.includes('song title'));
  // A picture laid over itself is just that picture.
  assert.equal(
    toLighting({ ...base, visual: pick('mandala'), overlay: pick('mandala'), sky: pick('rain') })
      .overlay,
    'none',
  );
  // Frames and traces from before these fields existed still validate.
  assert.equal(toLighting(base).visual, undefined);
  assert.ok(
    lightingSchema.safeParse({
      wash: 'deep blue',
      beam: 'off',
      laser: 'off',
      intensity: 0.5,
      motion: 0.2,
    }).success,
  );
});
test('rehearsal tours every wall picture and holds each sky for its dwell', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000000 });
  const room = new Room('A tour of the desk', 'rehearsal', '');
  const looks: Lighting[] = [];
  let last = -1;
  room.on('state', (state) => {
    if (state.frame && state.frame.id !== last) {
      last = state.frame.id;
      looks.push(state.frame.lighting);
    }
  });
  await room.start();
  for (let i = 0; i < 120; i++) {
    t.mock.timers.tick(1000);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  room.stop();
  assert.ok(looks.length > 20);
  assert.ok(looks.every((l) => l.visual && l.overlay && l.sky && l.overlay !== l.visual));
  assert.ok(new Set(looks.map((l) => l.visual)).size >= 8);
  assert.ok(new Set(looks.map((l) => l.sky)).size >= 2);
  // Weather has inertia: once a sky arrives it stays for at least eight frames.
  let run = 0;
  for (let i = 1; i < looks.length; i++) {
    run++;
    if (looks[i].sky !== looks[i - 1].sky) {
      assert.ok(run >= 8 || i === run, `sky changed after only ${run} frames`);
      run = 0;
    }
  }
});
test('personas see peers and recent changes; the original prompt drops out after the opening', () => {
  const room = new Room('unique opening prompt', 'rehearsal', '');
  for (const role of roles) {
    assert.match(JSON.stringify(requestFor(role, room.view(), 0, 'test')), /unique opening prompt/);
    assert.doesNotMatch(
      JSON.stringify(requestFor(role, room.view(), 4, 'test')),
      /unique opening prompt/,
    );
  }
});
test('rehearsal starts with exactly one musician and makes zero API calls', async () => {
  const room = new Room('The first spark', 'rehearsal', '', 'test', 10, 10);
  await room.start();
  assert.equal(room.state.frame?.parts.length, 1);
  assert.equal(room.state.requests, 0);
  assert.equal(room.state.frame?.parts[0].source, 'rehearsal');
  room.stop();
  assert.equal(room.state.status, 'ended');
});

test('a complete ten-minute rehearsal ends with bounded history and a final landing', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000000 });
  const room = new Room('A full evening in miniature', 'rehearsal', '');
  await room.start();
  for (let i = 0; i < 605 && room.state.status !== 'ended'; i++) {
    t.mock.timers.tick(1000);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.equal(room.state.status, 'ended');
  assert.equal(room.state.frame?.ending, true);
  assert.ok(room.state.frames.length <= 8);
  assert.ok(room.state.traces.length <= 180);
  assert.ok(room.state.endedAt! <= room.state.endsAt);
  assert.equal(room.state.requests, 0);
  room.stop();
});

test('holding a rest preserves silence, including after consecutive failed requests', () => {
  const rest = compile('keys', { ...defaultDecision(), action: 'rest' }, 2, 'dorian', 1);
  const held = compile('keys', { ...defaultDecision(), action: 'hold' }, 2, 'dorian', 1, rest);
  const heldAgain = compile('keys', { ...defaultDecision(), action: 'hold' }, 2, 'dorian', 1, held);
  assert.equal(held.notes.length, 0);
  assert.equal(heldAgain.notes.length, 0);
});

test('HTTP failure stays a labeled fallback and never discloses the key', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('opaque upstream content', { status: 503 }),
  );
  const request = bootstrapRequest('The test room', 'test');
  const trace = await callJev(request, 'bass', -1, 'test-key-do-not-disclose');
  assert.equal(trace.source, 'fallback');
  assert.equal(trace.error, 'Decision service HTTP 503');
  assert.equal(trace.cost, null);
  assert.doesNotMatch(JSON.stringify(trace), /test-key-do-not-disclose|opaque upstream content/);
});

test('an invalid answer retains provider-reported cost but cannot be applied', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(JSON.stringify({ usage: { cost: 0.002 }, answers: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  const trace = await callJev(bootstrapRequest('test', 'test'), 'bass', -1, 'test-key');
  assert.equal(trace.source, 'fallback');
  assert.equal(trace.cost, 0.002);
  assert.deepEqual(trace.answers, {});
});

test('three wholly failed rounds stop the room without inventing notes', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000000 });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    calls++;
    if (calls > 1) return new Response('', { status: 503 });
    const request = JSON.parse(init.body as string);
    const chosen: Record<string, string> = { opener: 'bass', bpm: '96', root: '2', mode: 'dorian' };
    const answers = Object.fromEntries(
      Object.entries(request.questions).map(([key, value]) => [
        key,
        {
          choice: chosen[key],
          probabilities: Object.fromEntries(
            Object.keys((value as { criteria: Record<string, string> }).criteria).map((option) => [
              option,
              option === chosen[key] ? 1 : 0,
            ]),
          ),
        },
      ]),
    );
    return new Response(JSON.stringify({ answers }));
  });
  const room = new Room('Failure rehearsal', 'live', 'test-key');
  await room.start();
  for (let i = 0; i < 20 && room.state.status !== 'ended'; i++) {
    t.mock.timers.tick(1000);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.equal(room.state.status, 'ended');
  assert.match(room.state.error ?? '', /three phrases/);
  assert.ok(
    room.state.frames.every((f) =>
      f.parts.every((p) => p.notes.length === 0 && p.source === 'fallback'),
    ),
  );
  assert.equal(room.state.requests, calls);
  room.stop();
});
