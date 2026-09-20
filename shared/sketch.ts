import { z } from 'zod';

// A long-form solo suggestion from the separately labeled arranger model (an LLM, not Jev).
// It contains no playable notes: only a story, a motif described in words and scale degrees,
// and a two-bar-by-two-bar arc. Jev reads it as context and still chooses every sounded note.
export const sketchChunkSchema = z.object({
  bars: z.string().min(1).max(12),
  energy: z.enum(['simmer', 'climb', 'peak', 'cool']),
  register: z.enum(['middle', 'high']),
  idea: z.string().min(4).max(220),
  targetDegrees: z
    .array(z.enum(['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7']))
    .min(1)
    .max(3),
  techniques: z
    .array(
      z.enum([
        'long_bend',
        'vibrato',
        'legato_run',
        'slides',
        'repeated_riff',
        'call_and_response',
        'space',
        'rhythmic_displacement',
        'sequence',
        'octave_leap',
        'grace_notes',
        'left_hand_comp',
      ]),
    )
    .max(4),
});
export const soloSketchSchema = z.object({
  title: z.string().min(2).max(80),
  story: z.string().min(8).max(400),
  motif: z.string().min(4).max(240),
  chunks: z.array(sketchChunkSchema).min(4).max(16),
});
export type SoloSketch = z.infer<typeof soloSketchSchema>;
export interface SoloSketchReport {
  status: 'planning' | 'ready' | 'failed';
  model: string;
  requestedAt: number;
  request?: unknown;
  sketch?: SoloSketch;
  providerId?: string;
  latencyMs?: number;
  cost?: number;
  error?: string;
}
/** The part of a sketch relevant to the two bars being composed. */
export function sketchAt(sketch: SoloSketch | undefined, chunk: number) {
  if (!sketch) return undefined;
  return {
    source: 'Outside arranger suggestion, written before these bars. It cannot hear the band.',
    story: sketch.story,
    motif: sketch.motif,
    now: sketch.chunks[Math.min(chunk, sketch.chunks.length - 1)],
    next: sketch.chunks[chunk + 1],
  };
}
