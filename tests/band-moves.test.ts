import test from 'node:test';
import assert from 'node:assert/strict';
import { composePhrase, phrasePlanRequest } from '../server/composer.js';
import { musicalContext } from '../server/musical-context.js';
import { rigRequest } from '../server/rig.js';
import { Room } from '../server/room.js';
import { baseMode, modeLibrary, scaleIntervals, volumes } from '../shared/performance.js';
import { nextTempo } from '../shared/score.js';
import {
  defaultDecision,
  defaultLighting,
  type JevRequest,
  type Musician,
  type Part,
  type Snapshot,
  type Trace,
} from '../shared/music.js';

function fixture(request: JevRequest, role: Musician, settings: Record<string, string>): Trace {
  const defaults: Record<string, string> = {
    action: 'vary',
    phraseBars: '2',
    attacks: '4',
    root: '2',
    mode: 'dorian',
    entry: '0',
    register: 'middle',
    texture: 'single_line',
    advance: '2',
    duration: '1',
    sound: 'play',
    volume: 'warm',
    keyMove: 'stay',
    ...settings,
  };
  return {
    id: 'fixture-' + Math.random(),
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
        const value = options.includes(defaults[key]) ? defaults[key] : options[0];
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
function perform(room: Snapshot, parts: Part[], id: number, root = 2, modeName = 'dorian') {
  const frame = {
    id,
    at: Date.now() - 10000,
    durationMs: 5000,
    bpm: 96,
    root,
    mode: baseMode(modeName),
    modeName,
    parts,
    lighting: defaultLighting,
    chapter: 'fixture',
    ending: false,
  };
  room.frames.push(frame);
  room.frame = frame;
}

test('every mode of melodic and harmonic minor is a seven-note scale Jev can choose', () => {
  const room = new Room('Modes', 'live', '').view();
  const offered = Object.keys(phrasePlanRequest('guitar', room, 0, 't').questions.mode.criteria);
  for (const mode of [
    'melodic_minor',
    'lydian_dominant',
    'altered',
    'phrygian_dominant',
    'ultralocrian',
  ])
    assert.ok(offered.includes(mode), mode);
  for (const [name, mode] of Object.entries(modeLibrary))
    if (name !== 'chromatic') {
      assert.equal(new Set(mode.intervals).size, 7, name);
      assert.equal(mode.intervals[0], 0, name);
    }
  assert.deepEqual(
    [baseMode('phrygian_dominant'), baseMode('melodic_minor')],
    ['mixolydian', 'dorian'],
  );
  assert.ok(
    scaleIntervals('lydian_dominant').includes(6) && scaleIntervals('lydian_dominant').includes(10),
  );
});

test('one player leads a key change only when the window is open; the move rewrites its own key and cues the band', async () => {
  const room = new Room('Leader', 'live', '').view();
  perform(room, [], 0);
  const closed = phrasePlanRequest('bass', room, 9, 't');
  assert.deepEqual(Object.keys(closed.questions.keyMove.criteria), ['stay']);
  room.keyLeadOpen = true;
  assert.deepEqual(
    Object.keys(phrasePlanRequest('drums', room, 9, 't').questions.keyMove.criteria),
    ['stay'],
  );
  const bass = await composePhrase('bass', room, 9, 't', async (request) =>
    fixture(request, 'bass', { keyMove: 'up_fourth' }),
  );
  assert.deepEqual(bass.performance?.keyLead, { root: 7, mode: 'dorian', move: 'up_fourth' });
  assert.deepEqual(bass.tonalIntent, { root: 7, mode: 'dorian' });
  const relative = await composePhrase('keys', room, 9, 't', async (request) =>
    fixture(request, 'keys', { keyMove: 'relative' }),
  );
  assert.deepEqual(relative.tonalIntent, { root: 5, mode: 'major' });

  // After the change has sounded, a bandmate hears the cue and an old commitment no longer pins its key.
  const guitar: Part = {
    role: 'guitar',
    notes: [{ midi: 62, beat: 0, duration: 1, velocity: 0.6 }],
    decision: defaultDecision(),
    solo: false,
    repeated: 0,
    source: 'jev',
    tonalIntent: { root: 2, mode: 'dorian' },
    performance: {
      style: 'pocket_funk',
      arc: 'settle',
      texture: 'single_line',
      palette: 'diatonic',
      chord: 'minor7',
      tensionPhrases: 0,
      motifAge: 0,
      phraseBars: 8,
      phraseChunks: 1,
    },
  };
  perform(room, [bass, guitar], 1, 7);
  room.keyChange = { by: 'bass', root: 7, mode: 'dorian', atFrame: 1 };
  const context = musicalContext(room, 'guitar');
  assert.match(context.bandKey!.cue!, /MOSS just led the band to G dorian/);
  assert.equal(context.bandKey!.youHaveFollowed, false);
  assert.equal(
    musicalContext(room, 'bass').bandKey!.cue,
    undefined,
    'the leader is not told to follow itself',
  );
  const follow = phrasePlanRequest('guitar', room, 2, 't');
  assert.ok(Object.keys(follow.questions.root.criteria).length === 12, 'root is free to follow');
  assert.deepEqual(
    Object.keys(follow.questions.style.criteria),
    ['pocket_funk'],
    'the phrase itself continues',
  );
});

test('the drummer leads tempo, chooses a feel the band can hear, and everyone has five dynamic levels', async () => {
  const push = { ...defaultDecision(), tempo: 'push' as const };
  const stay = defaultDecision();
  assert.equal(nextTempo(100, 100, [stay, stay, push]), 100.4);
  assert.equal(nextTempo(100, 100, [stay, stay, push], push), 102.5);
  assert.equal(nextTempo(109.5, 100, [push], push), 110, 'still bounded to ten percent');
  const room = new Room('Feel', 'live', '').view();
  const plan = phrasePlanRequest('drums', room, 0, 't');
  assert.ok('half_time' in plan.questions.feel.criteria);
  assert.deepEqual(Object.keys(plan.questions.volume.criteria), Object.keys(volumes));
  const drums = await composePhrase('drums', room, 0, 't', async (request) =>
    fixture(request, 'drums', { feel: 'half_time', volume: 'whisper', pulse: '2' }),
  );
  assert.equal(drums.performance?.feel, 'half_time');
  assert.equal(drums.performance?.volume, 'whisper');
  perform(room, [drums], 0);
  const heard = musicalContext(room, 'bass');
  assert.equal(heard.drummerFeel, 'half_time');
  assert.deepEqual(heard.bandDynamics?.peers, ['whisper']);
  assert.ok(volumes.whisper.gain < volumes.warm.gain && volumes.warm.gain < volumes.roar.gain);
});

test('only the guitar rig has an overdrive and a lead gain stage, chosen per bar', async () => {
  const room = new Room('Gain', 'live', '').view();
  const plan = fixture(phrasePlanRequest('guitar', room, 0, 't'), 'guitar', {}).answers;
  const rig = rigRequest('guitar', 't', {}, plan);
  assert.deepEqual(Object.keys(rig.questions.driveLevel.criteria), ['overdrive', 'lead']);
  assert.ok('driveLevelBar2' in rig.questions);
  assert.ok(!('driveLevel' in rigRequest('keys', 't', {}, plan).questions));
  const part = await composePhrase('guitar', room, 0, 't', async (request) =>
    fixture(request, 'guitar', { driveLevel: 'overdrive', driveLevelBar2: 'lead' }),
  );
  assert.deepEqual(
    part.effectsTimeline?.map((cue) => cue.driveLevel),
    ['overdrive', 'lead'],
  );
});

test('an over-used choice rests so Jev must pick its best alternative, without touching the shared option tables', () => {
  const room = new Room('Bored', 'live', '').view();
  room.startedAt = Date.now() - 200000;
  const keys: Part = {
    role: 'keys',
    notes: [{ midi: 64, beat: 0, duration: 1, velocity: 0.6, hand: 'right', patch: 'rhodes' }],
    decision: defaultDecision(),
    solo: false,
    repeated: 0,
    source: 'jev',
    tonalIntent: { root: 2, mode: 'dorian' },
    performance: {
      style: 'jazz_funk',
      arc: 'settle',
      texture: 'split_comp_lead',
      palette: 'diatonic',
      chord: 'minor7',
      tensionPhrases: 0,
      motifAge: 0,
      hasPlayed: true,
      recentChoices: {
        right: Array(8).fill('rhodes'),
        volume: Array(8).fill('warm'),
        left: ['organ', 'rhodes'],
      },
    },
  };
  perform(room, [keys], 12);
  let rested = 0;
  for (let phrase = 13; phrase < 33; phrase++) {
    const plan = phrasePlanRequest('keys', room, phrase, 't');
    const state = plan.state as { restingChoices?: Record<string, string> };
    if (!('rhodes' in plan.questions.right.criteria)) {
      rested++;
      assert.match(state.restingChoices!.right, /rhodes: you have used it 8 phrases running/);
      assert.ok(
        Object.keys(plan.questions.right.criteria).length >= 5,
        'every other keyboard remains',
      );
    }
    assert.ok('rhodes' in plan.questions.left.criteria, 'a fresh choice is never rested');
  }
  assert.ok(rested >= 12, `rhodes rested in ${rested} of 20 decisions`);
  assert.ok(
    'warm' in volumes &&
      'rhodes' in
        phrasePlanRequest('keys', new Room('x', 'live', '').view(), 0, 't').questions.right
          .criteria,
  );
});

test('a bass or drum feature never drops that player out of the rotation', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000000 });
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const request = JSON.parse(init.body as string);
    const name = request.state.persona?.name ?? request.state.context?.persona?.name;
    const role: Musician =
      name === 'JUNE' ? 'keys' : name === 'KIT' ? 'drums' : name === 'MOSS' ? 'bass' : 'guitar';
    const trace = fixture(request, role, {
      opener: 'bass',
      bpm: '96',
      action: role === 'bass' || role === 'drums' ? 'solo' : 'vary',
    });
    return new Response(JSON.stringify({ answers: trace.answers, usage: { cost: 0 } }));
  });
  const room = new Room('Rhythm section feature', 'live', 'fixture', 'test', 6000);
  const updates: Record<string, Set<number>> = { bass: new Set(), drums: new Set() };
  room.on('state', (state) => {
    for (const part of state.frame?.parts ?? [])
      if (part.role in updates && !part.continued && part.updatedAtFrame !== undefined)
        updates[part.role].add(part.updatedAtFrame);
  });
  await room.start();
  for (let second = 0; second < 80; second++) {
    t.mock.timers.tick(1000);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  room.stop();
  assert.ok(updates.bass.size >= 3, `bass composed ${updates.bass.size} times`);
  assert.ok(updates.drums.size >= 3, `drums composed ${updates.drums.size} times`);
});

