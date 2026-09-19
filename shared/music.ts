import { z } from 'zod';

export const roles = ['guitar', 'bass', 'keys', 'drums', 'lights'] as const;
export type Role = (typeof roles)[number];
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
export const fxNames = ['drive', 'wah', 'delay', 'reverb'] as const;
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
export const rhythms = ['pocket', 'offbeat', 'flow', 'sparse', 'sustain', 'clave'] as const;
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
} as const;
export const lightingSchema = z.object({
  wash: z.enum(lightRecipes.wash),
  beam: z.enum(lightRecipes.beam),
  laser: z.enum(lightRecipes.laser),
  intensity: z.number().min(0).max(1),
  motion: z.number().min(0).max(1),
});
export type Lighting = z.infer<typeof lightingSchema>;
export const defaultLighting: Lighting = {
  wash: 'amber dusk',
  beam: 'wide fan',
  laser: 'off',
  intensity: 0.55,
  motion: 0.3,
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
  }),
  ending: z.boolean(),
});
export type Decision = z.infer<typeof decisionSchema>;
export const noteSchema = z.object({
  beat: z.number().min(0).lt(8),
  duration: z.number().positive().max(8),
  midi: z.number().int().min(24).max(96),
  velocity: z.number().positive().max(1),
  hand: z.enum(['left', 'right']).optional(),
  patch: z.enum(patches).optional(),
});
export type Note = z.infer<typeof noteSchema>;
export interface Part {
  role: Musician;
  notes: Note[];
  decision: Decision;
  solo: boolean;
  repeated: number;
  source: 'jev' | 'rehearsal' | 'fallback';
}
export interface Frame {
  id: number;
  at: number;
  durationMs: number;
  bpm: number;
  root: number;
  mode: keyof typeof scales;
  parts: Part[];
  lighting: Lighting;
  chapter: string;
  ending: boolean;
}
export interface Snapshot {
  id: string;
  title: string;
  prompt: string;
  mode: 'live' | 'rehearsal';
  status: 'starting' | 'playing' | 'ended';
  startedAt: number;
  endsAt: number;
  seed: number;
  baseBpm: number;
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
  id: string;
  role: Role;
  frame: number;
  at: number;
  source: 'jev' | 'rehearsal' | 'fallback';
  latencyMs: number;
  request: JevRequest;
  answers: Record<string, Answer>;
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
    effects: { drive: false, wah: false, delay: false, reverb: true },
    ending: false,
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
