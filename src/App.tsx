import { ArchiveStream } from './ArchiveStream';
import type { ArchiveTrack } from '../shared/archive-playback';
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
import { Chat } from './Chat';
import type { ChatMessage } from '../shared/chat';
import { MasterDesk } from './MasterDesk';
import { ConceptCard } from './ConceptCard';
import './styles.css';
import { ArchivePanel } from './ArchivePanel';
import { HowJevWorks } from './HowJevWorks';
import { clipFrames, replaySnapshot } from '../shared/replay';

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
  const playlist = useRef<ArchiveTrack[]>([]);
  const streamAudio = useRef(new ArchiveStream());
  const streamActive = useRef(false);
  const [archiveMode, setArchiveMode] = useState(false);
  const archiveFetch = useRef<AbortController | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [needsDecisions, setNeedsDecisions] = useState(false);
  const [replayCues, setReplayCues] = useState<
    Pick<Trace, 'id' | 'at' | 'role' | 'source' | 'answers'>[]
  >([]);
  const [traceCursor, setTraceCursor] = useState<string | null>('');
  const [traceBusy, setTraceBusy] = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayError, setReplayError] = useState('');
  const replayRequest = useRef(0);
  const [paused, setPaused] = useState(false);
  const pausedAt = useRef(0);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const room = replay ?? liveRoom;
  const [description, setDescription] = useState('');
  const [nextDescription, setNextDescription] = useState('');
  const [connected, setConnected] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const change = () => setFullscreen(document.fullscreenElement === stage.current);
    document.addEventListener('fullscreenchange', change);
    return () => document.removeEventListener('fullscreenchange', change);
  }, []);
  const [liveAvailable, setLiveAvailable] = useState(false);
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
  const spectrum = useRef(() =>
    streamActive.current ? streamAudio.current.spectrum() : audio.current.spectrum(),
  ).current;
  const running = !!room && room.status !== 'ended';
  const effectiveMode = running ? room.mode : mode;
  const currentTime = replay
    ? streaming
      ? replay.startedAt + streamAudio.current.position() - replaySource.current!.startedAt
      : paused
        ? pausedAt.current
        : now
    : now + offset;
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
        setHealthReady(true);
      } catch {
        if (mounted) setConnected(false);
      }
    };
    void health();
    const syncTimer = window.setInterval(health, 30000);
    const stream = new EventSource(`${API}/api/events${archiveMode ? '?chatOnly=1' : ''}`);
    if (stream) {
      stream.onopen = () => setConnected(true);
      stream.onerror = () => setConnected(false);
      stream.addEventListener('chat', (event) => {
        const lines = JSON.parse((event as MessageEvent).data) as ChatMessage[];
        setChat((prev) =>
          [...prev.filter((m) => !lines.some((l) => l.id === m.id)), ...lines].slice(-60),
        );
      });
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
    }
    const clock = window.setInterval(() => setNow(Date.now()), 100);
    return () => {
      mounted = false;
      stream?.close();
      window.clearInterval(clock);
      window.clearInterval(syncTimer);
    };
  }, [archiveMode]);
  useEffect(() => () => audio.current.dispose(), []);
  useEffect(() => {
    if (room && !paused && !streaming && !replayLoading) {
      audio.current.update(room.id, room.frames);
      if (room.status === 'ended') audio.current.stop();
    }
  }, [room?.id, room?.frames, room?.status, paused, streaming, replayLoading]);
  useEffect(() => {
    if (
      replay ||
      replayLoading ||
      !running ||
      room.mode !== 'live' ||
      referenceRoom !== room.id ||
      !sound
    )
      return;
    const timer = window.setInterval(() => {
      const levels = audio.current.referenceLevels();
      if (levels)
        void fetch(`${API}/api/room/levels`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: room.id, levels }),
        }).catch(() => {});
    }, 2500);
    return () => clearInterval(timer);
  }, [replay, running, room?.id, room?.mode, referenceRoom, sound, replayLoading]);
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
    if (streamActive.current) {
      streamAudio.current.media.muted = sound;
      setSound(!sound);
      return;
    }
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
        headers: { 'Content-Type': 'application/json' },
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
      const response = await fetch(`${API}/api/room/stop`, { method: 'POST' });
      if (!response.ok) throw new Error('Could not end jam');
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
        headers: { 'Content-Type': 'application/json' },
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
  async function playRecording(tracks: ArchiveTrack[], index = 0) {
    const request = ++replayRequest.current;
    setArchiveMode(true);
    archiveFetch.current?.abort();
    archiveFetch.current = new AbortController();
    streamAudio.current.stop();
    streamActive.current = false;
    setStreaming(false);
    setReplayCues([]);
    setTraceCursor('');
    playlist.current = tracks;
    setTrackIndex(index);
    setReplayLoading(true);
    setReplayError('');
    setPaused(true);
    audio.current.stop();
    try {
      const track = tracks[index];
      const response = await fetch(
        `${API}/api/archive/${encodeURIComponent(track.id)}?playback=1`,
        { signal: archiveFetch.current.signal },
      );
      if (!response.ok)
        throw new Error(
          `Recording could not load (${response.status}). Try again or skip to the next song.`,
        );
      const saved = (await response.json()) as Snapshot & {
        audio?: { from: number; to: number } | null;
      };
      const end = Math.min(
        track.to ?? Infinity,
        saved.endedAt ??
          (saved.frames.at(-1)?.at ?? track.at) + (saved.frames.at(-1)?.durationMs ?? 0),
      );
      const frames = clipFrames(saved.frames, track.at, end);
      if (!frames.length)
        throw new Error('No recorded phrases in this song yet. Choose another song.');
      const source = {
        ...saved,
        title: track.prompt.split('\n')[0],
        prompt: track.prompt,
        startedAt: frames[0].at,
        endedAt: end,
        frames,
      };
      if (request !== replayRequest.current) return;
      if (saved.audio) {
        await streamAudio.current.play(
          `${API}/api/archive/${encodeURIComponent(track.id)}/audio`,
          saved.audio.from,
          source.startedAt,
          volume,
        );
        if (request !== replayRequest.current) return;
        streamActive.current = true;
        setStreaming(true);
      } else await audio.current.enable();
      if (request !== replayRequest.current) return;
      setSound(true);
      audio.current.sync(0);
      replaySource.current = source;
      setReferenceRoom('');
      setReplay(replaySnapshot(source, source.startedAt, Date.now()));
      setPaused(false);
    } catch (e) {
      if (request === replayRequest.current)
        setReplayError(e instanceof Error ? e.message : 'Replay failed. Try again.');
    } finally {
      if (request === replayRequest.current) setReplayLoading(false);
    }
  }
  useEffect(() => {
    const media = streamAudio.current.media;
    const fail = () => {
      if (streamActive.current) {
        setPaused(true);
        setReplayError('Audio stream interrupted. Retry this song or skip to the next.');
      }
    };
    media.addEventListener('error', fail);
    return () => {
      media.removeEventListener('error', fail);
      streamAudio.current.dispose();
    };
  }, []);
  function returnLive() {
    setArchiveOpen(false);
    ++replayRequest.current;
    setArchiveMode(false);
    archiveFetch.current?.abort();
    streamAudio.current.stop();
    streamActive.current = false;
    setStreaming(false);
    setReplayLoading(false);
    setReplayError('');
    audio.current.stop();
    audio.current.sync(offset);
    replaySource.current = null;
    playlist.current = [];
    setReplay(null);
    setPaused(false);
  }
  function seekReplay(from: number) {
    if (!replaySource.current) return;
    if (streamActive.current) {
      streamAudio.current.media.currentTime = Math.max(0, (from - streamAudio.current.from) / 1000);
      void streamAudio.current.media
        .play()
        .then(() => setPaused(false))
        .catch(() => setReplayError('Audio could not resume. Try again.'));
      return;
    }
    audio.current.stop();
    setPaused(false);
    setReplay(replaySnapshot(replaySource.current, from, Date.now()));
  }
  useEffect(() => {
    if (
      !replay ||
      paused ||
      replayLoading ||
      (currentTime < replay.endsAt && !(streaming && streamAudio.current.media.ended))
    )
      return;
    if (trackIndex + 1 < playlist.current.length)
      void playRecording(playlist.current, trackIndex + 1);
    else {
      audio.current.stop();
      if (streaming) streamAudio.current.media.pause();
      pausedAt.current = replay.endsAt;
      setPaused(true);
    }
  }, [now, replay, paused, replayLoading, trackIndex, streaming]);
  useEffect(() => {
    if (!replay || !replaySource.current || !needsDecisions) return;
    const abort = new AbortController();
    const source = replaySource.current;
    const at = currentTime - replay.startedAt + source.startedAt;
    void fetch(`${API}/api/archive/${encodeURIComponent(source.id)}/cues?at=${Math.floor(at)}`, {
      signal: abort.signal,
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((cues) => {
        if (!abort.signal.aborted) setReplayCues(cues);
      })
      .catch(() => {});
    return () => abort.abort();
  }, [replay?.id, needsDecisions, Math.floor(currentTime / 3000)]);
  async function loadReplayTraces() {
    const source = replaySource.current;
    if (!source || traceCursor === null || traceBusy) return;
    setTraceBusy(true);
    try {
      const response = await fetch(
        `${API}/api/archive/${encodeURIComponent(source.id)}/traces?cursor=${encodeURIComponent(traceCursor)}`,
      );
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { traces: Trace[]; next: string | null };
      if (source !== replaySource.current) return;
      source.traces = data.traces;
      setTraceCursor(data.next);
      setReplay((current) =>
        current
          ? {
              ...current,
              traces: data.traces.map((t) => ({
                ...t,
                at: t.at + current.startedAt - source.startedAt,
              })),
            }
          : current,
      );
    } catch {
      setError('Decision page could not load. Try again.');
    } finally {
      setTraceBusy(false);
    }
  }
  function exportTrace() {
    if (!room) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            coverage: replay
              ? 'Current archive decision page only. Full raw responses remain in the archive.'
              : 'Recent server buffer, up to 180 decisions and 8 phrases. Not an independently signed attestation.',
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
  const replayControls = (replay || replayLoading || replayError) && (
    <section className="replay-controls" aria-label="Recording playback">
      <strong>REPLAY · {playlist.current[trackIndex]?.prompt.split('\n')[0]}</strong>
      <span>
        Song {trackIndex + 1} of {playlist.current.length} · no model calls
      </span>
      {replayLoading && <span role="status">Loading song and instruments…</span>}
      {replayError && <span role="alert">{replayError}</span>}
      <button
        disabled={trackIndex === 0}
        onClick={() => void playRecording(playlist.current, trackIndex - 1)}
      >
        Previous song
      </button>
      <button
        disabled={trackIndex + 1 >= playlist.current.length}
        onClick={() => void playRecording(playlist.current, trackIndex + 1)}
      >
        Next song
      </button>
      {replayError && (
        <button onClick={() => void playRecording(playlist.current, trackIndex)}>Retry song</button>
      )}
      {replay && !replayLoading && !replayError && (
        <>
          <span>
            {streaming
              ? 'Streaming MP3 · synchronized stage'
              : 'Audio preparing · playing saved notes'}
          </span>
          <button
            onClick={() => {
              if (streaming) {
                if (paused && streamAudio.current.position() >= replaySource.current!.endedAt!) {
                  seekReplay(replaySource.current!.startedAt);
                  return;
                }
                if (paused)
                  void streamAudio.current.media
                    .play()
                    .then(() => setPaused(false))
                    .catch(() => setReplayError('Audio could not resume.'));
                else {
                  streamAudio.current.media.pause();
                  setPaused(true);
                }
                return;
              }
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
            {`${Math.floor(Math.max(0, currentTime - replay.startedAt) / 60000)}:${String(Math.floor(Math.max(0, currentTime - replay.startedAt) / 1000) % 60).padStart(2, '0')}`}{' '}
            /{' '}
            {`${Math.floor((replay.endsAt - replay.startedAt) / 60000)}:${String(Math.floor((replay.endsAt - replay.startedAt) / 1000) % 60).padStart(2, '0')}`}
            <input
              aria-label="Seek recording"
              type="range"
              min={0}
              max={Math.max(1, replay.endsAt - replay.startedAt)}
              value={Math.max(
                0,
                Math.min(replay.endsAt - replay.startedAt, currentTime - replay.startedAt),
              )}
              onChange={(e) => seekReplay(replaySource.current!.startedAt + Number(e.target.value))}
            />
          </label>
        </>
      )}
      <button onClick={returnLive}>Return to live</button>
      <button
        disabled={traceBusy || traceCursor === null}
        onClick={() => {
          setArchiveOpen(false);
          setConsoleOpen(true);
          void loadReplayTraces();
        }}
      >
        {traceBusy
          ? 'Loading decisions…'
          : traceCursor === null
            ? 'All decision pages read'
            : 'Load decision page'}
      </button>
    </section>
  );
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
          <button
            className="text-button archive-toggle"
            onClick={() => setArchiveOpen(!archiveOpen)}
          >
            Jtb archive
          </button>
          <button className="text-button" onClick={() => setAbout(true)}>
            How Jev works <ArrowUpRight size={15} />
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
            {archiveMode ? 'ARCHIVE PLAYER' : connected ? 'STAGE CONNECTED' : 'CONNECTING TO STAGE'}
          </div>
        </div>
        {!archiveOpen && replayControls}
        {archiveOpen && (
          <ArchivePanel
            api={API}
            onPlay={playRecording}
            onClose={() => setArchiveOpen(false)}
            player={replayControls}
          />
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
                  levels={streaming ? undefined : levels}
                  spectrum={spectrum}
                  traces={replay ? replayCues : room?.traces}
                  onDecisionStream={setNeedsDecisions}
                  playing={running && !!frame && !paused}

                  reduced={reduced}
                  onSelect={selectRole}
                  serverOffset={replay ? currentTime - now : offset}
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
              {fullscreen && !replay && <Chat api={API} messages={chat} overlay />}
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
                    streamAudio.current.media.volume = value;
                  }}
                />
              </div>
            </div>
            {!replay && !fullscreen && <Chat api={API} messages={chat} />}
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
            {!streaming && (
              <>
                <Mixer
                  audio={audio.current}
                  frame={activeFrame}
                  beat={frame ? ((currentTime - frame.at) * frame.bpm) / 60000 : 0}
                />
                <MasterDesk
                  audio={audio.current}
                  frame={activeFrame}
                  referenceActive={referenceRoom === room?.id && sound}
                  canReference={!replay && running && room.mode === 'live' && sound}
                  onReference={() => setReferenceRoom(room!.id)}
                />
              </>
            )}
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
        <button className="footer-link" onClick={() => setAbout(true)}>
          HOW JEV WORKS
        </button>
        <span>BUILT WITH JEV / MADE FOR THE MOMENT</span>
      </footer>
      {about && <HowJevWorks onClose={() => setAbout(false)} />}
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
