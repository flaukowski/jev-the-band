import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { Room } from '../server/room.js';
import { composePhrase } from '../server/composer.js';
import { callJev } from '../server/jev.js';
import { defaultLighting, fxNames, type Trace, type Part } from '../shared/music.js';
import { validateNotes } from '../shared/score.js';
import { jevConfig } from '../server/provider.js';
const config = jevConfig();

// Explicit paid diagnostic: three isolated compositions, at most 28 calls. Never touches the audience room.
if (!config.apiKey) throw new Error('Set the selected Jev provider key first.');
const room = new Room(
  'A warm C major soul-funk pocket. Guitar plays full rhythmic strummed chords, not a solo. Keys comp with two-handed Rhodes chords. Drums establish a steady danceable hi-hat pulse and backbeat throughout both bars. Make generous use of tasteful pedal combinations: envelope filter and drive on guitar, chorus and reverb on keys, a touch of dub echo. Land somewhere satisfying; groove, not endless tension.',
  'live',
  '',
);
room.state.initialRoot = 0;
room.state.initialMode = 'major';
const keepAlive = setInterval(() => {}, 1000);
const traces: Trace[] = [],
  parts: Part[] = [];
for (const role of ['guitar', 'keys', 'drums'] as const) {
  try {
    const part = await composePhrase(role, room.view(), 0, config.model, async (request) => {
      if (traces.length >= 28) throw new Error('Audit request cap');
      const trace = await callJev(request, role, 0, config.apiKey, undefined, config.provider);
      traces.push(trace);
      return trace;
    });
    validateNotes(part.notes, role);
    parts.push(part);
    // Make previous test phrases entirely past before another instrument hears them.
    room.state.frames = [
      {
        id: 0,
        at: Date.now() - 10000,
        durationMs: 5000,
        bpm: 96,
        root: 0,
        mode: 'major',
        parts: [...parts],
        lighting: defaultLighting,
        chapter: 'audit',
        ending: false,
      },
    ];
  } catch (error) {
    console.log(JSON.stringify({ role, error: (error as Error).message }));
    process.exitCode = 1;
  }
}
const summary = {
  requests: traces.length,
  cost: traces.reduce((sum, t) => sum + (t.cost ?? 0), 0),
  fallbacks: traces.filter((t) => t.source !== 'jev').length,
  parts: parts.map((p) => ({
    role: p.role,
    direction: p.performance,
    notes: p.notes.length,
    maxPolyphony: Math.max(
      0,
      ...p.notes.map(
        (n) =>
          p.notes.filter((v) => v.beat <= n.beat && v.beat + v.duration > n.beat + 0.00001).length,
      ),
    ),
    lastOnset: p.notes.at(-1)?.beat,
    pedals: p.effectsTimeline?.map((c) => ({
      beat: c.beat,
      on: fxNames.filter((f) => c.effects[f]),
    })),
  })),
};
await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/groove-audit.json',
  JSON.stringify({ testedAt: new Date().toISOString(), summary, parts, traces }, null, 2),
);
console.log(JSON.stringify(summary, null, 2));
if (
  traces.some((t) => t.source !== 'jev') ||
  parts.length !== 3 ||
  summary.parts.filter((p) => p.role !== 'drums').some((p) => p.maxPolyphony < 2) ||
  (summary.parts.find((p) => p.role === 'drums')?.lastOnset ?? 0) < 7
)
  process.exitCode = 1;

clearInterval(keepAlive);
