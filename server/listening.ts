import type { Role, Snapshot } from '../shared/music.js';
import { effectsAtBeat } from '../shared/performance.js';

/** Symbolic hearing, with a reaction delay. Never disclose a peer's unplayed score or intent. */
export function listeningState(room: Snapshot, role: Role, now = Date.now()) {
  const cutoff = now - 180;
  const audible = room.frames.filter((f) => f.at <= cutoff);
  const frame = audible.at(-1);
  const heard = audible.slice(-4).map((f) => {
    const throughBeat = Math.min(8, Math.max(0, ((cutoff - f.at) * f.bpm) / 60000));
    return {
      phrase: f.id,
      bpm: f.bpm,
      root: f.root,
      mode: f.mode,
      throughBeat,
      players: f.parts.map((p) => ({
        role: p.role,
        effects: effectsAtBeat(p, throughBeat),
        notes: p.notes
          .filter((n) => n.beat <= throughBeat)
          .map((n) => ({
            beat: n.beat,
            midi: n.midi,
            velocity: n.velocity,
            // The end of a note is also information from the future until it has sounded.
            heardDuration: Math.min(n.duration, throughBeat - n.beat),
            ...(n.patch ? { patch: n.patch } : {}),
          })),
      })),
    };
  });
  const own = room.frames.at(-1)?.parts.find((p) => p.role === role);
  return {
    heardThrough: cutoff,
    reactionDelayMs: 180,
    music: frame
      ? {
          bpm: frame.bpm,
          rootPitchClass: frame.root,
          mode: frame.mode,
          players: heard.at(-1)?.players,
        }
      : {
          bpm: room.baseBpm,
          rootPitchClass: room.initialRoot ?? 2,
          mode: room.initialMode ?? 'dorian',
          players: [],
          opener: room.opener,
        },
    recent: heard,
    ownMemory: own
      ? {
          decision: own.decision,
          effectsTimeline: own.effectsTimeline,
          notes: own.notes,
          tonalIntent: own.tonalIntent,
          solo: own.solo,
          consecutiveRepeats: own.repeated,
        }
      : null,
  };
}
