import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultDecision, defaultLighting, type Frame, type Part } from '../shared/music.js';
import { around, drumVoice, SignalTracker } from '../src/stage/signals.js';

function fixture() {
  const part: Part = {
    role: 'guitar',
    notes: [{ beat: 0, duration: 1, midi: 60, velocity: 0.7 }],
    decision: {
      ...defaultDecision(),
      effects: { ...defaultDecision().effects, drive: true, delay: false },
    },
    effectsTimeline: [
      {
        beat: 0,
        effects: { ...defaultDecision().effects, drive: true, delay: false },
        traceId: 'first-bar',
      },
      {
        beat: 4,
        effects: { ...defaultDecision().effects, drive: false, delay: true },
        traceId: 'second-bar',
      },
    ],
    solo: true,
    repeated: 0,
    source: 'jev',
    continued: true,
  };
  const frame: Frame = {
    id: 2,
    at: 100000,
    durationMs: 8000,
    bpm: 60,
    root: 0,
    mode: 'major',
    parts: [part],
    lighting: defaultLighting,
    chapter: 'test',
    ending: false,
  };
  return { part, frame };
}

test('stage pedals and lens follow the sounding bar cue without altering the musical score', (t) => {
  const { part, frame } = fixture();
  const before = structuredClone(frame);
  let now = frame.at + 3999;
  t.mock.method(Date, 'now', () => now);
  const tracker = new SignalTracker();
  const input = { frame, upcoming: null, playing: true, reduced: false, serverOffset: 0 };
  const first = tracker.update(input, 1);
  assert.equal(first.players.guitar.effects?.drive, true);
  assert.equal(first.players.guitar.effects?.delay, false);
  const drive = first.fx.drive;
  now = frame.at + 4000;
  const second = tracker.update(input, 1);
  assert.equal(second.players.guitar.effects, part.effectsTimeline![1].effects);
  assert.ok(second.fx.drive < drive);
  assert.ok(second.fx.delay > 0);
  assert.deepEqual(frame, before);
});

test('a continuing solo does not anticipate an invented repeated next chunk', (t) => {
  const { frame } = fixture();
  t.mock.method(Date, 'now', () => frame.at + 7500);
  const tracker = new SignalTracker();
  const signals = tracker.update(
    { frame, upcoming: null, playing: true, reduced: false, serverOffset: 0 },
    0.016,
  );
  assert.equal(around(signals, 'guitar', () => true).next, null);
  const next = { ...frame.parts[0].notes[0], midi: 67, beat: 0.5 };
  signals.upcoming = {
    ...frame,
    id: 3,
    at: frame.at + 9000,
    parts: [{ ...frame.parts[0], notes: [next] }],
  };
  const anticipated = around(signals, 'guitar', () => true);
  assert.equal(anticipated.next, next);
  assert.equal(anticipated.nextBeat, 9.5);
});

test('open and closed hi-hats animate the hat limb while low tom stays a tom', () => {
  assert.equal(drumVoice(42), 'hat');
  assert.equal(drumVoice(46), 'hat');
  assert.equal(drumVoice(45), 'tomLo');
});

test('reduced movement suppresses note hits and freezes shader time', (t) => {
  const { frame } = fixture();
  t.mock.method(Date, 'now', () => frame.at);
  const tracker = new SignalTracker();
  const signals = tracker.update(
    { frame, upcoming: null, playing: true, reduced: true, serverOffset: 0 },
    0.1,
  );
  assert.deepEqual(signals.players.guitar.hits, []);
  assert.equal(signals.time, 0);
  assert.equal(signals.fx.drive, 0);
});
