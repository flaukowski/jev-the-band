import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { placeFor, places } from '../src/stage/horizon.js';

test('a song is always set in the same place, for every viewer and every replay', () => {
  const id = randomUUID();
  assert.equal(placeFor(id), placeFor(id));
  assert.ok(places.includes(placeFor(id)));
});

test('songs spread over every place', () => {
  const seen = new Map<string, number>();
  for (let i = 0; i < 1200; i++) {
    const place = placeFor(randomUUID());
    seen.set(place, (seen.get(place) ?? 0) + 1);
  }
  for (const place of places) assert.ok((seen.get(place) ?? 0) > 120, `${place} is rarely drawn`);
});
