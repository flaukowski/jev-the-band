import { test, expect } from '@playwright/test';

test('shared rehearsal, silent audio render, trace inspection, stop, and mobile layout', async ({
  page,
  context,
  request,
}) => {
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
  await expect(page.getByText('STAGE CONNECTED', { exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await page.getByLabel('Decision mode').selectOption('rehearsal');
  await page.getByLabel('Jam title or description').fill('Lanterns on the river');
  await page.getByRole('button', { name: 'Let’s jam' }).click();
  await expect(page.getByText('OFFLINE REHEARSAL', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Enable sound' }).click();
  await expect
    .poll(
      async () => {
        const r = await request.get('/api/room');
        return (await r.json()).frame?.parts.length;
      },
      { timeout: 25000 },
    )
    .toBe(4);
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.getByText('Lanterns on the river', { exact: true }).first()).toBeVisible();
  const snapshot = await (await request.get('/api/room')).json();
  expect(snapshot.requests).toBe(0);
  expect(snapshot.frames.map((f: { parts: unknown[] }) => f.parts.length).slice(0, 4)).toEqual([
    1, 2, 3, 4,
  ]);
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
  await page.getByRole('button', { name: 'Under the hood' }).click();
  await expect(page.getByRole('complementary', { name: 'Live decision console' })).toBeVisible();
  await page.locator('.trace-summary').first().click();
  await expect(page.locator('.trace-detail pre')).toContainText('requestSHA256');
  await page.screenshot({ path: 'artifacts/stage-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'End jam', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Let’s jam' })).toBeVisible();
  await expect(second.getByRole('button', { name: 'Let’s jam' })).toBeVisible();
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
