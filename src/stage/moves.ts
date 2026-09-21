import { random } from '../../shared/music';
import { clamp01, damp, lerp, smooth } from './util';

/**
 * Stage moves for the standing players: sway, wander, jump, spin and the occasional pratfall.
 * This is showmanship, not music: a seeded choreographer reads the same signals the rest of the
 * stage does (beat, tempo, level, energy) and never asks Jev anything. Pure numbers, in station
 * units, so it can be run for ten simulated minutes in a unit test.
 */
export type Move = 'groove' | 'sway' | 'walk' | 'jump' | 'spin' | 'fall';

export interface DanceInput {
  time: number;
  dt: number;
  beat: number;
  bpm: number;
  /** The band is playing and motion is allowed. When false the player walks home and stands. */
  live: boolean;
  active: boolean;
  solo: boolean;
  energy: number;
  ending: boolean;
  /** A pedal stomp is under way: finish it before going anywhere. */
  hold: boolean;
}
export interface FootPose {
  x: number;
  y: number;
  z: number;
  pitch: number;
}
export interface DancePose {
  move: Move;
  /** Where the player stands, relative to their mark. */
  x: number;
  z: number;
  yaw: number;
  /** Height of the whole body off the deck. */
  lift: number;
  /** How far the hips sink into the knees. */
  crouch: number;
  /** 0 upright, 1 flat on their back. */
  tip: number;
  /** Extra sideways weight shift and torso roll. */
  shift: number;
  roll: number;
  /** Ankles, in the player's own turned (but untipped) frame. */
  footL: FootPose;
  footR: FootPose;
  /** Standing on the mark, able to reach the pedalboard. */
  home: boolean;
}
export interface DanceArea {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** A spot with clear deck behind it: nobody lands on an amp. */
  fallX: number;
}

const ANKLE = 0.07;
const HOMES = [
  { x: 0.14, z: -0.02 },
  { x: -0.13, z: 0.04 },
] as const;
const WALK_SPEED = 0.55;

interface Foot {
  x: number;
  z: number;
  fromX: number;
  fromZ: number;
  /** 1 when planted, 0..1 through a step. */
  u: number;
  duration: number;
}

export class Dance {
  readonly pose: DancePose = {
    move: 'groove',
    x: 0,
    z: 0,
    yaw: 0,
    lift: 0,
    crouch: 0,
    tip: 0,
    shift: 0,
    roll: 0,
    footL: { x: HOMES[0].x, y: ANKLE, z: HOMES[0].z, pitch: 0 },
    footR: { x: HOMES[1].x, y: ANKLE, z: HOMES[1].z, pitch: 0 },
    home: true,
  };
  /** How many times each move has started, for tests and the debug overlay. */
  readonly counts: Record<Move, number> = {
    groove: 0,
    sway: 0,
    walk: 0,
    jump: 0,
    spin: 0,
    fall: 0,
  };
  private readonly rng: () => number;
  private readonly feet: Foot[] = HOMES.map((h) => ({
    x: h.x,
    z: h.z,
    fromX: h.x,
    fromZ: h.z,
    u: 1,
    duration: 0.24,
  }));
  private move: Move = 'groove';
  private t = 0;
  private duration = 0;
  private nextAt: number;
  private x = 0;
  private z = 0;
  private vx = 0;
  private vz = 0;
  private yaw = 0;
  private destX = 0;
  private destZ = 0;
  private trip = false;
  private lastFall = -60;
  private hops = 0;
  private wait = 0;
  private hopSeconds = 0.6;
  private spinDir = 1;
  private downFor = 3;

  constructor(
    private readonly seed: number,
    private readonly area: DanceArea,
  ) {
    this.rng = random(Math.round(seed * 1000) + 7);
    this.nextAt = 4 + this.rng() * 6;
  }

