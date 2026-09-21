import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { composePhrase } from '../server/composer.js';
import { callJev } from '../server/jev.js';
import { Room } from '../server/room.js';
import { jevConfig } from '../server/provider.js';
import { defaultLighting, type Part, type Trace } from '../shared/music.js';

// Explicit paid audition of the drum groove harness: ten drum turns, at most 60 Jev calls.
const config = jevConfig();
if (!config.apiKey) throw new Error('Set the selected Jev provider key first.');
const room = new Room(
  'Greasy New Orleans funk at 96. A deep pocket the band can lean on, with fills that set up each new phrase.',
  'live',
  '',
).view();
const traces: Trace[] = [];
const parts: Part[] = [];
for (let turn = 0; turn < 10; turn++) {
  const part = await composePhrase('drums', room, turn, config.model, async (request) => {
    if (traces.length >= 60) throw new Error('Drum audition request cap');
    const trace = await callJev(request, 'drums', turn, config.apiKey, undefined, config.provider);
    traces.push(trace);
    return trace;
  });
  parts.push(part);
  const frame = {
    id: turn,
    at: Date.now() - 10000,
    durationMs: 5000,
    bpm: 96,
    root: 2,
    mode: 'dorian' as const,
    parts: [part],
    lighting: defaultLighting,
    chapter: 'drum audition',
    ending: false,
  };
  room.frames.push(frame);
  room.frame = frame;
  const resting = (traces.find((t) => t.answers.move && t.frame === turn)?.request.state as any)
    ?.restingChoices?.move;
  console.log(
    JSON.stringify({
      turn,
      move: part.performance?.drumMove,
      pulse: part.performance?.drumPulse,
      feel: part.performance?.feel,
      hits: part.notes.length,
      lastBarVoices: [...new Set(part.notes.filter((n) => n.beat >= 6).map((n) => n.midi))],
      landing: part.performance?.pendingLanding,
      movedBecause: resting ? 'previous move rested' : 'chosen',
    }),
  );
}
await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/drum-audit.json',
  JSON.stringify({ testedAt: new Date().toISOString(), parts, traces }, null, 2),
);
console.log(
  JSON.stringify({
    requests: traces.length,
    fallbacks: traces.filter((t) => t.source !== 'jev').length,
    cost: traces.reduce((s, t) => s + (t.cost ?? 0), 0),
  }),
);
