import { useEffect, useState } from 'react';
import { archiveTracks, type ArchiveTrack } from '../shared/archive-playback';
import type { Snapshot } from '../shared/music';

export type Entry = {
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
  onPlay: (tracks: ArchiveTrack[], index?: number) => void | Promise<void>;
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
      const tracks = archiveTracks(items);
      if (!tracks.length) throw new Error('No recorded songs in this selection yet.');
      await onPlay(tracks);
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
        const songs = archiveTracks(entries.filter((entry) => entry.day === day));
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
              {songs.map((song, index) => (
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
                  <button
                    disabled={busy}
                    aria-label={`Play song: ${song.prompt.split('\n')[0]}`}
                    onClick={() => {
                      setError('');
                      setBusy(true);
                      void Promise.resolve(onPlay(songs, index))
                        .catch((e) => setError(e.message))
                        .finally(() => setBusy(false));
                    }}
                  >
                    Play song
                  </button>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </section>
  );
}