  private start(move: Move, input: DanceInput) {
    this.move = move;
    this.t = 0;
    this.counts[move]++;
    const beatSeconds = 60 / input.bpm;
    if (move === 'groove') this.nextAt = input.time + 2 + this.rng() * 6;
    else if (move === 'sway') this.duration = (8 + Math.floor(this.rng() * 3) * 4) * beatSeconds;
    else if (move === 'spin') {
      this.duration = Math.max(1.5, Math.min(2.8, 4 * beatSeconds));
      this.spinDir = this.rng() < 0.5 ? 1 : -1;
    } else if (move === 'jump') {
      this.hops = 1 + Math.floor(this.rng() * (1.5 + input.energy * 3));
      this.armHop(input);
    } else if (move === 'fall') {
      this.lastFall = input.time;
      this.downFor = 2.4 + this.rng() * 2.2;
    }
  }

  /** Time the hop so the landing, not the take-off, is on the beat. */
  private armHop(input: DanceInput) {
    const beatSeconds = 60 / input.bpm;
    this.hopSeconds = Math.max(0.45, Math.min(0.75, beatSeconds));
    const lead = this.hopSeconds * 0.65;
    let until = (1 - (input.beat - Math.floor(input.beat))) * beatSeconds;
    while (until < lead) until += beatSeconds;
    this.wait = until - lead;
    this.t = 0;
  }

  private walkTo(x: number, z: number, input: DanceInput, trip = false) {
    this.destX = x;
    this.destZ = z;
    this.trip = trip;
    this.start('walk', input);
  }

  private choose(input: DanceInput) {
    const { area } = this;
    const away = Math.hypot(this.x, this.z) > 0.12;
    if (input.ending) return away ? this.walkTo(0, 0, input) : this.start('groove', input);
    const e = input.energy;
    const playing = input.active ? 1 : 0.4;
    const canFall = !input.solo && input.time - this.lastFall > 75 && input.time > 25;
    const weights: [Move, number][] = [
      ['groove', 2],
      ['sway', 3],
      ['walk', input.solo ? 0.4 : 3],
      ['jump', (0.4 + e * 4.5) * playing],
      ['spin', (0.3 + e * 1.6) * playing],
      ['fall', canFall ? 0.45 : 0],
    ];
    let roll = this.rng() * weights.reduce((sum, [, w]) => sum + w, 0);
    const move = weights.find(([, w]) => (roll -= w) < 0)?.[0] ?? 'groove';
    if (move === 'walk') {
      // Every third stroll or so is simply back to the mark, where the pedals are.
      if (away && this.rng() < 0.4) return this.walkTo(0, 0, input);
      return this.walkTo(
        lerp(area.minX, area.maxX, this.rng()),
        lerp(area.minZ, area.maxZ, this.rng()),
        input,
      );
    }
    // A fall is a stroll that goes wrong somewhere with room to land.
    if (move === 'fall')
      return this.walkTo(area.fallX + (this.rng() - 0.5) * 0.12, this.rng() * 0.08, input, true);
    this.start(move, input);
  }

