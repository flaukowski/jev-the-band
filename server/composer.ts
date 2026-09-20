import {
  actions,
  articulations,
  fxNames,
  modes,
  noteNames,
  patches,
  personas,
  scales,
  random,
  hash,
  type Answer,
  type ChoiceQuestion,
  type Decision,
  type JevRequest,
  type Musician,
  type Note,
  type Part,
  type Snapshot,
  type Trace,
} from '../shared/music.js';
import { endingPressure, validateNotes } from '../shared/score.js';
import { choice, toDecision } from './jev.js';
import { musicalContext } from './musical-context.js';
import {
  arcs,
  styles,
  guitarTextures,
  keyTextures,
  chordIntervals,
  guitarTuning,
  pitchPalette,
  type Performance,
} from '../shared/performance.js';
import { drumRequest, readDrums } from './drummer.js';
import { rigRequest, timbres } from './rig.js';

export type Decide = (request: JevRequest) => Promise<Trace>;
export const drumPitches: Record<string, string> = {
  36: 'kick',
  38: 'snare',
  42: 'closed hi-hat',
  46: 'open hi-hat',
  45: 'low tom',
  47: 'mid tom',
  50: 'high tom',
  49: 'crash',
  51: 'ride',
};
// A vocabulary of individual times, not a set of rhythmic patterns. Includes 32nds and tuplets.
export const onsetTimes = [
  ...new Set(
    [8, 6, 5, 4, 3, 2, 1].flatMap((division) =>
      Array.from({ length: 4 * division }, (_, i) => Number((i / division).toFixed(6))),
    ),
  ),
].sort((a, b) => a - b);
const durations = [0.125, 1 / 6, 0.2, 0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1, 1.5, 2, 3, 4, 6, 8];
const pitchLabel = (midi: number) =>
  `${noteNames[midi % 12]}${Math.floor(midi / 12) - 1} (MIDI ${midi})`;
