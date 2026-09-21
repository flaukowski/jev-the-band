import 'dotenv/config';
import express from 'express';
import { resolve } from 'node:path';
import { z } from 'zod';
import { Archive, ArchiveWriter, stateRows } from './archive.js';
import { songInput, songPrompt } from './song-input.js';
import { Room } from './room.js';
import { Chat, chatInput } from './chat.js';
import { levelsSchema } from '../shared/engineer.js';
import { jevConfig } from './provider.js';
import { readFileSync } from 'node:fs';
const app = express();
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4310);
const local = ['127.0.0.1', 'localhost', '::1'].includes(host);
const provider = jevConfig();
const version = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;
app.disable('x-powered-by');
if (!local) app.set('trust proxy', 1);
app.use(express.json({ limit: '12kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  const origin = req.headers.origin;
  const allowed = [
    process.env.STAGE_ORIGIN,
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    'http://127.0.0.1:5178',
    'http://localhost:5178',
  ].filter(Boolean);
  if (origin && !allowed.includes(origin)) {
    res.status(403).json({ error: 'Origin not allowed' });
    return;
  }
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  // Reject remote Host headers in local mode, including DNS rebinding.
  if (
    local &&
    !['127.0.0.1', 'localhost', '[::1]'].some(
      (h) => req.headers.host === `${h}:${port}` || req.headers.host === `${h}:5178`,
    )
  ) {
    res.status(403).json({ error: 'Local host only' });
    return;
  }
  next();
});
if (process.env.RAILWAY_ENVIRONMENT_ID && !process.env.DATABASE_URL)
  throw new Error('Railway requires DATABASE_URL for durable archives');
const archive = new Archive();
await archive.init();
await archive.recover();
let writer: ArchiveWriter | undefined;
let archiveFailed = false;
let starting = false;
let room: Room | null = null;
let committed: import('../shared/music.js').Snapshot | null = null;
const recentOpeners: import('../shared/music.js').Musician[] = [];
const clients = new Set<express.Response>();
const chat = new Chat();
const broadcast = (event: string, data: unknown) => {
  const wire = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    if (client.writableLength > 4_000_000) {
      client.end();
      clients.delete(client);
    } else client.write(wire);
  }
};
app.get('/api/health', (_req, res) =>
  res.json({
    ok: !archiveFailed,
    archive: {
      backend: process.env.DATABASE_URL ? 'postgres' : 'sqlite',
      writable: !archiveFailed,
      format: 1,
    },
    serverTime: Date.now(),
    liveAvailable: !!provider.apiKey,
    model: provider.model,
    provider: provider.provider,
    directorAvailable: !!provider.directorModel,
    version,
    revision: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.BUILD_REVISION || null,
  }),
);
app.get('/api/room', (_req, res) => res.json(committed));
app.get('/api/events', (req, res) => {
  if (clients.size >= 200) {
    res.status(503).end();
    return;
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(`event: state\ndata: ${JSON.stringify(committed)}\n\n`);
  res.write(`event: chat\ndata: ${JSON.stringify(chat.recent())}\n\n`);
  clients.add(res);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
});
app.get('/api/archive', async (req, res) => {
  await writer?.flush();
  res.json(await archive.list(String(req.query.q || '').slice(0, 200)));
});
app.get('/api/archive/:id', async (req, res) => {
  await writer?.flush();
  const recording = await archive.recording(req.params.id);
  if (!recording) {
    res.status(404).json({ error: 'Recording not found' });
    return;
  }
  res.json(recording);
});
// The room is open to everyone, so song requests are paced per address.
const requests = new Map<string, number[]>();
const paced: express.RequestHandler = (req, res, next) => {
  const now = Date.now();
  const key = req.ip ?? '';
  const recent = (requests.get(key) ?? []).filter((at) => now - at < 60_000);
  if (recent.length >= 6) {
    res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
    return;
  }
  requests.set(key, [...recent, now]);
  if (requests.size > 5000) requests.clear();
  next();
};
app.post('/api/room', paced, async (req, res) => {
  const parsed = songInput.extend({ mode: z.enum(['live', 'rehearsal']) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error:
        'Enter a title (1-80 characters), optional description (up to 3,900 characters), and a mode.',
    });
    return;
  }
  if (starting || (room && room.state.status !== 'ended')) {
    res.status(409).json({ error: 'A jam is already playing. Join it or end it first.' });
    return;
  }
  if (parsed.data.mode === 'live' && !provider.apiKey) {
    res.status(503).json({
      error: 'The host needs to configure the selected Jev provider key. Rehearsal works offline.',
    });
    return;
  }
  if (archiveFailed) {
    res.status(503).json({
      error: 'Archive unavailable; recording is required. Restart after restoring storage.',
    });
    return;
  }
  starting = true;
  await writer?.flush();
  if (archiveFailed) {
    starting = false;
    res.status(503).json({ error: 'Archive unavailable' });
    return;
  }
  if (room) recentOpeners.push(room.state.opener);
  if (recentOpeners.length > 4) recentOpeners.shift();
  room = new Room(
    songPrompt(parsed.data),
    parsed.data.mode,
    provider.apiKey,
    provider.model,
    Math.max(15, Math.min(6000, Number(process.env.MAX_JEV_REQUESTS) || 6000)),
    600,
    {
      provider: provider.provider,
      fallback: provider.fallback,
      directorModel: provider.directorModel,
      directorApiKey: provider.directorKey,
      recentOpeners: [...recentOpeners],
    },
  );
  const current = room;
  try {
    await archive.state(current.view());
    committed = current.view();
  } catch {
    archiveFailed = true;
    starting = false;
    current.stop('Archive unavailable');
    res.status(503).json({ error: 'Could not save recording; jam not started.' });
    return;
  }
  writer = new ArchiveWriter(archive, () => {
    archiveFailed = true;
    current.stop('Archive write failed; performance stopped to protect recording.');
    committed = {
      ...(committed ?? current.view()),
      status: 'ended',
      endedAt: Date.now(),
      error: current.state.error,
    };
    broadcast('state', committed);
  });
  const currentWriter = writer;
  current.on('state', (state) =>
    currentWriter.enqueue(
      stateRows(state),
      () => {
        committed = {
          ...state,
          traces: committed && committed.id === state.id ? committed.traces : [],
        };
        broadcast('state', { ...state, traces: [] });
      },
      true,
    ),
  );
  current.on('trace', (trace) =>
    currentWriter.enqueue(
      [{ id: current.state.id, kind: 'trace', key: trace.id, data: JSON.stringify(trace) }],
      () => {
        if (committed && committed.id === current.state.id)
          committed.traces = [...committed.traces, trace].slice(-180);
        broadcast('trace', trace);
      },
    ),
  );
  starting = false;
  res.status(201).json(room.view());
  void room.start();
});
app.post('/api/room/stop', paced, (_req, res) => {
  // A natural ending first; a second request while the band is landing stops immediately.
  room?.endSong();
  res.json({ ok: true });
});
app.post('/api/room/queue', paced, (req, res) => {
  const parsed = songInput.extend({ roomId: z.string().max(64) }).safeParse(req.body);
  if (!parsed.success || parsed.data.roomId !== room?.state.id) {
    res.status(400).json({ error: 'Enter a theme for the current room.' });
    return;
  }
  try {
    res.status(202).json(room.queueTheme(songPrompt(parsed.data)));
  } catch (error) {
    res
      .status(409)
      .json({ error: error instanceof Error ? error.message : 'Could not queue theme.' });
  }
});
app.post('/api/room/levels', (req, res) => {
  const parsed = z.object({ roomId: z.string().max(64), levels: levelsSchema }).safeParse(req.body);
  if (!parsed.success || parsed.data.roomId !== room?.state.id) {
    res.status(400).json({ error: 'Invalid reference measurement' });
    return;
  }
  room.recordLevels(parsed.data.levels);
  res.json({ ok: true });
});
app.post('/api/chat', (req, res) => {
  const parsed = chatInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Say something in 280 characters or fewer.' });
    return;
  }
  const message = chat.post(req.ip ?? '', parsed.data);
  if (!message) {
    res.status(429).json({ error: 'Easy on the tokens. One line a second.' });
    return;
  }
  broadcast('chat', [message]);
  res.status(201).json(message);
});
app.use(express.static(resolve('dist')));
app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
app.use(
  (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(400).json({ error: 'Invalid request' });
  },
);
const server = app.listen(port, host, () =>
  console.log(
    `JEV the band: http://${host}:${port} · ${provider.apiKey ? `Jev configured via ${provider.provider}` : 'offline rehearsal available'}`,
  ),
);
async function shutdown() {
  room?.stop();
  for (const client of clients) client.end();
  server.close();
  await writer?.flush();
  await archive.close();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
