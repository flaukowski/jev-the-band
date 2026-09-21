import { useEffect, useRef, useState } from 'react';
import {
  lightRecipes,
  musicians,
  personas,
  wallOverlays,
  type Frame,
  type Musician,
  type Role,
  type Sky,
  type Trace,
  type WallOverlay,
  type WallVisual,
} from '../shared/music';
import { createStage, type StageEngine, type StageInput } from './stage/engine';
import { places, type Place } from './stage/horizon';

const tripLevels = [
  { label: 'Full trip', value: 1 },
  { label: 'Mellow', value: 0.45 },
  { label: 'Clean lens', value: 0 },
];

export function Stage({
  frame,
  upcoming,
  playing,
  reduced,
  onSelect,
  serverOffset,
  loadingAudio,
  levels,
  spectrum,
  traces,
}: {
  frame: Frame | null;
  upcoming: Frame | null;
  playing: boolean;
  reduced: boolean;
  onSelect: (role: Role) => void;
  serverOffset: number;
  loadingAudio: boolean;
  levels?: () => Record<Musician, number>;
  spectrum?: () => Uint8Array | null;
  traces?: Trace[];
}) {
  const host = useRef<HTMLDivElement>(null);
  const [view, setView] = useState('wide');
  const [follow, setFollow] = useState(false);
  const [director, setDirector] = useState(false);
  const [trip, setTrip] = useState(0);
  // Empty string follows Lux; anything else is this viewer's own choice and is never sent anywhere.
  const [visual, setVisual] = useState<WallVisual | ''>('');
  const [overlay, setOverlay] = useState<WallOverlay | ''>('');
  const [sky, setSky] = useState<Sky | ''>('');
  const [place, setPlace] = useState<Place | ''>('');
  // The wall's "decision stream" shows the room's raw decision records, exactly as received.
  const stream = useRef<{ from?: Trace[]; lines: string[] }>({ lines: [] });
  const readStream = useRef(() => stream.current.lines).current;
  if (stream.current.from !== traces) {
    stream.current = {
      from: traces,
      lines: (traces ?? [])
        .slice(-24)
        .map((t) => JSON.stringify({ role: t.role, source: t.source, answers: t.answers })),
    };
  }
  const engine = useRef<StageEngine | null>(null);
  const input = useRef<StageInput>(null!);
  input.current = {
    frame,
    upcoming,
    playing,
    reduced,
    serverOffset,
    loadingAudio,
    follow,
    director,
    trip: tripLevels[trip].value,
    levels,
    spectrum,
    stream: readStream,
    visual: visual || undefined,
    overlay: overlay || undefined,
    sky: sky || undefined,
    place: place || undefined,
  };
  const select = useRef(onSelect);
  select.current = onSelect;
  useEffect(() => {
    // Let the page paint and the room connection open before building the venue.
    const timer = window.setTimeout(() => {
      engine.current = createStage(host.current!, () => input.current, {
        onSelect: (role) => select.current(role),
        onView: setView,
        onManualCamera: () => {
          setFollow(false);
          setDirector(false);
          setView('free');
        },
      });
    }, 150);
    return () => {
      window.clearTimeout(timer);
      engine.current?.dispose();
      engine.current = null;
    };
  }, []);
  const go = (name: string) => {
    setView(name);
    setFollow(false);
    setDirector(false);
    engine.current?.view(name);
  };
  return (
    <div ref={host} className="stage-canvas" aria-label="Interactive concert stage">
      <div className="camera-desk" aria-label="Camera controls">
        <select aria-label="Camera view" value={view} onChange={(e) => go(e.target.value)}>
          <option value="wide">Balcony</option>
          <option value="front">Front row</option>
          <option value="crowd">In the crowd</option>
          <option value="overhead">Overhead</option>
          <option value="wing">Stage wing</option>
          <option value="stage">From the stage</option>
          <option value="drone">Drone</option>
          <option value="lux">Lighting desk</option>
          {musicians.map((r) => (
            <option key={r} value={r}>
              {personas[r].name} cam
            </option>
          ))}
          {view === 'free' && <option value="free">Free camera</option>}
        </select>
        <button aria-label="Zoom in" onClick={() => engine.current?.zoom(0.85)}>
          +
        </button>
        <button aria-label="Zoom out" onClick={() => engine.current?.zoom(1.18)}>
          −
        </button>
        <button aria-label="Reset camera" onClick={() => go('wide')}>
          ↺
        </button>
        <button
          aria-pressed={follow}
          onClick={() => {
            setDirector(false);
            setFollow(!follow);
          }}
        >
          Follow solo
        </button>
        <button
          aria-pressed={director}
          title="Cuts to a new camera every 30 to 90 seconds with slow zooms and orbits, and finds the soloist"
          onClick={() => {
            setFollow(false);
            setDirector(!director);
          }}
        >
          Director
        </button>
        <button
          title="How strongly the picture responds to the players' effects"
          onClick={() => setTrip((trip + 1) % tripLevels.length)}
        >
          {tripLevels[trip].label}
        </button>
        <select
          aria-label="Projection wall"
          title="What the wall behind the band shows. Lux chooses unless you do; only you see your choice."
          value={visual}
          onChange={(e) => setVisual(e.target.value as WallVisual | '')}
        >
          <option value="">Wall: Lux</option>
          {lightRecipes.visual.map((v) => (
            <option key={v} value={v}>
              Wall: {v}
            </option>
          ))}
        </select>
        <select
          aria-label="Wall overlay"
          title="A second picture laid over the first"
          value={overlay}
          onChange={(e) => setOverlay(e.target.value as WallOverlay | '')}
        >
          <option value="">Overlay: Lux</option>
          {wallOverlays.map((v) => (
            <option key={v} value={v}>
              Overlay: {v}
            </option>
          ))}
        </select>
        <select
          aria-label="Sky and weather"
          title="Sky and weather over the field. Lux chooses unless you do."
          value={sky}
          onChange={(e) => setSky(e.target.value as Sky | '')}
        >
          <option value="">Sky: Lux</option>
          {lightRecipes.sky.map((v) => (
            <option key={v} value={v}>
              Sky: {v}
            </option>
          ))}
        </select>
        <select
          aria-label="Place"
          title="What stands on the horizon. Every song is drawn somewhere new unless you choose."
          value={place}
          onChange={(e) => setPlace(e.target.value as Place | '')}
        >
          <option value="">Place: per song</option>
          {places.map((v) => (
            <option key={v} value={v}>
              Place: {v}
            </option>
          ))}
        </select>
        <span>Drag to orbit · scroll to zoom</span>
      </div>
      <div className="stage-fallback">
        The stage needs WebGL. The music and decision console still work.
      </div>
    </div>
  );
}
