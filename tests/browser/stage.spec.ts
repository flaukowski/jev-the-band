import { test, expect } from '@playwright/test';

test('shared rehearsal, silent audio render, trace inspection, stop, and mobile layout', async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(150000);
  await request.post('/api/room/stop');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Observe the real master signal. Chromium is launched with --mute-audio, so no physical playback.
  await page.addInitScript(() => {
    const original = AudioNode.prototype.connect;
    (window as unknown as { audioPeaks: number[] }).audioPeaks = [];
    AudioNode.prototype.connect = function (
      this: AudioNode,
      destination: AudioNode | AudioParam,
      ...rest: number[]
    ) {
      if (destination instanceof AudioDestinationNode) {
        const analyser = this.context.createAnalyser();
        analyser.fftSize = 2048;
        Reflect.apply(original, this, [analyser]);
        Reflect.apply(original, analyser, [destination]);
        const data = new Float32Array(analyser.fftSize);
        setInterval(() => {
          analyser.getFloatTimeDomainData(data);
          const peaks = (window as unknown as { audioPeaks: number[] }).audioPeaks;
          peaks.push(Math.max(...data.map(Math.abs)));
          if (peaks.length > 300) peaks.shift();
        }, 100);
        return destination;
      }
      return Reflect.apply(original, this, [destination, ...rest]);
    } as typeof original;
  });
  await page.goto('/');
  console.log('Stage loaded');
  await expect(page.getByText('STAGE CONNECTED', { exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enable sound' })).toHaveCount(0);
  const promptBox = await page.locator('.prompt-panel').boundingBox();
  const stageBox = await page.locator('.stage-wrap').boundingBox();
  expect(promptBox!.y + promptBox!.height).toBeLessThan(stageBox!.y);
  await page.getByLabel('Decision mode').selectOption('rehearsal');
  await page.getByLabel('Title (required)').fill('Lanterns on the river');
  await page.getByRole('button', { name: 'Play demo' }).click();
  await expect(page.getByTestId('sample-status')).toHaveText('162 recorded samples ready', {
    timeout: 30000,
  });
  await expect(page.getByRole('button', { name: 'Mute sound', exact: true })).toBeVisible();
  console.log('Play enabled recorded voices');
  await expect(page.getByText('DEMO · NO AI', { exact: true }).first()).toBeVisible();
  await expect
    .poll(
      async () => {
        const r = await request.get('/api/room');
        return (await r.json()).frame?.parts.length;
      },
      { timeout: 25000 },
    )
    .toBe(4);
  const snapshot = await (await request.get('/api/room')).json();
  console.log('Four musicians entered');
  expect(snapshot.requests).toBe(0);
  expect(snapshot.frames.map((f: { parts: unknown[] }) => f.parts.length).slice(0, 4)).toEqual([
    1, 2, 3, 4,
  ]);
  const second = await context.newPage();
  await second.goto('/');
  await expect(
    second.getByRole('button', { name: 'Listen to this jam', exact: true }),
  ).toBeVisible();
  await expect(second.getByText('Lanterns on the river', { exact: true }).first()).toBeVisible();
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Math.max(...(window as unknown as { audioPeaks: number[] }).audioPeaks),
        ),
      { timeout: 7000 },
    )
    .toBeGreaterThan(0.001);
  const peak = await page.evaluate(() =>
    Math.max(...(window as unknown as { audioPeaks: number[] }).audioPeaks),
  );
  expect(peak).toBeLessThan(1);
  await page.getByRole('button', { name: 'Solo MOSS in mix', exact: true }).click();
  await expect
    .poll(async () =>
      Number(await page.getByRole('meter', { name: 'ROOK signal' }).getAttribute('aria-valuenow')),
    )
    .toBe(-60);
  await expect
    .poll(
      async () =>
        Number(
          await page.getByRole('meter', { name: 'MOSS signal' }).getAttribute('aria-valuenow'),
        ),
      { timeout: 7000 },
    )
    .toBeGreaterThan(-50);
  await page.getByRole('button', { name: 'Mute MOSS', exact: true }).click();
  await expect
    .poll(async () =>
      Number(await page.getByRole('meter', { name: 'MOSS signal' }).getAttribute('aria-valuenow')),
    )
    .toBe(-60);
  await page.getByRole('button', { name: 'Reset mix' }).click();
  await page.getByLabel('ROOK Distortion', { exact: true }).selectOption('on');
  await page.getByLabel('ROOK Envelope', { exact: true }).selectOption('on');
  await expect(page.locator('.effects-rig small').filter({ hasText: 'overridden' })).toHaveCount(2);
  await page
    .getByRole('article', { name: 'MOSS mixer' })
    .getByRole('button', { name: 'Effects rig' })
    .click();
  await expect(page.getByLabel('MOSS Distortion', { exact: true })).toHaveValue('auto');
  await expect(page.getByLabel('MOSS Envelope', { exact: true })).toHaveValue('auto');
  await page.getByRole('button', { name: 'Reset mix' }).click();
  await page.getByLabel('Camera view').selectOption('front');
  await expect(page.locator('.stage-canvas')).toHaveAttribute('data-camera', 'front');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Reset camera', exact: true }).click();
  await expect(page.locator('.stage-canvas')).toHaveAttribute('data-camera', 'wide');
  await page.getByRole('button', { name: 'Under the hood' }).click();
  await expect(page.getByRole('complementary', { name: 'Live decision console' })).toBeVisible();
  await page.locator('.trace-summary').first().click();
  await expect(page.locator('.trace-detail pre')).toContainText('requestSHA256');
  await page.screenshot({ path: 'artifacts/stage-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'End jam', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play demo' })).toBeVisible();
  await expect(second.getByRole('button', { name: /Let’s jam|Play demo/ })).toBeVisible();
  await second.close();
  await page.getByRole('button', { name: 'Close decision console' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/stage-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify({
      rehearsalAudioPeak: peak,
      staggeredEntrances: [1, 2, 3, 4],
      viewers: 2,
      apiCalls: 0,
      pageErrors: errors.length,
    }),
  );
});
