import { choice } from './jev.js';
import { drumRequest, readDrums } from './drummer.js';
import { sampleWithHeat } from './heat.js';
import { validateNotes } from '../shared/score.js';
import type { Answer, ChoiceQuestion, JevRequest, Note, Part, Trace } from '../shared/music.js';

// A drummer does not reinvent the beat every eight bars. The groove is a persistent object and
// each drum turn is a MOVE on it: keep it, vary one limb, fill, drop, build, change subdivision,
// or (rarely) write a new groove. Moves that are moments (fill, drop, build) are one-shots: the
// groove returns afterwards, optionally landing on a cymbal Jev chose. Every hit still derives
// from a Jev answer; the harness only keeps what was not asked about.

export const drumMoves = {
  keep: 'Keep the groove exactly. The pocket is working; let the band lean on it',
  vary_cymbals:
    'Theme and variation with the timekeeping hand: move between closed hats, open hats, ride, bell and pedal, or thin it out. Kick and snare stay',
  vary_kick: 'Theme and variation with the kick: shift, add or remove a few kicks. Hands stay',
  vary_snare:
    'Theme and variation with the snare hand: ghost notes, a displaced backbeat, cross-stick, a tom color. Kick and cymbals stay',
  fill: 'Play a fill into the next phrase, then return to the same groove',
  drop: 'Beat drop: pull part or all of the kit out for a moment, then slam back in',
  build: 'A rising snare or tom build across the end of the phrase, then back to the groove',
  change_subdivision:
    'Recompose the groove on a different grid: shift to a triplet/shuffle feel, or straighten back out',
  new_groove: 'Leave this groove behind and write a new one from nothing',
} as const;
export type DrumMove = keyof typeof drumMoves;
const oneShots: readonly string[] = ['fill', 'drop', 'build'];

const lanes = {
  kick: [36],
  snare: [38, 37, 45, 47, 50],
  cymbals: [42, 46, 44, 51, 53, 49, 55],
} as const;
export const drumVoices: Record<number, string> = {
  36: 'kick',
  38: 'snare',
  37: 'cross-stick rim click',
  45: 'low tom',
  47: 'mid tom',
  50: 'high tom',
  42: 'closed hi-hat',
  46: 'open hi-hat',
  44: 'pedal hi-hat chick',
  51: 'ride',
  53: 'ride bell',
  49: 'crash',
  55: 'splash',
};
type Lane = keyof typeof lanes;
const laneOf = (midi: number) =>
  (Object.keys(lanes) as Lane[]).find((lane) => (lanes[lane] as readonly number[]).includes(midi));
const stepBeat = (i: number, pulse: number, swing: number) =>
  Number((i / pulse + (pulse === 2 && i % 2 ? swing : 0)).toFixed(6));
const placement = (beat: number) =>
  `At phrase beat ${Number(beat.toFixed(3))} (bar ${Math.floor(beat / 4) + 1}, beat ${Number(((beat % 4) + 1).toFixed(3))}), `;

/** The groove a player returns to: a pending one-shot never becomes the theme. */
export function baseGroove(previous: Part | undefined): Note[] {
  return previous?.upNext?.at(-1) ?? previous?.notes ?? [];
}
/** Moves offered now. A new drummer can only write a groove; a young groove cannot be abandoned. */
export function availableMoves(previous: Part | undefined, windDown: boolean) {
  const established = !!previous?.performance?.drumPulse && baseGroove(previous).length > 0;
  if (!established) return { new_groove: drumMoves.new_groove };
  if (windDown)
    return {
      keep: drumMoves.keep,
      drop: 'Strip the kit down as the song closes',
      fill: 'A closing fill',
    };
  const moves: Record<string, string> = { ...drumMoves };
  if ((previous!.performance!.grooveAge ?? 0) < 4) delete moves.new_groove;
  // Groove grammar: the KIND of move may not repeat forever. Two variations or two keeps in a
  // row rest that kind; a moment is never followed by another moment; a fresh grid gets to settle.
  const kind = (move: string | undefined) =>
    move?.startsWith('vary_') ? 'vary' : oneShots.includes(move ?? '') ? 'moment' : move;
  const history = (previous!.performance!.recentChoices?.move ?? []).map(kind);
  const [last, before] = [history.at(-1), history.at(-2)];
  const rest = (k: string) => {
    for (const move of Object.keys(moves)) if (kind(move) === k) delete moves[move];
  };
  if (last === 'moment') rest('moment');
  if (last === 'vary' && before === 'vary') rest('vary');
  if (last === 'keep' && before === 'keep') rest('keep');
  if (last === 'change_subdivision' || last === 'new_groove') {
    rest('change_subdivision');
    rest('new_groove');
  }
  return moves;
}

