import test from 'node:test';
import assert from 'node:assert/strict';
import { directJam } from '../server/director.js';
import { bootstrapRequest } from '../server/jev.js';
import { engineerRequest, readEngineer } from '../server/engineer.js';
import {
  defaultEngineerMix,
  effectiveMaster,
  readMasterControls,
  type ChannelLevels,
} from '../shared/engineer.js';
import { availableEffects, instrumentEffects, rigProfiles } from '../shared/rigs.js';
import { chapterAt, type SonicConcept } from '../shared/concept.js';
import { defaultDecision, type Trace } from '../shared/music.js';
import { Room } from '../server/room.js';
import { musicalContext } from '../server/musical-context.js';

const concept: SonicConcept = {
  concept: 'A nursery melody wanders into a glowing soul celebration.',
  openingInstrument: 'keys',
  openingReason: 'A small piano motif introduces the theme',
  bpm: 104,
  root: 0,
  mode: 'major',
  chapters: [0, 35, 95, 160].map((atSeconds, i) => ({
    name: ['Playground', 'Skipping home', 'Cloud shapes', 'Return'][i],
    atSeconds,
    style: 'soul_gospel',
    arc: i === 2 ? 'build' : 'release',
    harmonicDirection: 'Return to warm C major chords',
    guitar: 'Answer with soft chord stabs',
    bass: 'Anchor the roots then vary the pickup',
    keys: 'Sing the motif in thirds then invert the answer',
    drums: 'Keep a gentle pulse and answer with a short fill',
    sound: 'Warm and clear with soft room ambience',
  })),
};

test('the director is one real structured LLM request, distinctly labeled, with validated chapters and no secret disclosure', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls++;
    assert.match(url, /chat\/completions$/);
    // Exercise real Fetch header validation even when the network is mocked.
    assert.equal(new Headers(init.headers).get('X-Title'), 'JEV the band - sonic director');
    const request = JSON.parse(init.body as string);
    assert.equal(request.response_format.type, 'json_schema');
    assert.ok(request.messages[1].content.includes('nursery rhymes'));
    return new Response(
      JSON.stringify({
        id: 'director-fixture',
        usage: { cost: 0.001 },
        choices: [{ message: { content: JSON.stringify(concept) } }],
      }),
    );
  });
  const report = await directJam(
    'Saturday after nursery rhymes',
    'test-planner',
    'secret-fixture-key',
    ['bass'],
  );
  assert.equal(calls, 1);
  assert.equal(report.status, 'ready');
  assert.equal(report.cost, 0.001);
  assert.equal(report.concept?.openingInstrument, 'keys');
  assert.doesNotMatch(JSON.stringify(report), /secret-fixture-key/);
  const opening = bootstrapRequest('test', 'jev', report.concept, ['bass']);
  assert.notEqual((opening.state as any).persona.name, 'MOSS');
  assert.deepEqual((opening.state as any).recentOpeners, ['bass']);
  assert.equal(chapterAt(report.concept, 40)?.name, 'Skipping home');
  const room = new Room('test', 'live', '');
  room.state.startedAt = Date.now() - 40000;
  room.state.director = report;
  assert.equal(musicalContext(room.view(), 'keys').sharedChart?.keys, concept.chapters[1].keys);
});

test('a failed director is disclosed and does not invent a brief', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('opaque sensitive service text', { status: 503 }),
  );
  const report = await directJam('test', 'test-planner', 'secret-fixture-key');
  assert.equal(report.status, 'failed');
  assert.equal(report.concept, undefined);
  assert.doesNotMatch(JSON.stringify(report), /secret-fixture-key|opaque sensitive/);
});

test('Patch uses measured levels, moves at most 1 dB, never boosts silence or a hot channel, and stays bounded', () => {
  const levels: ChannelLevels = {
    guitar: { rmsDb: -14, peakDb: -3 },
    bass: { rmsDb: -100, peakDb: -100 },
    keys: { rmsDb: -28, peakDb: -15 },
    drums: { rmsDb: -18, peakDb: -6 },
  };
  const mix = defaultEngineerMix();
  const request = engineerRequest(
    new Room('test', 'live', '').view(),
    mix,
    levels,
    Date.now(),
    'test',
  );
  assert.deepEqual((request.state as any).measuredLevels, levels);
  const trace = {
    id: 'engineer-fixture',
    answers: Object.fromEntries(
      Object.entries({
        guitar: '1',
        bass: '1',
        keys: '1',
        drums: '-1',
        reverb: '0.14',
        threshold: '-16',
        ratio: '2',
      }).map(([k, choice]) => [k, { choice, probabilities: { [choice]: 1 } }]),
    ),
  } as Trace;
  const next = readEngineer(trace, mix, levels, 100);
  assert.deepEqual(next.trimDb, { guitar: 0, bass: 0, keys: 1, drums: -1 });
  let end = next;
  for (let i = 0; i < 30; i++) end = readEngineer(trace, end, levels, 100 + i);
  assert.equal(end.trimDb.keys, 6);
  assert.equal(end.trimDb.drums, -6);
  const manual = effectiveMaster(
    end,
    readMasterControls({ mode: 'manual', reverb: 0.1, threshold: -12, ratio: 3 }),
  );
  assert.deepEqual(Object.values(manual.trimDb), [0, 0, 0, 0]);
  assert.equal(manual.reverb, 0.1);
});

test('Kit keeps drum identity even with stale aggressive pedal overrides; other rigs retain their colors', () => {
  assert.deepEqual(availableEffects('drums'), ['drive', 'delay', 'reverb']);
  const all = Object.fromEntries(
    Object.keys(defaultDecision().effects).map((k) => [k, true]),
  ) as ReturnType<typeof defaultDecision>['effects'];
  const drums = instrumentEffects('drums', all);
  assert.equal(drums.wah, false);
  assert.equal(drums.envelope, false);
  assert.equal(drums.chorus, false);
  assert.equal(drums.tremolo, false);
  assert.equal(instrumentEffects('guitar', all).wah, true);
  assert.ok(rigProfiles.drums.drive < rigProfiles.guitar.drive);
  assert.ok(rigProfiles.drums.echo < rigProfiles.guitar.echo);
});