function context(role: Musician, room: Snapshot, phrase: number) {
  const elapsed = Math.max(0, (Date.now() - room.startedAt) / 1000);
  return {
    persona: personas[role],
    phrase,
    elapsedSeconds: Math.round(elapsed),
    seedPrompt: phrase < 4 ? room.prompt : undefined,
    endingPressure: endingPressure(elapsed),
    lastPhraseBeforeHardStop: room.endsAt > 0 && room.endsAt - Date.now() < 14000,
    ...musicalContext(room, role),
  };
}
export function phrasePlanRequest(
  role: Musician,
  room: Snapshot,
  phrase: number,
  model: string,
): JevRequest {
  const own = room.frames.at(-1)?.parts.find((p) => p.role === role);
  const releaseDue = (own?.performance?.tensionPhrases ?? 0) >= 2;
  const questions: Record<string, ChoiceQuestion> = {
    style: choice(
      'Choose a stylistic branch for your phrase. Develop the current feel rather than switching genre every turn. Start from the prompt, then let the heard band lead.',
      styles,
    ),
    arc: choice(
      'Where is this phrase in tension and release? Groove is the goal, not permanent novelty. After a build/peak, make a consonant arrival. Release does not mean ending the jam.',
      releaseDue ? { settle: arcs.settle, release: arcs.release, space: arcs.space } : arcs,
    ),
    palette: choice(
      'Choose how adventurous the pitch vocabulary should be. Diatonic is the default for a settled groove or release. Blues allows blue notes; chromatic is a deliberate brief excursion.',
      {
        diatonic: 'Stay inside your chosen mode; make a clear tonal home',
        blues: 'Mode notes plus blue-note colors that should resolve',
        chromatic: 'All twelve pitch classes for an intentional tension passage',
      },
    ),
    chord: choice(
      'Choose the harmonic color your chord voices or melodic targets will outline. A stable triad, sixth or seventh provides release; suspended and extended colors add tension.',
      Object.fromEntries(
        Object.entries(chordIntervals).map(([name, tones]) => [
          name,
          name + '; semitones from root: ' + tones.join(','),
        ]),
      ),
    ),
    attacks: choice(
      'How many musical attacks should your next eight-beat phrase have? This is a note count, not a rhythmic template. Balance space, melody and response to heard peers.',
      role === 'keys'
        ? {
            '4': 'Four spacious chord or melody attacks',
            '6': 'Six varied attacks with room to breathe',
            '8': 'Eight active attacks',
          }
        : {
            '4': 'Four spacious gestures',
            '6': 'Six melodic attacks with room to breathe',
            '8': 'Eight attacks for an active phrase',
            '10': 'Ten attacks including a brief run',
            '12': 'Twelve attacks for dense momentum or drum interplay',
          },
    ),
    entry: choice(
      'At what beat do you begin this phrase? A pickup or breath can precede your first note.',
      ['0', '0.125', '0.25', '0.333333', '0.5', '0.75', '1', '1.5', '2'],
    ),
    action: choice(
      'Compose your next two-bar phrase. Solo foregrounds a singable melody; support ends a solo; vary/develop continue it; space is sparse; rest is silence; resolve is your own ending. Hold explicitly repeats your exact prior notes, only when offered.',
      actions.filter(
        (a) => a !== 'hold' || (own && !releaseDue && (own.performance?.motifAge ?? 0) < 3),
      ),
    ),
    intent: choice(
      'Choose how to keep the music compelling. A groove needs familiar anchors and a payoff. Develop one detail, answer a peer, or resolve tension; do not replace every note every turn.',
      [
        'answer_peer',
        'develop_motif',
        'new_theme',
        'create_tension',
        'release_tension',
        'thin_out',
        'build_energy',
        'trade_phrase',
        'sustain_texture',
      ],
    ),
    contour: choice(
      'Shape your own next melody or drum dynamics. This is a plan you will realize with individual note choices, not a predefined lick.',
      [
        'rise_then_rest',
        'fall_then_answer',
        'arch',
        'question_answer',
        'long_target_short_run',
        'fragment_with_space',
        'oscillate_then_escape',
        'displaced_accents',
      ],
    ),
    root: choice(
      'Your tonal center, in relation to the band you heard. Usually agree; deliberate modal tension is allowed.',
      Object.fromEntries(noteNames.map((name, i) => [String(i), name])),
    ),
    mode: choice(
      'Your own scale color. You may differ from peers tastefully; actual chromatic note choices remain available.',
      [...modes, 'phrygian', 'lydian', 'locrian', 'harmonic_minor', 'chromatic'],
    ),
    register: choice(
      'Choose your register for this phrase. Bass support usually lives low; a melodic solo can move higher. This choice sets the playable window, then you choose exact notes.',
      {
        low: 'Low, grounded register',
        middle: 'Middle instrumental register',
        high: 'Upper singing or solo register',
      },
    ),
    dynamic: choice('Overall expressive intention; individual velocities follow.', [
      'soft',
      'warm',
      'bold',
    ]),
    density: choice('How much space does the next phrase need? Silence matters.', [
      'low',
      'medium',
      'high',
    ]),
    tempo: choice('Suggest a small shared tempo change responding to heard music.', [
      'ease',
      'stay',
      'push',
    ]),
    harmony: choice(
      'Propose a shared tonic change. Another player must agree before the clock announces it.',
      ['stay', 'up_fourth', 'up_fifth'],
    ),
    ending: choice(
      'Before five minutes continue. As endingPressure rises or lastPhraseBeforeHardStop is true, seek a musical resolution.',
      ['continue', 'end'],
    ),
  };
  if (role === 'guitar') {
    questions.texture = choice(
      'Choose monophonic or polyphonic guitar playing for this phrase. Rhythmic chord comping is a full musical role, not only lead lines.',
      guitarTextures,
    );
    questions.position = choice(
      'Choose a fretboard position for polyphonic guitar. Individual string notes are chosen next.',
      {
        open: 'Open strings and frets 0–5',
        low: 'Frets 3–8',
        middle: 'Frets 7–12',
        upper: 'Frets 12–17',
      },
    );
    questions.stringPair = choice(
      'Which pair of strings would you use for double stops? Ignored for single-line or full-chord playing.',
      Object.fromEntries(
        guitarTuning.flatMap((_, i) =>
          guitarTuning
            .slice(i + 1)
            .map((__, j) => [i + '_' + (i + j + 1), 'Strings ' + (i + 1) + ' and ' + (i + j + 2)]),
        ),
      ),
    );
  }
  if (role === 'keys')
    questions.texture = choice(
      'Choose how your two hands make the phrase: melody, chord comping, split duties or full polyphony.',
      keyTextures,
    );
  if (role === 'drums') {
    questions.pulse = choice(
      'Choose the drum timing resolution. You will decide every actual hit/rest across both bars. Eighths or sixteenths support a pocket; triplets support a shuffle.',
      {
        '1': 'Quarter-note pulse',
        '2': 'Eighth-note pulse',
        '3': 'Triplet pulse',
        '4': 'Sixteenth-note pulse',
      },
    );
    questions.swingAmount = choice(
      'For eighths, delay offbeats by this fraction of a beat. Other subdivisions retain their own spacing.',
      { '0': 'Straight', '0.06': 'Light swing', '0.16': 'Deep shuffle' },
    );
  }
  if (role === 'keys')
    for (const hand of ['left', 'right'])
      questions[hand] = choice(
        `Keyboard patch for your ${hand} hand. You can split instruments.`,
        patches,
      );
  for (const bar of [1, 2])
    questions['timbreBar' + bar] = choice(
      'Choose the sonic character of bar ' +
        bar +
        '. Effects should be used generously as a musical voice; keep a color while it serves the groove or change it to answer, build or release. A separate decision will choose every pedal after seeing this intention.',
      timbres,
    );
  return {
    model,
    state: {
      ...context(role, room, phrase),
      task: 'You compose actual note events after this plan. There is no lick catalog. First make a groove worth keeping. Preserve recognizable rhythmic anchors; vary a detail, answer a peer, or resolve a previous tension. Novelty is not a demand to change every note. Only you can introduce a new theme at this boundary; peers retain their performed parts. Your own previous musical direction is private memory.',
    },
    questions,
  };
}

