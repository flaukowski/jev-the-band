import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('paid studio audition: director, audible June, and Patch receiving actual browser meters', async ({
  page,
  request,
}) => {
  test.skip(process.env.LIVE_STUDIO !== '1', 'Explicit paid audition only');
  test.setTimeout(140000);
  // Use an isolated server configured with MAX_JEV_REQUESTS=480. Never touch the listening room.
  expect(process.env.TEST_BASE_URL).toBe('http://127.0.0.1:4311');
  await request.post('/api/room/stop');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto('/');
    await page.getByLabel('Title (required)').fill('Saturday after nursery rhymes');
    await page
      .getByLabel('Song description')
      .fill(
        'Saturday after nursery rhymes. June opens alone with a playful piano chord melody, then warm soul-funk guitar answers, a grounded bass and clear natural acoustic drums. Let the innocent theme blossom, build briefly, then give us a warm release. Rich melodic effects, with the kit sounding like a drum kit.',
      );
    await page.getByRole('button', { name: 'Let’s jam', exact: true }).click();
    await expect(page.getByText('TONIGHT’S SONIC CONCEPT', { exact: true })).toBeVisible({
      timeout: 40000,
    });
    await expect
      .poll(
        async () => {
          const room = await (await request.get('/api/room')).json();
          return (
            room?.traces.some(
              (t: any) =>
                t.role === 'engineer' &&
                t.source === 'jev' &&
                Object.values(t.request.state.measuredLevels).some((v: any) => v.rmsDb > -55),
            ) && room.frames.some((f: any) => f.parts.length === 4)
          );
        },
        { timeout: 65000, intervals: [1500] },
      )
      .toBeTruthy();
    let room = await (await request.get('/api/room')).json();
    expect(room.director.status).toBe('ready');
    expect(room.requests).toBeLessThanOrEqual(480);
    expect(
      room.frames.some((f: any) =>
        f.parts.some((p: any) => p.role === 'keys' && p.notes.length > 0),
      ),
    ).toBe(true);
    expect(room.frames.at(-1).engineerMix.traceId).toBeTruthy();
    await expect(page.getByLabel('June keyboard sounds')).toBeVisible();
    await page.getByLabel('Next song title').fill('The next movement');
    await page
      .getByLabel('Next song description')
      .fill(
        'The nursery lights dim into a spacious late-night A minor blues. New melodic guitar answers and warm organ, a restrained bass pulse, natural drums.',
      );
    await page.getByRole('button', { name: 'Queue next · 8-bar lead-in' }).click();
    await expect(page.getByRole('list', { name: 'Queued themes' })).toBeVisible();
    await expect
      .poll(
        async () => {
          const next = await (await request.get('/api/room')).json();
          return next.setlist?.some(
            (c: any) => c.id !== next.id && c.appliedAt && Date.now() >= c.appliedAt,
          );
        },
        { timeout: 50000, intervals: [1000] },
      )
      .toBeTruthy();
    room = await (await request.get('/api/room')).json();
    const queued = room.setlist.find((c: any) => c.id !== room.id);
    const transition = room.frames.find((f: any) => f.id === queued.atFrame);
    expect(transition.themeId).toBe(queued.id);
    expect(transition.parts.every((p: any) => p.source === 'jev' && !p.continued)).toBe(true);
    expect(room.requests).toBeLessThanOrEqual(480);
    expect(errors).toEqual([]);
    await mkdir('artifacts', { recursive: true });
    await writeFile(
      'artifacts/live-studio.json',
      JSON.stringify({ testedAt: new Date().toISOString(), room, errors }, null, 2),
    );
    await page.screenshot({ path: 'artifacts/live-studio-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: 'artifacts/live-studio-mobile.png', fullPage: true });
    console.log(
      JSON.stringify({
        requests: room.requests,
        jevCost: room.cost,
        directorCost: room.director.cost,
        opener: room.opener,
        patchDecisions: room.traces.filter((t: any) => t.role === 'engineer' && t.source === 'jev')
          .length,
        mix: room.frames.at(-1).engineerMix,
        pageErrors: errors.length,
      }),
    );
  } finally {
    await request.post('/api/room/stop');
  }
});
