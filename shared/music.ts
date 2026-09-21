import { z } from 'zod';
import type { Performance } from './performance.js';
import type { DirectorReport } from './concept.js';
import type { EngineerMix } from './engineer.js';

export const roles = ['guitar', 'bass', 'keys', 'drums', 'lights'] as const;
export type Role = (typeof roles)[number];
export type DecisionRole = Role | 'engineer' | 'host';
export type JevProvider = 'openrouter' | 'typesafe';
export type Musician = Exclude<Role, 'lights'>;
export const musicians: Musician[] = ['guitar', 'bass', 'keys', 'drums'];
export const personas: Record<
  Role,
  { name: string; instrument: string; color: string; philosophy: string }
> = {
  guitar: {
    name: 'ROOK',
    instrument: 'Electric guitar',
    color: '#f4a66d',
    philosophy:
      'Melodic explorer. Singable motifs, space between phrases, patient tension and release. Trade phrases with June. A solo is an invitation, not a volume contest.',
  },
  bass: {
    name: 'MOSS',
    instrument: 'Electric bass',
    color: '#c8ef79',
    philosophy:
      'The gravitational center. Deep syncopated pocket, strong roots, occasional playful counterpoint. Hear Kit first. Introduce one small change that others can adopt.',
  },
  keys: {
    name: 'JUNE',
    instrument: 'Keys & synthesizers',
    color: '#cbafff',
    philosophy:
      'Harmonic cartographer. Warm Rhodes, percussive piano, organ swells and cosmic synths. Change color before adding notes. Split hands; leave the bass register to Moss.',
  },
  drums: {
    name: 'KIT',
    instrument: 'Drum kit',
    color: '#7cdedc',
    philosophy:
      'Elastic timekeeper. Keep a legible pocket, listen to the bass, use ghost notes and evolving cymbal textures. Ambient passages can breathe. Fill to invite a transition, not every bar.',
  },
  lights: {
    name: 'LUX',
    instrument: 'Lights & atmosphere',
    color: '#f2eeab',
    philosophy:
      'Visual fifth member. Hear density, momentum and silence. Mix wash, beam and laser layers. Reveal the soloist, let quiet passages go dark, build slowly. No rapid flashing.',
  },
};
export const patches = ['piano', 'rhodes', 'organ', 'analog', 'pad', 'bell'] as const;
export const decisionPersonas = {
  ...personas,
  engineer: {
    name: 'PATCH',
    instrument: 'Front of house',
    color: '#e7cda1',
    philosophy:
      'Keep a balanced musical mix. Preserve dynamics and the pocket; move gently, leave silence alone.',
  },
  host: {
    name: 'OPENING',
    instrument: 'Stage host',
    color: '#d6e4b9',
    philosophy: 'Choose the entry that best serves the sonic concept. Any musician can start.',
  },
};
export const fxNames = [
  'drive',
  'wah',
  'envelope',
  'chorus',
  'tremolo',
  'delay',
  'reverb',
] as const;
export type Patch = (typeof patches)[number];
export type Effects = Record<(typeof fxNames)[number], boolean>;
export const actions = [
  'hold',
  'vary',
  'develop',
  'solo',
  'support',
  'space',
  'rest',
  'resolve',
] as const;
export type Action = (typeof actions)[number];
export const rhythms = [
  'pocket',
  'offbeat',
  'flow',
  'sparse',
  'sustain',
  'clave',
  'lyrical',
  'thirty_seconds',
  'triplets',
  'quintuplets',
  'sextuplets',
  'broken',
] as const;
export const developments = [
  'repeat',
  'answer',
  'sequence_up',
  'sequence_down',
  'invert',
  'fragment',
  'new_theme',
] as const;
export const articulations = ['natural', 'legato', 'staccato', 'bend', 'slide'] as const;
// Lead techniques rendered by the audio engine. Hammer-ons and pull-offs sound without a new pick attack.
export const noteArticulations = [...articulations, 'hammer', 'pull'] as const;
export type Rhythm = (typeof rhythms)[number];
export const modes = ['dorian', 'mixolydian', 'minor', 'major'] as const;
export const scales = {
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
};
export const noteNames = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const lightRecipes = {
  wash: [
    'amber dusk',
    'violet ocean',
    'acid sunrise',
    'deep blue',
    'rose garden',
    'forest floor',
    'moon white',
    'ember red',
    'teal lagoon',
    'ultraviolet',
    'peach haze',
    'blackout',
  ],
  beam: [
    'wide fan',
    'crossing arches',
    'slow orbit',
    'ceiling bounce',
    'solo pool',
    'four pillars',
    'low sweep',
    'prism bloom',
    'inward focus',
    'horizon line',
    'rain curtain',
    'off',
  ],
  laser: [
    'emerald fan',
    'cyan tunnel',
    'violet lattice',
    'amber horizon',
    'blue spokes',
    'pink canopy',
    'slow spiral',
    'off',
  ],
  /** What Lux projects on the wall behind the band. Any of these can also be laid over another. */
  visual: [
    'liquid light',
    'jev logo',
    'piano roll',
    'band camera',
    'graphic eq',
    'radial spectrum',
    'plasma trails',
    'mandala',
    'decision stream',
    'song title',
  ],
  /** Procedural sky and weather over the festival field. */
  sky: [
    'starry night',
    'sunrise',
    'high noon',
    'sunset',
    'rain',
    'snow',
    'meteor shower',
    'alien abduction',
  ],
} as const;
export type WallVisual = (typeof lightRecipes.visual)[number];
export type WallOverlay = WallVisual | 'none';
export type Sky = (typeof lightRecipes.sky)[number];
export const wallOverlays = [...lightRecipes.visual, 'none'] as const;
export const lightingSchema = z.object({
  wash: z.enum(lightRecipes.wash),
  beam: z.enum(lightRecipes.beam),
  laser: z.enum(lightRecipes.laser),
  intensity: z.number().min(0).max(1),
  motion: z.number().min(0).max(1),
  // Added in v0.7. Optional so earlier frames and saved traces still validate.
  visual: z.enum(lightRecipes.visual).optional(),
  overlay: z.enum(wallOverlays).optional(),
  sky: z.enum(lightRecipes.sky).optional(),
});
export type Lighting = z.infer<typeof lightingSchema>;
export const defaultLighting: Lighting = {
  wash: 'amber dusk',
  beam: 'wide fan',
  laser: 'off',
  intensity: 0.55,
  motion: 0.3,
  visual: 'liquid light',
  overlay: 'none',
  sky: 'starry night',
};
export const decisionSchema = z.object({
  action: z.enum(actions),
  rhythm: z.enum(rhythms),
  degrees: z.array(z.number().int().min(0).max(7)).length(8),
  density: z.enum(['low', 'medium', 'high']),
  dynamic: z.enum(['soft', 'warm', 'bold']),
  tempo: z.enum(['ease', 'stay', 'push']),
  harmony: z.enum(['stay', 'up_fourth', 'up_fifth']),
  left: z.enum(patches),
  right: z.enum(patches),
  effects: z.object({
    drive: z.boolean(),
    wah: z.boolean(),
    delay: z.boolean(),
    reverb: z.boolean(),
    envelope: z.boolean().default(false),
    chorus: z.boolean().default(false),
    tremolo: z.boolean().default(false),
  }),
  ending: z.boolean(),
  development: z.enum(developments).default('answer'),
  articulation: z.enum(articulations).default('natural'),
  swing: z.enum(['straight', 'light', 'deep']).default('light'),
  commitment: z.enum(['brief', 'settle', 'patient']).default('settle'),
});
export type Decision = z.infer<typeof decisionSchema>;
export const noteSchema = z.object({
  beat: z.number().min(0).lt(8),
  duration: z.number().positive().max(8),
  midi: z.number().int().min(24).max(96),
  velocity: z.number().positive().max(1),
  hand: z.enum(['left', 'right']).optional(),
  patch: z.enum(patches).optional(),
  articulation: z.enum(noteArticulations).optional(),
  bend: z.number().min(-2).max(2).optional(),
  // hold: bend up and stay; release: bend and return (default); pre: start bent, then let down.
  bendShape: z.enum(['hold', 'release', 'pre']).optional(),
  vibrato: z.number().min(0).max(1).optional(),
  slideFrom: z.number().min(-12).max(12).optional(),
  provenance: z.object({ traceId: z.string(), slot: z.string() }).optional(),
  string: z.number().int().min(0).max(5).optional(),
});
export type Note = z.infer<typeof noteSchema>;
export interface Part {
  role: Musician;
  notes: Note[];
  decision: Decision;
  solo: boolean;
  repeated: number;
  source: 'jev' | 'rehearsal' | 'fallback';
  updatedAtFrame?: number;
  /**
   * Drums: what this part plays on its next repeats, first to last; the last entry is the groove
   * it settles back into. Set after a one-shot fill, drop or build so the moment is not looped.
   */
  upNext?: Note[][];
  /** The harness silenced this part because the wind-down ran out of time. Not a Jev choice. */
  cutForNextSong?: boolean;
  continued?: boolean;
  phraseFormat?: 'events-v1';
  tonalIntent?: { root: number; mode: string };
  performance?: Performance;
  effectsTimeline?: {
    beat: number;
    effects: Effects;
    traceId: string;
    /** Guitar only: light overdrive or saturated lead when drive is on. */
    driveLevel?: 'overdrive' | 'lead';
  }[];
}
export interface Frame {
  themeId?: string;
  themeTitle?: string;
  themeStartedAt?: number;
  engineerMix?: EngineerMix;
  id: number;
  at: number;
  durationMs: number;
  bpm: number;
  root: number;
  mode: keyof typeof scales;
  /** The full mode name when the band is outside the four base scales. */
  modeName?: string;
  parts: Part[];
  lighting: Lighting;
  chapter: string;
  ending: boolean;
  decisionRole?: Musician;
}
export interface Snapshot {
  provider?: JevProvider;
  /** Set when the room moved to its fallback decision provider mid-jam. */
  providerSwitch?: { from: JevProvider; to: JevProvider; reason: string; atFrame: number };
  setlist?: import('./setlist.js').ThemeCue[];
  themeId?: string;
  themeStartedAt?: number;
  soloInvitation?: { role: Musician; urgency: number; required: boolean };
  /** The host asked the band to end; it is landing the song before the room closes. */
  finishing?: boolean;
  /** First frame of the current song; musical time restarts there. */
  themeFrame0?: number;
  /** Set while the band is closing the current song for a queued one. */
  windDown?: { cueId: string; startFrame: number; framesIn: number };
  /** True when a player may lead the band to a new key at this boundary. */
  keyLeadOpen?: boolean;
  /** Two-bar frames since the band last changed key or mode. */
  keyAgeFrames?: number;
  keyChange?: { by: Musician; root: number; mode: string; atFrame: number };
  lastSoloAt?: number;
  lastSoloRole?: Musician;
  director?: DirectorReport;
  /** Long-form solo suggestions from the separately labeled arranger model; Jev still chooses every note. */
  soloSketches?: Partial<Record<Musician, import('./sketch.js').SoloSketchReport>>;
  id: string;
  title: string;
  prompt: string;
  mode: 'live' | 'rehearsal';
  status: 'starting' | 'playing' | 'ended';
  startedAt: number;
  endsAt: number;
  seed: number;
  baseBpm: number;
  initialRoot?: number;
  initialMode?: keyof typeof scales;
  opener: Musician;
  frame: Frame | null;
  frames: Frame[];
  traces: Trace[];
  requests: number;
  cost: number;
  billedCalls: number;
  endedAt?: number;
  error?: string;
}
export interface ChoiceQuestion {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string>;
}
export interface JevRequest {
  model: string;
  state: unknown;
  questions: Record<string, ChoiceQuestion>;
}
export interface Answer {
  choice: string;
  probabilities: Record<string, number>;
  confidence?: number;
}
export interface Trace {
  provider?: JevProvider;
  endpoint?: string;
  responseModel?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  id: string;
  role: DecisionRole;
  frame: number;
  at: number;
  source: 'jev' | 'rehearsal' | 'fallback';
  latencyMs: number;
  request: JevRequest;
  answers: Record<string, Answer>;
  appliedAnswers?: Record<string, Answer>;
  selectionMethod?: 'seeded-model-distribution';
  /** Novelty pressure (0–1) used to decode this trace's distribution; see server/heat.ts. */
  heat?: number;
  requestHash: string;
  providerId?: string;
  cost: number | null;
  error?: string;
}
export function defaultDecision(): Decision {
  return {
    action: 'vary',
    rhythm: 'pocket',
    degrees: [0, 2, 4, 6, 4, 2, 1, 0],
    density: 'medium',
    dynamic: 'warm',
    tempo: 'stay',
    harmony: 'stay',
    left: 'rhodes',
    right: 'rhodes',
    effects: {
      drive: false,
      wah: false,
      delay: false,
      reverb: true,
      envelope: false,
      chorus: false,
      tremolo: false,
    },
    ending: false,
    development: 'answer',
    articulation: 'natural',
    swing: 'light',
    commitment: 'settle',
  };
}
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export function hash(s: string): number {
  let n = 2166136261;
  for (const c of s) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
export function random(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
