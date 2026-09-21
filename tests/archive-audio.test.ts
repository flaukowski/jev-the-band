import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { Archive, AUDIO_CHUNK } from '../server/archive.js';
import { audioRoute } from '../server/audio-route.js';
import { transferArchive } from '../server/archive-transfer.js';
import { archiveTracks } from '../shared/archive-playback.js';

test('MP3 byte ranges cross chunks, reject invalid ranges and survive migration', async () => {
  const db = new Archive('', ':memory:');
  const target = new Archive('', ':memory:');
  await db.init();
  await target.init();
  const bytes = Buffer.alloc(AUDIO_CHUNK * 2 + 123);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  await db.saveAudio('test', bytes, 1000, 21000);
  const app = express();
  app.get('/audio/:id', audioRoute(db));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  try {
    const request = (range?: string) =>
      fetch(`http://127.0.0.1:${port}/audio/test`, { headers: range ? { Range: range } : {} });
    const full = await request();
    assert.equal(full.status, 200);
    assert.deepEqual(Buffer.from(await full.arrayBuffer()), bytes);
    for (const [range, from, to] of [
      ['bytes=262140-262150', 262140, 262150],
      ['bytes=-10', bytes.length - 10, bytes.length - 1],
      ['bytes=524288-', 524288, bytes.length - 1],
    ] as const) {
      const response = await request(range);
      assert.equal(response.status, 206);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes.subarray(from, to + 1));
    }
    for (const range of ['bytes=9999999-', 'bytes=20-10', 'bytes=-0', 'bytes=0-1,3-4', 'garbage'])
      assert.equal((await request(range)).status, 416);
    assert.equal((await fetch(`http://127.0.0.1:${port}/audio/missing`)).status, 404);
    await transferArchive(db, target);
    assert.deepEqual(await target.audioMeta('test'), await db.audioMeta('test'));
    assert.deepEqual(
      await target.audioChunk('test', 1),
      bytes.subarray(AUDIO_CHUNK, AUDIO_CHUNK * 2),
    );
  } finally {
    server.close();
    await db.close();
    await target.close();
  }
});

test('song queue preserves day and next-song boundaries', () => {
  const tracks = archiveTracks([
    {
      id: 'show',
      prompt: 'First',
      mode: 'live',
      status: 'ended',
      startedAt: 0,
      from: 50,
      to: 250,
      songs: [
        { id: 'a', prompt: 'First', requestedAt: 0, atFrame: 0, appliedAt: 0 },
        { id: 'b', prompt: 'Second', requestedAt: 0, atFrame: 1, appliedAt: 100 },
        { id: 'c', prompt: 'Unplayed', requestedAt: 0, atFrame: 2 },
      ],
    },
  ]);
  assert.deepEqual(
    tracks.map((t) => [t.prompt, t.at, t.to]),
    [
      ['First', 50, 100],
      ['Second', 100, 250],
    ],
  );
});
