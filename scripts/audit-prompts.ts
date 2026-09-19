import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { Room } from '../server/room.js';
import type { Frame } from '../shared/music.js';

// Explicit paid diagnostic: two isolated, silent live rooms, at most 70 calls each.
// Does not touch the audience room, play sound, or reuse a procedural rehearsal.
if (!process.env.OPENROUTER_API_KEY) throw new Error('Set the server key first.');
const prompts = [
  'the grieving pastor decides to burn it all down',
  'saturday after nursery rhymes',
];
const evidence = [];
for (const prompt of prompts) {
  const room = new Room(
    prompt,
    'live',
    process.env.OPENROUTER_API_KEY,
    process.env.JEV_MODEL || 'typesafe/jev-1.13',
    70,
    40,
  );
  const frames: Frame[] = [];
  const done = new Promise<void>((resolve) => {
    room.on('state', (state) => {
      if (state.frame && !frames.some((f) => f.id === state.frame.id)) frames.push(state.frame);
      if (state.status === 'ended') resolve();
      else if (state.frame?.parts.length === 4) room.stop();
    });
  });
  const timeout = setTimeout(() => room.stop('Prompt audit timeout'), 45000);
  await room.start();
  await done;
  clearTimeout(timeout);
  const state = room.view();
  const summary = {
    prompt,
    mode: state.mode,
    calls: state.requests,
    bpm: state.baseBpm,
    root: frames[0]?.root,
    scale: frames[0]?.mode,
    opener: state.opener,
    cost: state.cost,
    fallbacks: state.traces.filter((t) => t.source === 'fallback').length,
    players: frames.at(-1)?.parts.map((p) => ({
      role: p.role,
      action: p.decision.action,
      phraseFormat: p.phraseFormat,
      tonalIntent: p.tonalIntent,
      density: p.decision.density,
      dynamic: p.decision.dynamic,
      notes: p.notes.map((n) => [n.beat, n.midi, n.duration]),
    })),
    error: state.error,
  };
  evidence.push({ summary, frames, traces: state.traces });
  console.log(JSON.stringify(summary));
  if (state.error || summary.fallbacks || frames.at(-1)?.parts.length !== 4) process.exitCode = 1;
}
await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/prompt-audit-events.json',
  JSON.stringify({ testedAt: new Date().toISOString(), evidence }, null, 2),
);
