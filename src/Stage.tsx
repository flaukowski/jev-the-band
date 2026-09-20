import { useEffect, useRef, useState } from 'react';
import { musicians, personas, type Frame, type Musician, type Role } from '../shared/music';
import { createStage, type StageEngine, type StageInput } from './stage/engine';

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
}: {
  frame: Frame | null;
  upcoming: Frame | null;
  playing: boolean;
  reduced: boolean;
  onSelect: (role: Role) => void;
  serverOffset: number;
  loadingAudio: boolean;
  levels?: () => Record<Musician, number>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [view, setView] = useState('wide');
  const [follow, setFollow] = useState(false);
  const [director, setDirector] = useState(false);
  const [trip, setTrip] = useState(0);
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
          title="Cuts between cameras every two phrases and finds the soloist"
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
        <span>Drag to orbit · scroll to zoom</span>
      </div>
      <div className="stage-fallback">
        The stage needs WebGL. The music and decision console still work.
      </div>
    </div>
  );
}
