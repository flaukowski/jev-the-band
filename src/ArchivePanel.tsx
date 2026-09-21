import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
  player,
}: {
  api: string;
  onPlay: (tracks: ArchiveTrack[], index?: number) => void | Promise<void>;
  onClose: () => void;
  player?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [day, setDay] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    void fetch(`${api}/api/archive?q=`, { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Archive could not load. Close and reopen to try again.');
        const catalog = (await response.json()) as Entry[];
        if (!abort.signal.aborted) {
          setEntries(catalog);
          setDay([...new Set(catalog.map((entry) => entry.day))].sort().reverse()[0] ?? '');
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [api]);
  const days = [...new Set(entries.map((entry) => entry.day))].sort().reverse();
  const songs = archiveTracks(entries.filter((entry) => entry.day === day));
  const matching = songs.filter((song) =>
    `${song.prompt} ${day}`.toLowerCase().includes(query.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(matching.length / 20));
  const shown = matching.slice(page * 20, page * 20 + 20);
  async function play(index = 0) {
    setBusy(true);
    setError('');
    try {
      await onPlay(songs, index);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Replay could not start.');
    } finally {
      setBusy(false);
    }
  }
  return createPortal(
    <dialog
      ref={dialog}
      className="archive-modal"
      aria-labelledby="archive-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="archive-panel">
        <header className="archive-heading">
          <div>
            <span className="eyebrow">THE TAPES KEEP ROLLING</span>
            <h2 id="archive-title">Jtb archive</h2>
          </div>
          <button onClick={onClose} autoFocus>
            Close archive
          </button>
        </header>
        <div className="archive-filters">
          <label>
            Show day
            <select
              aria-label="Show day"
              value={day}
              disabled={!days.length}
              onChange={(e) => {
                setDay(e.target.value);
                setPage(0);
              }}
            >
              {!days.length && <option value="">No shows yet</option>}
              {days.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          </label>
          <label>
            Search this day
            <input
              type="search"
              value={query}
              placeholder="Song title or description"
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <button disabled={busy || !songs.length} onClick={() => void play()}>
            Replay show
          </button>
        </div>
        {loading && <p role="status">Loading archive…</p>}
        {busy && <p role="status">Loading song…</p>}
        {error && <p role="alert">{error}</p>}
        <div className="archive-list-scroll">
          <ol className="archive-songs" aria-label={`Songs for ${day}`}>
            {shown.map((song) => {
              const index = songs.indexOf(song);
              const [title, ...rest] = song.prompt.split('\n');
              const description = rest.join('\n');
              return (
                <li className="archive-song" key={song.key}>
                  <span className="archive-number">{index + 1}</span>
                  <h4 title={title}>{title}</h4>
                  <span
                    className="archive-description"
                    tabIndex={description ? 0 : undefined}
                    title={description || undefined}
                    aria-label={description || 'No description'}
                  >
                    {description || '—'}
                  </span>
                  <time
                    className="archive-time"
                    dateTime={new Date(song.at).toISOString()}
                    title={`${song.mode === 'live' ? 'Live Jev' : 'Instrument demo'}${song.recording ? ' · Recording' : ''}`}
                  >
                    {new Date(song.at).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </time>
                  <button
                    className="archive-play"
                    disabled={busy}
                    aria-label={`Play song: ${title}`}
                    title={`Play ${title}`}
                    onClick={() => void play(index)}
                  >
                    ▶
                  </button>
                </li>
              );
            })}
          </ol>
          {!loading && !matching.length && (
            <p>
              No recordings found.{' '}
              {songs.length ? 'Try another search.' : 'Choose another day or record a show.'}
            </p>
          )}
        </div>
        <footer className="archive-pagination">
          <span aria-live="polite">
            {matching.length
              ? `${page * 20 + 1}–${Math.min((page + 1) * 20, matching.length)} of ${matching.length} songs`
              : '0 songs'}
          </span>
          <div>
            <button disabled={page === 0} onClick={() => setPage(page - 1)}>
              Previous page
            </button>
            <span>
              Page {page + 1} of {pages}
            </span>
            <button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
              Next page
            </button>
          </div>
        </footer>
        {player}
      </div>
    </dialog>,
    document.body,
  );
}
