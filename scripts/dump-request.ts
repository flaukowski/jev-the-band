/**
 * dump-request.ts — capture real JevRequests, exactly as the composer sends them.
 *
 * Written for the kannaka-brain feasibility measurement: the point is to test a
 * local model against the traffic this repo actually emits, not against a
 * request someone hand-wrote to be easy.
 */
import { writeFileSync } from 'node:fs';
import { Room } from '../server/room.js';
import { requestFor, bootstrapRequest } from '../server/jev.js';
import type { Role } from '../shared/music.js';

const room = new Room('Slow tide over a cold harbour', 'live', '');
const view = room.view();

const out: Record<string, unknown> = {
  bootstrap: bootstrapRequest('Slow tide over a cold harbour', 'kannaka-brain-7b-v1'),
};
for (const role of ['guitar', 'bass', 'keys', 'drums', 'lights'] as Role[]) {
  out[role] = requestFor(role, view, 2, 'kannaka-brain-7b-v1');
}

writeFileSync('scripts/jev-requests.json', JSON.stringify(out, null, 2));
for (const [name, r] of Object.entries(out)) {
  const q = (r as { questions: Record<string, unknown> }).questions;
  console.log(
    `${name.padEnd(10)} questions=${String(Object.keys(q).length).padStart(3)}  ` +
      `options=${Object.values(q)
        .map((x) => Object.keys((x as { criteria: object }).criteria).length)
        .reduce((a, b) => a + b, 0)}  ` +
      `stateBytes=${JSON.stringify((r as { state: unknown }).state).length}`,
  );
}