  update(input: DanceInput): DancePose {
    const pose = this.pose;
    const dt = input.dt;
    this.t += dt;
    const t = this.t;
    let crouch = 0;
    let lift = 0;
    let tip = 0;
    let slip = 0;
    let flail = 0;
    let sway = 0;
    let airborne = 0;
    let yawGoal = 0;
    let spin = 0;

    if (!input.live && this.move !== 'fall') {
      // The music stopped: no showing off, just get back to the mark.
      if (this.move !== 'walk' || this.destX !== 0 || this.destZ !== 0 || this.trip) {
        if (Math.hypot(this.x, this.z) > 0.03) this.walkTo(0, 0, input);
        else if (this.move !== 'groove') this.start('groove', input);
      }
    } else if (this.move === 'groove' && input.time >= this.nextAt && !input.hold)
      this.choose(input);

    switch (this.move) {
      case 'sway': {
        const envelope = smooth(t / 0.8) * smooth((this.duration - t) / 0.8);
        sway = envelope;
        if (t >= this.duration) this.start('groove', input);
        break;
      }
      case 'walk': {
        const dx = this.destX - this.x;
        const dz = this.destZ - this.z;
        const dist = Math.hypot(dx, dz);
        const speed = Math.min(WALK_SPEED, dist * 2.5);
        const k = 1 - Math.exp(-dt * 5);
        this.vx += ((dist > 1e-4 ? (dx / dist) * speed : 0) - this.vx) * k;
        this.vz += ((dist > 1e-4 ? (dz / dist) * speed : 0) - this.vz) * k;
        const pace = Math.hypot(this.vx, this.vz);
        if (pace > 0.05) {
          // Turn a little toward where you are going, but never turn your back on the crowd.
          let heading = Math.atan2(this.vx, this.vz);
          if (Math.abs(heading) > Math.PI / 2) heading -= Math.sign(heading) * Math.PI;
          yawGoal = Math.max(-0.6, Math.min(0.6, heading * 0.7)) * clamp01(pace / 0.3);
        }
        if (dist < 0.04 && pace < 0.06) {
          if (this.trip && input.live) this.start('fall', input);
          else this.start('groove', input);
          this.trip = false;
        }
        break;
      }
      case 'jump': {
        const T = this.hopSeconds;
        const u = (t - this.wait) / T;
        if (u > 0) {
          const air = clamp01((u - 0.2) / 0.45);
          airborne = u >= 0.2 && u < 0.65 ? Math.sin(air * Math.PI) : 0;
          lift = 4 * air * (1 - air) * (0.2 + 0.12 * clamp01(input.energy * 1.5));
          crouch =
            u < 0.2
              ? Math.sin((u / 0.2) * Math.PI * 0.5) * 0.13 * (1 - smooth((u - 0.12) / 0.08))
              : u > 0.65
                ? Math.sin(clamp01((u - 0.65) / 0.35) * Math.PI) * 0.12
                : 0;
        }
        if (u >= 1) {
          if (--this.hops > 0 && input.live) this.armHop(input);
          else this.start('groove', input);
        }
        break;
      }
      case 'spin': {
        const u = clamp01(t / this.duration);
        spin = this.spinDir * Math.PI * 2 * smooth(u);
        crouch = Math.sin(u * Math.PI) * 0.04;
        if (u >= 1) this.start('groove', input);
        break;
      }
      case 'fall': {
        // Feet shoot out, the body goes over backwards like a felled tree, a few bars of playing
        // from the deck with the legs going, then a roll back up onto the feet.
        const over = 0.3 + 0.55;
        const up = over + this.downFor;
        if (t < over) {
          slip = smooth(t / 0.3);
          const u = clamp01((t - 0.18) / 0.62);
          tip = u * u;
          crouch = Math.sin(u * Math.PI) * 0.16;
        } else if (t < up) {
          const landed = t - over;
          tip = 1;
          slip = 1;
          flail = smooth(landed / 0.4) * smooth((up - t) / 0.4);
          lift = Math.abs(Math.sin(landed * 11)) * 0.05 * Math.exp(-landed * 5);
        } else {
          const u = clamp01((t - up) / 1.3);
          tip = 1 - smooth(u);
          slip = 1 - smooth(u * 1.6);
          crouch = Math.sin(u * Math.PI) * 0.3;
          if (u >= 1) {
            this.plant();
            this.start('groove', input);
            this.nextAt = input.time + 5 + this.rng() * 5;
          }
        }
        break;
      }
    }
    if (this.move !== 'walk') {
      this.vx = damp(this.vx, 0, 8, dt);
      this.vz = damp(this.vz, 0, 8, dt);
    }
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.yaw = damp(this.yaw, yawGoal, 4, dt);
    const yaw = this.yaw + spin;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);