function varyRequest(
  model: string,
  state: unknown,
  lane: Lane,
  base: Note[],
  pulse: number,
  swing: number,
): JevRequest {
  const questions: Record<string, ChoiceQuestion> = {};
  for (let i = 0; i < 8 * pulse; i++) {
    const beat = stepBeat(i, pulse, swing);
    const now = base.find((n) => laneOf(n.midi) === lane && Math.abs(n.beat - beat) < 0.02);
    const current = now ? drumVoices[now.midi] : 'nothing';
    questions['e' + i] = choice(
      `${placement(beat)}your groove currently plays ${current} in the ${lane} part. Keep most of the theme; change only the few places that make this variation.`,
      lane === 'kick'
        ? { off: 'No kick', on: 'Kick drum' }
        : {
            rest: 'Nothing here',
            ...Object.fromEntries(lanes[lane].map((midi) => [String(midi), drumVoices[midi]])),
          },
    );
    questions['v' + i] = choice(placement(beat) + 'accent level if you change this step.', {
      '0.25': 'Ghost',
      '0.45': 'Soft',
      '0.62': 'Normal',
      '0.8': 'Accent',
    });
  }
  return {
    model,
    state: {
      context: state,
      grooveTheme: base.map(({ beat, midi, velocity }) => ({
        beat,
        voice: drumVoices[midi],
        velocity,
      })),
      task: `Theme and variation. You are changing ONLY the ${lane} part of your own groove; everything else stays exactly as it is. Change between two and six steps across the two bars so the listener hears the same groove with a new detail: a displaced hit, a ghost note, an opened hat, a move to the ride. The second bar may answer the first.`,
    },
    questions,
  };
}
function readVary(
  trace: Trace,
  lane: Lane,
  base: Note[],
  pulse: number,
  swing: number,
  rng: () => number,
): Note[] {
  trace.appliedAnswers = structuredClone(trace.answers);
  trace.selectionMethod = 'seeded-model-distribution';
  const notes = base.filter((n) => laneOf(n.midi) !== lane).map((n) => ({ ...n }));
  for (let i = 0; i < 8 * pulse; i++) {
    const beat = stepBeat(i, pulse, swing);
    const answer = trace.appliedAnswers['e' + i];
    const picked = sampleWithHeat(answer, 0.45, rng);
    if (picked !== answer.choice) {
      answer.choice = picked;
      delete answer.confidence;
    }
    if (picked === 'rest' || picked === 'off') continue;
    const midi = picked === 'on' ? 36 : Number(picked);
    const old = base.find((n) => laneOf(n.midi) === lane && Math.abs(n.beat - beat) < 0.02);
    notes.push({
      beat,
      midi,
      duration: Math.min(0.25, 8 - beat),
      // An unchanged hit keeps its old accent; only a new hit takes the new one.
      velocity: old?.midi === midi ? old.velocity : Number(trace.answers['v' + i].choice),
      provenance: { traceId: trace.id, slot: 'e' + i },
    });
  }
  return notes.sort((a, b) => a.beat - b.beat || a.midi - b.midi);
}

const landings = {
  crash: 'Crash on the next downbeat as the groove returns',
  splash: 'A quick splash on the next downbeat',
  ride_bell: 'Ride bell ping on the next downbeat',
  none: 'Drop straight back into the groove with no cymbal',
};
const landingMidi: Record<string, number | undefined> = { crash: 49, splash: 55, ride_bell: 53 };
const spans = {
  '1': 'Only the last beat',
  '2': 'The last two beats',
  '4': 'The whole second bar',
};

