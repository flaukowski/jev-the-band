import { fxNames, type Effects, type Musician } from './music';

export const rigProfiles = {
  guitar: {
    drive: 1,
    echo: 0.24,
    room: 0.2,
    chorus: 0.28,
    tremolo: 0.08,
    wahHz: 1700,
    wahDepth: 1300,
    feedback: 0.3,
  },
  bass: {
    drive: 0.6,
    echo: 0.09,
    room: 0.07,
    chorus: 0.12,
    tremolo: 0.025,
    wahHz: 650,
    wahDepth: 350,
    feedback: 0.18,
  },
  keys: {
    drive: 0.65,
    echo: 0.18,
    room: 0.17,
    chorus: 0.28,
    tremolo: 0.07,
    wahHz: 2200,
    wahDepth: 900,
    feedback: 0.25,
  },
  drums: {
    drive: 0.22,
    echo: 0.055,
    room: 0.08,
    chorus: 0,
    tremolo: 0,
    wahHz: 12000,
    wahDepth: 0,
    feedback: 0.14,
  },
} satisfies Record<Musician, object>;
export function availableEffects(role: Musician): readonly (keyof Effects)[] {
  return role === 'drums' ? ['drive', 'delay', 'reverb'] : fxNames;
}
export function instrumentEffects(role: Musician, effects: Effects): Effects {
  const allowed = availableEffects(role);
  return Object.fromEntries(fxNames.map((f) => [f, allowed.includes(f) && effects[f]])) as Effects;
}
