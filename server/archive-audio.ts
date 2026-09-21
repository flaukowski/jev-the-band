import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import type { Archive } from './archive.js';
import type { Snapshot } from '../shared/music.js';

/** One isolated renderer at a time. Committed notes are its only musical input. */
export async function renderMP3(
  snapshot: Snapshot,
  origin: string,
  signal?: AbortSignal,
): Promise<Buffer> {
  const temp = await mkdtemp(join(tmpdir(), 'jtb-audio-'));
  const output = join(temp, 'master.mp3');
  const browser = await chromium
    .launch({
      executablePath: process.env.ARCHIVE_CHROMIUM_PATH || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    })
    .catch(async (error) => {
      await rm(temp, { recursive: true, force: true });
      throw error;
    });
  let encoder: ReturnType<typeof spawn> | undefined;
  const abort = () => {
    encoder?.kill();
    void browser.close();
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    if (signal?.aborted) throw new Error('Render stopped');
    const page = await browser.newPage();
    // No outbound APIs, live subscriptions, or uploads from the render page.
    await page.route('**/*', (route) =>
      new URL(route.request().url()).origin === new URL(origin).origin &&
      !new URL(route.request().url()).pathname.startsWith('/api/')
        ? route.continue()
        : route.abort(),
    );
    encoder = spawn(
      process.env.FFMPEG_PATH || 'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        's16le',
        '-ar',
        '32000',
        '-ac',
        '2',
        '-i',
        'pipe:0',
        '-codec:a',
        'libmp3lame',
        '-b:a',
        '128k',
        '-y',
        output,
      ],
      { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] },
    );
    encoder.stderr?.resume();
    let encoderError: Error | undefined;
    encoder.on('error', (e) => {
      encoderError = e;
    });
    encoder.stdin!.on('error', (e) => {
      encoderError = e;
    });
    const finished = new Promise<void>((resolve, reject) => {
      encoder!.on('error', reject);
      encoder!.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error('MP3 encoder failed')),
      );
    });
    // Attach immediately; a failed process must not create an unhandled rejection.
    void finished.catch(() => {});
    await page.exposeFunction('archivePCM', async (data: string) => {
      if (encoderError) throw encoderError;
      if (!encoder!.stdin!.write(Buffer.from(data, 'base64'))) await once(encoder!.stdin!, 'drain');
    });
    await page.goto(`${origin}/archive-render.html`);
    await page.waitForFunction(() => typeof window.renderArchive === 'function');
    const timeout = setTimeout(() => {
      void browser.close();
      encoder?.kill();
    }, 15 * 60000);
    try {
      await page.evaluate((snapshot) => window.renderArchive(snapshot), snapshot);
      encoder.stdin!.end();
      await finished;
      const mp3 = await readFile(output);
      if (mp3.length < 1000) throw new Error('Empty MP3');
      return mp3;
    } finally {
      clearTimeout(timeout);
    }
  } finally {
    signal?.removeEventListener('abort', abort);
    encoder?.kill();
    await browser.close();
    await rm(temp, { recursive: true, force: true });
  }
}

export function startAudioWorker(archive: Archive, origin: string) {
  let stopped = false;
  const abort = new AbortController();
  let running: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout>;
  const retry = new Map<string, number>();
  async function tick() {
    try {
      const entries = await archive.list();
      // Oldest first: deterministic backfill. No media rebuild after app upgrades.
      for (const entry of entries.reverse()) {
        if (stopped) break;
        if (
          entry.status !== 'ended' ||
          (retry.get(entry.id) ?? 0) > Date.now() ||
          (await archive.audioMeta(entry.id))
        )
          continue;
        const snapshot = await archive.recording(entry.id, true);
        if (
          !snapshot?.frames.length ||
          !snapshot.endedAt ||
          snapshot.endedAt <= snapshot.frames[0].at
        )
          continue;
        try {
          await archive.backfillCues(entry.id, abort.signal);
          const mp3 = await renderMP3(snapshot, origin, abort.signal);
          if (stopped) break;
          await archive.saveAudio(entry.id, mp3, snapshot.frames[0].at, snapshot.endedAt);
          console.log(`Archive MP3 ready: ${entry.id} (${mp3.length} bytes)`);
        } catch (error) {
          retry.set(entry.id, Date.now() + 5 * 60000);
          console.error(
            `Archive MP3 pending: ${entry.id}; retry in five minutes. Saved-note replay remains available. ${error instanceof Error ? error.message.split('\n')[0].slice(0, 160) : 'Render failed'}`,
          );
        }
      }
    } catch {
      console.error('Archive audio worker will retry.');
    }
    if (!stopped) timer = setTimeout(run, 30000);
  }
  function run() {
    running = tick();
  }
  timer = setTimeout(run, 1000);
  return async () => {
    stopped = true;
    abort.abort();
    clearTimeout(timer);
    await running;
  };
}
