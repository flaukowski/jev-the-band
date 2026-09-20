import {
  noteNames,
  type Answer,
  type ChoiceQuestion,
  type JevRequest,
  type Musician,
  type Note,
  type Part,
  type Trace,
} from '../shared/music.js';
import { chordIntervals, pitchPalette } from '../shared/performance.js';
import { choice } from './jev.js';
import { sampleWithHeat } from './heat.js';

// A lead CELL is one Jev request that yields a whole gesture of one to eight notes: a starting
// pitch, relative scale steps, a rhythmic grid, a held landing, a breath, a technique and an
// ornament. Parallel questions cannot see each other's answers, but relative steps always
// compose into a connected line, so one ~350 ms call can write a sixteenth-note run that the
// one-attack-per-call composer could never afford. Every pitch, rhythm and technique still
// derives from a Jev answer; the harness keeps the line on the instrument and in the palette.

export const maxCells = 10;
const minimumAdvance = 0.75;
export const leadEnergy = {
  simmer: 'Unhurried, conversational phrases with long notes and real breaths',
  climb: 'Growing intensity: longer runs, rising register, shorter breaths',
  peak: 'The high point: fast flurries, big bends, the top of the register, insistent repeats',
  cool: 'Come down: simpler phrases, falling lines, consonant landings, more space',
} as const;
// Parallel questions cannot see each other, so "how many notes" and "how fast" cannot agree on a
// gesture by themselves. Jev therefore names the NEXT gesture at the end of each cell (seeing
// everything played so far), and that choice shapes the options of the following request.
export const gestures = {
  cry: {
    color: 'One or two long notes that sing: bend into it, shake it, let it hang over the band',
    counts: ['1', '2'],
    grids: ['0.5', '1'],
    landings: ['1.5', '2', '3'],
  },
  melodic_cell: {
    color: 'A short singable cell of two to four notes: the motif, or an answer to it',
    counts: ['3', '2', '4'],
    grids: ['0.5', '0.333333', '0.25', '1'],
    landings: ['1', '0.5', '1.5', '2'],
  },
  run: {
    color: 'A fast scalar run or flurry that arrives on a held target note',
    counts: ['6', '5', '8'],
    grids: ['0.25', '0.166667', '0.333333', '0.125'],
    landings: ['1', '1.5', '2', '3'],
  },
  riff: {
    color: 'An insistent syncopated rhythmic figure on one or two pitches',
    counts: ['4', '3', '6'],
    grids: ['0.25', '0.5', '0.333333'],
    landings: ['0.5', '0.25', '1'],
  },
} as const;
export type Gesture = keyof typeof gestures;
const energyHeat: Record<string, number> = { simmer: 0.35, climb: 0.6, peak: 0.85, cool: 0.3 };
const grids = {
  '1': 'Quarter notes: broad and vocal',
  '0.5': 'Eighth notes',
  '0.333333': 'Eighth-note triplets',
  '0.25': 'Sixteenth notes',
  '0.166667': 'Sextuplets: a fast flurry',
  '0.125': 'Thirty-second notes: a blazing burst',
};
const stepLabels = {
  '1': 'one scale step up',
  '-1': 'one scale step down',
  '2': 'up a third',
  '-2': 'down a third',
  '0': 'repeat the same pitch',
  '3': 'leap up a fourth',
  '-3': 'leap down a fourth',
  '7': 'leap up an octave',
  '-7': 'leap down an octave',
};
const guitarTechniques = {
  picked: 'Pick every note with a clear attack',
  legato: 'Pick the first note, then hammer-on ascending and pull-off descending notes',
  slides: 'Slide along the string between the notes',
  muted: 'Tight palm-muted staccato notes',
};
const keyTechniques = {
  picked: 'Articulate every note',
  legato: 'Smooth connected legato',
  muted: 'Short detached staccato',
};
const guitarOrnaments = {
  none: 'Let the landing note speak plainly',
  vibrato: 'Wide singing vibrato on the landing note',
  bend_up_2: 'Bend a whole step UP INTO the landing pitch, hold it and shake',
  bend_up_1: 'Bend a half step up into the landing pitch and hold',
  bend_release: 'Strike the landing note, bend it up a whole step and let it fall back',
  prebend_release: 'Start bent a whole step above and release down into the landing pitch',
  slide_in: 'Slide into the landing note from your previous pitch',
};
const keyOrnaments = {
  none: 'Let the landing note speak plainly',
  grace_below: 'Crushed grace note from a semitone below the landing note',
  grace_above: 'Quick grace note from a scale step above the landing note',
};

