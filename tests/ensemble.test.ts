import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { defaultDecision, defaultLighting, musicians, type Frame } from '../shared/music.js';
import { compile, rhythmBeats } from '../shared/score.js';
import { defaultMix, channelGain, effectiveEffects, readMix } from '../shared/mixer.js';
import { listeningState } from '../server/listening.js';
import { Room } from '../server/room.js';

test('a player hears only performed notes and elapsed durations, never peers private intentions', () => {
  const room = new Room('test', 'rehearsal', '');
  const part = compile(
    'guitar',
    {
      ...defaultDecision(),
      rhythm: 'sustain',
      effects: { ...defaultDecision().effects, envelope: true },
    },
    0,
    'dorian',
    1,
  );
  part.notes = [
    { beat: 0, duration: 7, midi: 60, velocity: 0.5 },
    { beat: 6, duration: 1, midi: 95, velocity: 0.5 },
  ];
  part.effectsTimeline = [
    { beat: 0, effects: part.decision.effects, traceId: 'old' },
    { beat: 4, effects: { ...part.decision.effects, drive: true }, traceId: 'future-rig' },
  ];
  const f: Frame = {
    id: 0,
    at: 10000,
    durationMs: 8000,
    bpm: 60,
    root: 0,
    mode: 'dorian',
    parts: [part],
    lighting: defaultLighting,
    chapter: 'test',
    ending: false,
  };
  room.state.frames = [f, { ...f, id: 1, at: 18000, root: 11 }];
  room.state.frame = room.state.frames[1];
  const heard = listeningState(room.view(), 'bass', 12180);
  assert.equal(heard.music.rootPitchClass, 0);
  assert.equal(heard.recent.length, 1);
  assert.deepEqual(heard.recent[0].players[0].notes, [
    { beat: 0, midi: 60, velocity: 0.5, heardDuration: 2 },
  ]);
  assert.equal(heard.ownMemory, null);
  assert.doesNotMatch(JSON.stringify(heard), /development|95|future-rig|effectsTimeline/);
  assert.equal(heard.recent[0].players[0].effects.envelope, true);
  assert.equal(heard.recent[0].players[0].effects.drive, part.decision.effects.drive);
  assert.equal(
    listeningState(room.view(), 'guitar', 12180).ownMemory?.decision.effects.envelope,
    true,
  );
});

test('independent commitments admit at most one changed musician, retaining exact peer notes', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000000 });
  const room = new Room('Independent musical lives', 'rehearsal', '');
  const frames: Frame[] = [];
  room.on('state', (state) => {
    if (state.frame && frames.at(-1)?.id !== state.frame.id) frames.push(state.frame);
  });
  await room.start();
  for (let i = 0; i < 80; i++) {
    t.mock.timers.tick(1000);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  room.stop();
  assert.ok(frames.length > 12);
  assert.deepEqual(
    frames.slice(0, 4).map((f) => f.parts.length),
    [1, 2, 3, 4],
  );
  for (let i = 1; i < frames.length; i++) {
    const frame = frames[i];
    const prior = frames[i - 1];
    assert.ok(frame.parts.filter((p) => !p.continued).length <= 1);
    for (const part of frame.parts.filter((p) => p.continued)) {
      const old = prior.parts.find((p) => p.role === part.role)!;
      assert.deepEqual(
        part.notes,
        old.notes.map((n) => ({
          ...n,
          midi: part.role === 'drums' ? n.midi : n.midi + frame.root - prior.root,
        })),
      );
    }
  }
  assert.equal(
    new Set(
      frames
        .slice(4)
        .map((f) => f.decisionRole)
        .filter(Boolean),
    ).size,
    4,
  );
});

test('32nds and tuplets keep exact subdivisions even with swing', () => {
  for (const [rhythm, subdivision] of [
    ['thirty_seconds', 1 / 8],
    ['triplets', 1 / 3],
    ['quintuplets', 1 / 5],
    ['sextuplets', 1 / 6],
  ] as const) {
    const beats = rhythmBeats(rhythm, 'deep');
    assert.ok(beats.some((b, i) => i && Math.abs(b - beats[i - 1] - subdivision) < 1e-8));
    assert.deepEqual(beats, rhythmBeats(rhythm, 'straight'));
  }
});

test('solo phrasing has breaths, long targets and motif continuity across developments', () => {
  const lead = compile('guitar', { ...defaultDecision(), action: 'solo' }, 2, 'dorian', 1);
  assert.ok(Math.max(...lead.notes.map((n) => n.duration)) > 1);
  assert.ok(new Set(lead.notes.map((n) => n.duration.toFixed(2))).size > 3);
  const answer = compile(
    'guitar',
    {
      ...defaultDecision(),
      action: 'develop',
      development: 'answer',
      degrees: [7, 7, 7, 7, 5, 4, 3, 0],
    },
    2,
    'dorian',
    2,
    lead,
  );
  assert.equal(answer.solo, true);
  assert.deepEqual(answer.decision.degrees.slice(0, 4), lead.decision.degrees.slice(0, 4));
  assert.deepEqual(answer.decision.degrees.slice(4), [5, 4, 3, 0]);
});

test('mixer isolation, multi-solo, mute precedence and per-player effect overrides', () => {
  const mix = defaultMix();
  mix.guitar.solo = true;
  assert.ok(channelGain(mix, 'guitar') > 0);
  assert.equal(channelGain(mix, 'bass'), 0);
  mix.keys.solo = true;
  assert.ok(channelGain(mix, 'keys') > 0);
  mix.guitar.mute = true;
  assert.equal(channelGain(mix, 'guitar'), 0);
  mix.keys.db = -6;
  assert.ok(Math.abs(channelGain(mix, 'keys') - 0.5012) < 0.001);
  mix.guitar.rig.envelope = 'on';
  mix.bass.rig.envelope = 'off';
  assert.equal(effectiveEffects(mix.guitar, defaultDecision().effects).envelope, true);
  assert.equal(effectiveEffects(mix.bass, defaultDecision().effects).envelope, false);
  assert.equal(readMix({ guitar: { pan: Infinity, db: 999, tone: -4 } }).guitar.db, 6);
});

test('all bundled recordings have pinned provenance and match their integrity hashes', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../public/samples/manifest.json', import.meta.url), 'utf8'),
  );
  assert.ok(manifest.length > 100);
  for (const entry of manifest) {
    assert.match(entry.source, /raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[a-f0-9]{40}\//);
    assert.ok(['CC0-1.0', 'CC-BY-3.0'].includes(entry.license));
    const bytes = await readFile(new URL(`../public${entry.url}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
  }
  for (const role of musicians.filter((r) => r !== 'keys'))
    assert.ok(manifest.some((e: { bank: string }) => e.bank === role));
});
