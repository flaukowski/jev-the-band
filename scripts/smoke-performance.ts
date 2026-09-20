import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { Room } from '../server/room.js';
import { validateNotes } from '../shared/score.js';
import { musicians, type Frame } from '../shared/music.js';
import { jevConfig } from '../server/provider.js';
const config = jevConfig();
if (!config.apiKey) throw new Error('Set the selected Jev provider key first.');
// Integrated audition. At most 240 calls, at most 90 seconds of score. No sound output.
const room = new Room(
  'Lanterns on the river. Begin with a syncopated bass groove; let guitar answer with a warm melodic motif, Rhodes chords and an evolving drum pocket.',
  'live',
  config.apiKey,
  config.model,
  240,
  90,
  { provider: config.provider },
);
const frames: Frame[] = [];
const done = new Promise<void>((resolve) =>
  room.on('state', (state) => {
    if (state.frame && !frames.some((f) => f.id === state.frame.id)) frames.push(state.frame);
    if (state.status === 'ended') resolve();
  }),
);
const stop = setTimeout(() => room.stop('Smoke test timeout'), 101000);
await room.start();
await done;
clearTimeout(stop);
for (const frame of frames) for (const part of frame.parts) validateNotes(part.notes, part.role);
const variation = Object.fromEntries(
  musicians.map((role) => {
    const parts = frames.flatMap((f) =>
      f.parts.filter((p) => p.role === role && !p.continued && p.source === 'jev'),
    );
    const signature = (notes: (typeof parts)[number]['notes']) =>
      JSON.stringify(
        notes.map((n) => [
          n.beat,
          n.midi,
          n.duration,
          n.velocity,
          n.articulation,
          n.bend,
          n.hand,
          n.patch,
        ]),
      );
    return [
      role,
      {
        compositions: parts.length,
        distinctPhrases: new Set(parts.map((p) => signature(p.notes))).size,
        soundedNotes: parts.reduce((n, p) => n + p.notes.length, 0),
      },
    ];
  }),
);
await mkdir('artifacts', { recursive: true });
const result = { testedAt: new Date().toISOString(), variation, frames, final: room.view() };
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
      variation,
    },
    null,
    2,
  ),
);
if (
  room.state.error ||
  !frames.some((f) => f.parts.length === 4) ||
  Object.values(variation).some((v) => v.distinctPhrases < 2 || v.soundedNotes < 2) ||
  room.state.traces.some((t) => t.source === 'fallback')
)
  process.exitCode = 1;
