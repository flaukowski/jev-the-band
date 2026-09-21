import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { Room } from '../server/room.js';
import { jevConfig } from '../server/provider.js';
import type { Frame } from '../shared/music.js';

// Explicit paid audition of a queued song: at most 600 Jev calls and 160 seconds. No sound output.
const config = jevConfig();
if (!config.apiKey) throw new Error('Set the selected Jev provider key first.');
const room = new Room(
  'Slow midnight blues in a smoky room, brushed drums and a weeping guitar.',
  'live',
  config.apiKey,
  config.model,
  600,
  160,
  {
    provider: config.provider,
    fallback: config.fallback,
    directorModel: config.directorModel,
    directorApiKey: config.directorKey,
  },
);
const frames: Frame[] = [];
let queued = false;
const done = new Promise<void>((resolve) =>
  room.on('state', (state) => {
    if (state.frame && !frames.some((f) => f.id === state.frame.id)) frames.push(state.frame);
    // Queue once the first song is established.
    if (!queued && state.frame && state.frame.id >= 6) {
      queued = true;
      room.queueTheme(
        'Bright uptempo afrobeat street party at noon, horns-like keys and chattering guitar.',
      );
    }
    if (state.status === 'ended') resolve();
  }),
);
const stop = setTimeout(() => room.stop('Audit timeout'), 175000);
await room.start();
await done;
clearTimeout(stop);
const final = room.view();
const summary = frames.map((f) => ({
  id: f.id,
  song: f.themeTitle?.slice(0, 24),
  chapter: f.chapter,
  bpm: f.bpm,
  key: `${f.root} ${f.modeName}`,
  parts: f.parts.map(
    (p) =>
      `${p.role}:${p.notes.length}${p.continued ? '=' : ''}${p.cutForNextSong ? ' CUT' : ''}${p.continued ? '' : ' ' + p.decision.action}`,
  ),
}));
await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/transition-audit.json',
  JSON.stringify({ testedAt: new Date().toISOString(), summary, frames, final }, null, 2),
);
for (const row of summary) console.log(JSON.stringify(row));
console.log(
  JSON.stringify({
    requests: final.requests,
    cost: final.cost,
    ended: final.error ?? 'time',
    setlist: final.setlist?.map((c) => ({ atFrame: c.atFrame, applied: !!c.appliedAt })),
  }),
);
