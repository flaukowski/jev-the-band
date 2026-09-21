import test from 'node:test';
import assert from 'node:assert/strict';
import {
  audienceBankSchema,
  audienceGain,
  defaultAudienceControls,
  defaultAudienceDirection,
  readAudienceControls,
  readAudienceDirection,
} from '../shared/audience.js';
import { calibrateAudience, proceduralAudience } from '../src/audience.js';
import { audienceGenerationPlan } from '../scripts/generate-audience.js';

test('audience controls preserve silence and cap the absolute level even with an extreme listener trim', () => {
  const d = readAudienceDirection({ mood: 'cheering', levelDb: 100 });
  const c = readAudienceControls({ enabled: true, levelDb: 100, reactions: true });
  assert.equal(d.levelDb, -12);
  assert.equal(c.levelDb, 6);
  assert.ok(Math.abs(audienceGain(d, c) - 10 ** (-12 / 20)) < 1e-10);
  assert.equal(audienceGain({ ...d, mood: 'quiet' }, c), 0);
  assert.equal(audienceGain(d, { ...c, enabled: false }), 0);
  assert.deepEqual(readAudienceControls({ levelDb: NaN }), defaultAudienceControls());
  assert.deepEqual(readAudienceDirection(null), defaultAudienceDirection());
});

test('procedural ambience is repeatable, varied, stereo and independently peak limited', () => {
  const a = proceduralAudience('bed', 12, 8000, 3),
    b = proceduralAudience('bed', 13, 8000, 3);
  assert.deepEqual(a, proceduralAudience('bed', 12, 8000, 3));
  assert.notDeepEqual(a, b);
  assert.notDeepEqual(a[0], a[1]);
  const reaction = proceduralAudience('reaction', 12, 8000, 3);
  assert.notDeepEqual(a, reaction);
  for (const channels of [a, reaction]) {
    let peak = 0,
      power = 0,
      count = 0;
    for (const data of channels)
      for (const n of data) {
        assert.ok(Number.isFinite(n));
        peak = Math.max(peak, Math.abs(n));
        power += n * n;
        count++;
      }
    assert.ok(peak <= 0.500001);
    assert.ok(Math.sqrt(power / count) > 0.01);
  }
  const bad = [Float32Array.from([NaN, Infinity, 0])];
  assert.deepEqual(calibrateAudience(bad), { rms: 0, peak: 0 });
  assert.deepEqual([...bad[0]], [0, 0, 0]);
});

test('generated audience bank records provenance and rejects remote paths, duplicate ids and oversized banks', () => {
  const sample = {
    id: 'listening-1',
    path: '/audience/listening-1.mp3',
    mood: 'listening',
    kind: 'bed',
    durationSeconds: 12,
    prompt: 'Soft club audience',
    sha256: 'a'.repeat(64),
    approved: false,
  };
  const bank = {
    version: 1,
    source: 'generated',
    provider: 'Test provider',
    model: 'test-model',
    createdAt: new Date().toISOString(),
    license: 'Test only',
    samples: [sample],
  };
  assert.ok(audienceBankSchema.safeParse(bank).success);
  for (const path of [
    'https://example.com/a.mp3',
    '/audience/../secret.mp3',
    '/audience/a.mp3?token=secret',
  ])
    assert.equal(
      audienceBankSchema.safeParse({ ...bank, samples: [{ ...sample, path }] }).success,
      false,
    );
  assert.equal(audienceBankSchema.safeParse({ ...bank, samples: [sample, sample] }).success, false);
  assert.equal(
    audienceBankSchema.safeParse({ ...bank, samples: Array(101).fill(sample) }).success,
    false,
  );
});

test('the offline generation plan bounds calls and distributes 100 clips across ambience and gentle reactions', () => {
  const plan = audienceGenerationPlan(100);
  assert.equal(plan.filter((p) => p.kind === 'bed').length, 50);
  assert.equal(plan.filter((p) => p.kind === 'reaction').length, 50);
  assert.equal(new Set(plan.map((p) => p.prompt)).size, 100);
  assert.equal(
    plan.reduce((sum, p) => sum + p.durationSeconds * 40, 0),
    36000,
  );
  for (const clip of plan) {
    assert.match(clip.prompt, /no music/);
    assert.ok(clip.prompt.length <= 450, 'Provider accepts at most 450 characters');
  }
  assert.equal(
    audienceGenerationPlan(24).reduce((sum, clip) => sum + clip.durationSeconds * 40, 0),
    8640,
  );
  assert.throws(() => audienceGenerationPlan(101));
});
