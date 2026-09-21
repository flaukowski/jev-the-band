import {
  defaultLighting,
  fxNames,
  modes,
  musicians,
  type Effects,
  type Frame,
  type Lighting,
  type Musician,
  type Note,
  type Part,
} from '../../shared/music';
import { effectsAtBeat } from '../../shared/performance';
import { clamp01, damp, rootHue } from './util';

/**
 * Everything the stage knows about the music, derived once per rendered frame.
 * The stage never invents musical facts: every value here comes from committed note events,
 * Jev's typed decisions, or the listener's real post-fader meters. No model calls.
 */
export interface PlayerSignal {
  role: Musician;
  part?: Part;
  /** The committed rig cue sounding now, including bar-level changes. */
  effects?: Effects;
  active: boolean;
  solo: boolean;
  /** Fast attack envelope from the most recent onset, 0..1. */
  impulse: number;
  /** 1 while any note is sounding. */
  sustain: number;
  /** Smoothed loudness. Real meter when the listener has sound on, note-derived otherwise. */
  level: number;
  pitch: number;
  pitchGlide: number;
  velocity: number;
  density: number;
  /** Count of onsets heard so far; parity drives alternate picking and sticking. */
  onsets: number;
  /** Notes whose onset fell inside this tick. */
  hits: Note[];
  held: Note[];
  /** Progress 0..1 through a bent note, 0 otherwise. */
  bend: number;
}
export type FxName = (typeof fxNames)[number];
export interface Signals {
  time: number;
  dt: number;
  playing: boolean;
  reduced: boolean;
  bpm: number;
  /** Beats since the phrase began (0..8, can run over while the next phrase is in flight). */
  beat: number;
  beatPhase: number;
  barPhase: number;
  phrase: number;
  /** Whole-band intensity, fast and slow. */
  energy: number;
  energySlow: number;
  kick: number;
  snare: number;
  hat: number;
  crash: number;
  players: Record<Musician, PlayerSignal>;
  soloists: Musician[];
  hue: number;
  modeMix: [number, number, number, number];
  ending: boolean;
  fx: Record<FxName, number>;
  lighting: Lighting;
  /** Increments when Lux commits a different look. */
  lightingChanges: number;
  frame: Frame | null;
  upcoming: Frame | null;
}

export const drumVoice = (midi: number) =>
  midi === 36
    ? 'kick'
    : midi === 38 || midi === 37
      ? 'snare'
      : midi === 42 || midi === 46 || midi === 44
        ? 'hat'
        : midi === 51 || midi === 53
          ? 'ride'
          : midi === 49 || midi === 55
            ? 'crash'
            : midi === 50
              ? 'tomHi'
              : midi === 47
                ? 'tomMid'
                : 'tomLo';
export type DrumVoice = ReturnType<typeof drumVoice>;

const blankPlayer = (role: Musician): PlayerSignal => ({
  role,
  active: false,
  solo: false,
  impulse: 0,
  sustain: 0,
  level: 0,
  pitch: role === 'bass' ? 40 : 60,
  pitchGlide: role === 'bass' ? 40 : 60,
  velocity: 0,
  density: 0,
  onsets: 0,
  hits: [],
  held: [],
  bend: 0,
});

export interface SignalInput {
  frame: Frame | null;
  upcoming: Frame | null;
  playing: boolean;
  reduced: boolean;
  serverOffset: number;
  levels?: () => Record<Musician, number>;
}

export class SignalTracker {
  readonly s: Signals = {
    time: 0,
    dt: 0.016,
    playing: false,
    reduced: false,
    bpm: 96,
    beat: 0,
    beatPhase: 0,
    barPhase: 0,
    phrase: 0,
    energy: 0,
    energySlow: 0,
    kick: 0,
    snare: 0,
    hat: 0,
    crash: 0,
    players: Object.fromEntries(musicians.map((r) => [r, blankPlayer(r)])) as Record<
      Musician,
      PlayerSignal
    >,
    soloists: [],
    hue: rootHue(2),
    modeMix: [1, 0, 0, 0],
    ending: false,
    fx: Object.fromEntries(fxNames.map((n) => [n, 0])) as Record<FxName, number>,
    lighting: defaultLighting,
    lightingChanges: 0,
    frame: null,
    upcoming: null,
  };
  private lastFrameId = -1;
  private lastBeat = 0;
  private idleBeat = 0;
  private lightingKey = '';

