import { noteNames, personas, type Musician, type Snapshot } from '../shared/music.js';
import { scaleIntervals } from '../shared/performance.js';
import { listeningState } from './listening.js';
import { chapterAt } from '../shared/concept.js';

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
  const now = heard.recent.at(-1);
  const levels = now?.players.filter((p) => p.role !== role && p.volume).map((p) => p.volume);
  const change = room.keyChange;
  const changeHeard =
    change && room.frames.some((f) => f.id === change.atFrame && f.at <= heard.heardThrough);
  return {
    ...heard,
    bandKey: now
      ? {
          tonic: noteNames[now.root],
          rootPitchClass: now.root,
          mode: room.frames.find((f) => f.id === now.phrase)?.modeName ?? now.mode,
          ...(change && changeHeard && change.by !== role
            ? {
                cue: `${personas[change.by].name} just led the band to ${noteNames[change.root]} ${change.mode.replaceAll('_', ' ')}. Follow into the new key now, unless you deliberately hold the old one for a bar of tension.`,
                youHaveFollowed: own?.tonalIntent?.root === change.root,
              }
            : {}),
        }
      : undefined,
    bandDynamics: levels?.length
      ? {
          peers: levels,
          guidance:
            'Dynamics travel together. Match a bandmate who drops down or swells, or contrast on purpose.',
        }
      : undefined,
    drummerFeel: role === 'drums' ? undefined : now?.players.find((p) => p.role === 'drums')?.feel,
    sonicConcept: room.director?.concept?.concept,
    sharedChart: chapterAt(
      room.director?.concept,
      (Date.now() - (room.themeStartedAt ?? room.startedAt)) / 1000,
    ),
    currentTheme: room.prompt,
    soloInvitation: room.soloInvitation,
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
