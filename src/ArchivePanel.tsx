import { useEffect, useState } from 'react';
import { clipFrames } from '../shared/replay';
import type { Snapshot } from '../shared/music';

type Entry = {
  id: string;
  title: string;
  prompt: string;
  mode: string;
  status: string;
  startedAt: number;
  day: string;
  from?: number;
  to?: number;
  songs: NonNullable<Snapshot['setlist']>;
};
export function ArchivePanel({
  api,
  onPlay,
  onClose,
}: {
  api: string;
  onPlay: (sets: Snapshot[], from?: number) => void | Promise<void>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(() => {
      void fetch(`${api}/api/archive?q=${encodeURIComponent(query)}`, { signal: abort.signal })
        .then(async (r) => {
          if (!r.ok) throw new Error('Archive could not load.');
          const results = await r.json();
          if (!abort.signal.aborted) {
            setEntries(results);
            setError('');
          }
        })
        .catch((e) => {
          if (!abort.signal.aborted) setError(e.message);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [api, query]);
  async function play(items: Entry[], song?: string) {
    setBusy(true);
    setError('');
    try {
      const sets = await Promise.all(
        items
          .sort((a, b) => a.startedAt - b.startedAt)
          .map(async (item) => {
            const response = await fetch(`${api}/api/archive/${encodeURIComponent(item.id)}`);
            if (!response.ok) throw new Error('Recording could not load.');
            const recording = (await response.json()) as Snapshot;
            if (item.from !== undefined && item.to !== undefined)
              return {
                ...recording,
                startedAt: item.from,
                endedAt: item.to,
                frames: clipFrames(recording.frames, item.from, item.to),
              };
            return recording;
          }),
      );
      const playable = sets.filter((s) => s.frames.length);
      if (!playable.length) throw new Error('No recorded phrases in this selection yet.');
      const cue = song ? playable[0].setlist?.find((c) => c.id === song) : undefined;
      const from = song ? playable[0].frames.find((f) => f.themeId === song)?.at : undefined;
      if (from !== undefined) {
        const recording = playable[0];
        const end =
          recording.frames.find((f) => f.at > from && f.themeId !== song)?.at ??
          recording.endedAt ??
          recording.frames.at(-1)!.at + recording.frames.at(-1)!.durationMs;
        playable[0] = {
          ...recording,
          title: cue?.prompt.split('\n')[0] ?? recording.title,
          startedAt: from,
          endedAt: end,
          frames: clipFrames(recording.frames, from, end),
        };
      }
      await onPlay(playable, from);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Replay failed');
    } finally {
      setBusy(false);
    }
  }
  const days = [...new Set(entries.map((e) => e.day))];
  return (
    <section className="archive-panel" aria-label="Jtb archive">
      <div className="archive-heading">
        <div>
          <span className="eyebrow">THE TAPES KEEP ROLLING</span>
          <h2>Jtb archive</h2>
        </div>
        <button onClick={onClose}>Close archive</button>
      </div>
      <p>Replay shows, sets, and songs. Saved performances play without model calls.</p>
      <label>
        Search the archive
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Title, description, or date"
        />
      </label>
      {busy && <p role="status">Loading recording and instruments…</p>}
      {error && <p role="alert">{error}</p>}
      {!entries.length && <p>No recordings found. Start a jam to make the first tape.</p>}
      {days.map((day) => (
        <section key={day} className="archive-show">
          <div className="archive-heading">
            <h3>{day} · Show</h3>
            <button disabled={busy} onClick={() => void play(entries.filter((e) => e.day === day))}>
              Replay {query ? 'matching sets' : 'show'}
            </button>
          </div>
          {entries
            .filter((e) => e.day === day)
            .map((entry) => (
              <article key={entry.id} className="archive-set">
                <div>
                  <h4>{entry.songs[0]?.prompt.split('\n')[0] || entry.title}</h4>
                  <small>
                    {new Date(entry.startedAt).toLocaleTimeString()} ·{' '}
                    {entry.mode === 'live' ? 'Live Jev recording' : 'Instrument demo'} ·{' '}
                    {entry.status === 'ended' ? 'Saved set' : 'Recording'}
                  </small>
                  <p>{entry.prompt.split('\n').slice(1).join('\n')}</p>
                </div>
                <button disabled={busy} onClick={() => void play([entry])}>
                  Replay set
                </button>
                <ol>
                  {entry.songs
                    .filter((s) => s.appliedAt !== undefined)
                    .map((song) => (
                      <li key={song.id}>
                        <button disabled={busy} onClick={() => void play([entry], song.id)}>
                          {song.prompt.split('\n')[0]}
                        </button>
                      </li>
                    ))}
                </ol>
              </article>
            ))}
        </section>
      ))}
    </section>
  );
}
