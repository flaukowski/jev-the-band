import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';

import {
  ArrowDownToLine,
  ArrowUpRight,
  AudioLines,
  ChevronDown,
  Code2,
  Drum,
  Guitar,
  LampDesk,
  Maximize2,
  Pause,
  Piano,
  Play,
  Radio,
  SlidersHorizontal,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  musicians,
  noteNames,
  personas,
  roles,
  type Frame,
  type Role,
  type Snapshot,
  type Trace,
} from '../shared/music';
import { BandAudio } from './audio';
import './styles.css';

const Stage = lazy(() => import('./Stage').then((module) => ({ default: module.Stage })));

const API = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const icons = { guitar: Guitar, bass: Guitar, keys: Piano, drums: Drum, lights: LampDesk };
const elapsedLabel = (seconds: number) =>
  `${Math.floor(Math.max(0, seconds) / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(Math.max(0, seconds) % 60)
    .toString()
    .padStart(2, '0')}`;
export default function App() {
  const [room, setRoom] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [liveAvailable, setLiveAvailable] = useState(false);
  const [hostRequired, setHostRequired] = useState(false);
  const [controller, setController] = useState('');
  const [prompt, setPrompt] = useState('Somewhere between the last train and the sunrise');
  const [mode, setMode] = useState<'live' | 'rehearsal'>('rehearsal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sound, setSound] = useState(false);
  const [volume, setVolume] = useState(0.6);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [selected, setSelected] = useState<Role | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  const [reduced, setReduced] = useState(matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [about, setAbout] = useState(false);
  const audio = useRef(new BandAudio());
  const stage = useRef<HTMLDivElement>(null);
  const running = !!room && room.status !== 'ended';
  const currentTime = now + offset;
  const frame: Frame | null = room?.frames.filter((f) => f.at <= currentTime).at(-1) ?? null;
  const activeFrame = running ? frame : null;
  const seconds = room ? Math.min(((room.endedAt ?? currentTime) - room.startedAt) / 1000, 600) : 0;
  const traces = (room?.traces ?? [])
    .filter((t) => selected === 'all' || t.role === selected)
    .slice(-30)
    .reverse();
  useEffect(() => {
    let mounted = true;
    const health = async () => {
      const start = Date.now();
      try {
        const response = await fetch(`${API}/api/health`);
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!mounted) return;
        const off = data.serverTime - (start + Date.now()) / 2;
        setOffset(off);
        audio.current.sync(off);
        setLiveAvailable(data.liveAvailable);
        setHostRequired(data.hostAccessRequired);
      } catch {
        if (mounted) setConnected(false);
      }
    };
    void health();
    const syncTimer = window.setInterval(health, 30000);
    const stream = new EventSource(`${API}/api/events`);
    stream.onopen = () => setConnected(true);
    stream.onerror = () => setConnected(false);
    stream.addEventListener('state', (event) => {
      const next = JSON.parse((event as MessageEvent).data) as Snapshot | null;
      setRoom((previous) =>
        next && previous?.id === next.id && next.traces.length === 0
          ? { ...next, traces: previous.traces }
          : next,
      );
    });
    stream.addEventListener('trace', (event) => {
      const trace = JSON.parse((event as MessageEvent).data) as Trace;
      setRoom((prev) =>
        prev
          ? {
              ...prev,
              traces: [...prev.traces.filter((t) => t.id !== trace.id), trace].slice(-180),
            }
          : prev,
      );
    });
    const clock = window.setInterval(() => setNow(Date.now()), 100);
    return () => {
      mounted = false;
      stream.close();
      window.clearInterval(clock);
      window.clearInterval(syncTimer);
      audio.current.dispose();
    };
  }, []);
  useEffect(() => {
    if (room) {
      audio.current.update(room.id, room.frames);
      if (room.status === 'ended') audio.current.stop();
    }
  }, [room?.id, room?.frames, room?.status]);
  useEffect(() => {
    if (!about) return;
    const previous = document.activeElement as HTMLElement | null;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAbout(false);
      if (event.key !== 'Tab') return;
      const elements = Array.from(
        document.querySelectorAll<HTMLElement>('.about-modal button, .about-modal a'),
      );
      const first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      previous?.focus();
    };
  }, [about]);
  async function toggleAudio() {
    if (sound) {
      audio.current.mute();
      setSound(false);
    } else {
      try {
        await audio.current.enable();
        setSound(true);
      } catch {
        setError('Audio could not start. Try the sound button again.');
      }
    }
  }
  async function start() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${API}/api/room`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(controller ? { Authorization: `Bearer ${controller}` } : {}),
        },
        body: JSON.stringify({ prompt, mode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The jam could not start.');
      setRoom(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The jam could not start.');
    } finally {
      setBusy(false);
    }
  }
  async function stop() {
    try {
      const response = await fetch(`${API}/api/room/stop`, {
        method: 'POST',
        headers: controller ? { Authorization: `Bearer ${controller}` } : {},
      });
      if (!response.ok) throw new Error('Host access is required to end this jam.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not end jam');
    }
  }
  function exportTrace() {
    if (!room) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            coverage:
              'Recent server buffer, up to 180 decisions and 8 phrases. Not an independently signed attestation.',
            ...room,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jev-${room.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function selectRole(role: Role) {
    setSelected(role);
    setConsoleOpen(true);
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="#" aria-label="JEV the band home">
          JEV<span>THE BAND</span>
          <span className="logo-star">✳</span>
        </a>
        <div className="header-note">
          FIVE MINDS.
          <br />
          ONE LONG, STRANGE JAM.
        </div>
        <nav>
          <button className="text-button" onClick={() => setAbout(true)}>
            How it works <ArrowUpRight size={15} />
          </button>
          <button
            className={`console-toggle ${consoleOpen ? 'selected' : ''}`}
            onClick={() => setConsoleOpen(!consoleOpen)}
            aria-expanded={consoleOpen}
          >
            <Code2 size={17} /> Under the hood
          </button>
        </nav>
      </header>
      <main>
        <div className="session-heading">
          <div>
            <span className="eyebrow">AN EXPERIMENT IN COLLECTIVE INSTINCT</span>
            <h1>
              No setlist. <em>Just possibility.</em>
            </h1>
          </div>
          <div className="connection">
            <span className={connected ? 'connection-dot on' : 'connection-dot'} />
            {connected ? 'STAGE CONNECTED' : 'CONNECTING TO STAGE'}
          </div>
        </div>
        <div className={`performance-layout ${consoleOpen ? 'with-console' : ''}`}>
          <div className="performance-main">
            <div className="stage-wrap" ref={stage}>
              <Suspense fallback={<div className="stage-loading">Setting the stage…</div>}>
                <Stage
                  frame={activeFrame}
                  playing={running && !!frame}
                  reduced={reduced}
                  onSelect={selectRole}
                />
              </Suspense>
              <div className="stage-top">
                <div className={`session-badge ${running ? 'is-live' : ''}`}>
                  <span />
                  {running
                    ? room?.mode === 'live'
                      ? 'JEV LIVE'
                      : 'OFFLINE REHEARSAL'
                    : 'THE ROOM IS YOURS'}
                </div>
                <span className="stage-location">THE NEVERENDING ROOM / STAGE 01</span>
                <button
                  className="icon-button"
                  aria-label="Expand stage"
                  onClick={() => {
                    if (!document.fullscreenElement) void stage.current?.requestFullscreen();
                    else void document.exitFullscreen();
                  }}
                >
                  <Maximize2 size={17} />
                </button>
              </div>
              <div className="stage-bottom">
                <div className="onstage-title">
                  <span>
                    {running
                      ? (activeFrame?.chapter ?? 'The band is listening…')
                      : room?.status === 'ended'
                        ? 'Until the next one.'
                        : 'A little spark. A whole new direction.'}
                  </span>
                  <p>{running ? room?.title : 'Four musicians. One lighting artist. All ears.'}</p>
                </div>
                <button className={`sound-pill ${sound ? 'sound-on' : ''}`} onClick={toggleAudio}>
                  {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
                  {sound ? 'Sound on' : 'Enable sound'}
                </button>
              </div>
              {!running && (
                <div className="stage-caption">
                  NOTHING PRERECORDED.
                  <br />
                  <span>EVERY PHRASE IS A NEW DECISION.</span>
                </div>
              )}
            </div>
            <div className="transport">
              <div className="transport-time">
                <Radio size={18} />
                <b>{elapsedLabel(seconds)}</b>
                <span>/ 10:00 MAX</span>
              </div>
              <div className="musical-state">
                <span>
                  <b>{frame?.bpm ?? '—'}</b> BPM
                </span>
                <i />
                <span>
                  <b>{frame ? `${noteNames[frame.root]} ${frame.mode}` : 'Finding a key'}</b>
                </span>
                <i />
                <span>4 / 4</span>
              </div>
              <div className="volume-control">
                <Volume2 size={15} />
                <input
                  aria-label="Master volume"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setVolume(value);
                    audio.current.setVolume(value);
                  }}
                />
              </div>
            </div>
            <section className="players" aria-label="Meet the band">
              {roles.map((role, index) => {
                const person = personas[role];
                const part = activeFrame?.parts.find((p) => p.role === role);
                const Icon = icons[role];
                const lit = running && (role === 'lights' || !!part?.notes.length);
                return (
                  <button
                    key={role}
                    className={`player ${selected === role && consoleOpen ? 'focused' : ''}`}
                    style={{ '--player-color': person.color } as React.CSSProperties}
                    onClick={() => selectRole(role)}
                    title={person.philosophy}
                  >
                    <div className="player-top">
                      <span className="player-number">0{index + 1}</span>
                      <Icon size={19} />
                      <span className={`player-lamp ${lit ? 'on' : ''}`} />
                    </div>
                    <h2>
                      {person.name}
                      {part?.solo && <span className="solo-tag">SOLO</span>}
                    </h2>
                    <p>{person.instrument}</p>
                    <div className="player-bottom">
                      <span>
                        {lit
                          ? role === 'lights'
                            ? activeFrame?.lighting.wash
                            : part?.decision.action === 'hold'
                              ? 'Holding the thread'
                              : part?.decision.action
                          : 'Waiting for a spark'}
                      </span>
                      <div className={`meter ${lit && !reduced ? 'moving' : ''}`}>
                        {Array.from({ length: 9 }, (_, j) => (
                          <i
                            key={j}
                            style={{
                              height: `${4 + (part?.notes[j]?.velocity ?? (j % 4) / 5) * 13}px`,
                              animationDelay: `${j * 0.11}s`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </section>
            <section className="prompt-panel">
              <div className="prompt-label">
                <span className="eyebrow">
                  {running ? 'NOW WANDERING' : 'GIVE THEM A PLACE TO BEGIN'}
                </span>
                <h2>
                  {running ? 'The band takes it from here.' : 'What does tonight sound like?'}
                </h2>
                <p>
                  {running
                    ? 'They listen to one another. The prompt is just the first spark.'
                    : 'A title, a feeling, or a whole story. See where they take it.'}
                </p>
              </div>
              <div className="prompt-form">
                {running ? (
                  <div className="playing-controls">
                    <span className="current-prompt">“{room?.title}”</span>
                    <button className="end-button" onClick={stop}>
                      <Square size={15} /> End jam
                    </button>
                  </div>
                ) : (
                  <>
                    <label className="sr-only" htmlFor="jam-prompt">
                      Jam title or description
                    </label>
                    <textarea
                      id="jam-prompt"
                      value={prompt}
                      maxLength={4000}
                      rows={2}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="A midnight drive through a city made of glass…"
                    />
                    <div className="form-bottom">
                      <label className="mode-select">
                        <select
                          aria-label="Decision mode"
                          value={mode}
                          onChange={(e) => setMode(e.target.value as typeof mode)}
                        >
                          <option value="rehearsal">Offline rehearsal</option>
                          <option value="live" disabled={!liveAvailable}>
                            Live Jev{!liveAvailable ? ' · host key needed' : ''}
                          </option>
                        </select>
                        <ChevronDown size={13} />
                      </label>
                      <button
                        className="start-button"
                        disabled={busy || !connected || !prompt.trim()}
                        onClick={start}
                      >
                        <Play size={16} fill="currentColor" />
                        {busy ? 'Opening the room…' : 'Let’s jam'}
                      </button>
                    </div>
                  </>
                )}
                {hostRequired && (
                  <label className="host-key">
                    Host access{' '}
                    <input
                      type="password"
                      autoComplete="off"
                      value={controller}
                      onChange={(e) => setController(e.target.value)}
                      placeholder="Controller token · kept in memory"
                    />
                  </label>
                )}
              </div>
            </section>
            {(error || room?.error) && (
              <div className="error-message" role="alert">
                {error || room?.error}
              </div>
            )}
            <div className="below-note">
              <span>
                <AudioLines size={15} />
                {(mode === 'rehearsal' && !running) || room?.mode === 'rehearsal'
                  ? 'Rehearsal is procedural. Switch to Live Jev for real model decisions.'
                  : 'Jev chooses. The instruments play. Nothing prerecorded.'}
              </span>
              <button className="text-button" onClick={() => setReduced(!reduced)}>
                {reduced ? <Play size={13} /> : <Pause size={13} />}{' '}
                {reduced ? 'More movement' : 'Less movement'}
              </button>
            </div>
          </div>
          {consoleOpen && (
            <aside className="decision-console" aria-label="Live decision console">
              <div className="console-header">
                <div>
                  <span className="eyebrow">NO MYSTERY BACKSTAGE</span>
                  <h2>The decision feed</h2>
                </div>
                <button
                  className="icon-button"
                  aria-label="Close decision console"
                  onClick={() => setConsoleOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="console-description">
                Actual typed choices, probabilities, and requests. No invented inner monologue.
              </div>
              <div className="console-filters">
                <button
                  className={selected === 'all' ? 'active' : ''}
                  onClick={() => setSelected('all')}
                >
                  All
                </button>
                {roles.map((r) => (
                  <button
                    key={r}
                    className={selected === r ? 'active' : ''}
                    onClick={() => setSelected(r)}
                    style={{ '--player-color': personas[r].color } as React.CSSProperties}
                  >
                    {personas[r].name}
                  </button>
                ))}
              </div>
              <div className="console-stats">
                <span>
                  <b>{room?.requests ?? 0}</b> API calls
                </span>
                <span>
                  <b>{room?.billedCalls ? `$${room.cost.toFixed(5)}` : '—'}</b> reported cost
                </span>
              </div>
              <div className="trace-list">
                {traces.length ? (
                  traces.map((trace) => (
                    <TraceCard
                      key={trace.id}
                      trace={trace}
                      expanded={expanded === trace.id}
                      onToggle={() => setExpanded(expanded === trace.id ? null : trace.id)}
                    />
                  ))
                ) : (
                  <div className="empty-feed">
                    <Code2 size={31} />
                    <h3>Waiting for the first idea.</h3>
                    <p>
                      Start a jam to see the band’s decisions arrive here. Rehearsal is always
                      labeled.
                    </p>
                  </div>
                )}
              </div>
              <button className="export-button" onClick={exportTrace} disabled={!room}>
                <ArrowDownToLine size={16} /> Export recent decisions
              </button>
              <p className="trace-footnote">
                Up to 180 recent calls. Secrets are excluded. Provider IDs are shown when supplied;
                this is an inspectable trace, not a signed attestation.
              </p>
            </aside>
          )}
        </div>
      </main>
      <footer>
        <span>
          JEV THE BAND <b>✳</b> ALWAYS BECOMING.
        </span>
        <span>BUILT WITH JEV / MADE FOR THE MOMENT</span>
      </footer>
      {about && (
        <div className="modal-backdrop" onClick={() => setAbout(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
            className="about-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              autoFocus
              className="icon-button modal-close"
              aria-label="Close how it works"
              onClick={() => setAbout(false)}
            >
              <X />
            </button>
            <span className="eyebrow">A BAND THAT LISTENS</span>
            <h2 id="about-title">
              One spark.
              <br />
              Five points of view.
            </h2>
            <p>
              Rook, Moss, June, and Kit choose musical gestures through separate Jev decision calls.
              Lux listens to the same evolving score and shapes the lights.
            </p>
            <p>
              Jev receives notes and musical state as text, rather than hearing audio. It chooses
              scale degrees, rhythms, dynamics, effects, and its next move. A shared clock turns
              those choices into original synthesized sound.
            </p>
            <p>
              Players enter one at a time, trade solos, propose new keys, and nudge the tempo. After
              five minutes, they look for a landing. Every jam ends by ten.
            </p>
            <div className="about-label">OFFLINE REHEARSAL</div>
            <p>
              Try the stage without an API key. This mode uses procedural decisions and makes no Jev
              calls. Live Jev is available when the host connects a server-side key.
            </p>
            <a
              href="https://typesafe.ai/blog/introducing-system-one-models-and-jev"
              target="_blank"
              rel="noreferrer"
            >
              Meet the decision model <ArrowUpRight size={16} />
            </a>
          </section>
        </div>
      )}
    </div>
  );
}
function TraceCard({
  trace,
  expanded,
  onToggle,
}: {
  trace: Trace;
  expanded: boolean;
  onToggle: () => void;
}) {
  const p = personas[trace.role];
  const choices = Object.entries(trace.answers)
    .filter(([key]) => !key.startsWith('note'))
    .slice(0, 5);
  return (
    <article
      className={`trace-card ${trace.source}`}
      style={{ '--player-color': p.color } as React.CSSProperties}
    >
      <button className="trace-summary" onClick={onToggle} aria-expanded={expanded}>
        <div className="trace-meta">
          <strong>{p.name}</strong>
          <span>
            {trace.source === 'jev' ? `${trace.latencyMs} ms` : trace.source.toUpperCase()}
          </span>
          <ChevronDown size={14} />
        </div>
        <div className="trace-action">
          {trace.error ||
            (trace.source === 'rehearsal'
              ? 'Procedural rehearsal decision'
              : trace.answers.action?.choice || trace.answers.wash?.choice || 'Opening the room')}
        </div>
        <div className="trace-chips">
          {choices.map(([key, answer]) => (
            <span key={key}>
              {key}: <b>{answer.choice}</b>
            </span>
          ))}
        </div>
        <small>
          PHRASE {trace.frame < 0 ? 'SEED' : trace.frame + 1} ·{' '}
          {new Date(trace.at).toLocaleTimeString()}
        </small>
      </button>
      {expanded && (
        <div className="trace-detail">
          {choices.map(([key, answer]) => (
            <div className="probability" key={key}>
              <span>{key}</span>
              <b>{Math.round(answer.probabilities[answer.choice] * 100)}% selected probability</b>
            </div>
          ))}
          <pre>
            {JSON.stringify(
              {
                request: trace.request,
                response: trace.answers,
                providerId: trace.providerId ?? null,
                requestSHA256: trace.requestHash,
                source: trace.source,
                error: trace.error,
                reportedCost: trace.cost,
              },
              null,
              2,
            )}
          </pre>
        </div>
      )}
    </article>
  );
}
