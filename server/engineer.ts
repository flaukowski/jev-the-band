import { choice } from './jev.js';
import { listeningState } from './listening.js';
import {
  decisionPersonas,
  musicians,
  clamp,
  type JevRequest,
  type Snapshot,
  type Trace,
} from '../shared/music.js';
import { type EngineerMix, type ChannelLevels } from '../shared/engineer.js';
import { audienceMoodDescriptions, readAudienceDirection } from '../shared/audience.js';

export function engineerRequest(
  room: Snapshot,
  mix: EngineerMix,
  levels: ChannelLevels,
  at: number,
  model: string,
): JevRequest {
  const heard = room.frames.filter((f) => f.at <= Date.now() - 180).at(-1);
  return {
    model,
    state: {
      persona: decisionPersonas.engineer,
      currentMix: mix,
      measuredAt: at,
      measuredLevels: levels,
      measurementBasis:
        'Reference browser actual Web Audio channel RMS/peak, after instrument effects and channel compression, before band balance trims and listener faders/mutes/solos/master. Read measured + current trim for delivered balance. Local effect colors may be present. These are measurements, not score estimates.',
      heard: listeningState(room, 'lights').recent,
      foreground: heard?.parts.filter((p) => p.solo).map((p) => p.role) ?? [],
      task: 'Mix a real jam gently. Keep kick/bass foundation, intelligible keys and lead space. Preserve purposeful dynamics; do not equalize every player to identical loudness. Never chase silence or pump with each note. Make at most one dB per-channel adjustment at this update. Use modest global ambience and glue compression; instrument pedals already provide color.',
    },
    questions: {
      audienceMood: choice(
        'Choose a restrained audience response to music ALREADY heard. Listening or grooving usually; applause/cheering only for an audible payoff, quiet for intimate passages. This controls sample/procedural audience playback, never a real audience.',
        audienceMoodDescriptions,
      ),
      audienceDb: choice(
        'Absolute audience bus attenuation after calibrated audio. Keep it behind the band, lower it during solos or delicate music.',
        ['-48', '-36', '-30', '-24', '-20', '-16'],
      ),
      ...Object.fromEntries(
        musicians.map((r) => [
          r,
          choice(
            `Adjust ${r} balance by dB relative to its current trim. Inactive channels below -55 dB RMS must stay. Lead lines may stand out; drums and bass should retain a foundation.`,
            { '-1': 'Gently lower by 1 dB', '0': 'Keep this level', '1': 'Gently raise by 1 dB' },
          ),
        ]),
      ),
      reverb: choice(
        'Shared room ambience, kept modest because individual rigs also have reverb.',
        {
          '0': 'Dry shared bus',
          '0.04': 'Small room',
          '0.08': 'Warm room',
          '0.14': 'Spacious',
          '0.22': 'Large atmospheric space',
        },
      ),
      threshold: choice('Master glue compression threshold in dB. Preserve transient dynamics.', [
        '-20',
        '-16',
        '-14',
        '-10',
        '-6',
      ]),
      ratio: choice('Master glue compression ratio. Avoid squashing the groove.', [
        '1.5',
        '2',
        '3',
        '4',
      ]),
    },
  };
}
export function readEngineer(
  trace: Trace,
  prior: EngineerMix,
  levels: ChannelLevels,
  at: number,
): EngineerMix {
  const trimDb = { ...prior.trimDb };
  for (const role of musicians) {
    let delta = Number(trace.answers[role].choice);
    if (levels[role].rmsDb < -55 || (delta > 0 && levels[role].peakDb + prior.trimDb[role] > -6))
      delta = 0;
    trimDb[role] = clamp(prior.trimDb[role] + clamp(delta, -1, 1), -6, 6);
  }
  return {
    audience: readAudienceDirection({
      mood: trace.answers.audienceMood?.choice ?? prior.audience?.mood,
      levelDb: trace.answers.audienceDb
        ? Number(trace.answers.audienceDb.choice)
        : prior.audience?.levelDb,
    }),
    trimDb,
    reverb: clamp(Number(trace.answers.reverb.choice), 0, 0.22),
    threshold: clamp(Number(trace.answers.threshold.choice), -20, -6),
    ratio: clamp(Number(trace.answers.ratio.choice), 1.5, 4),
    traceId: trace.id,
    measuredAt: at,
  };
}
