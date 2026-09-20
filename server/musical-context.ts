import type { Musician, Snapshot } from '../shared/music.js';
import { scaleIntervals } from '../shared/performance.js';
import { listeningState } from './listening.js';

export function musicalContext(room: Snapshot, role: Musician) {
  const heard = listeningState(room, role);
  const own = room.frames.at(-1)?.parts.find((p) => p.role === role);
  const pitched = heard.recent.flatMap((f) =>
    f.players
      .filter((p) => p.role !== 'drums')
      .flatMap((p) => p.notes.map((n) => ({ midi: n.midi, root: f.root, mode: f.mode }))),
  );
  const outside = pitched.filter(
    (n) => !scaleIntervals(n.mode).includes((n.midi - n.root + 120) % 12),
  ).length;
  return {
    ...heard,
    ownDirection: own?.performance ?? null,
    grooveMemory:
      own?.notes.map(({ beat, midi, duration, velocity, hand, string }) => ({
        beat,
        midi,
        duration,
        velocity,
        hand,
        string,
      })) ?? [],
    feedback: {
      heardChromaticFraction: pitched.length
        ? Math.round((outside / pitched.length) * 100) / 100
        : 0,
      ownTensionPhrases: own?.performance?.tensionPhrases ?? 0,
      releaseDue: (own?.performance?.tensionPhrases ?? 0) >= 2,
      identicalOwnUpdates: own?.performance?.motifAge ?? 0,
      developmentDue: (own?.performance?.motifAge ?? 0) >= 2,
      aim: 'Make the groove feel good. Keep useful rhythmic anchors. Tension needs a consonant arrival; novelty does not mean changing every note. Respond to performed peers, never their private plans.',
    },
  };
}
