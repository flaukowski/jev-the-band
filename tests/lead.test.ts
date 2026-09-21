import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPerformanceChoices } from '../server/composer.js';
import { applyHeat, nextStaleness, noveltyPressure, sampleWithHeat } from '../server/heat.js';
import { applyCellChoices, cellRequest, gestureName, readCell } from '../server/lead.js';
import { Room } from '../server/room.js';
import { sketchAt } from '../shared/sketch.js';
import {
  defaultDecision,
  random,
  type Answer,
  type JevRequest,
  type Part,
  type Trace,
} from '../shared/music.js';

const answer = (probabilities: Record<string, number>): Answer => ({
  choice: Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0][0],
  probabilities,
});
const certain = (value: string): Answer => ({ choice: value, probabilities: { [value]: 1 } });
function trace(request: JevRequest, answers: Record<string, Answer>): Trace {
  return {
    id: 'lead-fixture',
    role: 'guitar',
    frame: 0,
    at: Date.now(),
    source: 'jev',
    latencyMs: 0,
    request,
    requestHash: 'fixture',
    cost: 0,
    answers,
  };
}
const plan = {
  root: certain('2'),
  mode: certain('dorian'),
  palette: certain('diatonic'),
  chord: certain('minor7'),
  register: certain('middle'),
  texture: certain('split_comp_lead'),
  energy: certain('climb'),
};
function part(performance: Partial<NonNullable<Part['performance']>>): Part {
  return {
    role: 'guitar',
    notes: [],
    decision: defaultDecision(),
    solo: false,
    repeated: 0,
    source: 'jev',
    tonalIntent: { root: 2, mode: 'dorian' },
    performance: {
      style: 'soul_gospel',
      arc: 'settle',
      texture: 'single_line',
      palette: 'diatonic',
      chord: 'minor7',
      tensionPhrases: 0,
      motifAge: 0,
      register: 'middle',
      contour: 'question_answer',
      attacks: '6',
      ...performance,
    },
  };
}

test('novelty pressure rises while a direction is unchanged and with elapsed time, and a real departure cools it', () => {
  const room = new Room('Heat', 'live', '').view();
  room.startedAt = Date.now();
  const fresh = noveltyPressure(part({ staleChunks: 0 }), room);
  const stale = noveltyPressure(part({ staleChunks: 8 }), room);
  assert.ok(fresh < 0.15 && stale > 0.6, `${fresh} ${stale}`);
  room.startedAt = Date.now() - 300000;
  assert.ok(noveltyPressure(part({ staleChunks: 0 }), room) > fresh);
  const same = { style: certain('soul_gospel'), arc: certain('settle'), register: certain('low') };
  assert.equal(
    nextStaleness(part({ staleChunks: 3 }), same),
    4,
    'one changed field is not a departure',
  );
  const departed = { ...same, style: certain('dub_reggae'), arc: certain('space') };
  assert.equal(nextStaleness(part({ staleChunks: 3 }), departed), 0);
});

test('heat reaches lower-probability choices only under pressure, never zero-probability ones, and keeps raw answers', () => {
  const arc = answer({ settle: 0.72, build: 0.18, space: 0.1, peak: 0 });
  const draws = (pressure: number, recent: string[] = []) => {
    const rng = random(7);
    return Array.from({ length: 400 }, () => sampleWithHeat(arc, pressure, rng, recent));
  };
  assert.ok(
    draws(0.08).filter((v) => v === 'settle').length > 320,
    'a young idea mostly keeps its most likely direction',
  );
  assert.ok(!draws(0.08).includes('space'), 'unlikely options stay outside a cool nucleus');
  const hot = draws(0.9, ['settle', 'settle', 'settle']);
  assert.ok(hot.filter((v) => v !== 'settle').length > 200, 'a stale player departs');
  assert.ok(!hot.includes('peak'), 'an option Jev gave no probability is never invented');
  const raw = trace(
    { model: 't', state: {}, questions: {} },
    { arc, tempo: answer({ stay: 0.6, push: 0.4 }) },
  );
  const before = JSON.stringify(raw.answers);
  const applied = applyHeat(raw, 0.9, random(3), { arc: ['settle', 'settle'] });
  assert.equal(JSON.stringify(raw.answers), before);
  assert.equal(applied.tempo.choice, 'stay', 'band votes are not heated');
  assert.equal(raw.heat, 0.9);
});

test("June's left hand plays when the combined probability of playing beats resting", () => {
  const request = { model: 't', state: { plan: { arc: 'build' } }, questions: {} };
  const split = trace(request, {
    leftCount: {
      choice: '0',
      probabilities: { '0': 0.3, '1': 0.08, '2': 0.15, '3': 0.28, '4': 0.17, '5': 0.02 },
    },
  });
  applyPerformanceChoices(split, random(11));
  assert.notEqual(split.appliedAnswers!.leftCount.choice, '0');
  assert.equal(split.answers.leftCount.choice, '0', 'raw answer preserved');
  const resting = trace(request, {
    leftCount: { choice: '0', probabilities: { '0': 0.7, '2': 0.3 } },
  });
  applyPerformanceChoices(resting, random(11));
  assert.equal(resting.appliedAnswers!.leftCount.choice, '0', 'a genuine rest is respected');
});

