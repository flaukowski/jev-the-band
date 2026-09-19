import { clamp, fxNames, musicians, type Musician, type Effects } from './music';
export type Override = 'auto' | 'on' | 'off';
export interface ChannelMix {
  db: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  tone: number;
  drive: number;
  rig: Record<keyof Effects, Override>;
}
export type Mix = Record<Musician, ChannelMix>;
export const defaultMix = (): Mix =>
  Object.fromEntries(
    musicians.map((r, i) => [
      r,
      {
        db: 0,
        pan: [-0.4, 0.08, 0.4, 0][i],
        mute: false,
        solo: false,
        tone: 0.55,
        drive: 0.5,
        rig: Object.fromEntries(fxNames.map((f) => [f, 'auto'])),
      },
    ]),
  ) as Mix;
export function channelGain(mix: Mix, role: Musician): number {
  const c = mix[role];
  return c.mute || (musicians.some((r) => mix[r].solo) && !c.solo)
    ? 0
    : 10 ** (clamp(c.db, -48, 6) / 20);
}
export function readMix(value: unknown): Mix {
  const mix = defaultMix();
  if (!value || typeof value !== 'object') return mix;
  for (const role of musicians) {
    const input = (value as Record<string, Partial<ChannelMix>>)[role];
    if (!input || typeof input !== 'object') continue;
    for (const key of ['db', 'pan', 'tone', 'drive'] as const) {
      if (typeof input[key] === 'number' && Number.isFinite(input[key]))
        mix[role][key] = clamp(
          input[key],
          key === 'db' ? -48 : key === 'pan' ? -1 : 0,
          key === 'db' ? 6 : 1,
        );
    }
    for (const key of ['mute', 'solo'] as const) mix[role][key] = input[key] === true;
    for (const key of fxNames)
      if (input.rig?.[key] === 'on' || input.rig?.[key] === 'off')
        mix[role].rig[key] = input.rig[key];
  }
  return mix;
}
export function effectiveEffects(channel: ChannelMix, effects: Effects): Effects {
  return Object.fromEntries(
    fxNames.map((f) => [f, channel.rig[f] === 'auto' ? !!effects[f] : channel.rig[f] === 'on']),
  ) as Effects;
}
