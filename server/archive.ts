import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import pg from 'pg';
import { clipFrames } from '../shared/replay.js';
const rendererVersion = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;
import type { Snapshot, Trace, Frame } from '../shared/music.js';

export type ArchiveRow = { id: string; kind: string; key: string; data: string };
export class Archive {
  private sqlite?: DatabaseSync;
  private pool?: pg.Pool;
  constructor(
    url = process.env.DATABASE_URL,
    path = process.env.ARCHIVE_SQLITE_PATH || 'data/jtb.sqlite',
  ) {
    if (url)
      this.pool = new pg.Pool({
        connectionString: url,
        connectionTimeoutMillis: 5000,
        query_timeout: 5000,
      });
    else {
      mkdirSync(dirname(resolve(path)), { recursive: true });
      this.sqlite = new DatabaseSync(path);
      this.sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    }
  }
  async init() {
    await this.query(
      'CREATE TABLE IF NOT EXISTS jtb_archive (id TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(id,kind,key))',
    );
  }
  private async query(sql: string, params: string[] = []): Promise<ArchiveRow[]> {
    if (this.pool) return (await this.pool.query(sql, params)).rows;
    const stmt = this.sqlite!.prepare(sql.replace(/\$\d+/g, '?'));
    if (/^SELECT/i.test(sql)) return stmt.all(...params) as ArchiveRow[];
    stmt.run(...params);
    return [];
  }
  async batch(rows: ArchiveRow[]) {
    const sql =
      'INSERT INTO jtb_archive(id,kind,key,data) VALUES($1,$2,$3,$4) ON CONFLICT(id,kind,key) DO UPDATE SET data=excluded.data';
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        for (const r of rows) await client.query(sql, [r.id, r.kind, r.key, r.data]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } else {
      this.sqlite!.exec('BEGIN IMMEDIATE');
      try {
        const stmt = this.sqlite!.prepare(sql.replace(/\$\d+/g, '?'));
        for (const r of rows) stmt.run(r.id, r.kind, r.key, r.data);
        this.sqlite!.exec('COMMIT');
      } catch (error) {
        this.sqlite!.exec('ROLLBACK');
        throw error;
      }
    }
  }
  async put(row: ArchiveRow) {
    await this.query(
      'INSERT INTO jtb_archive(id,kind,key,data) VALUES($1,$2,$3,$4) ON CONFLICT(id,kind,key) DO UPDATE SET data=excluded.data',
      [row.id, row.kind, row.key, row.data],
    );
  }
  async state(state: Snapshot) {
    await this.batch(stateRows(state));
  }
  async trace(id: string, trace: Trace) {
    await this.batch(traceRows(id, trace));
  }
  async rows(id?: string) {
    return this.query(
      id
        ? 'SELECT * FROM jtb_archive WHERE id=$1 ORDER BY id,kind,key'
        : 'SELECT * FROM jtb_archive ORDER BY id,kind,key',
      id ? [id] : [],
    );
  }
  async recording(id: string, playback = false): Promise<Snapshot | null> {
    const rows = playback
      ? await this.query(
          "SELECT * FROM jtb_archive WHERE id=$1 AND kind IN ('state','frame','song') ORDER BY kind,key",
          [id],
        )
      : await this.query(
          "SELECT * FROM jtb_archive WHERE id=$1 AND kind IN ('state','frame','song','trace') ORDER BY kind,key",
          [id],
        );
    const meta = rows.find((r) => r.kind === 'state');
    if (!meta) return null;
    const state = JSON.parse(meta.data) as Snapshot;
    state.frames = rows
      .filter((r) => r.kind === 'frame')
      .map((r) => JSON.parse(r.data) as Frame)
      .sort((a, b) => a.at - b.at);
    state.traces = rows
      .filter((r) => r.kind === 'trace')
      .map((r) => JSON.parse(r.data) as Trace)
      .sort((a, b) => a.at - b.at);
    const songs = rows
      .filter((r) => r.kind === 'song')
      .map((r) => JSON.parse(r.data) as NonNullable<Snapshot['setlist']>[number]);
    if (songs.length) state.setlist = songs.sort((a, b) => a.atFrame - b.atFrame);
    // A manual stop may truncate an already committed future frame.
    if (state.endedAt) state.frames = clipFrames(state.frames, -Infinity, state.endedAt);
    return state;
  }
  async list(q = '') {
    const rows = await this.query("SELECT * FROM jtb_archive WHERE kind='state'");
    const songRows = await this.query("SELECT * FROM jtb_archive WHERE kind='song'");
    const songs = new Map<string, NonNullable<Snapshot['setlist']>>();
    for (const row of songRows)
      songs.set(row.id, [...(songs.get(row.id) ?? []), JSON.parse(row.data)]);
    for (const cues of songs.values()) cues.sort((a, b) => a.atFrame - b.atFrame);
    const zone = process.env.ARCHIVE_TIMEZONE || 'America/New_York';
    const date = (at: number) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(at));
    return rows
      .map((r) => JSON.parse(r.data) as Snapshot)
      .flatMap((s) => {
        const end = Math.max(s.startedAt, s.endedAt ?? Date.now());
        const ranges = [{ from: s.startedAt, to: end, day: date(s.startedAt) }];
        if (date(Math.max(s.startedAt, end - 1)) !== ranges[0].day) {
          let lo = s.startedAt,
            hi = end;
          while (hi - lo > 1) {
            const mid = Math.floor((lo + hi) / 2);
            if (date(mid) === ranges[0].day) lo = mid;
            else hi = mid;
          }
          ranges[0].to = hi;
          ranges.push({ from: hi, to: end, day: date(hi) });
        }
        return ranges.map((range) => ({
          id: s.id,
          title: s.title,
          prompt: s.prompt,
          mode: s.mode,
          status: s.status,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          ...range,
          songs: songs.get(s.id) ?? s.setlist ?? [],
        }));
      })
      .filter((s) =>
        JSON.stringify([s.title, s.prompt, s.day, s.songs]).toLowerCase().includes(q.toLowerCase()),
      )
      .sort((a, b) => b.startedAt - a.startedAt);
  }
  async recover() {
    for (const item of await this.list()) {
      if (item.status === 'ended') continue;
      const state = await this.recording(item.id, true);
      if (!state) continue;
      state.status = 'ended';
      state.endedAt = Math.min(
        Date.now(),
        state.frames.at(-1)
          ? state.frames.at(-1)!.at + state.frames.at(-1)!.durationMs
          : state.startedAt,
      );
      state.error = 'Recording interrupted by server exit; recovered saved events.';
      await this.state(state);
    }
  }
  async audioMeta(id: string): Promise<AudioMeta | null> {
    const rows = await this.query(
      "SELECT * FROM jtb_archive WHERE id=$1 AND kind='audio-meta' AND key='mp3-v1'",
      [id],
    );
    return rows[0] ? JSON.parse(rows[0].data) : null;
  }
  async saveAudio(id: string, mp3: Buffer, from: number, to: number) {
    const chunks: ArchiveRow[] = [];
    for (let offset = 0; offset < mp3.length; offset += AUDIO_CHUNK)
      chunks.push({
        id,
        kind: 'audio',
        key: String(offset / AUDIO_CHUNK).padStart(6, '0'),
        data: mp3.subarray(offset, offset + AUDIO_CHUNK).toString('base64'),
      });
    const meta: AudioMeta = {
      bytes: mp3.length,
      from,
      to,
      rendererVersion,
      sha256: createHash('sha256').update(mp3).digest('hex'),
    };
    // Media becomes visible only with all its chunks, atomically.
    await this.batch([
      ...chunks,
      { id, kind: 'audio-meta', key: 'mp3-v1', data: JSON.stringify(meta) },
    ]);
  }
  async audioChunk(id: string, index: number) {
    const rows = await this.query(
      "SELECT * FROM jtb_archive WHERE id=$1 AND kind='audio' AND key=$2",
      [id, String(index).padStart(6, '0')],
    );
    if (!rows[0]) throw new Error('Audio chunk missing');
    return Buffer.from(rows[0].data, 'base64');
  }
  async cuePage(id: string, at: number) {
    const rows = await this.query(
      "SELECT * FROM jtb_archive WHERE id=$1 AND kind='cue' AND key<=$2 ORDER BY key DESC LIMIT 24",
      [id, `${String(Math.floor(at)).padStart(16, '0')}:~`],
    );
    return rows.reverse().map((row) => JSON.parse(row.data));
  }
  async backfillCues(id: string, signal?: AbortSignal) {
    const done = await this.query("SELECT * FROM jtb_archive WHERE id=$1 AND kind='cue-meta'", [
      id,
    ]);
    if (done.length) return;
    let cursor = '';
    while (true) {
      signal?.throwIfAborted();
      const page = await this.tracePage(id, cursor);
      if (page.traces.length) await this.batch(page.traces.map((trace) => cueRow(id, trace)));
      if (!page.next) break;
      cursor = page.next;
    }
    await this.put({ id, kind: 'cue-meta', key: 'complete', data: '{}' });
  }
  async tracePage(id: string, cursor = '') {
    const rows = await this.query(
      "SELECT * FROM jtb_archive WHERE id=$1 AND kind='trace' AND key>$2 ORDER BY key LIMIT 8",
      [id, cursor],
    );
    return {
      traces: rows.map((r) => JSON.parse(r.data) as Trace),
      next: rows.length === 8 ? rows.at(-1)!.key : null,
    };
  }
  async close() {
    this.sqlite?.close();
    await this.pool?.end();
  }
}

