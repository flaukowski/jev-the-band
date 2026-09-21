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

// A queued song never cuts in. The band is asked to bring the current song to a natural close;
// the next song begins, from nothing, after a fully silent two-bar frame.
/** Every song gets at least this many two-bar frames before a queued song may end it. */
export const minimumSongFrames = 8;
/** Frames the band has to finish by choice; after this the wind-down is cut to silence. */
export const windDownFrames = 5;

/** The LATEST frame at which a newly queued song can begin. It usually begins sooner. */
export function nextThemeFrame(room: Snapshot, now: number): number {
  const audible = room.frames.filter((f) => f.at <= now).at(-1);
  const next = audible ? audible.id + 1 : 0;
  const tail = room.setlist?.filter((cue) => cue.appliedAt === undefined).at(-1);
  const earliestWindDown = tail
    ? tail.atFrame + minimumSongFrames
    : Math.max(next, (room.themeFrame0 ?? 0) + minimumSongFrames);
  return earliestWindDown + windDownFrames + 1;
}