export const maxAttacks = 12;
export function eventRequest(
  role: Musician,
  room: Snapshot,
  phrase: number,
  model: string,
  plan: Record<string, Answer>,
  beat: number,
  draft: Note[],
  attack = 0,
): JevRequest {
  const tonalScale = (
    {
      ...scales,
      phrygian: [0, 1, 3, 5, 7, 8, 10],
      lydian: [0, 2, 4, 6, 7, 9, 11],
      locrian: [0, 1, 3, 5, 6, 8, 10],
      harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
      chromatic: Array.from({ length: 12 }, (_, i) => i),
    } as Record<string, number[]>
  )[plan.mode.choice];
  const root = Number(plan.root.choice);
  const last = draft.at(-1)?.midi;
  const describe = (midi: number) => {
    const interval = (midi - root + 120) % 12;
    const name = [
      'tonic',
      'flat second',
      'second',
      'minor third',
      'major third',
      'fourth',
      'tritone',
      'fifth',
      'flat sixth',
      'sixth',
      'flat seventh',
      'major seventh',
    ][interval];
    return (
      pitchLabel(midi) +
      '; ' +
      name +
      '; ' +
      (tonalScale.includes(interval) ? 'in your chosen scale' : 'chromatic tension or approach') +
      '; ' +
      (last === undefined
        ? 'opening pitch'
        : midi === last
          ? 'repeat your immediately previous pitch'
          : String(Math.abs(midi - last)) +
            ' semitones ' +
            (midi > last ? 'above' : 'below') +
            ' your previous pitch')
    );
  };
  const landing =
    plan.arc?.choice === 'release' && (beat >= 4 || Number(plan.attacks.choice) - attack <= 2);
  const range = (low: number, high: number, optional = false, chordOnly = false) => ({
    ...(optional ? { rest: 'Silence for this voice at this attack' } : {}),
    ...Object.fromEntries(
      Array.from({ length: high - low + 1 }, (_, i) => low + i)
        .filter((midi) =>
          pitchPalette(
            root,
            plan.mode.choice,
            plan.palette?.choice ?? 'diatonic',
            plan.chord?.choice ?? 'minor7',
            chordOnly || landing,
          ).includes(midi % 12),
        )
        .map((midi) => [String(midi), describe(midi)]),
    ),
  });
  const questions: Record<string, ChoiceQuestion> = {
    sound: choice(
      'Play this next attack or take an intentional rest? A solo should sing and a bass should establish a groove. This is an actual musical event, not an unused slot.',
      { play: 'Sound notes now', rest: 'Rest and advance time without notes' },
    ),
    advance: choice(
      `After this attack at beat ${beat}, how many beats until your next attack? Pick the actual interval: rests arise when the interval exceeds held duration. ${Number(plan.attacks.choice) - attack - 1} further attacks are planned in ${8 - beat} remaining beats; mix short runs with held targets and leave an intentional ending.`,
      durations.filter((v) => v <= 8 - beat + 0.000001).map(String),
    ),
    duration: choice(
      `How many beats should the notes at beat ${beat} be held? Choose the actual duration; long targets and short pickups make melody.`,
      durations.filter((v) => v <= 8 - beat + 0.000001).map(String),
    ),
    velocity: choice(
      `Actual strength of this attack at beat ${beat}; vary accents and ghost notes.`,
      ['0.22', '0.38', '0.52', '0.66', '0.8', '0.92'],
    ),
  };
  if (role === 'keys') {
    const texture = plan.texture?.choice ?? 'two_hand_chords';
    for (const hand of ['left', 'right'])
      questions[hand + 'Count'] = choice(
        'How many notes in the ' +
          hand +
          ' hand at this attack? The right hand carries harmony or melody; avoid leaving it silent throughout. The left stays above the bassist.',
        texture === 'single_line'
          ? hand === 'left'
            ? { '0': 'Left hand rests' }
            : { '0': 'Rest', '1': 'One melodic note' }
          : texture === 'split_comp_lead' && hand === 'right'
            ? { '0': 'Rest', '1': 'One melodic note' }
            : {
                '0': 'Let this hand rest or sustain notes already held',
                '1': 'Play a single melodic or bass note',
                '2': 'Play a two-note interval',
                '3': 'Play a three-note chord',
                '4': 'Play a four-note chord',
                '5': 'Use all five fingers for a full chord',
              },
      );
    for (const hand of ['left', 'right'])
      for (let voice = 0; voice < 5; voice++) {
        const active = draft.filter((n) => n.hand === hand && n.beat + n.duration > beat + 0.00001);
        questions[`${hand}${voice}`] = choice(
          `At beat ${beat}, choose exact MIDI pitch for ${hand}-hand voice ${voice + 1}, ordered from lowest to highest. Use rest for spare fingers. ${active.length} notes in this hand are still held. Right voice 1 carries a melody if soloing; other voices should leave it space. Chords are your individual note choices.`,
          active.length + voice >= 5
            ? {
                rest: 'Keep holding or rest',
                ...Object.fromEntries(
                  active.map((n) => [
                    String(n.midi),
                    pitchLabel(n.midi) + '; re-strike this held key',
                  ]),
                ),
              }
            : range(
                hand === 'left' ? 48 : 60,
                hand === 'left' ? 72 : 84,
                false,
                texture !== 'single_line' && !(texture === 'split_comp_lead' && hand === 'right'),
              ),
        );
      }
  } else if (role === 'guitar' && plan.texture?.choice !== 'single_line' && plan.texture?.choice) {
    const positions = { open: 0, low: 3, middle: 7, upper: 12 };
    const fret = positions[plan.position.choice as keyof typeof positions];
    const strings =
      plan.texture.choice === 'double_stops'
        ? plan.stringPair.choice.split('_').map(Number)
        : [0, 1, 2, 3, 4, 5];
    for (const string of strings)
      questions['string' + string] = choice(
        'Choose the exact note or mute on guitar string ' +
          (string + 1) +
          ' for this chord attack at beat ' +
          beat +
          '. Use chord tones, voice lead from your last chord, and mute strings that clutter the mix.',
        range(guitarTuning[string] + fret, guitarTuning[string] + fret + 5, true, true),
      );
    questions.stroke = choice('Choose the direction of this chord attack.', {
      down: 'Low strings to high strings',
      up: 'High strings to low strings',
      together: 'Simultaneous chord hit',
    });
    questions.spread = choice(
      'Time between successive strings in beats; a tight stab differs from a brushed strum.',
      {
        '0': 'Tight together',
        '0.025': 'Quick strum',
        '0.05': 'Relaxed strum',
        '0.09': 'Slow brushed chord',
      },
    );
  } else if (role === 'drums') {
    questions.pitch = choice(
      `Choose the next primary drum hit at beat ${beat}. Build your own groove from the alreadyComposed hits: no backbeat is supplied.`,
      drumPitches,
    );
    questions.cymbal = choice(
      `Choose an optional simultaneous cymbal at beat ${beat}, complementing your primary hit.`,
      { rest: 'No extra cymbal', 42: 'closed hat', 46: 'open hat', 49: 'crash', 51: 'ride' },
    );
    questions.body = choice(
      `Choose an optional simultaneous kick/snare/tom at beat ${beat}. Leave space if the primary hit covers it.`,
      {
        rest: 'No extra body hit',
        36: 'kick',
        38: 'snare',
        45: 'low tom',
        47: 'mid tom',
        50: 'high tom',
      },
    );
  } else {
    const ranges =
      role === 'bass'
        ? { low: [28, 48], middle: [36, 59], high: [48, 67] }
        : { low: [40, 64], middle: [48, 76], high: [60, 88] };
    const [low, high] = ranges[plan.register.choice as keyof typeof ranges];
    const pitches = range(low, high);
    const old = room.frames.at(-1)?.parts.find((p) => p.role === role);
    // Keep the opening anchor, but ask for one fresh answer after three identical own compositions.
    // The alternate pitch remains a real model choice inside the current musical palette.
    if ((old?.performance?.motifAge ?? 0) >= 2 && attack === 1 && Object.keys(pitches).length > 1)
      delete pitches[String(old?.notes[1]?.midi) as keyof typeof pitches];
    questions.pitch = choice(
      `Compose your NEXT actual note at beat ${beat}, after the notes in alreadyComposed. Sing the contour in your plan: step, leap, answer, sustain or rest. Reuse recognizable anchors from grooveMemory while developing a melodic thought. Avoid aimless arpeggios; a long chord-tone arrival can resolve a short run. This note becomes context for the very next decision.`,
      pitches,
    );
  }
  if (role !== 'drums')
    questions.articulation = choice(
      `Articulation of this actual attack at beat ${beat}.`,
      articulations,
    );
  if (role === 'guitar' && (!plan.texture || plan.texture.choice === 'single_line'))
    questions.bend = choice(
      `Bend amount in semitones for this note at beat ${beat}. Zero means no bend.`,
      ['-2', '-1', '0', '1', '2'],
    );
  return {
    model,
    state: {
      ...context(role, room, phrase),
      plan: Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, v.choice])),
      alreadyComposed: draft,
      nextAttackBeat: beat,
      attackIndex: attack,
      remainingAttacks: Number(plan.attacks.choice) - attack,
      phraseBeats: 8,
      task: 'Compose one musical attack, then see it before the next. Make the chosen STYLE and ARC audible. A groove needs repeated rhythmic anchors, consonant targets and a little space. Reuse useful parts of your own grooveMemory; change a detail rather than every note. In release, arrive at the chosen chord and soften. In solo, use a singable contour with short runs leading to long targets, not permanent tension. In chord modes, make rhythmic chordal playing. Every sounded pitch is your choice; no automatic accompaniment is added.',
    },
    questions,
  };
}