  update(input: SignalInput, dt: number) {
    const s = this.s;
    const { frame, playing, reduced } = input;
    s.dt = dt;
    s.reduced = reduced;
    s.playing = playing && !!frame;
    s.frame = frame;
    s.upcoming = input.upcoming;
    if (!reduced) s.time += dt;
    s.lighting = frame?.lighting ?? defaultLighting;
    const key = `${s.lighting.wash}|${s.lighting.beam}|${s.lighting.laser}`;
    if (key !== this.lightingKey) {
      this.lightingKey = key;
      s.lightingChanges++;
    }
    s.ending = !!frame?.ending;
    if (frame) s.bpm = frame.bpm;
    let beat: number;
    if (s.playing && frame) {
      beat = Math.max(0, ((Date.now() + input.serverOffset - frame.at) * frame.bpm) / 60000);
    } else {
      // An empty room still breathes, slowly.
      this.idleBeat += reduced ? 0 : dt * (72 / 60);
      beat = this.idleBeat;
    }
    const newFrame = (frame?.id ?? -1) !== this.lastFrameId;
    const from = newFrame ? Math.max(-1, beat - 0.5) : this.lastBeat;
    this.lastFrameId = frame?.id ?? -1;
    this.lastBeat = beat;
    s.beat = beat;
    s.phrase = frame?.id ?? 0;
    s.beatPhase = beat - Math.floor(beat);
    s.barPhase = (beat / 4) % 1;

    const meters = s.playing && input.levels ? input.levels() : undefined;
    const metered = !!meters && musicians.some((r) => meters[r] > 0.0005);
    let energy = 0;
    const fxTarget = Object.fromEntries(fxNames.map((n) => [n, 0])) as Record<FxName, number>;
    s.soloists.length = 0;
    const decay = Math.exp(-dt * 7);
    s.kick *= Math.exp(-dt * 6);
    s.snare *= Math.exp(-dt * 8);
    s.hat *= Math.exp(-dt * 16);
    s.crash *= Math.exp(-dt * 1.6);
    for (const role of musicians) {
      const p = s.players[role];
      const part = s.playing ? frame?.parts.find((x) => x.role === role) : undefined;
      p.part = part;
      p.effects = part ? effectsAtBeat(part, beat) : undefined;
      p.active = !!part?.notes.length;
      p.solo = !!part?.solo && p.active;
      p.density = part ? clamp01(part.notes.length / 36) : 0;
      p.hits.length = 0;
      p.held.length = 0;
      p.impulse *= decay;
      p.bend = 0;
      if (part && !reduced) {
        for (const n of part.notes) {
          if (n.beat > from && n.beat <= beat) {
            p.hits.push(n);
            p.onsets++;
            p.impulse = Math.max(p.impulse, n.velocity);
            p.velocity = n.velocity;
            if (role !== 'drums') p.pitch = n.midi;
            if (role === 'drums') {
              const voice = drumVoice(n.midi);
              if (voice === 'kick') s.kick = Math.max(s.kick, n.velocity);
              else if (voice === 'snare') s.snare = Math.max(s.snare, n.velocity);
              else if (voice === 'hat' || voice === 'ride') s.hat = Math.max(s.hat, n.velocity);
              else if (voice === 'crash') s.crash = Math.max(s.crash, n.velocity);
            }
          }
          if (beat >= n.beat && beat < n.beat + n.duration) {
            p.held.push(n);
            if (n.bend) p.bend = clamp01((beat - n.beat) / Math.min(n.duration, 0.6));
          }
        }
      }
      p.sustain = damp(p.sustain, p.held.length ? 1 : 0, p.held.length ? 30 : 6, dt);
      p.pitchGlide = damp(p.pitchGlide, p.pitch, 14, dt);
      const synthetic = p.active ? p.impulse * 0.8 + p.sustain * 0.22 * (0.5 + p.velocity) : 0;
      const measured = metered ? clamp01(meters![role] * 2.4) : synthetic;
      p.level = damp(p.level, reduced ? 0 : measured, measured > p.level ? 38 : 7, dt);
      if (p.solo) s.soloists.push(role);
      energy += p.level * 0.55 + p.density * 0.3 + (p.solo ? 0.22 : 0);
      if (part && p.active)
        for (const n of fxNames) if (p.effects?.[n]) fxTarget[n] += role === 'drums' ? 0 : 0.5;
    }
    energy = s.playing ? clamp01(energy / 2.4) : 0;
    s.energy = damp(s.energy, reduced ? 0 : energy, energy > s.energy ? 5 : 1.6, dt);
    s.energySlow = damp(s.energySlow, reduced ? 0 : energy, 0.35, dt);
    for (const n of fxNames) s.fx[n] = damp(s.fx[n], reduced ? 0 : clamp01(fxTarget[n]), 1.8, dt);
    if (frame) {
      // Hue travels the short way around the wheel.
      const target = rootHue(frame.root);
      let delta = target - s.hue;
      delta -= Math.round(delta);
      s.hue = (s.hue + delta * (1 - Math.exp(-dt * 0.9)) + 1) % 1;
    }
    const modeIndex = frame ? modes.indexOf(frame.mode) : 0;
    for (let i = 0; i < 4; i++) s.modeMix[i] = damp(s.modeMix[i], i === modeIndex ? 1 : 0, 0.7, dt);
    return s;
  }
}

/** The notes on either side of "now" for one limb, looking into the next phrase when it is known. */
export function around(
  s: Signals,
  role: Musician,
  accept: (n: Note) => boolean,
): { prev: Note | null; next: Note | null; nextBeat: number } {
  const part = s.players[role].part;
  let prev: Note | null = null;
  let next: Note | null = null;
  let nextBeat = Infinity;
  if (part)
    for (const n of part.notes) {
      if (!accept(n)) continue;
      if (n.beat <= s.beat) {
        if (!prev || n.beat >= prev.beat) prev = n;
      } else if (n.beat < nextBeat) {
        next = n;
        nextBeat = n.beat;
      }
    }
  if (!next) {
    // A long phrase/solo can continue with freshly composed notes. Anticipate only a published frame.
    const future = s.upcoming?.parts.find((x) => x.role === role);
    const startBeat =
      s.frame && s.upcoming ? ((s.upcoming.at - s.frame.at) * s.bpm) / 60000 : Infinity;
    if (future)
      for (const n of future.notes)
        if (accept(n) && n.beat + startBeat < nextBeat && n.beat + startBeat > s.beat) {
          next = n;
          nextBeat = n.beat + startBeat;
        }
  }
  return { prev, next, nextBeat };
}
