import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { composePhrase } from '../server/composer.js';
import { callJev } from '../server/jev.js';
import { Room } from '../server/room.js';
import { defaultLighting, type Part, type Trace } from '../shared/music.js';
import { jevConfig } from '../server/provider.js';
const config = jevConfig();

// Explicit paid audition: two isolated eight-bar solo excerpts, at most 120 Jev calls.
if (!config.apiKey) throw new Error('Set the selected Jev provider key first.');
const keepAlive = setInterval(() => {}, 1000);
const traces: Trace[] = [];
const results: { role: string; parts: Part[] }[] = [];
try {
  for (const role of ['guitar', 'keys'] as const) {
    const room = new Room(
      'Warm D Dorian soul-jazz. A real melodic solo that sings, develops a recognizable motif, uses expressive rhythmic runs and space, and resolves with warmth. No aimless arpeggiator; tell a story over the groove.',
      'live',
      '',
    ).view();
    room.soloInvitation = { role, urgency: 1, required: true };
    const parts: Part[] = [];
    results.push({ role, parts });
    for (let chunk = 0; chunk < 4; chunk++) {
      if (chunk) room.soloInvitation = undefined;
      const part = await composePhrase(role, room, chunk, config.model, async (request) => {
        if (traces.length >= 120) throw new Error('Solo audition request cap');
        const trace = await callJev(
          request,
          role,
          chunk,
          config.apiKey,
          undefined,
          config.provider,
        );
        traces.push(trace);
        return trace;
      });
      parts.push(part);
      const frame = {
        id: chunk,
        at: Date.now() - 10000,
        durationMs: 5000,
        bpm: 96,
        root: 2,
        mode: 'dorian' as const,
        parts: [part],
        lighting: defaultLighting,
        chapter: 'solo audition',
        ending: false,
      };
      room.frames.push(frame);
      room.frame = frame;
      console.log(
        JSON.stringify({
          role,
          chunk,
          soloBars: part.performance?.soloBars,
          notes: part.notes.length,
          lastBeat: part.notes.at(-1)?.beat,
        }),
      );
    }
  }
} catch (error) {
  console.log((error as Error).message);
  process.exitCode = 1;
}
const summary = {
  requests: traces.length,
  cost: traces.reduce((s, t) => s + (t.cost ?? 0), 0),
  fallbacks: traces.filter((t) => t.source !== 'jev').length,
  parts: results.map(({ role, parts }) => ({
    role,
    chunks: parts.length,
    chosenBars: parts[0]?.performance?.soloBars,
    distinct: new Set(
      parts.map((p) =>
        JSON.stringify(p.notes.map((n) => [n.beat, n.midi, n.duration, n.velocity])),
      ),
    ).size,
  })),
};
if (
  results.length !== 2 ||
  results.some(
    (r) =>
      r.parts.length !== 4 || r.parts.some((p) => !p.solo || (p.notes.at(-1)?.beat ?? 0) < 6.49),
  ) ||
  summary.parts.some((p) => p.distinct !== 4) ||
  summary.fallbacks
)
  process.exitCode = 1;
await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/solo-audit.json',
  JSON.stringify({ testedAt: new Date().toISOString(), summary, results, traces }, null, 2),
);
console.log(JSON.stringify(summary));
clearInterval(keepAlive);