export function leadWindow(role: Musician, register: string): [number, number] {
  return role === 'keys'
    ? register === 'high'
      ? [67, 91]
      : [58, 84]
    : register === 'high'
      ? [57, 88]
      : [48, 79];
}
function ladder(plan: Record<string, Answer>, low: number, high: number): number[] {
  const classes = pitchPalette(
    Number(plan.root.choice),
    plan.mode.choice,
    plan.palette?.choice ?? 'diatonic',
    plan.chord?.choice ?? 'minor7',
    false,
  );
  return Array.from({ length: high - low + 1 }, (_, i) => low + i).filter((midi) =>
    classes.includes(midi % 12),
  );
}
const label = (midi: number) => `${noteNames[midi % 12]}${Math.floor(midi / 12) - 1}`;

export function cellRequest(
  role: Musician,
  model: string,
  context: Record<string, unknown>,
  plan: Record<string, Answer>,
  beat: number,
  draft: Note[],
  cell: number,
  own: Part | undefined,
  sketch?: unknown,
  gesture: Gesture = 'melodic_cell',
): JevRequest {
  const kind = gestures[gesture];
  const [low, high] = leadWindow(role, plan.register.choice);
  const pitches = ladder(plan, low, high);
  const root = Number(plan.root.choice);
  const chord = (
    chordIntervals[plan.chord?.choice as keyof typeof chordIntervals] ?? chordIntervals.minor7
  ).map((v) => (root + v) % 12);
  const melody = draft.filter((n) => role !== 'keys' || n.hand === 'right');
  const last = melody.at(-1)?.midi ?? own?.notes.filter((n) => n.hand !== 'left').at(-1)?.midi;
  const start = Object.fromEntries(
    pitches.map((midi) => [
      String(midi),
      [
        label(midi),
        chord.includes(midi % 12) ? 'chord tone: a stable place to begin or land' : 'passing color',
        last === undefined
          ? 'opening pitch'
          : midi === last
            ? 'your previous pitch'
            : `${Math.abs(midi - last)} semitones ${midi > last ? 'above' : 'below'} your previous pitch`,
        midi >= high - 7 ? 'top of your register: save for a climax' : '',
      ]
        .filter(Boolean)
        .join('; '),
    ]),
  );
  // A fresh chunk never restarts on the pitch that opened the previous one.
  const oldOpening = own?.notes.filter((n) => n.hand !== 'left')[0]?.midi;
  if (cell === 0 && Object.keys(start).length > 2) delete start[String(oldOpening)];
  const remaining = Number((8 - beat).toFixed(3));
  const questions: Record<string, ChoiceQuestion> = {
    start: choice(
      `First pitch of this gesture at beat ${beat}. Continue your line from the previous pitch: answer it, climb from it, or leap for drama.`,
      start,
    ),
    count: choice(
      `This gesture is a ${gesture.replace('_', ' ')}: ${kind.color}. How many notes?`,
      Object.fromEntries(kind.counts.map((n) => [n, n + (n === '1' ? ' note' : ' notes')])),
    ),
    grid: choice(
      'Time between the notes of this gesture.',
      Object.fromEntries(kind.grids.map((g) => [g, grids[g as keyof typeof grids]])),
    ),
    landing: choice(
      `How many beats the LAST note of the gesture is held. ${remaining} beats remain in these two bars.`,
      [...kind.landings],
    ),
    gap: choice(
      'Silence after the landing note before your next gesture. Great solos breathe so the band can answer.',
      ['0', '0.5', '1', '0.25', '1.5', '2', '3'],
    ),
    next: choice(
      'Having played this, what should your NEXT gesture be? Contrast tells the story: a cry after a run, a run after a motif, a riff to build, a motif to come home. Do not repeat one kind of gesture all solo.',
      Object.fromEntries(Object.entries(gestures).map(([name, g]) => [name, g.color])),
    ),
    technique: choice(
      'How the notes of this gesture are articulated.',
      role === 'guitar' ? guitarTechniques : keyTechniques,
    ),
    ornament: choice(
      'Expressive treatment of the landing note. A lead voice bends, shakes and slides; use these often, especially on long notes.',
      role === 'guitar' ? guitarOrnaments : keyOrnaments,
    ),
    shape: choice('Dynamic shape across the gesture.', {
      crescendo: 'Grow into the landing note',
      accent_first: 'Hit the first note hard, then relax',
      even: 'Even and steady',
      decrescendo: 'Fade away',
      accent_last: 'Save the accent for the landing note',
    }),
    level: choice('Overall strength of this gesture.', ['0.66', '0.8', '0.92', '0.52']),
  };
  if (gesture === 'cry' && role === 'guitar') {
    delete questions.ornament.criteria.none;
    delete questions.ornament.criteria.slide_in;
  }
  for (let i = 1; i < 8; i++)
    questions['step' + i] = choice(
      `Melodic motion from note ${i} to note ${i + 1} of this gesture, in steps of your chosen scale. Ignored when the gesture has fewer notes. Stepwise motion makes runs; one leap makes drama; change direction to shape an arch.`,
      gesture === 'riff'
        ? Object.fromEntries(
            Object.entries(stepLabels).filter(([step]) => Math.abs(Number(step)) <= 2),
          )
        : stepLabels,
    );
  if (role === 'keys') {
    questions.comp = choice(
      'Left-hand accompaniment under this right-hand gesture. Your left hand should be heard regularly: a solo pianist comps for themself.',
      {
        stab: 'A short rhythmic chord stab with the first melody note',
        sustain: 'A chord held under the whole gesture',
        none: 'Left hand lays out for this gesture',
      },
    );
    const compTones = Array.from({ length: 20 }, (_, i) => 48 + i).filter((midi) =>
      chord.includes(midi % 12),
    );
    for (let voice = 0; voice < 3; voice++)
      questions['left' + voice] = choice(
        `Left-hand chord voice ${voice + 1}, below your melody and above the bassist.`,
        Object.fromEntries(compTones.map((midi) => [String(midi), label(midi) + '; chord tone'])),
      );
  }
  return {
    model,
    state: {
      ...context,
      plan: Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, v.choice])),
      soloEnergy: leadEnergy[plan.energy?.choice as keyof typeof leadEnergy],
      arrangerSketch: sketch,
      alreadyComposed: melody.map(({ beat, midi, duration, articulation, bend }) => ({
        beat,
        midi,
        duration,
        articulation,
        bend,
      })),
      gesturesLastChunk: own?.performance?.leadGestures,
      thisGesture: gesture,
      nextGestureBeat: beat,
      beatsRemaining: remaining,
      task: 'You are the featured soloist. Compose ONE gesture of your solo; you will see it before composing the next. Tell a story: state a motif, answer it, build with runs, cry on a bent or held note, breathe. Contrast is everything: follow a flurry with a long note, a long note with silence, a low phrase with a high answer. React to what the band just played. arrangerSketch, when present, is a suggestion written earlier by an outside arranger who cannot hear the band: follow it, bend it or ignore it according to what you hear now. Never noodle up and down a scale at one speed.',
    },
    questions,
  };
}