export function readEvents(
  role: Musician,
  trace: Trace,
  beat: number,
  d: Decision,
  prior: Note[],
): Note[] {
  let notes = prior.map((n) => ({ ...n }));
  const a = (field: string) => (trace.appliedAnswers ?? trace.answers)[field]?.choice;
  if (a('sound') === 'rest') return notes;
  const voices =
    role === 'keys'
      ? ['left', 'right'].flatMap((hand) => Array.from({ length: 5 }, (_, i) => `${hand}${i}`))
      : role === 'guitar' && Object.keys(trace.answers).some((key) => key.startsWith('string'))
        ? Object.keys(trace.answers)
            .filter((key) => /^string\d$/.test(key))
            .sort((left, right) =>
              a('stroke') === 'up' ? right.localeCompare(left) : left.localeCompare(right),
            )
        : role === 'drums'
          ? ['pitch', 'cymbal', 'body']
          : ['pitch'];
  for (const slot of voices) {
    if (a(slot) === 'rest') continue;
    const hand = slot.startsWith('left') ? 'left' : slot.startsWith('right') ? 'right' : undefined;
    if (hand && Number(slot.slice(hand.length)) >= Number(a(hand + 'Count'))) continue;
    const string = slot.startsWith('string') ? Number(slot.slice(6)) : undefined;
    const onset =
      beat +
      (string !== undefined && a('stroke') !== 'together'
        ? voices.indexOf(slot) * Number(a('spread') ?? 0)
        : 0);
    if (onset >= 8) continue;
    const note: Note = {
      midi: Number(a(slot)),
      beat: onset,
      duration: Math.min(Number(a('duration')), 8 - onset),
      velocity: Number(a('velocity')),
      ...(role !== 'drums' ? { articulation: a('articulation') as Note['articulation'] } : {}),
      ...(role === 'guitar' ? { bend: Number(a('bend') ?? 0) } : {}),
      ...(string !== undefined ? { string } : {}),
      ...(hand ? { hand, patch: d[hand] } : {}),
      provenance: { traceId: trace.id, slot },
    };
    if (
      notes.some(
        (n) =>
          n.midi === note.midi &&
          n.hand === note.hand &&
          n.string === note.string &&
          Math.abs(n.beat - onset) < 0.00001,
      )
    )
      continue;
    // A re-struck key or string releases its previous held voice; it does not require another finger.
    const adjusted = notes.map((n) =>
      n.beat < onset &&
      n.beat + n.duration > onset &&
      (string !== undefined
        ? n.string === string
        : hand
          ? n.hand === hand && n.midi === note.midi
          : false)
        ? { ...n, duration: onset - n.beat }
        : n,
    );
    try {
      validateNotes([...adjusted, note], role);
      notes = [...adjusted, note];
    } catch {
      trace.error = [trace.error, `Omitted ${slot}: instrument or timing constraint`]
        .filter(Boolean)
        .join('; ');
    }
  }
  return notes.sort((a, b) => a.beat - b.beat || a.midi - b.midi);
}

