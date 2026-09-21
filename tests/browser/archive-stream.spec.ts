import { Room } from '../../server/room.js';
import { Archive } from '../../server/archive.js';
import { renderMP3 } from '../../server/archive-audio.js';
import { test, expect } from '@playwright/test';
test('real MP3 streams, seeks and pauses with synchronized archive visuals', async ({
  page,
  request,
}) => {
  test.skip(
    process.env.ARCHIVE_STREAM_TEST !== '1',
    'Run against the isolated archive render fixture',
  );
  test.setTimeout(90000);
  const origin = process.env.TEST_BASE_URL || 'http://127.0.0.1:4323';
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))
    throw new Error('Use an isolated local server');
  const db = new Archive('', process.env.ARCHIVE_SQLITE_PATH || 'artifacts/stream.sqlite');
  await db.init();
  const room = new Room('Streaming verification\nSaved instruments and stage', 'rehearsal', '');
  await room.start();
  room.stop();
  const snapshot = room.view();
  snapshot.frames[0].durationMs = 15000;
  snapshot.endedAt = snapshot.frames[0].at + 15000;
  await db.state(snapshot);
  const mp3 = await renderMP3(snapshot, origin);
  await db.saveAudio(snapshot.id, mp3, snapshot.frames[0].at, snapshot.endedAt);
  await db.close();
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST') requests.push(r.url());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Jtb archive', exact: true }).click();
  await page
    .getByRole('button', { name: 'Play song: Streaming verification', exact: true })
    .last()
    .click();
  await expect(page.getByLabel('Recording playback')).toContainText('Streaming MP3', {
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Pause replay', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume replay', exact: true })).toBeVisible();
  const seek = page.getByRole('slider', { name: 'Seek recording' });
  const paused = Number(await seek.inputValue());
  await page.waitForTimeout(500);
  expect(Math.abs(Number(await seek.inputValue()) - paused)).toBeLessThan(100);
  await seek.fill('1000');
  await expect(page.getByRole('button', { name: 'Pause replay', exact: true })).toBeVisible();
  await expect.poll(async () => Number(await seek.inputValue())).toBeGreaterThan(1100);
  await page.getByRole('button', { name: 'Pause replay', exact: true }).click();
  await page.screenshot({ path: 'artifacts/stream-player-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/stream-player-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Return to live', exact: true }).click();
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
