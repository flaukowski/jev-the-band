import { test, expect } from '@playwright/test';
import { defaultDecision, defaultLighting, type Part } from '../../shared/music';
import { defaultEngineerMix } from '../../shared/engineer';

test('real audio switches isolated pedal rigs by bar and lets recorded cymbals ring beyond the score gate', async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  const measured: any[] = [];
  await page.route('**/api/room/levels', (route) => {
    measured.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true } });
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const w = window as any;
    w.rigs = [];
    w.playedBuffers = [];
    w.compressors = [];
    const createCompressor = AudioContext.prototype.createDynamicsCompressor;
    AudioContext.prototype.createDynamicsCompressor = function () {
      const node = createCompressor.call(this);
      w.compressors.push(node);
      return node;
    };
    const Worklet = AudioWorkletNode;
    window.AudioWorkletNode = class extends Worklet {
      constructor(...args: ConstructorParameters<typeof AudioWorkletNode>) {
        super(...args);
        w.rigs.push(this);
      }
    };
    const starts = new WeakMap<AudioBufferSourceNode, number>();
    const start = AudioBufferSourceNode.prototype.start,
      stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.start = function (at = 0, ...rest) {
      starts.set(this, at);
      Reflect.apply(start, this, [at, ...rest]);
    };
    AudioBufferSourceNode.prototype.stop = function (at = 0) {
      w.playedBuffers.push({
        duration: this.buffer?.duration,
        held: at - (starts.get(this) ?? at),
        fingerprint: this.buffer
          ? [101, 4011, 10111].map((i) => this.buffer!.getChannelData(0)[i])
          : [],
      });
      Reflect.apply(stop, this, [at]);
    };
    window.EventSource = class extends EventTarget {
      onopen: (() => void) | null = null;
      onerror = null;
      constructor() {
        super();
        w.testStream = this;
        setTimeout(() => this.onopen?.(), 0);
      }
      close() {}
    } as unknown as typeof EventSource;
  });
  await page.route('**/api/health', (route) =>
    route.fulfill({
      json: { ok: true, serverTime: Date.now(), liveAvailable: false, hostAccessRequired: false },
    }),
  );
  await page.goto('/');
  const snapshot = {
    id: 'audio-fixture',
    title: 'Audio fixture',
    prompt: '',
    mode: 'live',
    status: 'playing',
    startedAt: Date.now(),
    endsAt: Date.now() + 600000,
    seed: 1,
    baseBpm: 120,
    opener: 'guitar',
    frame: null,
    frames: [] as unknown[],
    traces: [],
    requests: 0,
    cost: 0,
    billedCalls: 0,
  };
  await page.evaluate(
    (s) =>
      (window as any).testStream.dispatchEvent(
        new MessageEvent('state', { data: JSON.stringify(s) }),
      ),
    snapshot,
  );
  await page.getByRole('button', { name: 'Listen to this jam', exact: true }).click();
  await expect(page.getByTestId('sample-status')).toHaveText('162 recorded samples ready', {
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Use this browser as reference', exact: true }).click();
  await page.getByRole('button', { name: 'Mute ROOK', exact: true }).click();
  const clean = { ...defaultDecision().effects, drive: false, reverb: false };
  const parts: Part[] = ['guitar', 'keys', 'drums'].map((role) => ({
    role: role as Part['role'],
    decision: { ...defaultDecision(), effects: clean },
    solo: false,
    repeated: 0,
    source: 'rehearsal',
    notes:
      role === 'drums'
        ? [{ midi: 49, beat: 0, duration: 0.125, velocity: 0.62 }]
        : [60, 64, 67].map((midi) => ({
            midi,
            beat: 0,
            duration: 2,
            velocity: 0.5,
            ...(role === 'keys' ? { hand: 'right' as const, patch: 'piano' as const } : {}),
          })),
    effectsTimeline: [
      { beat: 0, effects: { ...clean, drive: role === 'guitar' }, traceId: 'fixture' },
      { beat: 4, effects: { ...clean, drive: role === 'keys' }, traceId: 'fixture' },
    ],
  }));
  const frame = {
    id: 0,
    at: Date.now() + 1000,
    durationMs: 10000,
    bpm: 48,
    root: 0,
    mode: 'major',
    parts,
    engineerMix: { ...defaultEngineerMix(), threshold: -16, ratio: 3, reverb: 0.14 },
    lighting: defaultLighting,
    chapter: 'audio fixture',
    ending: false,
  };
  await page.evaluate(
    (s) => {
      s.frame.at = Date.now() + 1500;
      s.frames[0] = s.frame;
      (window as any).testStream.dispatchEvent(
        new MessageEvent('state', { data: JSON.stringify(s) }),
      );
    },
    { ...snapshot, frame, frames: [frame] },
  );
  const rigStates = () =>
    page.evaluate(() =>
      (window as any).rigs.map((r: AudioWorkletNode) =>
        Math.round(r.parameters.get('enabled')!.value),
      ),
    );
  await expect.poll(rigStates, { timeout: 8000 }).toEqual([1, 0, 0, 0]);
  await expect.poll(rigStates, { timeout: 10000 }).toEqual([0, 0, 1, 0]);
  const tail = await page.evaluate(async () => {
    const manifest = await (await fetch('/samples/manifest.json')).json();
    const crash = manifest.find((s: any) => s.bank === 'drums' && s.midi === 49);
    const sampleRate = (window as any).rigs[0].context.sampleRate;
    const c = new OfflineAudioContext(1, sampleRate, sampleRate);
    const buffer = await c.decodeAudioData(await (await fetch(crash.url)).arrayBuffer());
    let peak = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++)
      for (const v of buffer.getChannelData(ch)) peak = Math.max(peak, Math.abs(v));
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] *= 0.8 / peak;
    const fingerprint = [101, 4011, 10111].map((i) => data[i]);
    return {
      duration: buffer.duration,
      records: (window as any).playedBuffers.filter(
        (p: any) =>
          Math.abs(p.duration - buffer.duration) < 0.001 &&
          p.fingerprint.every((v: number, i: number) => Math.abs(v - fingerprint[i]) < 0.000001),
      ),
    };
  });
  expect(tail.duration).toBeGreaterThan(1);
  expect(tail.records.length).toBeGreaterThan(0);
  expect(tail.records[0].held).toBeGreaterThanOrEqual(tail.duration - 0.02);
  expect(errors).toEqual([]);
  await expect
    .poll(() => measured.some((m) => m.levels.guitar.rmsDb > -55), { timeout: 6000 })
    .toBe(true);
  await page.getByLabel('Master room', { exact: true }).focus();
  await page.getByLabel('Master room', { exact: true }).press('Home');
  await page.getByLabel('Master room', { exact: true }).press('ArrowRight');
  await expect(page.getByLabel('Master mix control')).toHaveValue('manual');
  await expect(page.getByLabel('Master room', { exact: true })).toHaveValue('0.01');
  const glueThreshold = () =>
    page.evaluate(() =>
      Math.round(
        (window as any).compressors.find(
          (c: DynamicsCompressorNode) => Math.abs(c.attack.value - 0.025) < 0.00001,
        ).threshold.value,
      ),
    );
  await page.getByLabel('Master compression threshold', { exact: true }).press('Home');
  await expect.poll(glueThreshold).toBe(-30);
  await page.getByLabel('Master mix control').selectOption('jev');
  await expect.poll(glueThreshold).toBe(-16);
  await expect(page.getByLabel('Audience sound enabled')).toBeChecked();
  await page.getByLabel('Audience sound enabled').uncheck();
  await expect(page.getByLabel('Audience sound enabled')).not.toBeChecked();
  await page.getByLabel('Audience reactions enabled').uncheck();
  await page.getByLabel('Audience mood', { exact: true }).selectOption('quiet');
  await expect(page.getByLabel('Master mix control')).toHaveValue('manual');
  await page.getByLabel('Audience level', { exact: true }).press('Home');
  await expect(page.getByLabel('Audience level', { exact: true })).toHaveValue('-48');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('jev-audience-v1')!)),
  ).toMatchObject({ enabled: false, reactions: false });
  await expect(
    page.getByText('Procedural room + applause · no generated voices', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('article', { name: 'KIT mixer' })
    .getByRole('button', { name: 'Effects rig' })
    .click();
  await expect(page.locator('.effects-rig select')).toHaveCount(3);
  await expect(page.getByLabel('KIT Auto-wah', { exact: true })).toHaveCount(0);
  console.log(
    JSON.stringify({
      barRigs: [
        [1, 0, 0, 0],
        [0, 0, 1, 0],
      ],
      cymbal: tail,
    }),
  );
});
