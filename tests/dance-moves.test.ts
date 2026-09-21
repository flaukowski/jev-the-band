import test from 'node:test';
import assert from 'node:assert/strict';
import { Dance, type DanceArea, type DanceInput, type Move } from '../src/stage/moves.js';

const area: DanceArea = { minX: -0.9, maxX: 0.65, minZ: -0.45, maxZ: 0.12, fallX: 0.55 };
const dt = 1 / 60;
function input(time: number, extra: Partial<DanceInput> = {}): DanceInput {
  return {
    time,
    dt,
    beat: (time * 96) / 60,
    bpm: 96,
    live: true,
    active: true,
    solo: false,
    energy: 0.5,
    ending: false,
    hold: false,
    ...extra,
  };
}

test('ten minutes of a standing player: every move turns up, nobody leaves their patch or loses a leg', () => {
  const dance = new Dance(1.7, area);
  let bothStepping = 0;
  let maxReach = 0;
  for (let time = 0; time < 600; time += dt) {
    const pose = dance.update(input(time));
    assert.ok(pose.x > area.minX - 0.05 && pose.x < area.maxX + 0.05, `x ${pose.x}`);
    assert.ok(pose.z > area.minZ - 0.05 && pose.z < area.maxZ + 0.05, `z ${pose.z}`);
    assert.ok(pose.lift >= 0 && pose.lift < 0.4 && pose.tip >= 0 && pose.tip <= 1);
    const lifted = [pose.footL, pose.footR].filter((f) => f.y > 0.075).length;
    if (lifted === 2 && pose.move !== 'jump' && pose.move !== 'fall') bothStepping++;
    if (pose.tip === 0)
      for (const foot of [pose.footL, pose.footR])
        maxReach = Math.max(maxReach, Math.hypot(foot.x, foot.z));
    if (pose.tip > 0.5)
      assert.ok(Math.abs(pose.x - area.fallX) < 0.12, 'falls where there is room');
  }
  for (const move of ['groove', 'sway', 'walk', 'jump', 'spin', 'fall'] as Move[])
    assert.ok(dance.counts[move] > 0, `${move}: ${JSON.stringify(dance.counts)}`);
  assert.ok(dance.counts.fall <= 7, `falling over is occasional: ${dance.counts.fall}`);
  assert.equal(bothStepping, 0, 'one foot stays on the deck unless jumping');
  assert.ok(maxReach < 0.5, `feet stay under the body: ${maxReach}`);
});

test('a jump lands on the beat', () => {
  const dance = new Dance(4.1, area);
  let time = 0.3;
  dance.cue('jump', input(time));
  let wasUp = false;
  let landedAt = -1;
  for (; time < 5 && landedAt < 0; time += dt) {
    const pose = dance.update(input(time));
    if (pose.lift > 0.05) wasUp = true;
    else if (wasUp && pose.lift === 0) landedAt = input(time).beat;
  }
  assert.ok(wasUp && landedAt > 0);
  assert.ok(Math.abs(landedAt - Math.round(landedAt)) < 0.08, `landed at beat ${landedAt}`);
});

test('a fall goes all the way over, keeps the legs going, and gets back up; silence sends everyone home', () => {
  const dance = new Dance(1.7, area);
  let time = 0;
  dance.cue('fall', input(time));
  let flat = 0;
  let kicked = 0;
  for (; time < 14; time += dt) {
    const pose = dance.update(input(time));
    if (pose.tip === 1) {
      flat += dt;
      kicked = Math.max(kicked, pose.footL.y, pose.footR.y);
    }
  }
  assert.ok(flat > 2 && flat < 5, `${flat}s on the deck`);
  assert.ok(kicked > 0.55);
  assert.equal(dance.pose.tip, 0);
  assert.ok(Math.abs(dance.pose.x - area.fallX) < 0.1);
  for (; time < 22; time += dt) dance.update(input(time, { live: false }));
  assert.ok(Math.hypot(dance.pose.x, dance.pose.z) < 0.05 && dance.pose.home);
  assert.equal(dance.pose.move, 'groove');
  for (; time < 60; time += dt) dance.update(input(time, { live: false }));
  assert.deepEqual([dance.counts.jump, dance.counts.spin, dance.counts.sway], [0, 0, 0]);
});
