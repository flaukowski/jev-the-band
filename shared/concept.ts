import { z } from 'zod';
import { styles, arcs } from './performance.js';

const direction = z.string().min(4).max(220);
export const chapterSchema = z.object({
  name: z.string().min(2).max(60),
  atSeconds: z.number().int().min(0).max(480),
  style: z.enum(Object.keys(styles) as [keyof typeof styles, ...(keyof typeof styles)[]]),
  arc: z.enum(Object.keys(arcs) as [keyof typeof arcs, ...(keyof typeof arcs)[]]),
  harmonicDirection: direction,
  guitar: direction,
  bass: direction,
  keys: direction,
  drums: direction,
  sound: direction,
});
export const conceptSchema = z.object({
  concept: z.string().min(8).max(600),
  openingInstrument: z.enum(['guitar', 'bass', 'keys', 'drums']),
  openingReason: z.string().min(4).max(180),
  bpm: z.number().int().min(70).max(125),
  root: z.number().int().min(0).max(11),
  mode: z.enum(['major', 'minor', 'dorian', 'mixolydian']),
  chapters: z.array(chapterSchema).min(4).max(6),
});
export type SonicConcept = z.infer<typeof conceptSchema>;
export interface DirectorReport {
  status: 'planning' | 'ready' | 'failed';
  model: string;
  request?: unknown;
  concept?: SonicConcept;
  providerId?: string;
  latencyMs?: number;
  cost?: number;
  error?: string;
}
export function chapterAt(concept: SonicConcept | undefined, elapsed: number) {
  return concept?.chapters.filter((ch) => ch.atSeconds <= Math.max(0, elapsed)).at(-1);
}
