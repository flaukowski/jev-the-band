import { choice } from './jev.js';
import { validateNotes } from '../shared/score.js';
import type { Answer, ChoiceQuestion, JevRequest, Note, Trace } from '../shared/music.js';

export function drumRequest(
  model: string,
  state: unknown,
  plan: Record<string, Answer>,
  start: number,
  draft: Note[],
): JevRequest {
  const subdivision = Number(plan.pulse.choice);
  const span = Math.min(4, 16 / subdivision, 8 - start);
  const questions: Record<string, ChoiceQuestion> = {};
  for (let i = 0; i < Math.round(span * subdivision); i++) {
    const beat = start + i / subdivision;
    const placement =
      'At phrase beat ' +
      beat +
      ' (bar ' +
      (Math.floor(beat / 4) + 1) +
      ', beat ' +
      ((beat % 4) + 1) +
      '), ';
    questions['k' + i] = choice(
      placement +
        'choose whether the kick sounds. Establish a danceable anchor; repetition is useful. React to the heard bass.',
      { off: 'No kick', on: 'Kick drum' },
    );
    questions['s' + i] = choice(
      placement +
        'choose snare/tom or rest. A legible backbeat belongs in groove styles; reserve tom fills for a transition.',
      { rest: 'No snare or tom', 38: 'Snare', 45: 'Low tom', 47: 'Middle tom', 50: 'High tom' },
    );
    questions['c' + i] = choice(
      placement +
        'choose cymbal or rest. Maintain a continuous pulse appropriate to your chosen style; a crash is a punctuation.',
      { rest: 'No cymbal', 42: 'Closed hi-hat', 46: 'Open hi-hat', 51: 'Ride', 49: 'Crash' },
    );
    questions['v' + i] = choice(placement + 'choose accent level, including soft ghost notes.', {
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
      plan: Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, v.choice])),
      alreadyComposed: draft,
      segmentStart: start,
      segmentBeats: span,
      task: 'Write the actual drum hits in this segment. The pulse grid is YOUR chosen subdivision, not a premade groove. Every kick, snare, tom and cymbal is your own choice. Anchor the band; make recurring accents the listener can feel, then vary one detail or answer a peer. In settle/release, keep the pocket. Fills should land back in the groove. Do not leave the second bar unfinished.',
    },
    questions,
  };
}
export function readDrums(
  trace: Trace,
  plan: Record<string, Answer>,
  start: number,
  prior: Note[],
): Note[] {
  const notes = [...prior];
  const subdivision = Number(plan.pulse.choice);
  const span = Math.min(4, 16 / subdivision, 8 - start);
  const swing = Number(plan.swingAmount.choice);
  for (let i = 0; i < Math.round(span * subdivision); i++) {
    const a = (key: string) => trace.answers[key + i].choice;
    const raw = start + i / subdivision;
    const beat = raw + (subdivision === 2 && i % 2 ? swing : 0);
    const velocity = Number(a('v'));
    const hits: [string, number][] = [];
    if (a('k') === 'on') hits.push(['k', 36]);
    if (a('s') !== 'rest') hits.push(['s', Number(a('s'))]);
    if (a('c') !== 'rest') hits.push(['c', Number(a('c'))]);
    for (const [lane, midi] of hits)
      notes.push({
        beat,
        midi,
        duration: Math.min(0.25, 8 - beat),
        velocity,
        provenance: { traceId: trace.id, slot: lane + i },
      });
  }
  validateNotes(notes, 'drums');
  return notes;
}
