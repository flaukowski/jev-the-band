import { useEffect, useState, type CSSProperties } from 'react';
import { fxNames, musicians, personas, type Frame, type Musician } from '../shared/music';
import { defaultMix, readMix, type ChannelMix, type Mix, type Override } from '../shared/mixer';
import type { BandAudio } from './audio';
import { effectsAtBeat } from '../shared/performance';

const labels = {
  drive: 'Distortion',
  wah: 'Auto-wah',
  envelope: 'Envelope',
  chorus: 'Chorus',
  tremolo: 'Tremolo',
  delay: 'Delay',
  reverb: 'Reverb',
};
export function Mixer({
  audio,
  frame,
  beat = 0,
}: {
  audio: BandAudio;
  frame: Frame | null;
  beat?: number;
}) {
  const [mix, setMix] = useState<Mix>(() => {
    try {
      return readMix(JSON.parse(localStorage.getItem('jev-mix-v2') ?? 'null'));
    } catch {
      return defaultMix();
    }
  });
  const [levels, setLevels] = useState(audio.levels());
  const [open, setOpen] = useState(true);
  const [rig, setRig] = useState<Musician>('guitar');
  const [sampleStatus, setSampleStatus] = useState(audio.samples.status);
  useEffect(() => {
    audio.setMix(mix);
    try {
      localStorage.setItem('jev-mix-v2', JSON.stringify(mix));
    } catch {
      /* Private browsing. */
    }
  }, [audio, mix]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setLevels(audio.levels());
      setSampleStatus(audio.samples.status);
    }, 90);
    return () => clearInterval(timer);
  }, [audio]);
  const update = (role: Musician, patch: Partial<ChannelMix>) =>
    setMix((m) => ({ ...m, [role]: { ...m[role], ...patch } }));
  const rigPart = frame?.parts.find((part) => part.role === rig);
  const direction = rigPart?.performance;
  return (
    <section className="soundboard" aria-label="Soundboard">
      <div className="board-heading">
        <button className="board-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          ↗ SOUND DESK <span>{open ? 'Hide' : 'Open'}</span>
        </button>
        <span>Your listening mix</span>
        <button className="board-reset" onClick={() => setMix(defaultMix())}>
          Reset mix
        </button>
      </div>
      {open && (
        <>
          <div className="channel-strips">
            {musicians.map((role) => {
              const channel = mix[role];
              const person = personas[role];
              const part = frame?.parts.find((p) => p.role === role);
              const db = levels[role] > 0 ? 20 * Math.log10(levels[role]) : -60;
              return (
                <article
                  key={role}
                  className="channel-strip"
                  style={{ '--channel': person.color } as CSSProperties}
                  aria-label={`${person.name} mixer`}
                >
                  <div className="channel-title">
                    <strong>{person.name}</strong>
                    <small>
                      {part?.solo
                        ? 'LEAD'
                        : part?.continued
                          ? 'LISTENING'
                          : part
                            ? 'PLAYING'
                            : 'READY'}
                    </small>
                  </div>
                  <div
                    className="channel-meter"
                    role="meter"
                    aria-label={`${person.name} signal`}
                    aria-valuemin={-60}
                    aria-valuemax={6}
                    aria-valuenow={Math.round(Math.max(-60, Math.min(6, db)))}
                  >
                    <i
                      style={{ width: `${Math.max(0, Math.min(100, ((db + 60) / 66) * 100))}%` }}
                    />
                  </div>
                  <label className="fader-label">
                    Level{' '}
                    <output>
                      {channel.db > 0 ? '+' : ''}
                      {channel.db} dB
                    </output>
                    <input
                      type="range"
                      min="-48"
                      max="6"
                      step="1"
                      aria-label={`${person.name} level`}
                      value={channel.db}
                      onChange={(e) => update(role, { db: +e.target.value })}
                    />
                  </label>
                  <div className="channel-switches">
                    <button
                      aria-label={`Mute ${person.name}`}
                      aria-pressed={channel.mute}
                      onClick={() => update(role, { mute: !channel.mute })}
                    >
                      MUTE
                    </button>
                    <button
                      aria-label={`Solo ${person.name} in mix`}
                      aria-pressed={channel.solo}
                      onClick={() => update(role, { solo: !channel.solo })}
                    >
                      SOLO
                    </button>
                  </div>
                  <label className="pan-label">
                    Pan{' '}
                    <output>
                      {Math.abs(channel.pan) < 0.05
                        ? 'C'
                        : `${channel.pan < 0 ? 'L' : 'R'} ${Math.round(Math.abs(channel.pan) * 100)}`}
                    </output>
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step="0.05"
                      aria-label={`${person.name} pan`}
                      value={channel.pan}
                      onChange={(e) => update(role, { pan: +e.target.value })}
                    />
                  </label>
                  <button
                    className="rig-open"
                    aria-pressed={rig === role}
                    onClick={() => setRig(role)}
                  >
                    Effects rig ↗
                  </button>
                </article>
              );
            })}
          </div>
          <div
            className="effects-rig"
            style={{ '--channel': personas[rig].color } as CSSProperties}
            aria-label={`${personas[rig].name} effects rig`}
          >
            <div className="rig-heading">
              <strong>{personas[rig].name}’S PEDALBOARD</strong>
              <span>JEV = player decides · ON / OFF = your override</span>
            </div>
            {direction && (
              <p className="rig-direction">
                {direction.style.replaceAll('_', ' ')} · {direction.arc} ·{' '}
                {direction.texture.replaceAll('_', ' ')} <span>BAR {beat < 4 ? '1' : '2'}</span>
              </p>
            )}
            <div className="pedals">
              {fxNames.map((effect) => {
                const played = rigPart ? effectsAtBeat(rigPart, beat)[effect] : false;
                const enabled =
                  mix[rig].rig[effect] === 'auto' ? played : mix[rig].rig[effect] === 'on';
                return (
                  <label key={effect} className={`pedal ${enabled ? 'engaged' : ''}`}>
                    <span>
                      <i />
                      {labels[effect]}
                    </span>
                    <small>
                      Jev: {played ? 'ON' : 'OFF'}
                      {mix[rig].rig[effect] !== 'auto' ? ' · overridden' : ''}
                    </small>
                    <select
                      aria-label={`${personas[rig].name} ${labels[effect]}`}
                      value={mix[rig].rig[effect]}
                      onChange={(e) =>
                        update(rig, {
                          rig: { ...mix[rig].rig, [effect]: e.target.value as Override },
                        })
                      }
                    >
                      <option value="auto">JEV</option>
                      <option value="on">ON</option>
                      <option value="off">OFF</option>
                    </select>
                  </label>
                );
              })}
            </div>
            <div className="rig-knobs">
              <label>
                Tone{' '}
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  aria-label={`${personas[rig].name} tone`}
                  value={mix[rig].tone}
                  onChange={(e) => update(rig, { tone: +e.target.value })}
                />
              </label>
              <label>
                Drive amount{' '}
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  aria-label={`${personas[rig].name} drive amount`}
                  value={mix[rig].drive}
                  onChange={(e) => update(rig, { drive: +e.target.value })}
                />
              </label>
            </div>
          </div>
          <div className="board-footnote">
            <span>
              SOLO isolates your mix. LEAD is the musician’s musical solo. Every player has a
              separate rig.
            </span>
            <span data-testid="sample-status">{sampleStatus}</span>
          </div>
        </>
      )}
    </section>
  );
}
