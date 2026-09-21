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
  // Heat memory: how long this player's direction has stayed put, and its own recent choices.
  register?: string;
  contour?: string;
  attacks?: string;
  staleChunks?: number;
  heat?: number;
  recentChoices?: Record<string, string[]>;
  soloEnergy?: string;
  volume?: keyof typeof volumes;
  feel?: string;
  /** Set when this player led the band to a new key or mode in this chunk. */
  keyLead?: { root: number; mode: string; move: string };
  leadGestures?: string[];
  leadKinds?: ('cry' | 'melodic_cell' | 'run' | 'riff')[];
  nextGesture?: 'cry' | 'melodic_cell' | 'run' | 'riff';
};
export const guitarTuning = [40, 45, 50, 55, 59, 64] as const;
export function effectsAtBeat(part: Part, beat: number) {
  return (
    part.effectsTimeline?.filter((cue) => cue.beat <= beat).at(-1)?.effects ?? part.decision.effects
  );
}
// Every mode a player may choose. The four everyday modes come first; the remaining Greek modes,
// then the modes of melodic and harmonic minor, are rarer colors that heat can reach.
export const modeLibrary: Record<string, { intervals: number[]; color: string }> = {
  dorian: {
    intervals: scales.dorian,
    color: 'Minor with a bright sixth: the classic jam-band vamp',
  },
  mixolydian: {
    intervals: scales.mixolydian,
    color: 'Major with a flat seventh: bluesy, open, danceable',
  },
  minor: { intervals: scales.minor, color: 'Natural minor: dark and plaintive' },
  major: { intervals: scales.major, color: 'Bright, settled major' },
  lydian: {
    intervals: [0, 2, 4, 6, 7, 9, 11],
    color: 'Major with a raised fourth: floating, dreamy',
  },
  phrygian: {
    intervals: [0, 1, 3, 5, 7, 8, 10],
    color: 'Minor with a flat second: Spanish, ominous',
  },
  locrian: {
    intervals: [0, 1, 3, 5, 6, 8, 10],
    color: 'Diminished and unstable: a brief dark excursion',
  },
  harmonic_minor: {
    intervals: [0, 2, 3, 5, 7, 8, 11],
    color: 'Minor with a leading tone: dramatic, classical',
  },
  melodic_minor: {
    intervals: [0, 2, 3, 5, 7, 9, 11],
    color: 'Jazz minor: minor third with bright sixth and seventh',
  },
  phrygian_dominant: {
    intervals: [0, 1, 4, 5, 7, 8, 10],
    color: 'Rare. Fifth mode of harmonic minor: desert heat, flamenco, klezmer',
  },
  lydian_dominant: {
    intervals: [0, 2, 4, 6, 7, 9, 10],
    color: 'Rare. Fourth mode of melodic minor: funky raised fourth with a flat seventh',
  },
  dorian_sharp4: {
    intervals: [0, 2, 3, 6, 7, 9, 10],
    color: 'Rare. Fourth mode of harmonic minor: minor blues with a biting raised fourth',
  },
  mixolydian_b6: {
    intervals: [0, 2, 4, 5, 7, 8, 10],
    color: 'Rare. Fifth mode of melodic minor: major with a bittersweet flat sixth',
  },
  dorian_b2: {
    intervals: [0, 1, 3, 5, 7, 9, 10],
    color: 'Rare. Second mode of melodic minor: dorian with a dark flat second',
  },
  lydian_augmented: {
    intervals: [0, 2, 4, 6, 8, 9, 11],
    color: 'Rare. Third mode of melodic minor: weightless, raised fourth and fifth',
  },
  lydian_sharp2: {
    intervals: [0, 3, 4, 6, 7, 9, 11],
    color: 'Rare. Sixth mode of harmonic minor: exotic major with a raised second',
  },
  ionian_sharp5: {
    intervals: [0, 2, 4, 5, 8, 9, 11],
    color: 'Rare. Third mode of harmonic minor: major with a yearning raised fifth',
  },
  locrian_natural2: {
    intervals: [0, 2, 3, 5, 6, 8, 10],
    color: 'Rare. Sixth mode of melodic minor: half-diminished, mysterious',
  },
  locrian_natural6: {
    intervals: [0, 1, 3, 5, 6, 9, 10],
    color: 'Rare. Second mode of harmonic minor: unstable with one bright note',
  },
  altered: {
    intervals: [0, 1, 3, 4, 6, 8, 10],
    color: 'Rare. Seventh mode of melodic minor: maximum tension that must resolve',
  },
  ultralocrian: {
    intervals: [0, 1, 3, 4, 6, 8, 9],
    color: 'Very rare. Seventh mode of harmonic minor: fully diminished unease',
  },
  chromatic: {
    intervals: Array.from({ length: 12 }, (_, i) => i),
    color: 'All twelve notes: a deliberate free passage',
  },
};
export function scaleIntervals(mode: string): readonly number[] {
  return (modeLibrary[mode] ?? modeLibrary.dorian).intervals;
}
/** Nearest everyday mode, for renderers that only know the four base scales. */
export function baseMode(mode: string): keyof typeof scales {
  const i = scaleIntervals(mode);
  return i.includes(4)
    ? i.includes(11)
      ? 'major'
      : 'mixolydian'
    : i.includes(9)
      ? 'dorian'
      : 'minor';
}
// Band dynamics, whisper to roar: scales note velocity (timbre) and the channel level (loudness).
export const volumes = {
  whisper: { color: 'Barely there: brushes, fingertips, held breath', velocity: 0.6, gain: 0.45 },
  soft: { color: 'Gentle and intimate', velocity: 0.78, gain: 0.66 },
  warm: { color: 'Comfortable conversational level', velocity: 0.92, gain: 0.84 },
  bold: { color: 'Strong, projecting, full band energy', velocity: 1, gain: 1 },
  roar: { color: 'Everything you have: the peak of the night', velocity: 1.08, gain: 1.14 },
} as const;
export const keyMoves = {
  stay: 'Stay in the current key and mode',
  up_fourth: 'Lead the band up a fourth: a lift, the classic jam modulation',
  up_fifth: 'Lead the band up a fifth: brighter and more urgent',
  relative: 'Move to the relative key: same notes, new home, major and minor trade places',
  up_step: 'Lift the whole band up a whole step: a gear change',
  down_step: 'Drop down a whole step: heavier and darker',
  new_mode: 'Keep the tonic but change the mode color under everyone',
} as const;
export const drumFeels = {
  backbeat: 'Steady backbeat pocket: snare on two and four',
  half_time: 'Half-time feel: snare on three, huge and spacious at the same tempo',
  double_time: 'Double-time feel: busy hats and driving snare at the same tempo',
  four_on_floor: 'Kick on every beat: dance-floor propulsion',
  breakbeat: 'Syncopated breakbeat with displaced snares and ghost notes',
  shuffle: 'Swung triplet shuffle',
  latin: 'Clave-inspired syncopation across toms, rim and bell-like ride',
  tom_groove: 'Tribal tom-driven groove with few cymbals',
  cymbal_wash: 'Pulse dissolves into cymbal swells and sparse kick: ambient time',
} as const;
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
