import 'dotenv/config';
import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import { Room } from './room.js';
import { levelsSchema } from '../shared/engineer.js';
import { jevConfig } from './provider.js';
import { readFileSync } from 'node:fs';

const app = express();
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4310);
const token = process.env.CONTROLLER_TOKEN || '';
const provider = jevConfig();
const version = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;
if (!['127.0.0.1', 'localhost', '::1'].includes(host) && token.length < 24)
  throw new Error('Public binding requires a CONTROLLER_TOKEN of at least 24 characters');
app.disable('x-powered-by');
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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  if (req.method === 'POST' && token) {
    const supplied = Buffer.from((req.headers.authorization || '').replace(/^Bearer /, ''));
    const expected = Buffer.from(token);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      res.status(401).json({ error: 'Host access required' });
      return;
    }
  }
  // Reject remote Host headers in local mode, including DNS rebinding.
  if (
    !token &&
    !['127.0.0.1', 'localhost', '[::1]'].some(
      (h) => req.headers.host === `${h}:${port}` || req.headers.host === `${h}:5178`,
    )
  ) {
    res.status(403).json({ error: 'Local host only' });
    return;
  }
  next();
});
let room: Room | null = null;
const recentOpeners: import('../shared/music.js').Musician[] = [];
const clients = new Set<express.Response>();
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
    ok: true,
    serverTime: Date.now(),
    liveAvailable: !!provider.apiKey,
    hostAccessRequired: !!token,
    model: provider.model,
    provider: provider.provider,
    directorAvailable: !!provider.directorModel,
    version,
    revision: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.BUILD_REVISION || null,
  }),
);
app.get('/api/room', (_req, res) => res.json(room?.view() ?? null));
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
  res.write(`event: state\ndata: ${JSON.stringify(room?.view() ?? null)}\n\n`);
  clients.add(res);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
});
app.post('/api/room', (req, res) => {
  const parsed = z
    .object({ prompt: z.string().trim().min(1).max(4000), mode: z.enum(['live', 'rehearsal']) })
    .safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: 'Enter a title or prompt, up to 4,000 characters, and select a mode.' });
    return;
  }
  if (room && room.state.status !== 'ended') {
    res.status(409).json({ error: 'A jam is already playing. Join it or end it first.' });
    return;
  }
  if (parsed.data.mode === 'live' && !provider.apiKey) {
    res
      .status(503)
      .json({
        error:
          'The host needs to configure the selected Jev provider key. Rehearsal works offline.',
      });
    return;
  }
  if (room) recentOpeners.push(room.state.opener);
  if (recentOpeners.length > 4) recentOpeners.shift();
  room = new Room(
    parsed.data.prompt,
    parsed.data.mode,
    provider.apiKey,
    provider.model,
    Math.max(15, Math.min(6000, Number(process.env.MAX_JEV_REQUESTS) || 6000)),
    600,
    {
      provider: provider.provider,
      directorModel: provider.directorModel,
      directorApiKey: provider.directorKey,
      recentOpeners: [...recentOpeners],
    },
  );
  room.on('state', (state) => broadcast('state', { ...state, traces: [] }));
  room.on('trace', (trace) => broadcast('trace', trace));
  res.status(201).json(room.view());
  void room.start();
});
app.post('/api/room/stop', (_req, res) => {
  room?.stop();
  res.json({ ok: true });
});
app.post('/api/room/queue', (req, res) => {
  const parsed = z
    .object({ roomId: z.string(), prompt: z.string().trim().min(1).max(4000) })
    .safeParse(req.body);
  if (!parsed.success || parsed.data.roomId !== room?.state.id) {
    res.status(400).json({ error: 'Enter a theme for the current room.' });
    return;
  }
  try {
    res.status(202).json(room.queueTheme(parsed.data.prompt));
  } catch (error) {
    res
      .status(409)
      .json({ error: error instanceof Error ? error.message : 'Could not queue theme.' });
  }
});
app.post('/api/room/levels', (req, res) => {
  const parsed = z.object({ roomId: z.string(), levels: levelsSchema }).safeParse(req.body);
  if (!parsed.success || parsed.data.roomId !== room?.state.id) {
    res.status(400).json({ error: 'Invalid reference measurement' });
    return;
  }
  room.recordLevels(parsed.data.levels);
  res.json({ ok: true });
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
function shutdown() {
  room?.stop();
  for (const client of clients) client.end();
  server.close();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
