import type { DirectorReport } from './concept.js';
import type { Snapshot } from './music.js';

export interface ThemeCue {
  id: string;
  prompt: string;
  requestedAt: number;
  atFrame: number;
  appliedAt?: number;
  director?: DirectorReport;
}

// The eight-bar lead-in begins on the next two-bar downbeat. Frame IDs track
// musical time, so a tempo push cannot turn the countdown into a wall-clock guess.
export function nextThemeFrame(room: Snapshot, now: number): number {
  const audible = room.frames.filter((f) => f.at <= now).at(-1);
  const next = audible ? audible.id + 1 : 0;
  const tail = room.setlist?.filter((cue) => cue.appliedAt === undefined).at(-1);
  return Math.max(next + 4, tail ? tail.atFrame + 4 : 0);
}
