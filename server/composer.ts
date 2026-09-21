import {
  actions,
  articulations,
  fxNames,
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
  scaleIntervals,
  modeLibrary,
  volumes,
  keyMoves,
  drumFeels,
  type Performance,
} from '../shared/performance.js';
import { availableMoves, composeDrums } from './groove.js';
import { rigRequest, timbresFor } from './rig.js';
import { continuingSolo, continuingPhrase, soloPlanRequest, sampleSoloLength } from './solo.js';
import {
  applyHeat,
  fatigue,
  heatedFields,
  sampleWithHeat,
  nextStaleness,
  noveltyPressure,
  rememberChoices,
} from './heat.js';
import { sketchAt } from '../shared/sketch.js';
import {
  applyCellChoices,
  cellRequest,
  gestureName,
  maxCells,
  readCell,
  type Gesture,
} from './lead.js';

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
  // Musical time belongs to the current song, not to the whole night.
  const elapsed = Math.max(0, (Date.now() - (room.themeStartedAt ?? room.startedAt)) / 1000);
  return {
    persona: personas[role],
    phrase,
    elapsedSeconds: Math.round(elapsed),
    seedPrompt: phrase < 4 ? room.prompt : undefined,
    endingPressure: endingPressure(elapsed),
    lastPhraseBeforeHardStop: room.endsAt > 0 && room.endsAt - Date.now() < 14000,
    ...fitContext(musicalContext(room, role)),
    exploration: exploration(role, room),
  };
}
// The decisions endpoint rejects very large bodies. Dense drum parts repeated across four heard
// frames and several private memories can exceed it, so the oldest hearing is dropped first.
function fitContext<T extends ReturnType<typeof musicalContext>>(state: T): T {
  const fitted = {
    ...state,
    recent: [...state.recent],
    ownDirection: state.ownDirection
      ? { ...state.ownDirection, recentChoices: undefined, phraseMotif: undefined }
      : state.ownDirection,
  };
  while (fitted.recent.length > 1 && JSON.stringify(fitted).length > 40000) fitted.recent.shift();
  return fitted;
}
function exploration(role: Musician, room: Snapshot) {
  const own = room.frames.at(-1)?.parts.find((p) => p.role === role);
  const pressure = noveltyPressure(own, room);
  return {
    pressure,
    unchangedChunks: own?.performance?.staleChunks ?? 0,
    guidance:
      pressure < 0.4
        ? 'The idea is young. Let it settle and groove.'
        : pressure < 0.7
          ? 'Your direction has held for a while. Change one real dimension: register, texture, rhythm density, harmonic color or arc.'
          : 'This has looped long enough. Take the music somewhere new: a different style branch, register, texture, mode color or a new theme. Bold departures are welcome now; the band will follow.',
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
  const soloContinues = continuingSolo(own);
  const phraseContinues = continuingPhrase(own);
  const invitedSolo = room.soloInvitation?.role === role && room.soloInvitation.required;
  const entryDue =
    role === 'keys' && (!own?.performance?.hasPlayed || (own.performance.silentTurns ?? 0) >= 2);
  const questions: Record<string, ChoiceQuestion> = {
    phraseBars: choice(
      'Choose the length of this whole musical idea, in bars. Two bars is a compact riff; four to eight allow question/answer and development; twelve allow a longer journey. These are fresh connected sections, not repeating one two-bar loop. Choose from the mood and use varied lengths.',
      phraseContinues ? [String(own!.performance!.phraseBars)] : ['2', '4', '6', '8', '12'],
    ),
    style: choice(
      'Choose a stylistic branch for your phrase. When sharedChart moves to a new section, introduce your instrument-specific instruction and style through a small audible change while responding to performed peers. Between transitions, develop the current feel. Start from the sonic concept, then let heard music and the loose shared chart guide the journey.',
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
      'Compose your next two-bar phrase. Solo enters a dedicated 8–32-bar melodic composition with fresh phrases every two bars. Attend to soloInvitation urgency: the audience needs a proper featured melody, not endless support. A continuing committed solo must develop until its chosen length is complete. Support ends a finished solo; space is sparse; rest is silence. Hold explicitly repeats accompaniment, never a solo.',
      invitedSolo
        ? ['solo']
        : soloContinues || phraseContinues
          ? ['develop', 'vary']
          : actions.filter(
              (a) =>
                (!entryDue || !['rest', 'hold'].includes(a)) &&
                !(own?.solo && a === 'hold') &&
                (a !== 'hold' || (own && !releaseDue && (own.performance?.motifAge ?? 0) < 3)),
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
      'Your own scale color. Usually share the band mode in bandKey. The rarer modes of melodic and harmonic minor are special colors for a deliberate excursion; you may differ from peers tastefully.',
      Object.fromEntries(Object.entries(modeLibrary).map(([name, m]) => [name, m.color])),
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
    volume: choice(
      'How loud do you play this phrase? A band breathes together: come down when bandDynamics is quiet, swell with a build, drop to a whisper to make the next peak matter. Do not sit at one level all night.',
      Object.fromEntries(Object.entries(volumes).map(([name, v]) => [name, v.color])),
    ),
    keyMove: choice(
      'Do you lead the band to a new key or mode right now? Bandmates will hear it and should follow. Most phrases stay; a move is a big moment that refreshes a long jam.',
      room.keyLeadOpen && role !== 'drums' && !phraseContinues && !soloContinues
        ? keyMoves
        : { stay: keyMoves.stay },
    ),
    density: choice('How much space does the next phrase need? Silence matters.', [
      'low',
      'medium',
      'high',
    ]),
    tempo: choice(
      role === 'drums'
        ? 'You own the time. Push or ease the tempo and the band follows you by a few percent; stay when the pocket feels right.'
        : 'Suggest a small shared tempo change responding to heard music. The drummer leads tempo; follow what you hear.',
      ['ease', 'stay', 'push'],
    ),
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
    questions.feel = choice(
      'Choose the groove feel you will realize with your own hits. Changing feel is how a drummer moves the whole band: they hear it and respond. Keep a feel while it serves; change it when the jam needs a new chapter.',
      drumFeels,
    );
    questions.move = choice(
      'What do you do with your groove this phrase? The groove is the theme. Most phrases keep it or vary one limb; a fill, drop or build marks a moment and then the groove returns; changing the subdivision or writing a new groove is a new chapter. Vary your moves: do not do the same kind of thing every time.',
      availableMoves(own, !!room.windDown),
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
      timbresFor(role),
    );
  const retired = room.windDown ? {} : fatigue(own, room, phrase, questions);
  if (room.windDown) {
    // A new song is waiting. The only question is how this one ends.
    const left = room.windDown.framesIn;
    const only = (key: string, values: Record<string, string>) => {
      if (questions[key]) questions[key] = choice(questions[key].instructions, values);
    };
    only(
      'action',
      left >= 4
        ? { rest: 'Stop. Your part in this song is over' }
        : {
            resolve:
              'Play a final landing: home chord tones, slower, softer, with a clear last note',
            ...(left < 2 ? { space: 'Thin out to a few long tones on the way to stopping' } : {}),
            // Everyone plays the first closing phrase together; dropping out comes after it.
            ...(left >= 1
              ? { rest: 'Stop now and let the others finish. Once you stop you stay silent' }
              : {}),
          },
    );
    only('arc', { release: arcs.release, space: arcs.space });
    only('phraseBars', { '2': 'These two bars' });
    only('keyMove', { stay: keyMoves.stay });
    only('tempo', {
      ease: 'Let the time relax into the ending',
      stay: 'Hold the tempo to the end',
    });
    only('intent', {
      release_tension: 'Resolve what is unresolved',
      thin_out: 'Remove notes until nothing is left',
      sustain_texture: 'Let a last sound ring out',
    });
    only(
      'volume',
      Object.fromEntries(
        (['whisper', 'soft', 'warm'] as const).map((name) => [name, volumes[name].color]),
      ),
    );
    only('density', { low: 'Few notes' });
    if (questions.move) only('move', availableMoves(own, true));
  }
  if (phraseContinues && !invitedSolo) {
    // Continue an established idea; new notes and rhythm do not require a new theme.
    // A bandmate's key change outranks a private commitment: follow it mid-phrase.
    const followKey =
      !!room.keyChange &&
      room.keyChange.by !== role &&
      own!.tonalIntent?.root !== room.keyChange.root;
    for (const [key, value] of Object.entries({
      style: own!.performance!.style,
      ...(followKey
        ? {}
        : {
            root: String(own!.tonalIntent?.root ?? room.initialRoot ?? 2),
            mode: own!.tonalIntent?.mode ?? room.initialMode ?? 'dorian',
          }),
    }))
      questions[key] = choice(
        `Continue your committed musical phrase: retain its ${key} while developing fresh notes.`,
        [value],
      );
    delete questions.intent.criteria.new_theme;
  }
  return {
    model,
    state: {
      ...context(role, room, phrase),
      restingChoices: Object.keys(retired).length ? retired : undefined,
      ending: room.windDown
        ? 'The band is bringing this song to a natural close. Land it together: simplify, soften, arrive home and stop. Players drop out one by one. When you stop, stay stopped. Do not start new ideas.'
        : undefined,
      task:
        'You compose actual note events after this plan. There is no lick catalog. ' +
        (noveltyPressure(own, room) < 0.55
          ? 'First make a groove worth keeping. Preserve recognizable rhythmic anchors; vary a detail, answer a peer, or resolve a previous tension. Novelty is not a demand to change every note.'
          : 'The groove is established and has held for a while: follow exploration.guidance and move the jam forward. Keep one anchor the listener can recognize while you change direction.') +
        ' Only you can introduce a new theme at this boundary; peers retain their performed parts. Your own previous musical direction is private memory.',
    },
    questions,
  };
}

/**
 * A restless player may lead the band somewhere new. The move is Jev's heated keyMove answer;
 * the harness only does the interval arithmetic and rewrites the player's own root and mode.
 */
function leadKey(room: Snapshot, answers: Record<string, Answer>, rng: () => number) {
  const move = answers.keyMove?.choice ?? 'stay';
  if (move === 'stay') return undefined;
  const frame = room.frames.at(-1);
  const root = frame?.root ?? room.initialRoot ?? 2;
  const mode = frame?.modeName ?? frame?.mode ?? room.initialMode ?? 'dorian';
  const minorish = !scaleIntervals(mode).includes(4);
  const shift = { up_fourth: 5, up_fifth: 7, up_step: 2, down_step: 10, new_mode: 0 }[move];
  const next = (root + (shift ?? (minorish ? 3 : 9))) % 12;
  let nextMode = move === 'relative' ? (minorish ? 'major' : 'minor') : mode;
  if (move === 'new_mode') {
    const options = { ...answers.mode.probabilities, [mode]: 0 };
    nextMode = sampleWithHeat({ ...answers.mode, probabilities: options }, 0.85, rng);
    if (nextMode === mode) return undefined;
  }
  const certain = (value: string) => ({ choice: value, probabilities: { [value]: 1 } });
  answers.root = certain(String(next));
  answers.mode = certain(nextMode);
  return { root: next, mode: nextMode, move };
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
  const tonalScale = scaleIntervals(plan.mode.choice);
  const root = Number(plan.root.choice);
  const own = room.frames.at(-1)?.parts.find((p) => p.role === role);
  const soloMode = !!plan.soloBars;
  const phraseContinues = continuingPhrase(own);
  const entryDue =
    role === 'keys' &&
    attack === 0 &&
    (!own?.performance?.hasPlayed || (own.performance.silentTurns ?? 0) >= 2);
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
      entryDue || soloMode
        ? { play: 'Enter audibly now; choose your actual notes' }
        : { play: 'Sound notes now', rest: 'Rest and advance time without notes' },
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
    if (entryDue || soloMode) delete questions.rightCount.criteria['0'];
    // A comping texture needs an audible left hand. When nothing is ringing there and it has
    // been silent for two beats, resting is not offered; Jev still chooses every pitch.
    const leftNotes = draft.filter((n) => n.hand === 'left');
    const leftIdle =
      !leftNotes.some((n) => n.beat + n.duration > beat + 0.00001) &&
      (attack === 0 || beat - Math.max(0, ...leftNotes.map((n) => n.beat + n.duration)) >= 2);
    if (texture !== 'single_line' && leftIdle) delete questions.leftCount.criteria['0'];
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
  if (soloMode) {
    const remaining = Number(plan.attacks.choice) - attack - 1;
    const middle = attack === Math.floor(Number(plan.attacks.choice) / 2) - 1;
    const minimum = Math.max(0.125, remaining === 1 ? 6.5 - beat : middle ? 3.5 - beat : 0.125);
    const maximum = remaining > 0 ? 7.75 - beat - (remaining - 1) * 0.125 : 8 - beat;
    const intervals = [...new Set([...durations, Number(minimum.toFixed(6))])].filter(
      (v) => v >= minimum - 0.00001 && v <= maximum + 0.00001,
    );
    if (remaining > 0)
      questions.advance.criteria = Object.fromEntries(
        intervals.map((v) => [
          String(v),
          `Next attack after ${v} beats; leave room for the full melodic phrase`,
        ]),
      );
    const melody = questions[role === 'keys' ? 'right0' : 'pitch'];
    const oldMelody = own?.notes.filter((n) => role !== 'keys' || n.hand === 'right') ?? [];
    // Preserve recognizable anchors, but new solo statements cannot repeat the old groove.
    if (melody && [0, 2, 4].includes(attack) && Object.keys(melody.criteria).length > 2)
      delete melody.criteria[String(oldMelody[attack]?.midi)];
    if (melody && Object.keys(melody.criteria).length > 2 && draft.length)
      delete melody.criteria[
        String(draft.filter((n) => role !== 'keys' || n.hand === 'right').at(-1)?.midi)
      ];
    if (
      attack === 1 &&
      Object.keys(questions.advance.criteria).length > 1 &&
      oldMelody.length > 2
    ) {
      const oldInterval = Number((oldMelody[2].beat - oldMelody[1].beat).toFixed(6));
      delete questions.advance.criteria[String(oldInterval)];
    }
    const melodyDraft = draft.filter((n) => role !== 'keys' || n.hand === 'right');
    if (melodyDraft.length >= 3 && Object.keys(questions.advance.criteria).length > 1) {
      const latest = melodyDraft.slice(-3);
      const a = Number((latest[1].beat - latest[0].beat).toFixed(6));
      const b = Number((latest[2].beat - latest[1].beat).toFixed(6));
      if (a === b) delete questions.advance.criteria[String(a)];
    }
  }
  if (phraseContinues && !soloMode && [1, 3].includes(attack)) {
    const melody = questions[role === 'keys' ? 'right0' : 'pitch'];
    const previousMelody = own?.notes.filter((n) => role !== 'keys' || n.hand === 'right') ?? [];
    if (melody && Object.keys(melody.criteria).length > 2)
      delete melody.criteria[String(previousMelody[attack]?.midi)];
  }
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
export function applyPerformanceChoices(trace: Trace, rng: () => number, pressure = 0): void {
  trace.appliedAnswers = structuredClone(trace.answers);
  trace.selectionMethod = 'seeded-model-distribution';
  trace.heat = pressure;
  const voiced = { left: new Set<string>(), right: new Set<string>() };
  // Five ways of playing must not lose to one way of resting. When the combined probability
  // of playing exceeds resting, the hand plays and the voice count comes from Jev's own
  // distribution over the playing options.
  for (const hand of ['left', 'right']) {
    const count = trace.appliedAnswers[hand + 'Count'];
    if (!count || count.choice !== '0') continue;
    const playing = Object.entries(count.probabilities).filter(([k, p]) => k !== '0' && p > 0);
    const mass = playing.reduce((sum, [, p]) => sum + p, 0);
    if (mass <= (count.probabilities['0'] ?? 0)) continue;
    let draw = rng() * mass;
    for (const [value, p] of playing) {
      draw -= p;
      if (draw <= 0 || value === playing.at(-1)![0]) {
        count.choice = value;
        delete count.confidence;
        break;
      }
    }
  }
  for (const [key, answer] of Object.entries(trace.appliedAnswers)) {
    if (
      !/^(pitch|left\d|right\d|string\d|advance|duration|velocity|articulation|bend|cymbal|body)$/.test(
        key,
      )
    )
      continue;
    const arc = (trace.request.state as { plan?: { arc?: string } })?.plan?.arc;
    const steady = arc === 'settle' || arc === 'release';
    if (steady && key === 'advance' && pressure < 0.5) continue;
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
      candidates.push([item[0], Math.pow(item[1], 1 / ((steady ? 0.35 : 0.7) + 0.5 * pressure))]);
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
  const rawPlan = await decide(phrasePlanRequest(role, room, phrase, model));
  if (rawPlan.source !== 'jev') throw new Error('Phrase plan unavailable');
  const pressure = noveltyPressure(previous, room);
  const heatRng = random(room.seed + phrase * 389 + hash(role));
  const plan = {
    ...rawPlan,
    answers: applyHeat(rawPlan, pressure, heatRng, previous?.performance?.recentChoices, [
      ...heatedFields,
      ...(role === 'drums' ? ['tempo'] : []),
    ]),
  };
  const keyLead = leadKey(room, plan.answers, heatRng);
  if (!continuingPhrase(previous)) {
    const lengthTrace = { ...rawPlan, answers: { bars: rawPlan.answers.phraseBars } };
    const length = sampleSoloLength(lengthTrace, random(room.seed + phrase * 271 + hash(role)));
    rawPlan.appliedAnswers = { ...plan.answers, phraseBars: lengthTrace.appliedAnswers!.bars };
    plan.answers = structuredClone(rawPlan.appliedAnswers);
    plan.answers.phraseBars = { ...lengthTrace.appliedAnswers!.bars, choice: String(length) };
  }
  const soloMode =
    (role === 'guitar' || role === 'keys') &&
    (plan.answers.action.choice === 'solo' || continuingSolo(previous));
  let soloBars: number | undefined;
  const ready = room.soloSketches?.[role];
  const sketch = soloMode
    ? sketchAt(
        ready?.status === 'ready' ? ready.sketch : undefined,
        continuingSolo(previous) ? (previous!.performance!.soloPhrases ?? 0) : 0,
      )
    : undefined;
  if (soloMode) {
    const solo = await decide(
      soloPlanRequest(role, room, model, plan.answers, {
        ...context(role, room, phrase),
        arrangerSketch: sketch,
      }),
    );
    if (solo.source !== 'jev') throw new Error('Solo plan unavailable');
    soloBars = sampleSoloLength(solo, random(room.seed + phrase * 313 + hash(role)));
    applyHeat(solo, Math.max(pressure, 0.5), heatRng, previous?.performance?.recentChoices, [
      'opening',
      'energy',
      'register',
      'contour',
      'texture',
    ]);
    Object.assign(plan.answers, solo.appliedAnswers);
    plan.answers.soloBars = solo.appliedAnswers!.bars;
  }
  // Rig and note decisions share the accepted direction but do not depend on each
  // other. Let them compose concurrently, then accept both atomically.
  const rigPending = decide(
    rigRequest(role, model, context(role, room, phrase), plan.answers),
  ).catch(() => null);
  try {
    const d = toDecision(plan.answers);
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
      soloBars,
      soloPhrases: soloMode
        ? (continuingSolo(previous) ? (previous!.performance!.soloPhrases ?? 0) : 0) + 1
        : 0,
      soloStage: soloMode
        ? continuingSolo(previous)
          ? 'Developing the melody'
          : 'New melodic statement'
        : undefined,
      phraseBars: soloMode ? soloBars : Number(plan.answers.phraseBars.choice),
      phraseChunks: (soloMode ? continuingSolo(previous) : continuingPhrase(previous))
        ? (previous?.performance?.phraseChunks ?? 0) + 1
        : 1,
      phraseMotif: (soloMode ? continuingSolo(previous) : continuingPhrase(previous))
        ? previous?.performance?.phraseMotif
        : undefined,
      register: plan.answers.register.choice,
      contour: plan.answers.contour.choice,
      attacks: plan.answers.attacks.choice,
      staleChunks: nextStaleness(previous, plan.answers),
      heat: pressure,
      recentChoices: rememberChoices(previous, plan.answers),
      soloEnergy: soloMode ? plan.answers.energy?.choice : undefined,
      volume: plan.answers.volume.choice as Performance['volume'],
      feel: plan.answers.feel?.choice,
      keyLead,
    };
    const remember = async (part: Part) => {
      const rig = await rigPending;
      if (!rig || rig.source !== 'jev') throw new Error('Rig decisions unavailable');
      part.effectsTimeline = [0, 4].map((beat) => ({
        ...(role === 'guitar'
          ? {
              driveLevel: rig.answers[beat === 0 ? 'driveLevel' : 'driveLevelBar2']?.choice as
                'overdrive' | 'lead',
            }
          : {}),
        beat,
        effects: Object.fromEntries(
          fxNames.map((effect) => [
            effect,
            rig.answers[beat === 0 ? effect : effect + 'Bar2'].choice === 'on',
          ]),
        ) as Decision['effects'],
        traceId: rig.id,
      }));
      part.decision.effects = part.effectsTimeline[0].effects;
      const fingerprint = (notes: Note[]) =>
        JSON.stringify(notes.map(({ provenance: _provenance, ...note }) => note));
      part.performance!.motifAge =
        previous && fingerprint(part.notes) === fingerprint(previous.notes)
          ? (previous.performance?.motifAge ?? 0) + 1
          : 0;
      part.performance!.hasPlayed = !!part.notes.length || !!previous?.performance?.hasPlayed;
      part.performance!.phraseMotif ??= part.notes
        .slice(0, 16)
        .map(({ midi, beat, duration }) => ({ midi, beat, duration }));
      part.performance!.silentTurns = part.notes.length
        ? 0
        : (previous?.performance?.silentTurns ?? 0) + 1;
      return part;
    };
    const part: Part = {
      role,
      decision: d,
      solo:
        role === 'guitar' || role === 'keys'
          ? soloMode
          : // A bass or drum feature lasts for the phrase that asked for it.
            d.action === 'solo',
      repeated: 0,
      notes: [],
      source: 'jev',
      phraseFormat: 'events-v1',
      tonalIntent: { root: Number(plan.answers.root.choice), mode: plan.answers.mode.choice },
      performance,
    };
    if (d.action === 'rest') return remember(part);
    if (role === 'drums') {
      // Holding is the keep move: it returns to the groove, never to a fill that was a moment.
      if (d.action === 'hold' && previous)
        plan.answers.move = { ...plan.answers.move, choice: 'keep' };
      const drums = await composeDrums(
        model,
        context(role, room, phrase),
        plan.answers,
        previous,
        decide,
        random(room.seed + phrase * 211 + hash(role)),
      );
      part.notes = drums.notes;
      part.upNext = drums.upNext;
      Object.assign(performance, {
        drumPulse: drums.pulse,
        drumSwing: drums.swing,
        drumMove: drums.move,
        grooveAge: drums.grooveAge,
        pendingLanding: drums.landing,
        // The feel bandmates hear only changes when the groove itself was rewritten.
        feel: ['new_groove', 'change_subdivision'].includes(drums.move)
          ? plan.answers.feel?.choice
          : (previous?.performance?.feel ?? plan.answers.feel?.choice),
      });
      return remember(part);
    }
    if (d.action === 'hold' && previous)
      return remember({
        ...part,
        notes: structuredClone(previous.notes),
        repeated: previous.repeated + 1,
      });
    let beat = Number(plan.answers.entry.choice);
    const rng = random(room.seed + phrase * 197 + hash(role));
    if (soloMode) {
      // Lead playing: each request writes a whole gesture, so runs, bends and breaths are affordable.
      const recent: Record<string, string[]> = {
        next: (previous?.performance?.leadKinds ?? []).slice(-2),
      };
      const gestures: string[] = [];
      const kinds: Gesture[] = [];
      let gesture =
        (continuingSolo(previous) && previous?.performance?.nextGesture) ||
        (plan.answers.opening.choice as Gesture);
      for (let cell = 0; cell < maxCells && beat < 7.25; cell++) {
        const trace = await decide(
          cellRequest(
            role,
            model,
            context(role, room, phrase),
            plan.answers,
            beat,
            part.notes,
            cell,
            previous,
            sketch,
            gesture,
          ),
        );
        if (trace.source !== 'jev') throw new Error('Lead decisions unavailable');
        gestures.push(
          gestureName(applyCellChoices(trace, plan.answers.energy?.choice, rng, recent)),
        );
        const result = readCell(role, trace, plan.answers, beat, part.notes, d);
        validateNotes(result.notes, role);
        part.notes = result.notes;
        beat = result.next;
        kinds.push(gesture);
        gesture = trace.appliedAnswers!.next.choice as Gesture;
      }
      performance.leadGestures = gestures;
      performance.leadKinds = kinds;
      performance.nextGesture = gesture;
      return remember(part);
    }
    const attacks = Math.min(maxAttacks, Number(plan.answers.attacks.choice));
    for (let attack = 0; attack < attacks && beat < 7.9999; attack++) {
      const events = await decide(
        eventRequest(role, room, phrase, model, plan.answers, beat, part.notes, attack),
      );
      if (events.source !== 'jev') throw new Error('Note decisions unavailable');
      applyPerformanceChoices(events, rng, pressure);
      if (soloMode)
        for (const note of part.notes) {
          if (
            (role !== 'keys' || note.hand === 'right') &&
            note.beat < beat &&
            note.beat + note.duration > beat
          )
            note.duration = beat - note.beat;
        }
      part.notes = readEvents(role, events, beat, d, part.notes);
      beat = Math.round((beat + Number(events.appliedAnswers!.advance.choice)) * 1e6) / 1e6;
      // The remaining phrase is silence if all twelve attack slots were used early.
      if (8 - beat < 0.12499) break;
    }
    validateNotes(part.notes, role);
    return remember(part);
  } finally {
    // Account for every started request even when a note call rejects the chunk.
    await rigPending;
  }
}
