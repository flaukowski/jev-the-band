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
  async function playShow(day: string) {
    setBusy(true);
    setError('');
    try {
      // Search narrows the displayed songs; Replay show always plays the whole day.
      let catalog = entries;
      if (query) {
        const response = await fetch(`${api}/api/archive?q=`);
        if (!response.ok) throw new Error('Show could not load.');
        catalog = await response.json();
      }
      const items = catalog.filter((entry) => entry.day === day);
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
      await onPlay(playable);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Replay failed');
    } finally {
      setBusy(false);
    }
  }
  const days = [...new Set(entries.map((e) => e.day))].sort().reverse();
  return (
    <section className="archive-panel" aria-label="Jtb archive">
      <div className="archive-heading">
        <div>
          <span className="eyebrow">THE TAPES KEEP ROLLING</span>
          <h2>Jtb archive</h2>
        </div>
        <button onClick={onClose}>Close archive</button>
      </div>
      <p>One show per day. Every song in playing order, replayed without model calls.</p>
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
      {days.map((day) => {
        const songs = entries
          .filter((entry) => entry.day === day)
          .flatMap((entry) => {
            const performed = entry.songs
              .filter((song) => song.appliedAt !== undefined)
              .sort((a, b) => a.appliedAt! - b.appliedAt!);
            if (!performed.length)
              return [
                {
                  key: entry.id,
                  prompt: entry.prompt,
                  at: entry.startedAt,
                  mode: entry.mode,
                  recording: entry.status !== 'ended',
                },
              ];
            return performed
              .filter((song, index) => {
                const end = performed[index + 1]?.appliedAt ?? Infinity;
                return end > (entry.from ?? -Infinity) && song.appliedAt! < (entry.to ?? Infinity);
              })
              .map((song) => ({
                key: `${entry.id}:${song.id}`,
                prompt: song.prompt,
                at: Math.max(song.appliedAt!, entry.from ?? -Infinity),
                mode: entry.mode,
                recording: entry.status !== 'ended' && song.id === performed.at(-1)?.id,
              }));
          })
          .sort((a, b) => a.at - b.at);
        return (
          <section key={day} className="archive-show" aria-label={`Show ${day}`}>
            <div className="archive-heading">
              <h3>
                {day} · {songs.length} {songs.length === 1 ? 'song' : 'songs'}
                {query ? ' matching' : ''}
              </h3>
              <button disabled={busy} onClick={() => void playShow(day)}>
                Replay show
              </button>
            </div>
            <ol className="archive-songs" aria-label={`Songs for ${day}`}>
              {songs.map((song) => (
                <li key={song.key} className="archive-song">
                  <div>
                    <h4>{song.prompt.split('\n')[0]}</h4>
                    <small>
                      {new Date(song.at).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}{' '}
                      · {song.mode === 'live' ? 'Live Jev' : 'Instrument demo'}
                      {song.recording ? ' · Recording' : ''}
                    </small>
                    {song.prompt.includes('\n') && (
                      <p>{song.prompt.split('\n').slice(1).join('\n')}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </section>
  );
}
