import { scales, type Musician, type Part } from './music.js';

export const styles = {
  pocket_funk:
    'Deep syncopated pocket, short guitar/keyboard chord stabs, repeating bass anchors, a clear backbeat',
  soul_gospel:
    'Warm chordal playing, voice leading, singable answers and satisfying major/minor resolutions',
  blues_rock:
    'Grounded blues-rock groove, call and response, expressive blue notes resolving into a strong tonal home',
  jazz_funk:
    'A steady funk rhythm section with extended chords, guide tones and fluid melodic conversation',
  psychedelic_rock:
    'Patient modal vamps, spacious guitar and evolving effects with recognizable themes and a payoff',
  dub_reggae: 'Deep bass, spacious offbeat chord chops, restrained drums and selective echoes',
  latin_fusion:
    'Interlocking syncopation, complementary percussion and chord accents, repeating danceable foundations',
  ambient: 'Slow consonant swells, long breath, sparse percussion and gentle harmonic arrivals',
} as const;
export const arcs = {
  settle:
    'Establish or enjoy a groove. Repeat useful anchors; consonance and rhythmic consistency are virtues.',
  build:
    'Increase energy a little while preserving the pocket. Create a specific tension that can later resolve.',
  peak: 'A brief energetic high point, not the permanent default. Prepare a clear release.',
  release:
    'Resolve toward home chord tones, soften or simplify, leave breaths. Give the listener a payoff.',
  space: 'Thin out and listen. Long tones and silence can remain consonant and grounded.',
} as const;
export const guitarTextures = {
  single_line: 'Single-note melodic line or lead',
  double_stops: 'Two-note rhythmic intervals on selected strings',
  chord_comp: 'Rhythmic chord punches, with chosen notes on individual strings',
  strummed_chords: 'Full voiced chords with a deliberate up/down strum',
  chord_swells: 'Sustained polyphonic chord swells with room to breathe',
} as const;
export const keyTextures = {
  single_line: 'A single right-hand melody, left hand resting',
  two_hand_chords: 'Both hands voice full rhythmic chords, up to five notes per hand',
  split_comp_lead: 'Left-hand chord comping underneath a right-hand melody',
  rhythmic_stabs: 'Short syncopated polyphonic chord stabs',
  sustained_chords: 'Warm sustained two-hand harmony with careful voice leading',
} as const;
export const chordIntervals = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  dominant7: [0, 4, 7, 10],
  minor7: [0, 3, 7, 10],
  major7: [0, 4, 7, 11],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  sixth: [0, 4, 7, 9],
  minor9: [0, 3, 7, 10, 2],
  major9: [0, 4, 7, 11, 2],
  power: [0, 7],
} as const;
export type Performance = {
  style: keyof typeof styles;
  arc: keyof typeof arcs;
  texture: string;
  palette: 'diatonic' | 'blues' | 'chromatic';
  chord: keyof typeof chordIntervals;
  tensionPhrases: number;
  motifAge: number;
  timbres?: string[];
  hasPlayed?: boolean;
  silentTurns?: number;
  soloBars?: number;
  soloPhrases?: number;
  soloStage?: string;
  phraseBars?: number;
  phraseChunks?: number;
  phraseMotif?: { midi: number; beat: number; duration: number }[];
};
export const guitarTuning = [40, 45, 50, 55, 59, 64] as const;
export function effectsAtBeat(part: Part, beat: number) {
  return (
    part.effectsTimeline?.filter((cue) => cue.beat <= beat).at(-1)?.effects ?? part.decision.effects
  );
}
export function scaleIntervals(mode: string): readonly number[] {
  return (
    (
      {
        ...scales,
        phrygian: [0, 1, 3, 5, 7, 8, 10],
        lydian: [0, 2, 4, 6, 7, 9, 11],
        locrian: [0, 1, 3, 5, 6, 8, 10],
        harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
        chromatic: Array.from({ length: 12 }, (_, i) => i),
      } as Record<string, number[]>
    )[mode] ?? scales.dorian
  );
}
export function pitchPalette(
  root: number,
  mode: string,
  palette: string,
  chord: string,
  chordOnly: boolean,
): number[] {
  const offsets = chordOnly
    ? (chordIntervals[chord as keyof typeof chordIntervals] ?? chordIntervals.minor7)
    : palette === 'chromatic'
      ? Array.from({ length: 12 }, (_, i) => i)
      : palette === 'blues'
        ? [...scaleIntervals(mode), 3, 6, 10]
        : scaleIntervals(mode);
  return [...new Set(offsets.map((v) => (root + v + 12) % 12))];
}
export function drumSampleLifetime(role: Musician, heldSeconds: number, sampleSeconds: number) {
  // Percussion is struck, not key-gated. Cymbals may naturally ring across a phrase boundary.
  return role === 'drums'
    ? Math.max(0.01, sampleSeconds - 0.02)
    : Math.min(heldSeconds, sampleSeconds - 0.06);
}
