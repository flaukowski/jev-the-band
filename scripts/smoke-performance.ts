import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { Room } from '../server/room.js';
import { validateNotes } from '../shared/score.js';
import type { Frame } from '../shared/music.js';
if (!process.env.OPENROUTER_API_KEY) throw new Error('Set the server key first.');
// Short integrated audition. At most 30 calls, at most 30 seconds of score. No sound output.
const room = new Room(
  'Lanterns on the river. Begin with a syncopated bass groove; let guitar answer with a warm melodic motif, Rhodes chords and an evolving drum pocket.',
  'live',
  process.env.OPENROUTER_API_KEY,
  process.env.JEV_MODEL || 'typesafe/jev-1.13',
  30,
  30,
);
const frames: Frame[] = [];
const done = new Promise<void>((resolve) =>
  room.on('state', (state) => {
    if (state.frame && !frames.some((f) => f.id === state.frame.id)) frames.push(state.frame);
    if (state.status === 'ended') resolve();
  }),
);
const stop = setTimeout(() => room.stop('Smoke test timeout'), 36000);
await room.start();
await done;
clearTimeout(stop);
for (const frame of frames) for (const part of frame.parts) validateNotes(part.notes, part.role);
await mkdir('artifacts', { recursive: true });
const result = { testedAt: new Date().toISOString(), frames, final: room.view() };
await writeFile('artifacts/live-performance.json', JSON.stringify(result, null, 2));
console.log(
  JSON.stringify(
    {
      requests: room.state.requests,
      cost: room.state.cost,
      frames: frames.length,
      lastPhraseIsEnding: frames.at(-1)?.ending,
      allFourPlayers: frames.some((f) => f.parts.length === 4),
      fallbacks: room.state.traces.filter((t) => t.source === 'fallback').length,
      sources: [...new Set(frames.flatMap((f) => f.parts.map((p) => p.source)))],
      error: room.state.error,
    },
    null,
    2,
  ),
);
if (
  room.state.error ||
  !frames.some((f) => f.parts.length === 4) ||
  room.state.traces.some((t) => t.source === 'fallback')
)
  process.exitCode = 1;