/** Decode a cell with the solo's heat. Raw answers stay intact in trace.answers. */
export function applyCellChoices(
  trace: Trace,
  energy: string | undefined,
  rng: () => number,
  recent: Record<string, string[]>,
): Record<string, Answer> {
  const applied = structuredClone(trace.answers);
  const heat = energyHeat[energy ?? 'simmer'] ?? 0.4;
  const used = new Set<string>();
  for (const [key, answer] of Object.entries(applied)) {
    if (key === 'comp') {
      // Decide play versus lay out by total probability mass, so three ways of playing
      // cannot lose to a single way of resting.
      const rest = answer.probabilities.none ?? 0;
      if (answer.choice === 'none' && 1 - rest > rest)
        answer.choice =
          (answer.probabilities.stab ?? 0) >= (answer.probabilities.sustain ?? 0)
            ? 'stab'
            : 'sustain';
      continue;
    }
    const left = /^left\d$/.test(key);
    const picked = sampleWithHeat(
      left
        ? {
            ...answer,
            probabilities: Object.fromEntries(
              Object.entries(answer.probabilities).map(([k, p]) => [k, used.has(k) ? 0 : p]),
            ),
          }
        : answer,
      key === 'start' ? Math.min(heat, 0.45) : heat,
      rng,
      recent[key],
    );
    if (left) used.add(picked);
    if (picked !== answer.choice) {
      answer.choice = picked;
      delete answer.confidence;
    }
    if (['count', 'grid', 'ornament', 'technique', 'landing', 'next', 'gap'].includes(key))
      recent[key] = [...(recent[key] ?? []), picked].slice(-3);
  }
  trace.appliedAnswers = applied;
  trace.selectionMethod = 'seeded-model-distribution';
  trace.heat = heat;
  return applied;
}