export function stateRows(state: Snapshot): ArchiveRow[] {
  return [
    ...(state.setlist ?? []).map((song) => ({
      id: state.id,
      kind: 'song',
      key: song.id,
      data: JSON.stringify(song),
    })),
    ...state.frames.map((frame) => ({
      id: state.id,
      kind: 'frame',
      key: String(frame.id),
      data: JSON.stringify(frame),
    })),
    {
      id: state.id,
      kind: 'state',
      key: 'latest',
      data: JSON.stringify({
        ...state,
        archiveFormat: 1,
        rendererVersion,
        frames: [],
        traces: [],
        frame: null,
      }),
    },
  ];
}

/** Single writer: bounded memory, short batches, commit before publication, idempotent retry. */
export class ArchiveWriter {
  private pending: { rows: ArchiveRow[]; publish: () => void }[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private writing?: Promise<void>;
  private bytes = 0;
  failed = false;
  constructor(
    private archive: Pick<Archive, 'batch'>,
    private onFailure: () => void,
  ) {}
  enqueue(rows: ArchiveRow[], publish: () => void, immediate = false) {
    if (this.failed) return;
    const size = Buffer.byteLength(JSON.stringify(rows));
    if (this.bytes + size > 32 * 1024 * 1024) {
      this.fail();
      return;
    }
    this.bytes += size;
    this.pending.push({ rows, publish });
    if (immediate || this.pending.length >= 32) void this.flush();
    else
      this.timer ??= setTimeout(() => {
        this.timer = undefined;
        void this.flush();
      }, 100);
  }
  private fail() {
    this.failed = true;
    clearTimeout(this.timer);
    this.onFailure();
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.writing) {
      await this.writing;
      if (this.pending.length && !this.failed) await this.flush();
      return;
    }
    if (!this.pending.length || this.failed) return;
    const batch = this.pending.splice(0, 32);
    this.writing = (async () => {
      const rows = batch.flatMap((item) => item.rows);
      let committed = false;
      for (let attempt = 0; attempt < 3 && !committed; attempt++) {
        try {
          await this.archive.batch(rows);
          committed = true;
        } catch {
          if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
        }
      }
      if (!committed) {
        this.pending.unshift(...batch);
        this.fail();
        return;
      }
      for (const item of batch) {
        this.bytes -= Buffer.byteLength(JSON.stringify(item.rows));
        item.publish();
      }
    })();
    await this.writing;
    this.writing = undefined;
    if (this.pending.length && !this.failed) await this.flush();
  }
}

export const AUDIO_CHUNK = 256 * 1024;
export type AudioMeta = {
  bytes: number;
  from: number;
  to: number;
  rendererVersion: string;
  sha256: string;
};

function cueRow(id: string, trace: Trace): ArchiveRow {
  return {
    id,
    kind: 'cue',
    key: `${String(Math.floor(trace.at)).padStart(16, '0')}:${trace.id}`,
    data: JSON.stringify({
      id: trace.id,
      at: trace.at,
      role: trace.role,
      source: trace.source,
      answers: trace.answers,
    }),
  };
}
export function traceRows(id: string, trace: Trace): ArchiveRow[] {
  return [{ id, kind: 'trace', key: trace.id, data: JSON.stringify(trace) }, cueRow(id, trace)];
}
