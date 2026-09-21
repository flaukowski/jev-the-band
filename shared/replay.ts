import type { Snapshot, Frame } from './music';

// Trim at the playback boundary, preserving held notes and the active pedal state.
export function clipFrames(frames: Frame[], from: number, to: number): Frame[] {
  return frames
    .filter((f) => f.at < to && f.at + f.durationMs > from)
    .map((f) => {
      const start = Math.max(f.at, from),
        end = Math.min(f.at + f.durationMs, to);
      if (start === f.at && end === f.at + f.durationMs) return f;
      const cut = ((start - f.at) * f.bpm) / 60000,
        limit = ((end - f.at) * f.bpm) / 60000;
      return {
        ...f,
        at: start,
        durationMs: end - start,
        parts: f.parts.map((p) => {
          const cues = p.effectsTimeline;
          const active = cues?.filter((c) => c.beat <= cut).at(-1);
          return {
            ...p,
            notes: p.notes
              .filter((n) => n.beat < limit && n.beat + n.duration > cut)
              .map((n) => ({
                ...n,
                beat: Math.max(n.beat, cut) - cut,
                duration: Math.min(n.beat + n.duration, limit) - Math.max(n.beat, cut),
              })),
            effectsTimeline: cues
              ? [
                  ...(active ? [{ ...active, beat: 0 }] : []),
                  ...cues
                    .filter((c) => c.beat > cut && c.beat < limit)
                    .map((c) => ({ ...c, beat: c.beat - cut })),
                ]
              : undefined,
          };
        }),
      };
    });
}
export function replaySnapshot(source: Snapshot, from: number, now: number): Snapshot {
  const delta = now + 300 - from;
  const end = source.endedAt ?? Math.max(...source.frames.map((f) => f.at + f.durationMs));
  return {
    ...source,
    id: `replay-${source.id}-${now}`,
    status: 'playing',
    startedAt: source.startedAt + delta,
    endsAt: end + delta,
    endedAt: undefined,
    frames: clipFrames(source.frames, from, end).map((f) => ({
      ...f,
      at: f.at + delta,
      themeStartedAt: f.themeStartedAt === undefined ? undefined : f.themeStartedAt + delta,
    })),
    traces: source.traces.map((t) => ({ ...t, at: t.at + delta })),
  };
}
