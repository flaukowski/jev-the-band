import assert from 'node:assert/strict';
import test from 'node:test';
import { random } from '../shared/music.js';
import { Director } from '../src/stage/director.js';

const pool = ['wide', 'guitar', 'front', 'keys', 'crowd', 'drums', 'wing', 'bass', 'overhead'];
const make = (seed: number) => new Director(pool, (s) => (s === 'wing' ? 0.2 : 1), random(seed));

/** Run the director at ten ticks a second; a phrase boundary every five seconds while playing. */
function run(
  d: Director,
  seconds: number,
  soloist: (t: number) => string | undefined,
  playing = true,
) {
  const cuts: { at: number; shot: string; arc: number; zoom: number; over: number }[] = [];
  for (let i = 0; i <= seconds * 10; i++) {
    const t = i / 10;
    const cut = d.update(t, soloist(t), playing && i % 50 === 0, playing);
    if (cut) cuts.push({ at: t, shot: cut.shot, ...cut.move });
  }
  return cuts;
}

test('the camera always moves on within 30 to 90 seconds, playing or silent', () => {
  for (const playing of [true, false])
    for (let seed = 1; seed <= 20; seed++) {
      const cuts = run(make(seed), 1200, () => undefined, playing);
      assert.equal(cuts[0].at, 0);
      for (let i = 1; i < cuts.length; i++) {
        const held = cuts[i].at - cuts[i - 1].at;
        assert.ok(held >= 30 && held <= 96.1, `held ${held}s`);
        assert.notEqual(cuts[i].shot, cuts[i - 1].shot);
      }
      assert.ok(cuts.length >= 13);
    }
});

test('every shot carries a slow move sized to the room it has', () => {
  const cuts = run(make(7), 3000, () => undefined);
  for (const c of cuts) {
    assert.ok(c.arc !== 0 || c.zoom !== 1, 'a shot never sits still');
    const limit = c.shot === 'wing' ? 0.2 : 1;
    assert.ok(Math.abs(c.arc) <= 0.7 * limit + 1e-9);
    assert.ok(c.zoom >= 1 - 0.26 * limit - 1e-9 && c.zoom <= 1 / (1 - 0.26 * limit) + 1e-9);
    // Under two degrees a second even on the freest shot.
    assert.ok(Math.abs(c.arc) / c.over < 0.03);
  }
  assert.ok(
    cuts.some((c) => c.arc !== 0) && cuts.some((c) => c.zoom < 1) && cuts.some((c) => c.zoom > 1),
  );
});

test('a solo is cut to at once, covered with short cutaways, and returned to', () => {
  const cuts = run(make(3), 400, (t) => (t >= 12 && t < 300 ? 'keys' : undefined));
  const first = cuts.find((c) => c.at >= 12)!;
  assert.equal(first.shot, 'keys');
  assert.ok(first.at < 12.2);
  const during = cuts.filter((c) => c.at >= 12 && c.at < 300);
  for (let i = 1; i < during.length; i++) {
    const held = during[i].at - during[i - 1].at;
    if (during[i - 1].shot === 'keys') assert.notEqual(during[i].shot, 'keys');
    else {
      assert.equal(during[i].shot, 'keys');
      assert.ok(held <= 24.1, `cutaway held ${held}s`);
    }
  }
  assert.ok(during.filter((c) => c.shot === 'keys').length >= 3);
});
