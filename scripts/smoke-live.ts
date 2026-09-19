import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { Room } from '../server/room.js';
import { callJev, requestFor } from '../server/jev.js';
import { phrasePlanRequest } from '../server/composer.js';
import { roles } from '../shared/music.js';
if (!process.env.OPENROUTER_API_KEY)
  throw new Error('Set OPENROUTER_API_KEY in the server environment.');
// Exactly five calls, one per persona. No repeating performance loop.
const room = new Room(
  'Lanterns on the river: a patient, warm D Dorian funk groove with space for conversation.',
  'live',
  process.env.OPENROUTER_API_KEY,
);
const traces = await Promise.all(
  roles.map((role) =>
    callJev(
      role === 'lights'
        ? requestFor(role, room.view(), 4, process.env.JEV_MODEL || 'typesafe/jev-1.13')
        : phrasePlanRequest(role, room.view(), 4, process.env.JEV_MODEL || 'typesafe/jev-1.13'),
      role,
      4,
      process.env.OPENROUTER_API_KEY!,
    ),
  ),
);
await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/live-smoke.json',
  JSON.stringify({ testedAt: new Date().toISOString(), traces }, null, 2),
);
console.log(
  JSON.stringify(
    traces.map((t) => ({
      role: t.role,
      source: t.source,
      latencyMs: t.latencyMs,
      questionCount: Object.keys(t.answers).length,
      cost: t.cost,
      error: t.error,
    })),
    null,
    2,
  ),
);
if (traces.some((t) => t.source !== 'jev')) process.exitCode = 1;
