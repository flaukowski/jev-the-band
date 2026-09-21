import { test, expect } from '@playwright/test';
import { Room } from '../../server/room.js';

test('title/description, archive search and replay are isolated from live writes', async ({
  page,
}) => {
  const room = new Room('Recorded dawn\nWarm bass', 'rehearsal', '');
  await room.start();
  room.stop();
  const recorded = room.view();
  recorded.frames[0].durationMs = 60000;
  recorded.endedAt = recorded.frames[0].at + recorded.frames[0].durationMs;
  const second = {
    ...recorded,
    id: 'second-song',
    title: 'Second song',
    prompt: 'Second song',
    startedAt: recorded.startedAt + 60000,
    setlist: [],
  };
  const errors: string[] = [];
  const posts: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (r.method() === 'POST') posts.push(r.url());
  });
  await page.route('**/api/health', (r) =>
    r.fulfill({
      json: { ok: true, serverTime: Date.now(), liveAvailable: false },
    }),
  );
  await page.route('**/api/events', (r) =>
    r.fulfill({ contentType: 'text/event-stream', body: 'event: state\ndata: null\n\n' }),
  );
  await page.route('**/api/archive?*', (r) =>
    r.fulfill({
      json:
        new URL(r.request().url()).searchParams.get('q') === 'missing'
          ? []
          : [
              { ...recorded, day: '2026-09-20', songs: recorded.setlist },
              { ...second, day: '2026-09-20', songs: [] },
            ],
    }),
  );
  await page.route(`**/api/archive/${recorded.id}?playback=1`, (r) =>
    r.fulfill({ json: recorded }),
  );
  let failSecond = true;
  await page.route('**/api/archive/second-song?playback=1', (r) =>
    failSecond
      ? r.fulfill({ status: 503, json: { error: 'Temporary failure' } })
      : r.fulfill({
          json: {
            ...recorded,
            id: second.id,
            frames: recorded.frames.map((f) => ({ ...f, at: f.at + 60000 })),
            endedAt: recorded.endedAt! + 60000,
          },
        }),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByLabel('Title (required)')).toBeVisible();
  await expect(page.getByLabel('Song description')).toBeVisible();
  await page.getByLabel('Title (required)').fill('');
  await expect(page.getByRole('button', { name: 'Play demo', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Jtb archive', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recorded dawn' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Replay set' })).toHaveCount(0);
  await expect(page.locator('.archive-song')).toHaveCount(2);
  await page.getByRole('searchbox').fill('missing');
  await expect(page.getByText('No recordings found.', { exact: false })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole('searchbox').fill('');
  await page.getByRole('button', { name: 'Replay show', exact: true }).click();
  await expect(page.getByLabel('Recording playback')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.generation-status')).toContainText('ARCHIVE REPLAY', {
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Pause replay', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume replay', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume replay', exact: true }).click();
  await page.getByRole('button', { name: 'Next song', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('503');
  failSecond = false;
  await page.getByRole('button', { name: 'Retry song', exact: true }).click();
  await expect(page.getByLabel('Recording playback')).toContainText('REPLAY · Second song');
  await expect(page.getByRole('button', { name: 'Next song', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Previous song', exact: true }).click();
  await expect(page.getByLabel('Recording playback')).toContainText('REPLAY · Recorded dawn');
  await page.getByRole('button', { name: 'Play song: Second song', exact: true }).click();
  await expect(page.getByLabel('Recording playback')).toContainText('REPLAY · Second song');
  await page.screenshot({ path: 'artifacts/archive-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/archive-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Return to live', exact: true }).click();
  await expect(page.getByLabel('Title (required)')).toBeVisible();
  expect(posts).toEqual([]);
  expect(errors).toEqual([]);
});
