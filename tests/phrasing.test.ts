import test from 'node:test';
import assert from 'node:assert/strict';
import { composePhrase, phrasePlanRequest } from '../server/composer.js';
import { continuingPhrase, continuingSolo } from '../server/solo.js';
import { nextThemeFrame } from '../shared/setlist.js';
import { Room } from '../server/room.js';
import {
  defaultLighting,
  type JevRequest,
  type Trace,
  type Part,
  type Snapshot,
  type Musician,
} from '../shared/music.js';

function fixture(
  request: JevRequest,
  role: Musician,
  settings: Record<string, string>,
  serial: number,
): Trace {
  const defaults = {
    action: 'vary',
    phraseBars: '12',
    bars: '12',
    attacks: role === 'keys' ? '8' : '10',
    root: '0',
    mode: 'minor',
    style: 'soul_gospel',
    arc: 'settle',
    entry: '0',
    register: 'middle',
    texture: 'single_line',
    advance: '0.5',
    duration: '0.25',
    sound: 'play',
    rightCount: '1',
    leftCount: '0',
    ...settings,
  };
  return {
    id: `fixture-${serial}`,
    role,
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
        const preferred = defaults[key as keyof typeof defaults];
        const value = preferred && options.includes(preferred) ? preferred : options[0];
        assert.ok(value, `nonempty ${key}`);
        return [
          key,
          {
            choice: value,
            probabilities: Object.fromEntries(options.map((o) => [o, o === value ? 1 : 0])),
          },
        ];
      }),
    ),
  };
}
function addPart(room: Snapshot, part: Part, id: number) {
  const frame = {
    id,
    at: Date.now() - 10000,
    durationMs: 5000,
    bpm: 96,
    root: 0,
    mode: 'minor' as const,
    parts: [part],
    lighting: defaultLighting,
    chapter: 'fixture',
    ending: false,
  };
  room.frames.push(frame);
  room.frame = frame;
}

for (const role of ['guitar', 'keys'] as const)
  test(`${role} commits to a 12-bar solo with six fresh full-span melodic chunks and preserved raw decisions`, async () => {
    const room = new Room('A warm melodic celebration', 'live', '').view();
    room.soloInvitation = { role, urgency: 1, required: true };
    let serial = 0;
    const chunks: Part[] = [];
    for (let i = 0; i < 6; i++) {
      if (i) room.soloInvitation = undefined;
      const records: { trace: Trace; raw: string }[] = [];
      const part = await composePhrase(role, room, i, 'test', async (request) => {
        const trace = fixture(request, role, { action: i ? 'develop' : 'solo' }, serial++);
        records.push({ trace, raw: JSON.stringify(trace.answers) });
        return trace;
      });
      assert.equal(part.solo, true);
      assert.equal(part.performance?.soloBars, 12);
      assert.equal(part.performance?.soloPhrases, i + 1);
      const melody = part.notes.filter((n) => role !== 'keys' || n.hand === 'right');
      assert.ok(melody.length >= 8);
      assert.ok(melody.at(-1)!.beat >= 6.49);
      assert.ok(new Set(melody.map((n) => n.midi)).size >= 2);
      if (i)
        assert.notDeepEqual(
          part.notes.map((n) => [n.midi, n.beat]),
          chunks[i - 1].notes.map((n) => [n.midi, n.beat]),
        );
      for (const { trace, raw } of records)
        assert.equal(JSON.stringify(trace.answers), raw, 'raw model answers must remain unchanged');
      chunks.push(part);
      addPart(room, part, i);
      assert.equal(continuingSolo(part), i < 5);
    }
    const finished = await composePhrase(role, room, 6, 'test', async (request) =>
      fixture(request, role, { action: 'support', phraseBars: '2' }, serial++),
    );
    assert.equal(finished.solo, false);
  });

test('ordinary 12-bar musical ideas continue without hold or a new private theme and end independently', async () => {
  const room = new Room('An evolving bass conversation', 'live', '').view();
  let serial = 0;
  for (let i = 0; i < 6; i++) {
    const part = await composePhrase('bass', room, i, 'test', async (request) =>
      fixture(request, 'bass', {}, serial++),
    );
    assert.equal(part.performance?.phraseBars, 12);
    assert.equal(part.performance?.phraseChunks, i + 1);
    assert.equal(continuingPhrase(part), i < 5);
    addPart(room, part, i);
    if (i < 5) {
      const next = phrasePlanRequest('bass', room, i + 1, 'test');
      assert.deepEqual(Object.keys(next.questions.phraseBars.criteria), ['12']);
      assert.ok(!('hold' in next.questions.action.criteria));
      assert.ok(!('new_theme' in next.questions.intent.criteria));
    }
  }
});