test('a refused provider hands the whole room to the configured fallback once, and every trace says who answered', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000000 });
  const seen: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
    seen.push(String(url));
    if (String(url).includes('typesafe.ai')) return new Response('{}', { status: 402 });
    const request = JSON.parse(init.body as string);
    assert.equal(request.model, 'typesafe/jev-1.13', 'the fallback uses its own model id');
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer or-key');
    const trace = fixture(request, 'guitar', { opener: 'bass', bpm: '96' });
    return new Response(JSON.stringify({ answers: trace.answers, usage: { cost: 0 } }));
  });
  const room = new Room('Fallback', 'live', 'ts-key', 'jev-1.13.0', 6000, 600, {
    provider: 'typesafe',
    fallback: { provider: 'openrouter', apiKey: 'or-key', model: 'typesafe/jev-1.13' },
  });
  await room.start();
  for (let second = 0; second < 20; second++) {
    t.mock.timers.tick(1000);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  room.stop();
  assert.deepEqual(
    { from: room.state.providerSwitch?.from, to: room.state.providerSwitch?.to },
    { from: 'typesafe', to: 'openrouter' },
  );
  assert.match(room.state.providerSwitch!.reason, /HTTP 402/);
  assert.equal(
    seen.filter((u) => u.includes('typesafe.ai')).length,
    1,
    'no retries against the refused provider',
  );
  const accepted = room.state.traces.filter((trace) => trace.source === 'jev');
  assert.ok(accepted.length > 5 && accepted.every((trace) => trace.provider === 'openrouter'));
  assert.ok(
    room.state.frames.some((f) => f.parts.some((p) => p.source === 'jev' && p.notes.length)),
  );
  assert.ok(!JSON.stringify(room.view()).includes('or-key'), 'no credential in room state');
});

test('fallback configuration needs both keys and can be switched off', async () => {
  const { jevConfig } = await import('../server/provider.js');
  const both = { TYPESAFE_API_KEY: 'a', OPENROUTER_API_KEY: 'b' };
  assert.deepEqual(jevConfig(both).fallback, {
    provider: 'openrouter',
    apiKey: 'b',
    model: 'typesafe/jev-1.13',
  });
  assert.deepEqual(jevConfig({ ...both, JEV_PROVIDER: 'openrouter' }).fallback, {
    provider: 'typesafe',
    apiKey: 'a',
    model: 'jev-1.13.0',
  });
  assert.equal(jevConfig({ ...both, JEV_FALLBACK: '0' }).fallback, undefined);
  assert.equal(jevConfig({ TYPESAFE_API_KEY: 'a' }).fallback, undefined);
});
