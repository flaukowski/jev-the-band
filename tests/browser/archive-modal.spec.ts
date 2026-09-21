import { test, expect } from '@playwright/test';
test('archive modal selects days, caps pages at 20, preserves full hover text and restores focus', async ({
  page,
}) => {
  const description =
    'A long description with the full musical direction intact, including the final quiet resolution after a warm and winding guitar solo.';
  const entries = Array.from({ length: 25 }, (_, i) => ({
    id: `song-${i}`,
    prompt: `Song ${i + 1}\n${description}`,
    title: `Song ${i + 1}`,
    mode: 'live',
    status: 'ended',
    startedAt: 100000 + i * 1000,
    day: '2026-09-21',
    songs: [],
  }));
  entries.push({
    ...entries[0],
    id: 'old-song',
    prompt: 'Yesterday\nEarlier show',
    title: 'Yesterday',
    day: '2026-09-20',
  });
  await page.route('**/api/archive?*', (r) => r.fulfill({ json: entries }));
  await page.route('**/api/archive/song-20?playback=1', (r) =>
    r.fulfill({ status: 503, json: { error: 'Fixture unavailable' } }),
  );
  await page.route('**/api/health', (r) =>
    r.fulfill({ json: { ok: true, serverTime: Date.now(), liveAvailable: false } }),
  );
  await page.route('**/api/events*', (r) =>
    r.fulfill({ contentType: 'text/event-stream', body: 'event: state\ndata: null\n\n' }),
  );
  await page.goto('/');
  const open = page.getByRole('button', { name: 'Jtb archive', exact: true });
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Jtb archive' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.archive-song')).toHaveCount(20);
  await expect(dialog.getByText('1–20 of 25 songs', { exact: true })).toBeVisible();
  await expect(dialog.locator('.archive-description').first()).toHaveAttribute(
    'title',
    description,
  );
  await dialog.locator('.archive-description').first().hover();
  expect(
    await dialog
      .locator('.archive-description')
      .first()
      .evaluate((e) => e.scrollWidth > e.clientWidth),
  ).toBe(true);
  await dialog.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(dialog.locator('.archive-song')).toHaveCount(5);
  await expect(dialog.getByRole('heading', { name: 'Song 21', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Play song: Song 21', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('503');
  await expect(dialog.getByLabel('Recording playback')).toContainText('Song 21 of 25');
  await dialog.getByRole('searchbox').fill('Song 25');
  await expect(dialog.locator('.archive-song')).toHaveCount(1);
  await expect(dialog.getByText('Page 1 of 1', { exact: true })).toBeVisible();
  await dialog.getByRole('searchbox').fill('');
  await dialog.getByLabel('Show day').selectOption('2026-09-20');
  await expect(dialog.getByRole('heading', { name: 'Yesterday', exact: true })).toBeVisible();
  await expect(dialog.locator('.archive-song')).toHaveCount(1);
  await dialog.getByLabel('Show day').selectOption('2026-09-21');
  await page.screenshot({ path: 'artifacts/modal-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/modal-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  await open.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close archive', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
