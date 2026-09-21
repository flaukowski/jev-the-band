import { createHash } from 'node:crypto';
import type { Archive } from './archive.js';
export async function transferArchive(source: Archive, target: Archive) {
  const rows = await source.rows();
  if (rows.some((r) => r.kind === 'state' && JSON.parse(r.data).status !== 'ended'))
    throw new Error('End active sets before migrating.');
  const ids = [...new Set(rows.map((r) => r.id))];
  for (const id of ids) {
    const existing = await target.rows(id),
      local = rows.filter((r) => r.id === id);
    if (
      existing.some(
        (r) => !local.some((l) => l.kind === r.kind && l.key === r.key && l.data === r.data),
      )
    )
      throw new Error(`Destination recording conflicts: ${id}. No rows copied.`);
  }
  await target.batch(rows);
  // Canonicalize fields: driver result property order is not a content difference.
  const digest = (records: typeof rows) =>
    createHash('sha256')
      .update(
        JSON.stringify(
          records
            .map((r) => [r.id, r.kind, r.key, r.data])
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
        ),
      )
      .digest('hex');
  for (const id of ids)
    if (digest(rows.filter((r) => r.id === id)) !== digest(await target.rows(id)))
      throw new Error(`Verification failed: ${id}`);
  return { sets: ids.length, records: rows.length };
}