function shapeRequest(model: string, state: unknown, move: string, base: Note[]): JevRequest {
  const common = {
    span: choice('How much of the end of this two-bar phrase does the moment take?', {
      ...spans,
      ...(move === 'drop' ? { '8': 'Both bars: a full breakdown' } : {}),
    }),
    landing: choice('How does the groove come back on the next downbeat?', landings),
  };
  const questions: Record<string, ChoiceQuestion> =
    move === 'fill'
      ? {
          ...common,
          grid: choice(
            'The subdivision of the fill. A tuplet fill over a straight groove is a classic surprise.',
            {
              '4': 'Sixteenth notes',
              '3': 'Eighth-note triplets',
              '6': 'Sextuplets: a fast roll',
              '2': 'Eighth notes: big and simple',
            },
          ),
          contour: choice('The idea of the fill; you choose every hit next.', {
            down_the_toms: 'Snare to high, mid and low toms',
            up_the_toms: 'Low tom rising to the snare',
            snare_roll: 'Snare with ghost notes and accents',
            kick_conversation: 'Hands and kick trading',
            stabs: 'A few syncopated accents with space',
          }),
        }
      : move === 'drop'
        ? {
            ...common,
            what: choice('What falls silent? Whatever remains keeps your own groove hits.', {
              kick: 'The kick drops out; hands keep time',
              kick_and_snare: 'Only the cymbal pulse remains',
              cymbals: 'Cymbals vanish; kick and snare stay dry',
              all_but_kick: 'Just the kick remains',
              everything: 'Total silence from the kit',
            }),
          }
        : {
            ...common,
            voice: choice('What drives the build?', {
              '38': 'Snare',
              '45': 'Floor tom',
              '47': 'Mid tom',
            }),
            shape: choice('How does the build accelerate?', {
              eighths_to_sixteenths: 'Eighths doubling to sixteenths',
              sixteenths: 'Steady sixteenths growing louder',
              sixteenths_to_32nds: 'Sixteenths erupting into thirty-seconds',
            }),
            under: choice('What continues under the build?', {
              kick: 'Your kick pattern',
              kick_and_cymbals: 'Kick and cymbals',
              nothing: 'Only the build',
            }),
          };
  return {
    model,
    state: {
      context: state,
      grooveTheme: base.map(({ beat, midi }) => ({ beat, voice: drumVoices[midi] })),
      task: `Shape a ${move}. It is a moment, not a new groove: your groove returns on the next downbeat. Serve the band: a short fill or drop usually says more than a long one.`,
    },
    questions,
  };
}

function fillRequest(
  model: string,
  state: unknown,
  shape: Record<string, Answer>,
  base: Note[],
): JevRequest {
  const span = Number(shape.span.choice);
  const grid = Number(shape.grid.choice);
  const questions: Record<string, ChoiceQuestion> = {};
  for (let i = 0; i < span * grid; i++) {
    const beat = 8 - span + i / grid;
    questions['f' + i] = choice(
      `${placement(beat)}choose this hit of your fill (${shape.contour.choice.replaceAll('_', ' ')}).`,
      {
        rest: 'Leave air',
        38: 'Snare',
        50: 'High tom',
        47: 'Mid tom',
        45: 'Low tom',
        36: 'Kick',
        flam: 'Snare flam: a grace note into an accent',
        42: 'Closed hi-hat',
      },
    );
    questions['v' + i] = choice(placement(beat) + 'accent level.', {
      '0.45': 'Soft',
      '0.62': 'Normal',
      '0.8': 'Accent',
      '0.95': 'Hard accent',
      '0.25': 'Ghost',
    });
  }
  return {
    model,
    state: {
      context: state,
      fillShape: Object.fromEntries(Object.entries(shape).map(([k, a]) => [k, a.choice])),
      grooveBeforeFill: base
        .filter((n) => n.beat < 8 - span)
        .slice(-16)
        .map(({ beat, midi }) => ({ beat, voice: drumVoices[midi] })),
      task: 'Write every hit of the fill. Give it a shape: start from the groove, move around the kit, leave at least one gap, and drive toward the downbeat that follows. Accents make the phrase; not every step needs a hit.',
    },
    questions,
  };
}

export interface DrumResult {
  notes: Note[];
  upNext?: Note[][];
  pulse: number;
  swing: number;
  move: DrumMove;
  grooveAge: number;
  /** The landing Jev chose for the groove's return after a one-shot. */
  landing?: string;
}

