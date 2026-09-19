import { test, expect, type Page } from '@playwright/test';

// Isolated UI fixtures: never start, stop, or replace the listener's real room.
async function stage(page: Page, available: boolean, room: unknown = null) {
  await page.route('**/api/health', (route) =>
    route.fulfill({
      json: {
        ok: true,
        serverTime: Date.now(),
        liveAvailable: available,
        hostAccessRequired: false,
      },
    }),
  );
  await page.route('**/api/events', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: `event: state\ndata: ${JSON.stringify(room)}\n\n`,
    }),
  );
  await page.goto('/');
  await expect(page.getByLabel('Decision mode')).toBeEnabled();
}

test('a configured key defaults to Live Jev; an explicit demo choice survives health refresh', async ({
  page,
}) => {
  await page.clock.install();
  await stage(page, true);
  await expect(page.getByLabel('Decision mode')).toHaveValue('live');
  await expect(page.locator('.generation-status')).toContainText('LIVE JEV');
  await expect(page.getByRole('button', { name: 'Let’s jam' })).toBeVisible();
  await page.getByLabel('Decision mode').selectOption('rehearsal');
  await expect(page.locator('.generation-status')).toContainText('DEMO · NO AI');
  await expect(page.locator('.generation-status')).toContainText('0 Jev requests');
  await expect(page.getByRole('button', { name: 'Play demo' })).toBeVisible();
  await page.clock.fastForward(31000);
  await expect(page.getByLabel('Decision mode')).toHaveValue('rehearsal');
  await page.getByText('What does Jev actually control?', { exact: true }).click();
  await expect(page.locator('.composition-contract')).toContainText('three built-in motifs');
  await page.screenshot({ path: 'artifacts/modes-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/modes-mobile.png', fullPage: true });
});

test('without a key the demo clearly says that the title is not a musical prompt', async ({
  page,
}) => {
  await stage(page, false);
  await expect(page.getByLabel('Decision mode')).toHaveValue('rehearsal');
  await expect(page.getByRole('option', { name: 'Live Jev · host key needed' })).toHaveAttribute(
    'disabled',
    '',
  );
  await expect(page.locator('.generation-status')).toContainText(
    'the title does not shape the composition',
  );
  await expect(
    page.getByText(
      'This is a procedural instrument demo. Its title is a label, not a musical prompt.',
    ),
  ).toBeVisible();
});

test('a shared running demo reports its actual mode even when the next-jam default is live', async ({
  page,
}) => {
  await page.route('**/api/health', (route) =>
    route.fulfill({
      json: {
        ok: true,
        serverTime: Date.now(),
        liveAvailable: true,
        hostAccessRequired: false,
      },
    }),
  );
  await page.route('**/api/events', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: `event: state\ndata: ${JSON.stringify({
        id: 'ui-demo',
        title: 'Demo',
        prompt: 'Demo',
        mode: 'rehearsal',
        status: 'playing',
        startedAt: Date.now(),
        endsAt: Date.now() + 600000,
        seed: 1,
        baseBpm: 96,
        opener: 'bass',
        frame: null,
        frames: [],
        traces: [],
        requests: 0,
        cost: 0,
        billedCalls: 0,
      })}\n\n`,
    }),
  );
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'End jam', exact: true })).toBeVisible();
  await expect(page.locator('.generation-status')).toContainText('DEMO · NO AI');
  await expect(page.locator('.generation-status')).toContainText('0 Jev requests');
});
