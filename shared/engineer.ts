import { z } from 'zod';
import { clamp, musicians, type Musician } from './music.js';
import {
  defaultAudienceDirection,
  readAudienceDirection,
  type AudienceDirection,
} from './audience.js';

const level = z.object({
  rmsDb: z.number().finite().min(-100).max(12),
  peakDb: z.number().finite().min(-100).max(18),
});
export const levelsSchema = z.object({ guitar: level, bass: level, keys: level, drums: level });
export type ChannelLevels = z.infer<typeof levelsSchema>;
export interface EngineerMix {
  audience?: AudienceDirection;
  trimDb: Record<Musician, number>;
  reverb: number;
  threshold: number;
  ratio: number;
  traceId?: string;
  measuredAt?: number;
}
export const defaultEngineerMix = (): EngineerMix => ({
  audience: defaultAudienceDirection(),
  trimDb: { guitar: 0, bass: 0, keys: 0, drums: 0 },
  reverb: 0.04,
  threshold: -14,
  ratio: 2,
});
export interface MasterControls {
  audience?: AudienceDirection;
  mode: 'jev' | 'manual';
  reverb: number;
  threshold: number;
  ratio: number;
}
export const defaultMasterControls = (): MasterControls => ({
  audience: defaultAudienceDirection(),
  mode: 'jev',
  reverb: 0.04,
  threshold: -14,
  ratio: 2,
});
export function readMasterControls(value: unknown): MasterControls {
  const defaults = defaultMasterControls();
  if (!value || typeof value !== 'object') return defaults;
  const v = value as Partial<MasterControls>;
  return {
    audience: readAudienceDirection(v.audience),
    mode: v.mode === 'manual' ? 'manual' : 'jev',
    reverb:
      typeof v.reverb === 'number' && Number.isFinite(v.reverb)
        ? clamp(v.reverb, 0, 0.3)
        : defaults.reverb,
    threshold:
      typeof v.threshold === 'number' && Number.isFinite(v.threshold)
        ? clamp(v.threshold, -30, 0)
        : defaults.threshold,
    ratio:
      typeof v.ratio === 'number' && Number.isFinite(v.ratio)
        ? clamp(v.ratio, 1, 8)
        : defaults.ratio,
  };
}
export function effectiveMaster(mix: EngineerMix, controls: MasterControls): EngineerMix {
  return controls.mode === 'jev'
    ? mix
    : {
        ...controls,
        trimDb: Object.fromEntries(musicians.map((r) => [r, 0])) as Record<Musician, number>,
      };
}