test('one lead cell becomes a legato run with hammer-ons and pull-offs that lands on a bend into the chosen pitch', () => {
  const request = cellRequest('guitar', 't', {}, plan, 1, [], 0, undefined);
  for (const key of ['start', 'count', 'grid', 'landing', 'gap', 'technique', 'ornament', 'step7'])
    assert.ok(key in request.questions, key);
  assert.ok('bend_up_2' in request.questions.ornament.criteria);
  const t = trace(request, {
    sound: certain('play'),
    start: certain('62'),
    count: certain('5'),
    grid: certain('0.25'),
    landing: certain('2'),
    gap: certain('0.5'),
    technique: certain('legato'),
    ornament: certain('bend_up_2'),
    shape: certain('crescendo'),
    level: certain('0.8'),
    ...Object.fromEntries(
      ['1', '1', '-1', '2', '1', '1', '1'].map((step, i) => ['step' + (i + 1), certain(step)]),
    ),
  });
  const applied = applyCellChoices(t, 'climb', random(5), {});
  assert.equal(gestureName(applied), 'legato run into a bend');
  const { notes, next } = readCell('guitar', t, plan, 1, [], defaultDecision());
  // D dorian ladder from D4: D E F E G; the landing G is fretted at F and bent up a whole step.
  assert.deepEqual(
    notes.map((n) => n.midi),
    [62, 64, 65, 64, 65],
  );
  assert.deepEqual(
    notes.map((n) => n.beat),
    [1, 1.25, 1.5, 1.75, 2],
  );
  assert.deepEqual(
    notes.map((n) => n.articulation),
    ['legato', 'hammer', 'hammer', 'pull', 'bend'],
  );
  assert.deepEqual([notes[4].bend, notes[4].bendShape, notes[4].duration], [2, 'hold', 2]);
  assert.ok(notes[0].velocity < notes[3].velocity, 'crescendo');
  assert.equal(next, 4.5);
  assert.deepEqual(
    notes.map((n) => n.provenance?.slot),
    ['start', 'step1', 'step2', 'step3', 'step4'],
  );
});

test('a lead line turns around at the edge of the instrument and releases the previous ringing note', () => {
  const request = cellRequest('guitar', 't', {}, plan, 4, [], 1, undefined);
  const t = trace(request, {
    sound: certain('play'),
    start: certain('79'),
    count: certain('3'),
    grid: certain('0.5'),
    landing: certain('1'),
    gap: certain('0'),
    technique: certain('slides'),
    ornament: certain('none'),
    shape: certain('even'),
    level: certain('0.66'),
    ...Object.fromEntries(Array.from({ length: 7 }, (_, i) => ['step' + (i + 1), certain('2')])),
  });
  const ringing = [{ midi: 69, beat: 2, duration: 4, velocity: 0.7 }];
  const { notes } = readCell('guitar', t, plan, 4, ringing, defaultDecision());
  assert.equal(notes[0].duration, 2, 'monophonic lead');
  assert.ok(notes.every((n) => n.midi <= 79));
  assert.equal(notes[2].articulation, 'slide');
  assert.equal(notes[2].slideFrom, notes[1].midi - notes[2].midi);
  assert.equal(ringing[0].duration, 4, 'prior state is not mutated');
});

test('a soloing keyboardist comps with distinct Jev-chosen left-hand chord tones', () => {
  const request = cellRequest('keys', 't', {}, plan, 0, [], 0, undefined);
  assert.ok('comp' in request.questions && 'left2' in request.questions);
  const chordTone = { '50': 0.5, '53': 0.3, '57': 0.2 };
  const t = trace(request, {
    sound: certain('play'),
    start: certain('74'),
    count: certain('2'),
    grid: certain('0.5'),
    landing: certain('1'),
    gap: certain('1'),
    technique: certain('legato'),
    ornament: certain('grace_below'),
    shape: certain('even'),
    level: certain('0.8'),
    comp: { choice: 'none', probabilities: { none: 0.4, stab: 0.35, sustain: 0.25 } },
    left0: answer(chordTone),
    left1: answer(chordTone),
    left2: answer(chordTone),
    ...Object.fromEntries(Array.from({ length: 7 }, (_, i) => ['step' + (i + 1), certain('-1')])),
  });
  applyCellChoices(t, 'simmer', random(9), {});
  assert.equal(t.appliedAnswers!.comp.choice, 'stab');
  const { notes } = readCell('keys', t, plan, 0, [], { left: 'organ', right: 'rhodes' });
  const left = notes.filter((n) => n.hand === 'left');
  assert.equal(new Set(left.map((n) => n.midi)).size, 3, 'three different keys');
  assert.ok(left.every((n) => n.patch === 'organ' && n.beat === 0));
  const right = notes.filter((n) => n.hand === 'right');
  assert.deepEqual(
    right.map((n) => [n.midi, n.beat]),
    [
      [74, 0],
      [71, 0.4375],
      [72, 0.5],
    ],
  );
});

test('the arranger sketch is advisory context selected by solo position', () => {
  const chunk = (bars: string) => ({
    bars,
    energy: 'climb' as const,
    register: 'high' as const,
    idea: 'sequence the motif upward',
    targetDegrees: ['5' as const],
    techniques: ['long_bend' as const],
  });
  const sketch = {
    title: 'Lantern',
    story: 'A patient climb toward one crying bend.',
    motif: '5 up to b7, fall to 4',
    chunks: ['1-2', '3-4', '5-6', '7-8'].map(chunk),
  };
  assert.equal(sketchAt(undefined, 0), undefined);
  assert.equal(sketchAt(sketch, 1)!.now.bars, '3-4');
  assert.equal(sketchAt(sketch, 1)!.next!.bars, '5-6');
  assert.equal(sketchAt(sketch, 9)!.now.bars, '7-8');
  assert.match(sketchAt(sketch, 0)!.source, /cannot hear the band/);
});