// Creative decisions use the model's own distribution, not uniform random notes. Preserve
// raw provider answers and the applied selections separately for honest, reproducible traces.
export function applyPerformanceChoices(trace: Trace, rng: () => number): void {
  trace.appliedAnswers = structuredClone(trace.answers);
  trace.selectionMethod = 'seeded-model-distribution';
  const voiced = { left: new Set<string>(), right: new Set<string>() };
  for (const [key, answer] of Object.entries(trace.appliedAnswers)) {
    if (
      !/^(pitch|left\d|right\d|string\d|advance|duration|velocity|articulation|bend|cymbal|body)$/.test(
        key,
      )
    )
      continue;
    const arc = (trace.request.state as { plan?: { arc?: string } })?.plan?.arc;
    const steady = arc === 'settle' || arc === 'release';
    if (steady && key === 'advance') continue;
    const hand = /^(left|right)\d$/.exec(key)?.[1] as 'left' | 'right' | undefined;
    const occupied = hand ? voiced[hand] : new Set<string>();
    const duplicate = occupied.has(answer.choice);
    const ranked = Object.entries(answer.probabilities)
      .filter(([pitch, p]) => p > 0 && !occupied.has(pitch))
      .sort((a, b) => b[1] - a[1]);
    if (!ranked.length || (ranked[0][1] >= 0.85 && !duplicate)) {
      if (answer.choice !== 'rest') occupied.add(answer.choice);
      continue;
    }
    const candidates: [string, number][] = [];
    let mass = 0;
    for (const item of ranked) {
      candidates.push([item[0], Math.pow(item[1], 1 / (steady ? 0.35 : 0.7))]);
      mass += item[1];
      if (mass >= 0.85) break;
    }
    let draw = rng() * candidates.reduce((sum, [, p]) => sum + p, 0);
    for (const [value, p] of candidates) {
      draw -= p;
      if (draw <= 0) {
        answer.choice = value;
        if (value !== trace.answers[key].choice) delete answer.confidence;
        break;
      }
    }
    if (answer.choice !== 'rest') occupied.add(answer.choice);
  }
}

