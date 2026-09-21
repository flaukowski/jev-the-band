import { test, expect } from '@playwright/test';

test('audience crossfades remain bounded, quiet really fades out, and disposal leaves the shared context open', async ({
  page,
}) => {
  // Only a static module harness: no room, Jev calls, microphone, or audible browser output.
  await page.route('**/audience-harness', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Audience audio harness</title>',
    }),
  );
  await page.goto('/audience-harness');
  const result = await page.evaluate(async () => {
    const modulePath = '/src/audience.ts';
    const { AudiencePlayer } = await import(modulePath);
    const ctx = new OfflineAudioContext(2, 36 * 22050, 22050);
    const audience = new AudiencePlayer(ctx);
    await audience.loadBank();
    audience.start('test-room');
    audience.tick(9.4);
    audience.tick(18.9);
    audience.setDirection({ mood: 'applause', levelDb: -18 }, 20);
    audience.tick(20);
    audience.tick(28.4);
    audience.tick(30);
    audience.setDirection({ mood: 'quiet', levelDb: -18 }, 31);
    audience.tick(31);
    const buffer = await ctx.startRendering();
    const data = buffer.getChannelData(0);
    const windowRms = (start: number, end: number) => {
      let power = 0;
      for (let i = start * 22050; i < end * 22050; i++) power += data[i] ** 2;
      return Math.sqrt(power / ((end - start) * 22050));
    };
    let peak = 0,
      maxStep = 0;
    for (let i = 1; i < data.length; i++) {
      peak = Math.max(peak, Math.abs(data[i]));
      maxStep = Math.max(maxStep, Math.abs(data[i] - data[i - 1]));
    }
    const status = audience.status;
    audience.dispose();
    const live = new AudioContext();
    const second = new AudiencePlayer(live);
    second.dispose();
    const stillOpen = live.state !== 'closed';
    await live.close();
    return {
      status,
      peak,
      maxStep,
      early: windowRms(3, 7),
      crossfade: windowRms(10, 12),
      reaction: windowRms(23, 26),
      tail: windowRms(35, 36),
      stillOpen,
    };
  });
  expect(result.status.source).toBe('generated');
  expect(result.status.label).toContain('elevenlabs.io');
  expect(result.early).toBeGreaterThan(0.001);
  expect(result.crossfade).toBeGreaterThan(result.early * 0.6);
  expect(result.reaction).toBeGreaterThan(0.001);
  expect(result.peak).toBeLessThan(0.15);
  expect(result.maxStep).toBeLessThan(0.1);
  expect(result.tail).toBeLessThan(0.00001);
  expect(result.stillOpen).toBe(true);
});

test('unreviewed generated clips never download or claim to be ready', async ({ page }) => {
  let clipRequests = 0;
  await page.route('**/audience-harness', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Audience bank harness</title>',
    }),
  );
  await page.route('**/audience/manifest.json', (route) =>
    route.fulfill({
      json: {
        version: 1,
        source: 'generated',
        provider: 'Fixture',
        model: 'fixture',
        createdAt: new Date().toISOString(),
        license: 'Fixture only',
        samples: [
          {
            id: 'unreviewed',
            path: '/audience/unreviewed.mp3',
            mood: 'listening',
            kind: 'bed',
            durationSeconds: 12,
            prompt: 'Fixture',
            sha256: 'a'.repeat(64),
            approved: false,
          },
        ],
      },
    }),
  );
  await page.route('**/audience/*.mp3', (route) => {
    clipRequests++;
    return route.abort();
  });
  await page.goto('/audience-harness');
  const status = await page.evaluate(async () => {
    const modulePath = '/src/audience.ts';
    const { AudiencePlayer } = await import(modulePath);
    const player = new AudiencePlayer(new OfflineAudioContext(2, 22050, 22050));
    const status = await player.loadBank();
    player.dispose();
    return status;
  });
  expect(status.source).toBe('unavailable');
  expect(status.approvedSamples).toBe(0);
  expect(status.readySamples).toBe(0);
  expect(clipRequests).toBe(0);
});