export async function composeDrums(
  model: string,
  state: unknown,
  plan: Record<string, Answer>,
  previous: Part | undefined,
  decide: (request: JevRequest) => Promise<Trace>,
  rng: () => number,
): Promise<DrumResult> {
  const ask = async (request: JevRequest) => {
    const trace = await decide(request);
    if (trace.source !== 'jev') throw new Error('Drum decisions unavailable');
    return trace;
  };
  let base = baseGroove(previous).map((n) => ({ ...n }));
  const perf = previous?.performance;
  let move = (plan.move?.choice ?? 'new_groove') as DrumMove;
  if (!perf?.drumPulse || !base.length) move = 'new_groove';
  let pulse = perf?.drumPulse ?? Number(plan.pulse.choice);
  let swing = perf?.drumSwing ?? Number(plan.swingAmount.choice);
  // A landing owed from the previous one-shot is played even if the drummer composes again at once.
  const owed =
    previous?.upNext?.length === 2 ? landingMidi[perf?.pendingLanding ?? 'none'] : undefined;
  const land = (notes: Note[], midi: number | undefined, traceId?: string): Note[] =>
    midi === undefined
      ? notes
      : [
          {
            beat: 0,
            midi,
            duration: 0.25,
            velocity: 0.85,
            provenance: traceId ? { traceId, slot: 'landing' } : undefined,
          },
          ...notes.filter((n) => !(n.beat < 0.02 && laneOf(n.midi) === 'cymbals')),
        ];

  if (move === 'new_groove' || move === 'change_subdivision') {
    if (move === 'change_subdivision')
      // Jev's own pulse answer if it differs; otherwise the natural opposite of the current grid.
      plan.pulse = {
        ...plan.pulse,
        choice: Number(plan.pulse.choice) !== pulse ? plan.pulse.choice : pulse === 3 ? '4' : '3',
      };
    pulse = Number(plan.pulse.choice);
    swing = Number(plan.swingAmount.choice);
    let notes: Note[] = [];
    for (let start = 0; start < 8; start += Math.min(4, 16 / pulse))
      notes = readDrums(
        await ask(drumRequest(model, state, plan, start, notes)),
        plan,
        start,
        notes,
      );
    return { notes: land(notes, owed), pulse, swing, move, grooveAge: 0 };
  }
  const grooveAge = (perf?.grooveAge ?? 0) + 1;
  if (move === 'keep')
    return {
      notes: land(base, owed),
      upNext: owed ? [base] : undefined,
      pulse,
      swing,
      move,
      grooveAge,
    };
  if (move.startsWith('vary_')) {
    const lane = move.slice(5) as Lane;
    const trace = await ask(varyRequest(model, state, lane, base, pulse, swing));
    base = readVary(trace, lane, base, pulse, swing, rng);
    validateNotes(base, 'drums');
    return {
      notes: land(base, owed),
      upNext: owed ? [base] : undefined,
      pulse,
      swing,
      move,
      grooveAge,
    };
  }
  // One-shots: this chunk is the moment; the queue brings the groove back.
  const shapeTrace = await ask(shapeRequest(model, state, move, base));
  const shape = shapeTrace.answers;
  const span = Number(shape.span.choice);
  const from = 8 - span;
  let notes = base.filter((n) => n.beat < from - 0.0001);
  if (move === 'drop') {
    const silent: Record<string, Lane[]> = {
      kick: ['kick'],
      kick_and_snare: ['kick', 'snare'],
      cymbals: ['cymbals'],
      all_but_kick: ['snare', 'cymbals'],
      everything: ['kick', 'snare', 'cymbals'],
    };
    notes = base.filter(
      (n) => n.beat < from - 0.0001 || !silent[shape.what.choice].includes(laneOf(n.midi)!),
    );
  } else if (move === 'build') {
    const keep: Lane[] =
      shape.under.choice === 'kick'
        ? ['kick']
        : shape.under.choice === 'kick_and_cymbals'
          ? ['kick', 'cymbals']
          : [];
    notes.push(...base.filter((n) => n.beat >= from - 0.0001 && keep.includes(laneOf(n.midi)!)));
    for (let beat = from; beat < 7.9999;) {
      const progress = (beat - from) / span;
      const step =
        shape.shape.choice === 'sixteenths'
          ? 0.25
          : shape.shape.choice === 'eighths_to_sixteenths'
            ? progress < 0.5
              ? 0.5
              : 0.25
            : progress < 0.5
              ? 0.25
              : 0.125;
      notes.push({
        beat: Number(beat.toFixed(6)),
        midi: Number(shape.voice.choice),
        duration: Math.min(0.125, 8 - beat),
        velocity: Number((0.3 + 0.65 * progress).toFixed(2)),
        provenance: { traceId: shapeTrace.id, slot: 'build' },
      });
      beat += step;
    }
  } else {
    const trace = await ask(fillRequest(model, state, shape, base));
    const grid = Number(shape.grid.choice);
    for (let i = 0; i < span * grid; i++) {
      const hit = trace.answers['f' + i].choice;
      if (hit === 'rest') continue;
      const beat = Number((from + i / grid).toFixed(6));
      const velocity = Number(trace.answers['v' + i].choice);
      const provenance = { traceId: trace.id, slot: 'f' + i };
      if (hit === 'flam' && beat >= 0.04)
        notes.push({ beat: beat - 0.04, midi: 38, duration: 0.04, velocity: 0.3, provenance });
      notes.push({
        beat,
        midi: hit === 'flam' ? 38 : Number(hit),
        duration: Math.min(0.125, 8 - beat),
        velocity,
        provenance,
      });
    }
  }
  notes = land(notes, owed).sort((a, b) => a.beat - b.beat || a.midi - b.midi);
  validateNotes(notes, 'drums');
  const back = land(base, landingMidi[shape.landing.choice], shapeTrace.id);
  return {
    notes,
    upNext: [back, base],
    landing: shape.landing.choice,
    pulse,
    swing,
    move,
    grooveAge,
  };
}
export const isOneShot = (move: string | undefined) => oneShots.includes(move ?? '');
