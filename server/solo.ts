import { choice } from './jev.js';
import { gestures, leadEnergy } from './lead.js';
import type { Answer, JevRequest, Musician, Part, Snapshot, Trace } from '../shared/music.js';

export function continuingSolo(part: Part | undefined): boolean {
  return (
    !!part?.solo &&
    !!part.performance?.soloBars &&
    (part.performance.soloPhrases ?? 0) * 2 < part.performance.soloBars
  );
}
export function continuingPhrase(part: Part | undefined): boolean {
  return (
    !!part?.performance?.phraseBars &&
    (part.performance.phraseChunks ?? 0) * 2 < part.performance.phraseBars
  );
}
export function soloPlanRequest(
  role: Musician,
  room: Snapshot,
  model: string,
  plan: Record<string, Answer>,
  context: unknown,
): JevRequest {
  const own = room.frames.at(-1)?.parts.find((p) => p.role === role);
  const continuing = continuingSolo(own);
  const played = continuing ? (own?.performance?.soloPhrases ?? 0) * 2 : 0;
  const total = continuing ? own!.performance!.soloBars! : undefined;
  return {
    model,
    state: {
      context,
      chosenDirection: Object.fromEntries(Object.entries(plan).map(([k, a]) => [k, a.choice])),
      solo: {
        playedBars: played,
        totalBars: total,
        previousNotes: own?.notes ?? [],
        journey:
          total && played >= total - 2
            ? 'Resolve this solo and hand back the groove.'
            : played === 0
              ? 'State a NEW singable melody, clearly different from your accompaniment.'
              : 'Develop your melody with a new answer, rhythmic displacement, a run and a breath. Build toward a satisfying arrival.',
      },
      task: 'Compose a real featured solo. Never loop the support groove or just play a scale arpeggiator. Every two bars must contain new melodic and rhythmic material, coherent with your previous solo phrase and performed band. Make a motif, answer it, develop it and resolve. Choose a length from the mood, not a fixed default. Other soloists may overlap; listen and trade space.',
    },
    questions: {
      bars: choice(
        'Choose the full solo duration in bars based on mood, energy and available space. Preserve the chosen duration during a continuing solo.',
        total ? [String(total)] : ['8', '10', '12', '16', '20', '24', '28', '32'],
      ),
      energy: choice(
        'Where is this solo right now? Shape a journey across the whole solo: most solos simmer, climb, peak near two thirds, then cool into the handoff.',
        // A solo has a shape: it may not peak in its first bars or stay cool all the way through.
        Object.fromEntries(
          Object.entries(leadEnergy).filter(([name]) =>
            (!total || played === 0
              ? ['simmer', 'climb']
              : played >= total - 2
                ? ['cool']
                : played / total < 0.4
                  ? ['simmer', 'climb', 'peak']
                  : ['climb', 'peak']
            ).includes(name),
          ),
        ),
      ),
      opening: choice(
        'Which kind of gesture opens these two bars? It continues from how your last phrase ended.',
        Object.fromEntries(Object.entries(gestures).map(([name, g]) => [name, g.color])),
      ),
      attacks: choice(
        'Actual attacks across these two bars; vary rhythm and leave melodic breaths.',
        role === 'keys' ? ['8'] : ['8', '10', '12'],
      ),
      texture: choice(
        'A foreground melody; left-hand keyboard support can be sparse.',
        role === 'keys' ? ['single_line', 'split_comp_lead'] : ['single_line'],
      ),
      register: choice('A singing register clear of the bass and support voices.', [
        'middle',
        'high',
      ]),
      contour: choice('Choose a melodic narrative for this fresh phrase.', [
        'question_answer',
        'long_target_short_run',
        'rise_then_rest',
        'fall_then_answer',
        'arch',
        'displaced_accents',
      ]),
      entry: choice('Enter this solo phrase with a clear statement or short pickup breath.', [
        '0',
        '0.125',
        '0.25',
        '0.5',
      ]),
    },
  };
}

// Draw duration from Jev's own distribution, so mood can influence a variable
// 8–32-bar length. Preserve its raw answer and disclose the applied draw.
export function sampleSoloLength(trace: Trace, rng: () => number): number {
  const answer = trace.answers.bars;
  const options = Object.entries(answer.probabilities).filter(([, p]) => p > 0);
  let draw = rng() * options.reduce((sum, [, p]) => sum + p, 0);
  let picked = answer.choice;
  for (const [value, p] of options) {
    draw -= p;
    if (draw <= 0) {
      picked = value;
      break;
    }
  }
  trace.appliedAnswers = structuredClone(trace.answers);
  trace.appliedAnswers.bars = { ...answer, choice: picked };
  if (picked !== answer.choice) delete trace.appliedAnswers.bars.confidence;
  trace.selectionMethod = 'seeded-model-distribution';
  return Number(picked);
}
