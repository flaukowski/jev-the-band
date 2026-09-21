import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Archive, ArchiveWriter } from '../server/archive.js';
import { Room } from '../server/room.js';
import { replaySnapshot } from '../shared/replay.js';
import { songInput, songPrompt } from '../server/song-input.js';

test('title is mandatory and description combines with it as the original prompt', () => {
  assert.equal(songInput.safeParse({ title: ' ' }).success, false);
  assert.equal(
    songPrompt(songInput.parse({ title: ' Dawn ', description: ' Warm bass ' })),
    'Dawn\nWarm bass',
  );
});
test('SQLite retains complete frames and raw responses across reopen; recovery is explicit', async () => {
  const path = mkdtempSync(join(tmpdir(), 'jtb-'));
  const file = join(path, 'archive.sqlite');
  let db = new Archive('', file);
  await db.init();
  try {
    const room = new Room('A saved song\nDescription', 'rehearsal', '');
    room.on('error', () => {});
    await room.start();
    room.stop();
    const state = room.view();
    assert.ok(state.frames.length);
    // Simulate a rolling buffer with more frames than the live room retains.
    for (let i = 0; i < 12; i++)
      await db.state({
        ...state,
        status: 'playing',
        endedAt: undefined,
        frames: [
          { ...state.frames[0], id: i, at: Date.now() - 20000 + i * 1000, durationMs: 1000 },
        ],
      });
    for (const t of state.traces) {
      await db.trace(state.id, t);
      await db.trace(state.id, t);
    }
    await db.close();
    db = new Archive('', file);
    await db.init();
    await db.recover();
    const saved = (await db.recording(state.id))!;
    assert.equal(saved.frames.length, 12);
    assert.equal(saved.status, 'ended');
    assert.match(saved.error!, /interrupted/);
    assert.equal(saved.traces.length, state.traces.length);
    assert.equal((await db.list('Description')).length, 1);
    const replay = replaySnapshot(saved, saved.frames[0].at, 1000);
    assert.equal(replay.frames[0].at, 1300);
    assert.deepEqual(replay.frames[0].parts, saved.frames[0].parts);
    assert.equal((await db.list('not present')).length, 0);
  } finally {
    await db.close();
    rmSync(path, { recursive: true });
  }
});
test('writer commits before publication, retries idempotently, and batches response bursts', async () => {
  let attempts = 0;
  const published: number[] = [];
  const batches: number[] = [];
  const writer = new ArchiveWriter(
    {
      batch: async (rows) => {
        attempts++;
        if (attempts === 1) throw new Error('temporary');
        batches.push(rows.length);
        assert.equal(published.length, 0);
      },
    },
    () => assert.fail('unexpected failure'),
  );
  for (let i = 0; i < 10; i++)
    writer.enqueue([{ id: 'set', kind: 'trace', key: String(i), data: '{}' }], () =>
      published.push(i),
    );
  assert.equal(published.length, 0);
  await writer.flush();
  assert.equal(attempts, 2);
  assert.deepEqual(batches, [10]);
  assert.equal(published.length, 10);
});
test('permanent storage failure stops publication and fails closed', async () => {
  let failed = false;
  let published = false;
  const writer = new ArchiveWriter(
    {
      batch: async () => {
        throw new Error('offline');
      },
    },
    () => {
      failed = true;
    },
  );
  writer.enqueue([{ id: 'set', kind: 'trace', key: '1', data: '{}' }], () => {
    published = true;
  });
  await writer.flush();
  assert.equal(failed, true);
  assert.equal(published, false);
  assert.equal(writer.failed, true);
});

test('shows split across local midnight and search includes the queued songs', async () => {
  const db = new Archive('', ':memory:');
  await db.init();
  try {
    const room = new Room('Before midnight', 'rehearsal', '');
    const state = room.view();
    state.startedAt = Date.parse('2026-09-20T23:59:00-04:00');
    state.status = 'ended';
    state.endedAt = state.startedAt + 120000;
    await db.state(state);
    const entries = await db.list();
    assert.equal(entries.length, 2);
    assert.deepEqual(new Set(entries.map((e) => e.day)), new Set(['2026-09-20', '2026-09-21']));
    assert.equal(entries[0].to, entries[1].from);
  } finally {
    await db.close();
  }
});

test('migration copies complete records, verifies reruns and refuses conflicting destination content', async () => {
  const { transferArchive } = await import('../server/archive-transfer.js');
  const source = new Archive('', ':memory:'),
    target = new Archive('', ':memory:');
  await source.init();
  await target.init();
  try {
    const room = new Room('Migration', 'rehearsal', '');
    const state = room.view();
    state.status = 'ended';
    await source.state(state);
    const result = await transferArchive(source, target);
    assert.equal(result.sets, 1);
    assert.deepEqual(await target.rows(), await source.rows());
    assert.deepEqual(await transferArchive(source, target), result);
    await target.put({ id: state.id, kind: 'trace', key: 'unique', data: '{}' });
    await assert.rejects(transferArchive(source, target), /conflicts/);
    assert.equal((await source.rows()).length, 1);
  } finally {
    await source.close();
    await target.close();
  }
});

test('song metadata survives the live setlist rolling buffer', async () => {
  const db = new Archive('', ':memory:');
  await db.init();
  try {
    const state = new Room('Original song', 'rehearsal', '').view();
    state.status = 'ended';
    for (let i = 0; i < 12; i++)
      await db.state({
        ...state,
        setlist: [
          {
            id: String(i),
            prompt: `Song ${i}\nDescription ${i}`,
            requestedAt: i,
            atFrame: i,
            appliedAt: i,
          },
        ],
      });
    assert.equal((await db.recording(state.id))!.setlist!.length, 12);
    assert.equal((await db.list('Description 0')).length, 1);
  } finally {
    await db.close();
  }
});