export function gestureName(a: Record<string, Answer>): string {
  const count = Number(a.count.choice);
  const ornament = a.ornament.choice;
  const tail = ornament.startsWith('bend') || ornament.startsWith('prebend') ? ' into a bend' : '';
  if (count === 1) return tail ? 'bent cry' : ornament === 'vibrato' ? 'singing note' : 'held note';
  const speed = Number(a.grid.choice) <= 0.25 ? (count >= 5 ? 'run' : 'flurry') : 'melodic cell';
  return (a.technique.choice === 'legato' ? 'legato ' : '') + speed + tail;
}

/** Expand one decoded cell into notes. Returns the notes and the beat of the next cell. */
export function readCell(
  role: Musician,
  trace: Trace,
  plan: Record<string, Answer>,
  beat: number,
  prior: Note[],
  patches: { left: Note['patch']; right: Note['patch'] },
): { notes: Note[]; next: number } {
  const a = trace.appliedAnswers ?? trace.answers;
  const pick = (key: string) => a[key].choice;
  const gap = Number(pick('gap'));
  const [low, high] = leadWindow(role, plan.register.choice);
  const pitches = ladder(plan, low, high);
  // Tuplet grids are exact fractions, so a run of sextuplets lands precisely on the beat.
  const grid = { '0.333333': 1 / 3, '0.166667': 1 / 6 }[pick('grid')] ?? Number(pick('grid'));
  const landing = Number(pick('landing'));
  const count = Number(pick('count'));
  const technique = pick('technique');
  const ornament = pick('ornament');
  const level = Number(pick('level'));
  const previous = prior.filter((n) => role !== 'keys' || n.hand === 'right').at(-1);
  let index = Math.max(0, pitches.indexOf(Number(pick('start'))));
  const line: { midi: number; slot: string }[] = [{ midi: pitches[index], slot: 'start' }];
  for (let i = 1; i < count; i++) {
    let step = Number(pick('step' + i));
    // The instrument's range is a physical limit: a line that would leave it turns around.
    if (index + step < 0 || index + step >= pitches.length) step = -step;
    index = Math.max(0, Math.min(pitches.length - 1, index + step));
    line.push({ midi: pitches[index], slot: 'step' + i });
  }
  const notes = prior
    // A lead line is monophonic: the new gesture releases whatever was still ringing.
    .map((n) =>
      (role !== 'keys' || n.hand === 'right') && n.beat < beat && n.beat + n.duration > beat
        ? { ...n, duration: beat - n.beat }
        : n,
    );
  const gate = technique === 'muted' ? 0.45 : technique === 'picked' ? 0.85 : 1;
  line.forEach(({ midi, slot }, i) => {
    const onset = Number((beat + i * grid).toFixed(6));
    if (onset >= 8) return;
    const final = i === line.length - 1;
    const t = line.length > 1 ? i / (line.length - 1) : 1;
    const dynamics =
      { crescendo: -0.16 + 0.26 * t, decrescendo: 0.1 - 0.26 * t, even: 0 }[pick('shape')] ??
      (pick('shape') === 'accent_first' ? (i === 0 ? 0.12 : -0.08) : final ? 0.12 : -0.08);
    const before = i ? line[i - 1].midi : previous?.midi;
    const note: Note = {
      midi,
      beat: onset,
      duration: Math.min(8 - onset, final ? Math.max(landing, grid * gate) : grid * gate),
      velocity: Math.max(0.2, Math.min(1, level + dynamics)),
      articulation:
        technique === 'muted' ? 'staccato' : technique === 'legato' ? 'legato' : 'natural',
      ...(role === 'keys' ? { hand: 'right' as const, patch: patches.right } : {}),
      provenance: { traceId: trace.id, slot },
    };
    if (role === 'guitar' && i && before !== undefined && before !== midi) {
      if (technique === 'legato') {
        note.articulation = midi > before ? 'hammer' : 'pull';
        note.velocity = Math.max(0.2, note.velocity - 0.08);
      } else if (technique === 'slides') {
        note.articulation = 'slide';
        note.slideFrom = Math.max(-12, Math.min(12, before - midi));
      }
    }
    if (final && role === 'guitar') {
      if (ornament === 'vibrato') note.vibrato = 0.8;
      if (ornament === 'bend_up_2' || ornament === 'bend_up_1') {
        // Jev chose the pitch the listener should hear; fret below it and bend up into it.
        const amount = ornament === 'bend_up_2' ? 2 : 1;
        Object.assign(note, {
          midi: midi - amount,
          bend: amount,
          bendShape: 'hold',
          vibrato: 0.7,
          articulation: 'bend',
        });
      }
      if (ornament === 'bend_release')
        Object.assign(note, { bend: 2, bendShape: 'release', articulation: 'bend' });
      if (ornament === 'prebend_release')
        Object.assign(note, { bend: 2, bendShape: 'pre', articulation: 'bend' });
      if (ornament === 'slide_in' && before !== undefined && before !== midi)
        Object.assign(note, {
          articulation: 'slide',
          slideFrom: Math.max(-12, Math.min(12, before - midi)),
        });
    }
    if (final && role === 'keys' && ornament !== 'none' && onset >= 0.0625) {
      const grace =
        ornament === 'grace_below' ? midi - 1 : (pitches[pitches.indexOf(midi) + 1] ?? midi + 2);
      notes.push({
        midi: grace,
        beat: Number((onset - 0.0625).toFixed(6)),
        duration: 0.0625,
        velocity: Math.max(0.2, note.velocity - 0.15),
        hand: 'right',
        patch: patches.right,
        articulation: 'legato',
        provenance: { traceId: trace.id, slot: 'ornament' },
      });
    }
    notes.push(note);
  });
  const end = beat + (line.length - 1) * grid + Math.max(landing, grid);
  const next = Number(Math.max(beat + minimumAdvance, end + gap).toFixed(6));
  if (a.comp && pick('comp') !== 'none') {
    const voices = [...new Set([0, 1, 2].map((v) => Number(pick('left' + v))))];
    const held = pick('comp') === 'sustain' ? Math.min(8, next) - beat : 0.35;
    for (const n of notes)
      if (n.hand === 'left' && n.beat < beat && n.beat + n.duration > beat)
        n.duration = beat - n.beat;
    voices.forEach((midi, v) =>
      notes.push({
        midi,
        beat,
        duration: Math.min(8 - beat, held),
        velocity: Math.max(0.2, level - 0.2),
        hand: 'left',
        patch: patches.left,
        articulation: 'natural',
        provenance: { traceId: trace.id, slot: 'left' + v },
      }),
    );
  }
  return { notes: notes.sort((x, y) => x.beat - y.beat || x.midi - y.midi), next };
}