export async function composePhrase(
  role: Musician,
  room: Snapshot,
  phrase: number,
  model: string,
  decide: Decide,
): Promise<Part> {
  const previous = room.frames.at(-1)?.parts.find((p) => p.role === role);
  const plan = await decide(phrasePlanRequest(role, room, phrase, model));
  if (plan.source !== 'jev') throw new Error('Phrase plan unavailable');
  const rig = await decide(rigRequest(model, context(role, room, phrase), plan.answers));
  if (rig.source !== 'jev') throw new Error('Rig decisions unavailable');
  const d = toDecision({ ...plan.answers, ...rig.answers });
  d.degrees = [];
  d.development = plan.answers.intent.choice === 'new_theme' ? 'new_theme' : 'answer';
  const performance: Performance = {
    style: plan.answers.style.choice as Performance['style'],
    arc: plan.answers.arc.choice as Performance['arc'],
    palette: plan.answers.palette.choice as Performance['palette'],
    chord: plan.answers.chord.choice as Performance['chord'],
    texture: plan.answers.texture?.choice ?? 'groove',
    tensionPhrases: ['build', 'peak'].includes(plan.answers.arc.choice)
      ? (previous?.performance?.tensionPhrases ?? 0) + 1
      : 0,
    motifAge: d.action === 'hold' ? (previous?.performance?.motifAge ?? 0) + 1 : 0,
    timbres: [plan.answers.timbreBar1.choice, plan.answers.timbreBar2.choice],
  };
  const remember = (part: Part) => {
    const fingerprint = (notes: Note[]) =>
      JSON.stringify(notes.map(({ provenance: _provenance, ...note }) => note));
    part.performance!.motifAge =
      previous && fingerprint(part.notes) === fingerprint(previous.notes)
        ? (previous.performance?.motifAge ?? 0) + 1
        : 0;
    return part;
  };
  const part: Part = {
    role,
    decision: d,
    solo:
      d.action === 'solo' || (['vary', 'develop', 'hold'].includes(d.action) && !!previous?.solo),
    repeated: 0,
    notes: [],
    source: 'jev',
    phraseFormat: 'events-v1',
    tonalIntent: { root: Number(plan.answers.root.choice), mode: plan.answers.mode.choice },
    performance,
    effectsTimeline: [0, 4].map((beat) => ({
      beat,
      effects: Object.fromEntries(
        fxNames.map((effect) => [
          effect,
          rig.answers[beat === 0 ? effect : effect + 'Bar2'].choice === 'on',
        ]),
      ) as Decision['effects'],
      traceId: rig.id,
    })),
  };
  if (d.action === 'rest') return remember(part);
  if (d.action === 'hold' && previous)
    return remember({
      ...part,
      notes: structuredClone(previous.notes),
      repeated: previous.repeated + 1,
    });
  if (role === 'drums') {
    for (let start = 0; start < 8; start += Math.min(4, 16 / Number(plan.answers.pulse.choice))) {
      const trace = await decide(
        drumRequest(model, context(role, room, phrase), plan.answers, start, part.notes),
      );
      if (trace.source !== 'jev') throw new Error('Drum decisions unavailable');
      part.notes = readDrums(trace, plan.answers, start, part.notes);
    }
    return remember(part);
  }
  let beat = Number(plan.answers.entry.choice);
  const rng = random(room.seed + phrase * 197 + hash(role));
  const attacks = Math.min(maxAttacks, Number(plan.answers.attacks.choice));
  for (let attack = 0; attack < attacks && beat < 7.9999; attack++) {
    const events = await decide(
      eventRequest(role, room, phrase, model, plan.answers, beat, part.notes, attack),
    );
    if (events.source !== 'jev') throw new Error('Note decisions unavailable');
    applyPerformanceChoices(events, rng);
    part.notes = readEvents(role, events, beat, d, part.notes);
    beat = Math.round((beat + Number(events.appliedAnswers!.advance.choice)) * 1e6) / 1e6;
    // The remaining phrase is silence if all twelve attack slots were used early.
    if (8 - beat < 0.12499) break;
  }
  validateNotes(part.notes, role);
  return remember(part);
}