test('an immediate audience override wins over queued Jev cues and a new room drops old cues', async ({
  page,
}) => {
  await page.route('**/audience-harness', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Audience ownership harness</title>',
    }),
  );
  await page.goto('/audience-harness');
  const result = await page.evaluate(async () => {
    const modulePath = '/src/audience.ts';
    const { AudiencePlayer } = await import(modulePath);
    const render = async (restart: boolean) => {
      const context = new OfflineAudioContext(2, 5 * 22050, 22050);
      const player = new AudiencePlayer(context);
      await player.loadBank();
      player.start('old-room');
      if (restart) {
        player.setDirection({ mood: 'quiet', levelDb: -24 }, 0.2);
        player.stop();
        player.start('new-room');
      } else {
        player.setDirection({ mood: 'grooving', levelDb: -12 }, 0.2);
        // A real manual quiet choice while Jev's future cue is still pending.
        player.setDirection({ mood: 'quiet', levelDb: -24 });
      }
      player.tick(0.3);
      const audio = (await context.startRendering()).getChannelData(0);
      let power = 0;
      for (let i = 3 * 22050; i < 4 * 22050; i++) power += audio[i] ** 2;
      const rms = Math.sqrt(power / 22050);
      player.dispose();
      return rms;
    };
    return { manualQuiet: await render(false), newRoom: await render(true) };
  });
  expect(result.manualQuiet).toBeLessThan(0.000001);
  expect(result.newRoom).toBeGreaterThan(0.001);
});

test('missing audience assets stay silent instead of generating white noise', async ({ page }) => {
  await page.route('**/audience-harness', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Missing bank</title>' }),
  );
  await page.route('**/audience/manifest.json', (route) => route.fulfill({ status: 404 }));
  await page.goto('/audience-harness');
  const result = await page.evaluate(async () => {
    const audienceModule = '/src/audience.ts';
    const { AudiencePlayer } = await import(audienceModule);
    const context = new OfflineAudioContext(2, 22050 * 4, 22050);
    const player = new AudiencePlayer(context);
    await player.loadBank();
    player.start('missing', true);
    player.tick(1);
    const data = (await context.startRendering()).getChannelData(0);
    const peak = data.reduce((p, n) => Math.max(p, Math.abs(n)), 0);
    const status = player.status;
    player.dispose();
    return { peak, status };
  });
  expect(result.peak).toBe(0);
  expect(result.status.source).toBe('unavailable');
});

test('welcome and manual reactions play with no musical frames, respect mute, and cancel cleanly', async ({
  page,
}) => {
  await page.route('**/audience-harness', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Opening crowd</title>',
    }),
  );
  await page.goto('/audience-harness');
  const result = await page.evaluate(async () => {
    const audienceModule = '/src/audience.ts';
    const { AudiencePlayer } = await import(audienceModule);
    const render = async (welcome: boolean, muted = false) => {
      const ctx = new OfflineAudioContext(2, 22050 * 4, 22050);
      const player = new AudiencePlayer(ctx);
      await player.loadBank();
      player.setControls({ enabled: !muted, reactions: true, levelDb: 0 });
      player.start('welcome-test', welcome);
      const accepted = player.triggerReaction('applause');
      const data = (await ctx.startRendering()).getChannelData(0);
      const power = data.slice(22050, 22050 * 3).reduce((p, n) => p + n * n, 0) / (22050 * 2);
      player.dispose();
      return { rms: Math.sqrt(power), accepted };
    };
    return {
      welcome: await render(true),
      manual: await render(false),
      muted: await render(true, true),
    };
  });
  expect(result.welcome.rms).toBeGreaterThan(0.001);
  expect(result.welcome.accepted).toBe(false); // no stacking a second reaction over the welcome
  expect(result.manual.accepted).toBe(true);
  expect(result.manual.rms).toBeGreaterThan(0.001);
  expect(result.muted.rms).toBe(0);
  expect(result.muted.accepted).toBe(false);
});

test('Start sounds the crowd before slow instrument downloads, then failure stops it', async ({
  page,
}) => {
  await page.route('**/audience-harness', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Band startup</title>' }),
  );
  await page.goto('/audience-harness');
  const result = await page.evaluate(async () => {
    const audioModule = '/src/audio.ts';
    const { BandAudio } = await import(audioModule);
    const band = new BandAudio();
    let release!: () => void;
    band.samples.load = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    const enabling = band.enable(true);
    const began = performance.now();
    while (
      (!release || band.audienceStatus?.source !== 'generated') &&
      performance.now() - began < 10000
    )
      await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 1200));
    const before = { status: band.audienceStatus, notes: band.scheduledNotes };
    const firstSpectrum = Array.from(band.spectrum() as Uint8Array).some((n) => n > 0);
    release();
    await enabling;
    band.update('new-room', []);
    const preserved = band.audienceStatus?.active;
    band.cancelPrelude();
    const stopped = !band.audienceStatus?.active;
    band.dispose();
    return { before, firstSpectrum, preserved, stopped };
  });
  expect(result.before.status.source).toBe('generated');
  expect(result.before.status.active).toBe(true);
  expect(result.before.notes).toBe(0);
  expect(result.firstSpectrum).toBe(true);
  expect(result.preserved).toBe(true);
  expect(result.stopped).toBe(true);
});