test('rig decisions run alongside note decisions and are accepted together', async () => {
  const room = new Room('A warm groove', 'live', '').view();
  let releaseRig: (() => void) | undefined;
  let notesBeforeRig = false;
  const part = await composePhrase('guitar', room, 0, 'test', async (request) => {
    if ('driveBar2' in request.questions)
      await new Promise<void>((resolve) => {
        releaseRig = resolve;
      });
    else if ('pitch' in request.questions) {
      notesBeforeRig = !!releaseRig;
      releaseRig?.();
    }
    return fixture(request, 'guitar', { action: 'vary', phraseBars: '2' }, 0);
  });
  assert.ok(notesBeforeRig, 'note composition does not wait for the independent rig request');
  assert.equal(part.effectsTimeline?.length, 2);
  assert.ok(part.notes.length);
});

test('a late lighting response does not discard a musician completed before its deadline', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000000 });
  let releaseLights: (() => void) | undefined;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const request = JSON.parse(init.body as string);
    if ('wash' in request.questions)
      await new Promise<void>((resolve) => {
        releaseLights = resolve;
      });
    const trace = fixture(request, 'keys', { opener: 'keys', action: 'vary' }, 0);
    return new Response(JSON.stringify({ answers: trace.answers, usage: { cost: 0 } }));
  });
  const room = new Room('Opening', 'live', 'fixture', 'test', 6000);
  const started = room.start();
  for (let turn = 0; turn < 20; turn++) await new Promise<void>((resolve) => setImmediate(resolve));
  assert.ok(releaseLights);
  t.mock.timers.tick(6901);
  releaseLights();
  await started;
  assert.equal(room.state.frame?.parts[0].source, 'jev');
  assert.ok(room.state.frame!.parts[0].notes.length);
  assert.equal(room.state.traces.find((trace) => trace.role === 'lights')?.source, 'fallback');
  room.stop();
});

test('theme queue stays in musical time, is FIFO, and rejects invalid room states', () => {
  const room = new Room('First', 'live', '');
  assert.throws(() => room.queueTheme('Next'), /Start a live/);
  room.state.status = 'playing';
  room.state.endsAt = Date.now() + 600000;
  addPart(
    room.state,
    { role: 'bass', notes: [], decision: {} as any, solo: false, repeated: 0, source: 'jev' },
    10,
  );
  assert.equal(nextThemeFrame(room.view(), Date.now()), 15);
  const a = room.queueTheme('A new world');
  const b = room.queueTheme('Then another');
  assert.equal(a.atFrame, 15);
  assert.equal(b.atFrame, 19);
  room.queueTheme('Third');
  room.queueTheme('Fourth');
  assert.throws(() => room.queueTheme('Fifth'), /Four themes/);
  room.stop();
  assert.throws(() => room.queueTheme('Late'), /Start a live/);
});

test('the live scheduler delivers queued transitions, streams independent phrases, and invites a proper solo by three minutes', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000000 });
  let serial = 0;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const request = JSON.parse(init.body as string);
    const name = request.state.persona?.name ?? request.state.context?.persona?.name;
    const role: Musician =
      name === 'JUNE' ? 'keys' : name === 'KIT' ? 'drums' : name === 'MOSS' ? 'bass' : 'guitar';
    const trace = fixture(
      request,
      role,
      { phraseBars: '4', opener: 'keys', bpm: '96', action: 'vary', intent: 'answer_peer' },
      serial++,
    );
    return new Response(JSON.stringify({ answers: trace.answers, usage: { cost: 0 } }));
  });
  const room = new Room('Opening theme', 'live', 'fixture', 'test', 6000);
  const frames: NonNullable<Snapshot['frame']>[] = [];
  room.on('state', (state) => {
    if (state.frame && state.frame.id !== frames.at(-1)?.id)
      frames.push(structuredClone(state.frame));
  });
  await room.start();
  let cue: ReturnType<Room['queueTheme']> | undefined;
  for (let second = 0; second < 205; second++) {
    t.mock.timers.tick(1000);
    await new Promise<void>((resolve) => setImmediate(resolve));
    if (second === 25) cue = room.queueTheme('A new sunlit chapter');
  }
  room.stop();
  assert.ok(cue);
  assert.equal(frames.find((f) => f.themeId === cue.id)?.id, cue.atFrame);
  assert.equal(frames.find((f) => f.id === cue.atFrame - 1)?.themeTitle, 'Opening theme');
  assert.equal(
    frames.find((f) => f.id === cue.atFrame)?.parts.filter((p) => !p.continued).length,
    4,
  );
  const solo = frames.find((f) => f.parts.some((p) => p.solo && p.performance?.soloBars));
  assert.ok(solo, 'scheduled real solo');
  assert.ok(solo.at - room.state.startedAt <= 181000);
  assert.ok(
    frames.some((f) => f.parts.filter((p) => !p.continued).length > 1),
    'independent phrase continuations stream concurrently',
  );
  assert.ok(
    frames.every((f) => f.parts.every((p) => p.source === 'jev')),
    'no hidden fallback composition',
  );
});