    // Feet stay where they were put until the body has moved far enough to need a step.
    const moving = this.move === 'walk' || this.move === 'spin';
    const threshold = moving ? 0.09 : 0.045;
    const lead = 0.2;
    const half = Math.sin(input.beat * Math.PI + this.seed);
    let worst = -1;
    let worstError = threshold;
    const grounded = airborne === 0 && tip === 0;
    this.feet.forEach((foot, i) => {
      const home = HOMES[i];
      const idealX = this.x + home.x * cos + home.z * sin + this.vx * lead;
      const idealZ = this.z - home.x * sin + home.z * cos + this.vz * lead;
      if (foot.u < 1) {
        foot.u = Math.min(1, foot.u + dt / foot.duration);
        const s = smooth(foot.u);
        foot.x = lerp(foot.fromX, idealX, s);
        foot.z = lerp(foot.fromZ, idealZ, s);
        return;
      }
      const error = Math.hypot(idealX - foot.x, idealZ - foot.z);
      if (error > worstError) {
        worst = i;
        worstError = error;
      }
    });
    if (worst >= 0 && grounded && this.feet.every((f) => f.u >= 1)) {
      const foot = this.feet[worst];
      foot.fromX = foot.x;
      foot.fromZ = foot.z;
      foot.u = 0;
      foot.duration = worstError > 0.2 ? 0.16 : moving ? 0.22 : 0.28;
    }

    const down = smooth((tip - 0.25) / 0.5);
    this.feet.forEach((foot, i) => {
      const out = i === 0 ? pose.footL : pose.footR;
      const side = i === 0 ? 1 : -1;
      const dx = foot.x - this.x;
      const dz = foot.z - this.z;
      const step = foot.u < 1 ? Math.sin(foot.u * Math.PI) : 0;
      // The unweighted foot comes off the deck on each sway.
      const unweight = sway * Math.max(0, -half * side);
      let x = dx * cos - dz * sin;
      let y = ANKLE + step * 0.075 + unweight * 0.04 + airborne * 0.13;
      let z = dx * sin + dz * cos + slip * 0.3 - airborne * 0.1;
      let pitch = step * 0.25 + unweight * 0.3 + airborne * 0.5;
      if (down > 0) {
        // On their back: knees up, heels kicking in time.
        const kick = flail * Math.max(0, Math.sin(input.beat * Math.PI * 2 + (i ? Math.PI : 0)));
        x = lerp(x, HOMES[i].x * 1.2, down);
        y = lerp(y, 0.42 + kick * 0.24, down);
        z = lerp(z, 0.1 + kick * 0.32, down);
        pitch = lerp(pitch, -0.2, down);
      }
      out.x = x;
      out.y = y;
      out.z = z;
      out.pitch = pitch;
    });

    pose.move = this.move;
    pose.x = this.x;
    pose.z = this.z;
    pose.yaw = yaw;
    pose.lift = lift + smooth(tip) * 0.13;
    pose.crouch = crouch;
    pose.tip = tip;
    pose.shift = sway * half * 0.06;
    pose.roll = -sway * half * 0.07;
    pose.home = Math.hypot(this.x, this.z) < 0.1 && this.move !== 'fall' && this.move !== 'jump';
    return pose;
  }

  /** Start a move now instead of waiting for the choreographer. Used by tests and the dev console. */
  cue(move: Move, input: DanceInput) {
    if (this.move === 'fall') return;
    if (move === 'fall') this.walkTo(this.area.fallX, 0.04, input, true);
    else if (move === 'walk')
      this.walkTo(this.x > 0 ? this.area.minX : this.area.maxX, this.area.minZ, input);
    else this.start(move, input);
  }

  /** Less movement: stand on the mark, immediately. */
  reset() {
    this.move = 'groove';
    this.x = this.z = this.vx = this.vz = this.yaw = 0;
    this.trip = false;
    this.plant();
  }

  /** Put both feet back under the body, as after getting up. */
  private plant() {
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    this.feet.forEach((foot, i) => {
      foot.x = this.x + HOMES[i].x * cos + HOMES[i].z * sin;
      foot.z = this.z - HOMES[i].x * sin + HOMES[i].z * cos;
      foot.u = 1;
    });
  }
}
