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
  decisionPersonas,
  roles,
  type Frame,
  type Role,
  type DecisionRole,
  type Snapshot,
  type Trace,
} from '../shared/music';
import { BandAudio } from './audio';
import { Mixer } from './Mixer';
import { MasterDesk } from './MasterDesk';
import { ConceptCard } from './ConceptCard';
import './styles.css';
import { ArchivePanel } from './ArchivePanel';
import { replaySnapshot } from '../shared/replay';

const Stage = lazy(() => import('./Stage').then((module) => ({ default: module.Stage })));

const API = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const icons = { guitar: Guitar, bass: Guitar, keys: Piano, drums: Drum, lights: LampDesk };
const patchLabel = (patch: string) =>
  ({
    piano: 'Piano',
    rhodes: 'Rhodes',
    organ: 'Organ',
    analog: 'Analog synth',
    pad: 'Synth pad',
    bell: 'Bell keys',
  })[patch] ?? patch;
const elapsedLabel = (seconds: number) =>
  `${Math.floor(Math.max(0, seconds) / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(Math.max(0, seconds) % 60)
    .toString()
    .padStart(2, '0')}`;
export default function App() {
  const [liveRoom, setRoom] = useState<Snapshot | null>(null);
  const [replay, setReplay] = useState<Snapshot | null>(null);
  const replaySource = useRef<Snapshot | null>(null);
  const playlist = useRef<Snapshot[]>([]);
  const [paused, setPaused] = useState(false);
  const pausedAt = useRef(0);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const room = replay ?? liveRoom;
  const [description, setDescription] = useState('');
  const [nextDescription, setNextDescription] = useState('');
  const [connected, setConnected] = useState(false);
  const [liveAvailable, setLiveAvailable] = useState(false);
  const [hostRequired, setHostRequired] = useState(false);
  const [controller, setController] = useState('');
  const [prompt, setPrompt] = useState('Somewhere between the last train and the sunrise');
  const [nextPrompt, setNextPrompt] = useState('');
  const [chosenMode, setChosenMode] = useState<'live' | 'rehearsal' | null>(null);
  const [healthReady, setHealthReady] = useState(false);
  const mode = chosenMode ?? (liveAvailable ? 'live' : 'rehearsal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sound, setSound] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [referenceRoom, setReferenceRoom] = useState('');
  const [volume, setVolume] = useState(0.6);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [selected, setSelected] = useState<DecisionRole | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  const [reduced, setReduced] = useState(matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [about, setAbout] = useState(false);
  const audio = useRef(new BandAudio());
  const stage = useRef<HTMLDivElement>(null);
  // The stage reads the same post-fader meters as the soundboard, so movement follows what is heard.
  const levels = useRef(() => audio.current.levels()).current;
  const spectrum = useRef(() => audio.current.spectrum()).current;
  const running = !!room && room.status !== 'ended';
  const effectiveMode = running ? room.mode : mode;
  const currentTime = replay ? (paused ? pausedAt.current : now) : now + offset;
  const frame: Frame | null = room?.frames.filter((f) => f.at <= currentTime).at(-1) ?? null;
  const activeFrame = running ? frame : null;
  const upcomingFrame = running ? (room?.frames.find((f) => f.at > currentTime) ?? null) : null;
  const themeTitle = activeFrame?.themeTitle ?? room?.title;
  const activeCue = room?.setlist?.find((c) => c.id === activeFrame?.themeId);
  const queuedThemes =
    room?.setlist?.filter((c) => c.atFrame > (activeFrame?.id ?? -1) && c.id !== room.id) ?? [];
  const seconds = room ? Math.min(((room.endedAt ?? currentTime) - room.startedAt) / 1000, 600) : 0;
  const traces = (room?.traces ?? [])
    .filter((t) => (!replay || t.at <= currentTime) && (selected === 'all' || t.role === selected))
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
        if (!replaySource.current) audio.current.sync(off);
        setLiveAvailable(data.liveAvailable);
        setHostRequired(data.hostAccessRequired);
        setHealthReady(true);
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
    if (room && !paused) {
      audio.current.update(room.id, room.frames);
      if (room.status === 'ended') audio.current.stop();
    }
  }, [room?.id, room?.frames, room?.status, paused]);
  useEffect(() => {
    if (replay || !running || room.mode !== 'live' || referenceRoom !== room.id || !sound) return;
    const timer = window.setInterval(() => {
      const levels = audio.current.referenceLevels();
      if (levels)
        void fetch(`${API}/api/room/levels`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(controller ? { Authorization: `Bearer ${controller}` } : {}),
          },
          body: JSON.stringify({ roomId: room.id, levels }),
        }).catch(() => {});
    }, 2500);
    return () => clearInterval(timer);
  }, [replay, running, room?.id, room?.mode, referenceRoom, sound, controller]);
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
        setAudioLoading(true);
        await audio.current.enable();
        setSound(true);
      } catch {
        setError('Audio could not start. Try the sound button again.');
      } finally {
        setAudioLoading(false);
      }
    }
  }
  async function start() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      setAudioLoading(true);
      await audio.current.enable(true);
      setSound(true);
      setAudioLoading(false);
      const response = await fetch(`${API}/api/room`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(controller ? { Authorization: `Bearer ${controller}` } : {}),
        },
        body: JSON.stringify({ title: prompt, description, mode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The jam could not start.');
      setRoom(data);
      setReferenceRoom(data.id);
    } catch (e) {
      audio.current.cancelPrelude();
      setError(e instanceof Error ? e.message : 'The jam could not start.');
    } finally {
      setBusy(false);
      setAudioLoading(false);
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
  async function queueTheme() {
    if (busy || !room || !nextPrompt.trim()) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${API}/api/room/queue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(controller ? { Authorization: `Bearer ${controller}` } : {}),
        },
        body: JSON.stringify({ roomId: room.id, title: nextPrompt, description: nextDescription }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not queue the next theme.');
      setNextPrompt('');
      setNextDescription('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not queue theme.');
    } finally {
      setBusy(false);
    }
  }
  async function playRecording(sets: Snapshot[], from?: number) {
    audio.current.stop();
    await audio.current.enable();
    setSound(true);
    audio.current.sync(0);
    replaySource.current = sets[0];
    playlist.current = sets.slice(1);
    setPaused(false);
    setReferenceRoom('');
    setReplay(replaySnapshot(sets[0], from ?? sets[0].frames[0].at, Date.now()));
    setArchiveOpen(false);
  }
  function returnLive() {
    audio.current.stop();
    audio.current.sync(offset);
    replaySource.current = null;
    playlist.current = [];
    setReplay(null);
    setPaused(false);
  }
  function seekReplay(from: number) {
    if (!replaySource.current) return;
    audio.current.stop();
    setPaused(false);
    setReplay(replaySnapshot(replaySource.current, from, Date.now()));
  }
  useEffect(() => {
    if (!replay || paused || now < replay.endsAt) return;
    if (playlist.current.length)
      void playRecording(playlist.current).catch(() => setError('Could not continue replay.'));
    else {
      audio.current.stop();
      pausedAt.current = replay.endsAt;
      setPaused(true);
    }
  }, [now, replay, paused]);
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
          SIX MINDS.
          <br />
          ONE LONG, STRANGE JAM.
        </div>
        <nav>
          <button className="text-button" onClick={() => setArchiveOpen(!archiveOpen)}>
            Jtb archive
          </button>
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
        {archiveOpen && (
          <ArchivePanel api={API} onPlay={playRecording} onClose={() => setArchiveOpen(false)} />
        )}
        {replay && (
          <section className="replay-controls" aria-label="Recording playback">
            <strong>REPLAY · {replay.title}</strong>
            <span>Saved notes & responses · no model calls</span>
            <button
              onClick={() => {
                if (paused) {
                  const original = replaySource.current!;
                  const position = pausedAt.current - (replay.startedAt - original.startedAt);
                  seekReplay(
                    position >= (original.endedAt ?? Infinity) ? original.frames[0].at : position,
                  );
                } else {
                  pausedAt.current = Date.now();
                  audio.current.stop();
                  setPaused(true);
                }
              }}
            >
              {paused ? 'Resume replay' : 'Pause replay'}
            </button>
            <label>
              Seek recording
              <input
                aria-label="Seek recording"
                type="range"
                min={0}
                max={Math.max(1, replay.endsAt - replay.startedAt)}
                value={Math.max(
                  0,
                  Math.min(replay.endsAt - replay.startedAt, currentTime - replay.startedAt),
                )}
                onChange={(e) =>
                  seekReplay(replaySource.current!.startedAt + Number(e.target.value))
                }
              />
            </label>
            <button onClick={returnLive}>Return to live</button>
          </section>
        )}
        {!replay && (
          <section className="prompt-panel">
            <div className="prompt-label">
              <span className="eyebrow">
                {running ? 'NOW WANDERING' : 'GIVE THEM A PLACE TO BEGIN'}
              </span>
              <h2>
                {(running ? room.mode : mode) === 'rehearsal'
                  ? 'Try the instruments.'
                  : running
                    ? 'The band takes it from here.'
                    : 'What does tonight sound like?'}
              </h2>
              <p>
                {(running ? room.mode : mode) === 'rehearsal'
                  ? 'This is a procedural instrument demo. Its title is a label, not a musical prompt.'
                  : running
                    ? 'Send the next song whenever inspiration hits. The band brings this one to a natural close, falls silent, then starts the new song from nothing.'
                    : 'A title, a feeling, or a whole story. See where they take it.'}
              </p>
            </div>
            <div className="prompt-form">
              {running ? (
                <>
                  <div className="playing-controls">
                    <span className="current-prompt">“{themeTitle}”</span>
                    <button className="end-button" onClick={stop}>
                      <Square size={15} /> {room.finishing ? 'Landing… press to cut' : 'End jam'}
                    </button>
                  </div>
                  {room.mode === 'live' && (
                    <form
                      className="next-theme"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void queueTheme();
                      }}
                    >
                      <label htmlFor="next-theme">Next song title (required)</label>
                      <input
                        type="text"
                        id="next-theme"
                        aria-label="Next song title"
                        required
                        value={nextPrompt}
                        maxLength={80}
                        onChange={(event) => setNextPrompt(event.target.value)}
                        placeholder="A new title, mood, or direction…"
                      />
                      <label>
                        Description
                        <textarea
                          aria-label="Next song description"
                          value={nextDescription}
                          maxLength={3900}
                          onChange={(e) => setNextDescription(e.target.value)}
                        />
                      </label>
                      <button
                        className="start-button"
                        type="submit"
                        disabled={
                          busy ||
                          !nextPrompt.trim() ||
                          queuedThemes.length >= 4 ||
                          room.status !== 'playing'
                        }
                      >
                        {busy ? 'Queueing…' : 'Queue next · 8-bar lead-in'}
                      </button>
                      {queuedThemes.length > 0 && (
                        <ol className="theme-queue" aria-label="Queued themes">
                          {queuedThemes.map((cue) => (
                            <li key={cue.id}>
                              <b>{cue.prompt.split('\n')[0].slice(0, 80)}</b>
                              <span>
                                {Math.max(
                                  0,
                                  Math.ceil(
                                    (cue.atFrame - (activeFrame?.id ?? 0)) * 2 -
                                      (activeFrame
                                        ? ((currentTime - activeFrame.at) * activeFrame.bpm) /
                                          240000
                                        : 0),
                                  ),
                                )}{' '}
                                bars at most ·{' '}
                                {room?.windDown?.cueId === cue.id
                                  ? 'the band is bringing this song home'
                                  : cue.director?.status === 'planning'
                                    ? 'shaping concept'
                                    : 'queued: starts fresh after a natural ending'}
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </form>
                  )}
                </>
              ) : (
                <>
                  <label htmlFor="jam-prompt">Title (required)</label>
                  <input
                    type="text"
                    id="jam-prompt"
                    required
                    value={prompt}
                    maxLength={80}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="A midnight drive through a city made of glass…"
                  />
                  <label>
                    Description
                    <textarea
                      aria-label="Song description"
                      value={description}
                      maxLength={3900}
                      rows={3}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="A feeling, a direction, or a whole story…"
                    />
                  </label>
                  <div className="form-bottom">
                    <label className="mode-select">
                      <select
                        aria-label="Decision mode"
                        value={mode}
                        disabled={!healthReady}
                        onChange={(e) => setChosenMode(e.target.value as typeof mode)}
                      >
                        <option value="rehearsal">Instrument demo · no AI</option>
                        <option value="live" disabled={!liveAvailable}>
                          Live Jev{!liveAvailable ? ' · host key needed' : ''}
                        </option>
                      </select>
                      <ChevronDown size={13} />
                    </label>
                    <button
                      className="start-button"
                      disabled={
                        busy ||
                        !connected ||
                        !healthReady ||
                        (mode === 'live' && !liveAvailable) ||
                        !prompt.trim()
                      }
                      onClick={start}
                    >
                      <Play size={16} fill="currentColor" />
                      {audioLoading
                        ? 'Loading instruments…'
                        : busy
                          ? 'Opening the room…'
                          : mode === 'live'
                            ? 'Let’s jam'
                            : 'Play demo'}
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
        )}

        {(error || room?.error) && (
          <div className="error-message" role="alert">
            {error || room?.error}
          </div>
        )}
        <div
          className={`generation-status ${effectiveMode === 'rehearsal' ? 'demo-status' : ''}`}
          role="status"
        >
          <strong>
            {replay
              ? 'ARCHIVE REPLAY'
              : !healthReady
                ? 'CONNECTING TO THE BAND'
                : effectiveMode === 'rehearsal'
                  ? 'DEMO · NO AI'
                  : 'LIVE JEV'}
          </strong>
          <span>
            {replay
              ? 'Playing saved decisions. No new model calls.'
              : !healthReady
                ? 'Checking the connection…'
                : effectiveMode === 'rehearsal'
                  ? '0 Jev requests. Procedural music; the title does not shape the composition.'
                  : running
                    ? `${room.requests} API requests · Real Jev decisions, live as they happen.`
                    : 'Your prompt sets the scene. Each player makes real Jev decisions as the jam unfolds.'}
          </span>
        </div>
        <ConceptCard
          report={activeCue?.director ?? room?.director}
          elapsed={
            (currentTime - (activeFrame?.themeStartedAt ?? room?.startedAt ?? currentTime)) / 1000
          }
        />
        <div className={`performance-layout ${consoleOpen ? 'with-console' : ''}`}>
          <div className="performance-main">
            <div className="stage-wrap" ref={stage}>
              <Suspense fallback={<div className="stage-loading">Setting the stage…</div>}>
                <Stage
                  frame={activeFrame}
                  upcoming={upcomingFrame}
                  levels={levels}
                  spectrum={spectrum}
                  traces={replay ? room?.traces.filter((t) => t.at <= currentTime) : room?.traces}
                  playing={running && !!frame && !paused}

                  reduced={reduced}
                  onSelect={selectRole}
                  serverOffset={replay ? (paused ? pausedAt.current - now : 0) : offset}
                  loadingAudio={audioLoading}
                />
              </Suspense>
              <div className="stage-top">
                <div className={`session-badge ${running ? 'is-live' : ''}`}>
                  <span />
                  {replay
                    ? 'REPLAY'
                    : running
                      ? room?.mode === 'live'
                        ? 'JEV LIVE'
                        : 'DEMO · NO AI'
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
                  <p>{running ? themeTitle : 'Four musicians. Lights. Sound. All ears.'}</p>
                </div>
                {(running || sound) && (
                  <button
                    className={`sound-pill ${sound ? 'sound-on' : ''}`}
                    onClick={toggleAudio}
                    disabled={audioLoading}
                  >
                    {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
                    {audioLoading
                      ? 'Loading instruments…'
                      : sound
                        ? 'Mute sound'
                        : 'Listen to this jam'}
                  </button>
                )}
              </div>
              {!running && (
                <div className="stage-caption">
                  {mode === 'live' ? 'JEV CHOOSES. CODE PLAYS.' : 'INSTRUMENT DEMO. NO AI.'}
                  <br />
                  <span>
                    {mode === 'live'
                      ? 'RECORDED NOTES. LIVE DECISIONS.'
                      : 'TRY LIVE JEV FOR PROMPT-DRIVEN MUSIC.'}
                  </span>
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
                    {role === 'keys' && part && (
                      <div className="keyboard-patches" aria-label="June keyboard sounds">
                        <span>LH · {patchLabel(part.decision.left)}</span>
                        <span>RH · {patchLabel(part.decision.right)}</span>
                      </div>
                    )}
                    {part?.performance?.phraseBars && (
                      <div className="phrase-progress">
                        {part.solo ? 'Melodic solo' : 'Musical phrase'} · bars{' '}
                        {Math.max(1, (part.performance.phraseChunks ?? 1) * 2 - 1)}–
                        {(part.performance.phraseChunks ?? 1) * 2} / {part.performance.phraseBars}
                      </div>
                    )}
                    {part?.solo && part.performance?.leadGestures?.length ? (
                      <div
                        className="phrase-progress"
                        title="Each gesture is one Jev decision request; see Under the hood"
                      >
                        {part.performance.soloEnergy} · {part.performance.leadGestures.join(' → ')}
                        {role !== 'lights' && room?.soloSketches?.[role]?.status === 'ready'
                          ? ' · arc suggested by arranger'
                          : ''}
                      </div>
                    ) : null}
                    <div className="player-bottom">
                      <span>
                        {part && !part.notes.length
                          ? part.source === 'fallback'
                            ? 'Retrying entry'
                            : part.decision.action === 'rest'
                              ? 'Taking a breath'
                              : 'Listening · no notes'
                          : lit
                            ? role === 'lights'
                              ? [
                                  activeFrame?.lighting.wash,
                                  activeFrame?.lighting.visual,
                                  activeFrame?.lighting.sky,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')
                              : part?.continued || part?.decision.action === 'hold'
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
            <Mixer
              audio={audio.current}
              frame={activeFrame}
              beat={frame ? ((currentTime - frame.at) * frame.bpm) / 60000 : 0}
            />
            <MasterDesk
              audio={audio.current}
              frame={activeFrame}
              referenceActive={referenceRoom === room?.id && sound}
              canReference={
                !replay &&
                running &&
                room.mode === 'live' &&
                sound &&
                (!hostRequired || !!controller)
              }
              onReference={() => setReferenceRoom(room!.id)}
            />
            <details className="composition-contract">
              <summary>What does Jev actually control?</summary>
              <p>
                Live Jev chooses a style, groove and tension/release arc, then composes exact
                pitches, timing, duration, velocity and articulation. Guitar can play single lines,
                double stops or up to six-string chords; keys can comp, sustain chords or split
                chords and melody, with five held notes per hand. Drums choose their pulse and every
                hit/rest across two full bars. Samples ring naturally.
              </p>
              <p>
                Each player chooses a tonal intention, musical role and independent pedals for each
                bar. Guitar, bass and keys have seven colors; Kit has a restrained saturation, echo
                and room rig that preserves drum attacks. Your mixer overrides take priority.
                Players take turns revising phrases and hear only notes already played by peers. The
                harness keeps time, enforces instrument limits, asks for a release after sustained
                building, and caps the jam at ten minutes. Live phrases use no preset licks,
                voicings or drum patterns. Creative pitch choices use Jev’s probabilities, more
                conservatively in settled passages; the trace shows raw answers and applied choices.
              </p>
              <p>
                The instrument demo makes no Jev calls and uses three built-in motifs with
                procedural changes. Its title is not semantically interpreted. Open Under the hood
                to inspect real requests and their results.
              </p>
            </details>
            <div className="below-note">
              <span>
                <AudioLines size={15} />
                {effectiveMode === 'rehearsal'
                  ? 'Rehearsal is procedural. Switch to Live Jev for real model decisions.'
                  : 'Jev chooses the notes. The band listens, responds and plays.'}
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
                {([...roles, 'engineer', 'host'] as DecisionRole[]).map((r) => (
                  <button
                    key={r}
                    className={selected === r ? 'active' : ''}
                    onClick={() => setSelected(r)}
                    style={{ '--player-color': decisionPersonas[r].color } as React.CSSProperties}
                  >
                    {decisionPersonas[r].name}
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
              Six points of view.
            </h2>
            <p>
              Rook, Moss, June, and Kit choose musical gestures through separate Jev decision calls.
              Lux shapes the lights. Patch listens to measured channel levels and balances the
              sound. One initial LLM brief turns your prompt into a sonic concept and a loose
              section map; the musicians still choose the actual notes through Jev.
            </p>
            <p>
              Jev receives a delayed record of notes already played, never a peer’s unplayed score.
              One musician can revise a phrase at a time; the others keep playing while they listen.
              Recorded guitar, bass and piano notes bring their choices to life, with a separate
              effects rig for each player.
            </p>
            <p>
              Players enter one at a time, trade solos, propose new keys, and nudge the tempo. After
              five minutes, they look for a landing. Every jam ends by ten.
            </p>
            <div className="about-label">INSTRUMENT DEMO · NO AI</div>
            <p>
              Try the stage without an API key. This mode uses procedural decisions and makes no Jev
              calls. Live Jev is available when the host connects a server-side key.
            </p>
            <a href="/samples/CREDITS.md" target="_blank" rel="noreferrer">
              Instrument recordings & credits <ArrowUpRight size={16} />
            </a>
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
  const p = decisionPersonas[trace.role];
  const choices = Object.entries(trace.appliedAnswers ?? trace.answers)
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
              : trace.answers.action?.choice ||
                trace.answers.wash?.choice ||
                (trace.answers.advance ? 'Composing the next attack' : 'Opening the room'))}
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
                appliedChoices: trace.appliedAnswers ?? trace.answers,
                selectionMethod: trace.selectionMethod ?? 'provider-choice',
                noveltyPressure: trace.heat ?? null,
                providerId: trace.providerId ?? null,
                provider: trace.provider ?? 'openrouter',
                endpoint: trace.endpoint,
                responseModel: trace.responseModel,
                tokenUsage: trace.usage,
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
