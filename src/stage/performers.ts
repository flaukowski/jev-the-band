import * as THREE from 'three';
import {
  fxNames,
  personas,
  random,
  type Effects,
  type Musician,
  type Note,
  type Role,
} from '../../shared/music';
import { Character, type Look } from './character';
import { DrumKit, KeysRig, patchBoard } from './kitkeys';
import { around, drumVoice, type DrumVoice, type PlayerSignal, type Signals } from './signals';
import { Amp, Cable, Pedalboard, Ribbon, StringInstrument, sharedAmpTextures } from './strings';
import { denim, rug, tieDye, weave } from './textures';
import { Spring, box, clamp01, cyl, damp, dampV, lerp, mesh, smooth } from './util';

export const STATION_SCALE = 1.2;
export const stagePositions: Record<Role, [number, number, number, number]> = {
  // x, y, z, yaw
  guitar: [-4.7, 0, 0.5, 0.28],
  bass: [-1.7, 0, 0.9, 0.1],
  keys: [4.5, 0, 0.1, -0.62],
  drums: [1.0, 0.5, -3.0, 0],
  lights: [-6.2, -0.72, 8.2, Math.PI - 0.35],
};

export interface PerformerContext {
  heads: Record<Role, THREE.Vector3>;
  scene: THREE.Scene;
}
export interface Performer {
  role: Role;
  station: THREE.Group;
  character: Character;
  /** World-space point notes appear to leave from. */
  emitter: THREE.Vector3;
  update(sig: Signals, dt: number, ctx: PerformerContext): void;
}

const shirtFor = (role: Role, extra: number[], seed: number) =>
  new THREE.MeshStandardMaterial({
    map: tieDye([new THREE.Color(personas[role].color).getHex(), ...extra], seed),
    roughness: 0.92,
    bumpMap: cloth ?? (cloth = weave()),
    bumpScale: 0.35,
  });
let cloth: THREE.Texture | null = null;
export function resetPerformerCaches() {
  cloth = null;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _e = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** Convert a point or direction from any object's local frame into a character's root frame. */
function intoRoot(ch: Character, from: THREE.Object3D, v: THREE.Vector3, direction = false) {
  _m.copy(ch.root.matrixWorld).invert().multiply(from.matrixWorld);
  return direction ? v.transformDirection(_m) : v.applyMatrix4(_m);
}
function worldIntoRoot(ch: Character, v: THREE.Vector3) {
  return v.applyMatrix4(_m.copy(ch.root.matrixWorld).invert());
}

function makeStation(role: Role, scene: THREE.Scene) {
  const [x, y, z, yaw] = stagePositions[role];
  const station = new THREE.Group();
  station.position.set(x, y, z);
  station.rotation.y = yaw;
  station.scale.setScalar(STATION_SCALE);
  station.userData.role = role;
  scene.add(station);
  return station;
}

/** Shared standing groove: knees absorb the beat because the feet stay planted and the hips move. */
function groove(
  ch: Character,
  sig: Signals,
  p: { level: number; solo: boolean; active: boolean },
  t: number,
  seed: number,
  depth = 1,
) {
  const live = sig.playing && !sig.reduced ? 1 : 0;
  const drive = live * (0.35 + p.level * 0.9 + (p.solo ? 0.35 : 0)) * (p.active ? 1 : 0.45) * depth;
  const phase = sig.beatPhase;
  const bob = Math.pow(0.5 + 0.5 * Math.cos(phase * Math.PI * 2), 1.6);
  const half = Math.sin(sig.beat * Math.PI + seed);
  const breath = Math.sin(t * 1.15 + seed) * 0.5 + 0.5;
  ch.hips.position.y = ch.hipsRest - 0.012 - bob * 0.04 * drive - breath * 0.002;
  ch.hips.position.x = half * 0.028 * drive + Math.sin(t * 0.31 + seed) * 0.012;
  ch.hips.position.z = Math.sin(t * 0.23 + seed * 2) * 0.01;
  ch.hips.rotation.y = half * 0.09 * drive;
  ch.hips.rotation.z = -half * 0.035 * drive;
  ch.spine.rotation.z = half * 0.05 * drive;
  ch.spine.rotation.y = -half * 0.05 * drive;
  ch.chest.rotation.x = 0.03 + bob * 0.045 * drive + breath * 0.012;
  ch.chest.rotation.z = half * 0.03 * drive;
  ch.headBob.x = bob * 0.2 * drive;
  ch.headBob.z = half * 0.07 * drive;
  return { bob, half, drive };
}

/** Slow, seeded wandering of attention between bandmates, the instrument and the crowd. */
class Attention {
  private until = 0;
  private current = new THREE.Vector3(0, 1.5, 8);
  private readonly rng: () => number;
  constructor(
    seed: number,
    private readonly self: Role,
  ) {
    this.rng = random(seed);
  }
  update(
    sig: Signals,
    ch: Character,
    ctx: PerformerContext,
    own: THREE.Vector3 | null,
    dt: number,
  ) {
    const soloist = sig.soloists.find((r) => r !== this.self);
    const selfSolo = sig.soloists.includes(this.self as Musician);
    if (sig.time > this.until) {
      this.until = sig.time + 2.2 + this.rng() * 4;
      const roll = this.rng();
      const others = (Object.keys(ctx.heads) as Role[]).filter(
        (r) => r !== this.self && r !== 'lights',
      );
      if (roll < 0.34) this.current.set((this.rng() - 0.5) * 14, -0.5 + this.rng() * 2, 12);
      else if (roll < 0.6 && own) this.current.copy(own);
      else this.current.copy(ctx.heads[others[Math.floor(this.rng() * others.length)]]);
    }
    const target = _e;
    if (selfSolo && own) target.copy(own);
    else if (soloist) target.copy(ctx.heads[soloist]);
    else target.copy(this.current);
    worldIntoRoot(ch, target);
    dampV(ch.gaze, target, 3, dt);
  }
}

/** Tracks which pedals changed so the player visibly steps on them. */
class Stomp {
  private last = '';
  private t = 1;
  private readonly to = new THREE.Vector3();
  constructor(private readonly board: Pedalboard) {}
  update(
    ch: Character,
    effects: Effects | undefined,
    home: THREE.Vector3,
    dt: number,
    playing: boolean,
  ) {
    const key = effects ? fxNames.map((n) => (effects[n] ? 1 : 0)).join('') : '';
    if (playing && effects && this.last && key !== this.last) {
      const changed = fxNames.find((n, i) => (effects[n] ? '1' : '0') !== this.last[i])!;
      this.to.copy(this.board.switches.get(changed)!);
      intoRoot(ch, this.board.group, this.to);
      this.t = 0;
    }
    if (effects) this.last = key;
    this.t = Math.min(1, this.t + dt / 0.62);
    const reach = Math.sin(smooth(this.t) * Math.PI);
    const press = this.t > 0.42 && this.t < 0.58 ? 1 : 0;
    ch.target.footR.lerpVectors(home, this.to, reach);
    ch.target.footR.y += reach * 0.09 * (1 - press) + (reach > 0.01 ? 0.03 : 0);
    ch.footPitch.R = reach * 0.3 - press * 0.35;
    return reach;
  }
}

abstract class StringPlayer implements Performer {
  readonly station: THREE.Group;
  readonly character: Character;
  readonly emitter = new THREE.Vector3();
  protected readonly instrument: StringInstrument;
  protected readonly pedals = new Pedalboard();
  protected readonly amp: Amp;
  private readonly strap: Ribbon;
  private readonly cable: Cable;
  private readonly attention: Attention;
  private readonly stomp: Stomp;
  private readonly pick = new Spring(0, 420, 22);
  private readonly fret = new THREE.Vector3();
  private readonly lean = new Spring(0, 14, 5);
  private soloAmount = 0;
  private string = 2;
  private fretNumber = 5;
  private readonly strapPoints = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ];
  private readonly footHomeR = new THREE.Vector3(-0.13, 0.07, 0.04);
  private readonly tmpJack = new THREE.Vector3();

  constructor(
    readonly role: 'guitar' | 'bass',
    look: Look,
    finish: number,
    scene: THREE.Scene,
    ampOffset: THREE.Vector3,
    ampKind: 'combo' | 'fridge',
    private readonly seed: number,
  ) {
    this.station = makeStation(role, scene);
    this.character = new Character(look);
    this.station.add(this.character.root);
    const accent = new THREE.Color(personas[role].color).getHex();
    this.instrument = new StringInstrument(role, finish, accent);
    const bass = role === 'bass';
    this.instrument.group.position.set(bass ? -0.1 : -0.07, bass ? -0.27 : -0.23, 0.175);
    this.instrument.group.rotation.set(-0.16, -0.2, bass ? 0.5 : 0.4);
    this.character.chest.add(this.instrument.group);
    this.strap = new Ribbon(
      this.character.root,
      12,
      0.05,
      0.006,
      new THREE.MeshStandardMaterial({ color: bass ? 0x2a2017 : 0x5a2d1a, roughness: 0.9 }),
    );
    this.pedals.group.position.set(0.12, 0, 0.62);
    this.pedals.group.rotation.y = Math.PI;
    this.station.add(this.pedals.group);
    this.amp = new Amp(ampKind, accent, sharedAmpTextures());
    this.amp.group.position.copy(ampOffset);
    this.station.add(this.amp.group);
    this.station.updateMatrixWorld(true);
    const ampIn = this.amp.input.getWorldPosition(new THREE.Vector3());
    const jack = this.instrument.jack.getWorldPosition(new THREE.Vector3());
    this.cable = new Cable(scene, jack, ampIn, 1.5, 0x0b0b0c, stagePositions[role][1] + 0.012);
    this.attention = new Attention(seed, role);
    this.stomp = new Stomp(this.pedals);
    this.character.handL.curl = 0.95;
    this.character.handR.curl = bass ? 0.6 : 1.05;
  }

  update(sig: Signals, dt: number, ctx: PerformerContext) {
    const ch = this.character;
    const p = sig.players[this.role];
    const inst = this.instrument;
    const t = sig.time;
    const bass = this.role === 'bass';
    const g = groove(ch, sig, p, t, this.seed, bass ? 1.15 : 1);
    this.soloAmount = damp(this.soloAmount, p.solo ? 1 : 0, 1.6, dt);
    const solo = this.soloAmount;
    const bendFace = p.bend * solo;
    // Solo stance: weight back, neck up, chin up. Bends pull the whole body.
    const lean = this.lean.step(solo * (0.55 + p.level * 0.5) + bendFace * 0.5, dt);
    ch.spine.rotation.x = -0.14 * lean;
    ch.chest.rotation.x += -0.1 * lean;
    ch.hips.position.z -= 0.05 * lean;
    inst.group.rotation.z = (bass ? 0.5 : 0.4) + lean * 0.3 + g.bob * 0.025 * g.drive;
    inst.group.rotation.y = -0.2 - lean * 0.1;
    ch.headBob.x += -0.35 * lean * (0.5 + 0.5 * p.sustain);
    ch.face.eyesClosed = clamp01(solo * (0.4 + p.sustain * 0.6) * (p.level > 0.15 ? 1 : 0.3));
    ch.face.mouth = clamp01(bendFace * 0.9 + solo * p.impulse * 0.4);
    ch.face.brow = bendFace - solo * 0.3;
    ch.root.updateMatrixWorld(true);

    // Fretting hand goes to the actual fret of the sounding pitch.
    for (const n of p.hits) this.pluck(n, p);
    const next = around(sig, this.role, () => true);
    if (!p.held.length && next.next && next.nextBeat - sig.beat < 0.3) {
      const loc = inst.locate(next.next.midi);
      this.string = loc.string;
      this.fretNumber = loc.fret;
    }
    const vibrato = solo * p.sustain * Math.sin(t * 36) * 0.0035;
    inst.localPoint(inst.fretX(this.fretNumber), this.string, 0, _a);
    _a.y += p.bend * 0.012 + vibrato - 0.052;
    _a.z -= 0.045;
    intoRoot(ch, inst.group, _a);
    if (this.fret.lengthSq() === 0) this.fret.copy(_a);
    dampV(this.fret, _a, p.solo ? 26 : 18, dt);
    ch.target.handL.copy(this.fret);
    ch.aim.L.set(-0.12, 1, 0.25);
    intoRoot(ch, inst.group, ch.aim.L, true);
    ch.aim.weightL = 0.92;
    ch.palm.L.set(0.25, 0.2, 1);
    intoRoot(ch, inst.group, ch.palm.L, true);
    ch.pole.elbowL.set(0.55, -0.9, -0.35);
    const finger = ((this.fretNumber % 4) + 4) % 4;
    ch.handL.press.forEach(
      (_, i) =>
        (ch.handL.press[i] = damp(
          ch.handL.press[i],
          i === finger ? 0.28 * p.sustain : -0.12,
          24,
          dt,
        )),
    );

    // Picking hand: alternate strokes across the sounding string.
    const stroke = this.pick.step(0, dt);
    inst.localPoint(inst.bridgeX + (bass ? 0.16 : 0.1), this.string, 0.035, _b);
    _b.y += stroke + (bass ? -0.035 : 0.0);
    _b.x -= 0.04;
    _b.y += 0.055;
    intoRoot(ch, inst.group, _b);
    ch.target.handR.copy(_b);
    ch.aim.R.set(0.55, -0.85, -0.25);
    intoRoot(ch, inst.group, ch.aim.R, true);
    ch.aim.weightR = 0.85;
    ch.palm.R.set(0, 0.1, -1);
    intoRoot(ch, inst.group, ch.palm.R, true);
    ch.pole.elbowR.set(-0.9, 0.1, -0.5);
    if (bass) {
      // Two-finger pluck: index and middle trade every note.
      const which = p.onsets % 2;
      ch.handR.press[0] = damp(ch.handR.press[0], which === 0 ? p.impulse * 0.9 : 0, 30, dt);
      ch.handR.press[1] = damp(ch.handR.press[1], which === 1 ? p.impulse * 0.9 : 0, 30, dt);
    }

    // Feet: tap with the pulse, step on pedals when Jev changes the rig.
    const reach = this.stomp.update(ch, p.part?.decision.effects, this.footHomeR, dt, sig.playing);
    if (reach < 0.01 && sig.playing && !sig.reduced)
      ch.footPitch.R =
        -Math.max(0, Math.sin(sig.beatPhase * Math.PI * 2 + 0.6)) * 0.22 * (0.4 + p.level);
    ch.target.footL.set(0.14, 0.07, -0.02);

    inst.localPoint(inst.fretX(this.fretNumber), this.string, 0, _c);
    this.attention.update(sig, ch, ctx, inst.group.localToWorld(_c), dt);
    ch.solve(dt, t);

    // Strap over the left shoulder; cable to the amp.
    const sp = this.strapPoints;
    ch.toRoot(inst.strapFront, sp[0]);
    ch.toRoot(ch.shoulderL, sp[1]);
    sp[1].x -= 0.07;
    sp[1].y += 0.075;
    sp[1].z += 0.03;
    ch.toRoot(ch.chest, sp[2]);
    sp[2].y += 0.12;
    sp[2].z -= 0.14;
    ch.toRoot(ch.spine, sp[3]);
    sp[3].x -= 0.15;
    sp[3].z -= 0.12;
    ch.toRoot(inst.strapBack, sp[4]);
    this.strap.thread(sp);
    this.cable.update(inst.jack.getWorldPosition(this.tmpJack), dt);

    inst.update(dt, t);
    this.pedals.update(sig.playing ? p.part?.decision.effects : undefined, dt);
    this.amp.update(p.level, t);
    inst.headstock.getWorldPosition(this.emitter);
  }

  private pluck(n: Note, p: PlayerSignal) {
    const loc = this.instrument.locate(n.midi);
    this.string = loc.string;
    this.fretNumber = loc.fret;
    this.instrument.ring(loc.string, loc.fret, n.velocity);
    const hammer = n.articulation === 'legato' || n.articulation === 'slide';
    if (!hammer) this.pick.x = (p.onsets % 2 ? 1 : -1) * (0.012 + n.velocity * 0.016);
  }
}

export class Guitarist extends StringPlayer {
  constructor(scene: THREE.Scene) {
    super(
      'guitar',
      {
        seed: 11,
        height: 1.04,
        build: 0.95,
        skin: 0xe2b592,
        shirt: shirtFor('guitar', [0xc8432b, 0xffe0a3, 0x7a2a5a], 101),
        sleeve: 'tee',
        pants: new THREE.MeshStandardMaterial({ map: denim(), roughness: 0.9 }),
        shoes: 0x6b3d22,
        hair: 'long',
        hairColor: 0x3b2415,
        accent: 0xf4a66d,
        beard: true,
      },
      0xd2691e,
      scene,
      new THREE.Vector3(-0.35, 0, -1.25),
      'combo',
      1.7,
    );
  }
}
export class Bassist extends StringPlayer {
  constructor(scene: THREE.Scene) {
    super(
      'bass',
      {
        seed: 23,
        height: 0.99,
        build: 1.12,
        skin: 0x8a5a3c,
        shirt: shirtFor('bass', [0x2f6b3a, 0xf2f7c4, 0x1d3b2a], 202),
        sleeve: 'long',
        pants: new THREE.MeshStandardMaterial({ color: 0x23211f, roughness: 0.9 }),
        shoes: 0x1b1b1d,
        hair: 'beanie',
        hairColor: 0x14100d,
        accent: 0x9fd13a,
        beard: true,
        glasses: 'shades',
      },
      0x6f8f5a,
      scene,
      new THREE.Vector3(0.25, 0, -1.55),
      'fridge',
      4.1,
    );
  }
}

export class Keyboardist implements Performer {
  readonly role = 'keys' as const;
  readonly station: THREE.Group;
  readonly character: Character;
  readonly emitter = new THREE.Vector3();
  private readonly rig: KeysRig;
  private readonly leslie: Amp;
  private readonly attention = new Attention(77, 'keys');
  private readonly hands = {
    left: {
      pos: new THREE.Vector3(0.22, 1.02, 0.34),
      board: 'stage' as 'stage' | 'synth' | 'organ',
      lift: new Spring(0, 300, 20),
    },
    right: {
      pos: new THREE.Vector3(-0.22, 1.02, 0.34),
      board: 'stage' as 'stage' | 'synth' | 'organ',
      lift: new Spring(0, 300, 20),
    },
  };
  private turn = 0;

  constructor(scene: THREE.Scene) {
    this.station = makeStation('keys', scene);
    const accent = new THREE.Color(personas.keys.color);
    this.character = new Character({
      seed: 31,
      height: 0.96,
      build: 0.9,
      skin: 0xc58c66,
      shirt: shirtFor('keys', [0x5b3fa8, 0xffd9f2, 0x2a1b5e], 303),
      sleeve: 'long',
      pants: new THREE.MeshStandardMaterial({ color: 0x3a1f47, roughness: 0.85 }),
      shoes: 0xe9e2cf,
      hair: 'curly',
      hairColor: 0x17100f,
      accent: accent.getHex(),
      glasses: 'round',
    });
    this.station.add(this.character.root);
    this.rig = new KeysRig(accent);
    this.station.add(this.rig.group);
    this.leslie = new Amp('leslie', accent.getHex(), sharedAmpTextures());
    this.leslie.group.position.set(1.55, 0, -0.85);
    this.leslie.group.rotation.y = 0.5;
    this.station.add(this.leslie.group);
    this.character.handL.curl = this.character.handR.curl = 0.42;
  }

  update(sig: Signals, dt: number, ctx: PerformerContext) {
    const ch = this.character;
    const p = sig.players.keys;
    const t = sig.time;
    const g = groove(ch, sig, p, t, 2.9, 0.85);
    const decision = p.part?.decision;
    for (const board of Object.values(this.rig.boards)) board.clear();
    const centroid = { left: _a.set(0, 0, 0), right: _b.set(0, 0, 0) };
    const counts = { left: 0, right: 0 };
    for (const n of p.held) {
      const hand = n.hand ?? 'right';
      const board = patchBoard(n.patch ?? decision?.[hand]);
      this.rig.boards[board].hold(n.midi);
      this.hands[hand].board = board;
      centroid[hand].add(this.rig.boards[board].keyPoint(n.midi, _c));
      counts[hand]++;
    }
    ch.root.updateMatrixWorld(true);
    let reachX = 0;
    (['left', 'right'] as const).forEach((hand) => {
      const state = this.hands[hand];
      const side = hand === 'left' ? 'L' : 'R';
      for (const n of p.hits)
        if ((n.hand ?? 'right') === hand) state.lift.x = -0.018 - n.velocity * 0.012;
      const target = centroid[hand];
      let board = this.rig.boards[state.board];
      if (counts[hand]) target.multiplyScalar(1 / counts[hand]);
      else {
        // Between notes the hand travels toward the next chord and hovers.
        const upcoming = around(sig, 'keys', (n) => (n.hand ?? 'right') === hand);
        const n = upcoming.next && upcoming.nextBeat - sig.beat < 1 ? upcoming.next : upcoming.prev;
        if (n) {
          state.board = patchBoard(n.patch ?? decision?.[hand]);
          board = this.rig.boards[state.board];
          board.keyPoint(n.midi, target);
        } else {
          state.board = patchBoard(decision?.[hand]);
          board = this.rig.boards[state.board];
          target.set(hand === 'left' ? -0.18 : 0.18, 0.012, 0.045);
        }
        target.y += p.active ? 0.03 : 0.06;
      }
      target.y += 0.05 + state.lift.step(0, dt);
      target.z += 0.115;
      intoRoot(ch, board.group, target);
      dampV(state.pos, target, 20, dt);
      ch.target[`hand${side}`].copy(state.pos);
      const aim = ch.aim[side].set(0, -0.22, -1);
      intoRoot(ch, board.group, aim, true);
      ch.aim[`weight${side}`] = 0.9;
      ch.palm[side].set(0, -1, 0.1);
      const held = counts[hand] > 0 ? 1 : 0;
      const hnd = hand === 'left' ? ch.handL : ch.handR;
      hnd.press.forEach(
        (_, i) =>
          (hnd.press[i] = damp(
            hnd.press[i],
            held * (0.18 + 0.1 * Math.sin(i * 2.1 + p.onsets)),
            30,
            dt,
          )),
      );
      reachX += state.pos.x;
    });
    ch.pole.elbowL.set(0.9, -0.5, -0.5);
    ch.pole.elbowR.set(-0.9, -0.5, -0.5);
    // Turn the torso toward wherever the hands are working, and lean into loud passages.
    this.turn = damp(this.turn, Math.max(-0.7, Math.min(0.7, reachX * 0.9)), 4, dt);
    ch.hips.rotation.y += this.turn * 0.45;
    ch.spine.rotation.y += this.turn * 0.3;
    ch.chest.rotation.y = this.turn * 0.25;
    ch.spine.rotation.x = 0.1 + p.level * 0.16 + g.bob * 0.05 * g.drive;
    ch.hips.position.z += 0.02 + p.level * 0.03;
    ch.face.eyesClosed = p.solo ? 0.7 * p.sustain : 0;
    ch.face.mouth = p.solo ? p.impulse * 0.5 : 0;
    ch.face.brow = p.solo ? 0.5 : 0;
    ch.target.footL.set(0.13, 0.07, -0.02);
    ch.target.footR.set(-0.11, 0.07, 0.1);
    // Sustain pedal foot rides long notes.
    ch.footPitch.R = p.sustain > 0.5 ? 0.12 : -0.05;
    const focus = this.rig.boards[this.hands.right.board].group.getWorldPosition(_c);
    this.attention.update(sig, ch, ctx, focus, dt);
    ch.solve(dt, t);
    const organ = p.held.some(
      (n) => patchBoard(n.patch ?? decision?.[n.hand ?? 'right']) === 'organ',
    );
    this.rig.update(
      dt,
      sig.playing ? decision?.left : undefined,
      sig.playing ? decision?.right : undefined,
      organ,
    );
    this.leslie.update(organ ? p.level : p.level * 0.3, t);
    this.emitter.copy(focus);
    this.emitter.y += 0.15;
  }
}

const leftVoices: DrumVoice[] = ['snare', 'tomHi', 'crash'];
interface StickHand {
  side: 'L' | 'R';
  home: DrumVoice;
  tip: THREE.Vector3;
  from: THREE.Vector3;
  fromBeat: number;
  stick: THREE.Mesh;
}

export class Drummer implements Performer {
  readonly role = 'drums' as const;
  readonly station: THREE.Group;
  readonly character: Character;
  readonly emitter = new THREE.Vector3();
  private readonly kit: DrumKit;
  private readonly attention = new Attention(53, 'drums');
  private readonly sticks: StickHand[];
  private readonly kickLeg = new Spring(0, 320, 18);
  private readonly bounce = new Spring(0, 160, 12);
  private crashFlip = 0;

  constructor(scene: THREE.Scene) {
    this.station = makeStation('drums', scene);
    const accent = new THREE.Color(personas.drums.color).getHex();
    this.character = new Character({
      seed: 47,
      height: 1,
      build: 0.94,
      skin: 0xf0c6a4,
      shirt: shirtFor('drums', [0x1a6f8c, 0xf5fff0, 0x0d2f4a], 404),
      sleeve: 'tank',
      pants: new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 0.9 }),
      shoes: 0xd23b3b,
      hair: 'ponytail',
      hairColor: 0xc39a52,
      accent,
    });
    this.station.add(this.character.root);
    this.kit = new DrumKit(accent);
    this.station.add(this.kit.group);
    const carpet = mesh(
      this.station,
      new THREE.PlaneGeometry(2.3, 2.0),
      new THREE.MeshStandardMaterial({ map: rug(), roughness: 1 }),
      0,
      0.004,
      0.35,
    );
    carpet.rotation.set(-Math.PI / 2, 0, Math.PI / 2 + 0.04);
    carpet.receiveShadow = true;
    const wood = new THREE.MeshStandardMaterial({ color: 0xd9b98a, roughness: 0.5 });
    const stick = (parent: THREE.Object3D) => {
      const s = cyl(parent, 0.0045, 0.0075, 0.4, wood, 0, 0.11, 0.018, 6);
      s.castShadow = true;
      return s;
    };
    const ch = this.character;
    this.sticks = [
      {
        side: 'L',
        home: 'snare',
        tip: this.kit.points.snare.clone(),
        from: this.kit.points.snare.clone(),
        fromBeat: 0,
        stick: stick(ch.handL.group),
      },
      {
        side: 'R',
        home: 'hat',
        tip: this.kit.points.hat.clone(),
        from: this.kit.points.hat.clone(),
        fromBeat: 0,
        stick: stick(ch.handR.group),
      },
    ];
    ch.handL.curl = ch.handR.curl = 1.05;
  }

  private voiceOf(n: Note): DrumVoice | 'crash2' {
    const v = drumVoice(n.midi);
    return v === 'crash' && this.crashFlip % 2 ? 'crash2' : v;
  }

  update(sig: Signals, dt: number, ctx: PerformerContext) {
    const ch = this.character;
    const p = sig.players.drums;
    const t = sig.time;
    const live = sig.playing && !sig.reduced && p.active;
    for (const n of p.hits) {
      const v = drumVoice(n.midi);
      if (v === 'crash') this.crashFlip++;
      this.kit.strike(this.voiceOf(n), n.velocity);
      if (v === 'kick') {
        this.kickLeg.kick(5 * n.velocity);
        this.bounce.kick(-0.5 * n.velocity);
      } else if (v === 'snare') this.bounce.kick(-0.25 * n.velocity);
    }
    this.kit.update(dt);

    // Seated body: the kick travels up through the spine.
    const bounce = this.bounce.step(0, dt);
    const half = Math.sin(sig.beat * Math.PI);
    const drive = live ? 0.5 + p.level : 0.15;
    ch.hips.position.set(half * 0.012 * drive, 0.605 + bounce * 0.02, -0.04);
    ch.hips.rotation.set(-0.06, half * 0.05 * drive, 0);
    ch.spine.rotation.set(0.12 + bounce * 0.12, -half * 0.08 * drive, half * 0.03 * drive);
    ch.chest.rotation.set(0.08 + Math.sin(t * 1.1) * 0.01, 0, 0);
    ch.headBob.x = Math.pow(0.5 + 0.5 * Math.cos(sig.beatPhase * Math.PI * 2), 2) * 0.32 * drive;
    ch.headBob.z = half * 0.12 * drive;
    ch.face.mouth = clamp01(sig.crash * 0.8 + p.level * 0.25);
    ch.face.brow = sig.crash;
    ch.root.updateMatrixWorld(true);

    // Feet on the pedals.
    const kick = Math.max(0, this.kickLeg.step(0, dt));
    ch.target.footR.copy(this.kit.kickPedal);
    ch.target.footR.y += 0.05 - Math.min(0.05, kick * 0.05) + 0.02;
    ch.footPitch.R = -0.2 + Math.min(0.4, kick * 0.5);
    ch.footYaw.R = -0.12;
    ch.target.footL.copy(this.kit.hatPedal);
    ch.target.footL.y +=
      0.03 + (live ? Math.max(0, Math.sin(sig.beatPhase * Math.PI * 2)) * 0.02 : 0);
    ch.footYaw.L = 0.35;
    ch.pole.kneeL.set(0.5, 0.4, 1);
    ch.pole.kneeR.set(-0.35, 0.4, 1);

    // Each hand flies from its last hit to its next one, arriving exactly on the beat.
    for (const hand of this.sticks) {
      const mine = (n: Note) => {
        const v = drumVoice(n.midi);
        return v !== 'kick' && leftVoices.includes(v) === (hand.side === 'L');
      };
      const { prev, next, nextBeat } = around(sig, 'drums', mine);
      if (prev && prev.beat !== hand.fromBeat && prev.beat <= sig.beat) {
        hand.fromBeat = prev.beat;
        hand.from.copy(this.kit.points[this.voiceOf(prev)]);
      }
      const to = live && next ? this.kit.points[this.voiceOf(next)] : this.kit.points[hand.home];
      const prevBeat = prev ? prev.beat : sig.beat - 1;
      const span = live && next ? Math.max(0.05, nextBeat - prevBeat) : 1;
      const u = live && next ? clamp01((sig.beat - prevBeat) / span) : 1;
      const seconds = (span * 60) / sig.bpm;
      // Long gaps: rest low, then wind up just before the stroke.
      const windup = seconds > 0.7 ? smooth((u - (1 - 0.45 / seconds)) / (0.45 / seconds)) : 1;
      const arc = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 0.8);
      const velocity = next?.velocity ?? 0.5;
      const height =
        live && next
          ? Math.min(0.3, 0.06 + seconds * 0.38) * (0.55 + velocity * 0.6) * arc * windup
          : 0.05 + Math.sin(t * 1.4 + (hand.side === 'L' ? 1 : 0)) * 0.008;
      hand.tip.lerpVectors(hand.from, to, smooth(u));
      if (!live || !next) dampV(hand.from, to, 3, dt);
      _a.copy(hand.tip);
      _a.y += height * 1.5 + 0.004;
      // Grip sits behind and above the tip, toward the player's shoulder.
      _b.set(hand.side === 'L' ? 0.2 : -0.2, 0, 0).sub(_c.set(hand.tip.x, 0, hand.tip.z));
      _b.y = 0;
      _b.normalize().multiplyScalar(0.27);
      _c.copy(hand.tip).add(_b);
      _c.y += 0.075 + height * 0.62;
      const grip = intoRoot(ch, this.kit.group, _c);
      ch.target[`hand${hand.side}`].copy(grip);
      const tip = intoRoot(ch, this.kit.group, _a);
      ch.aim[hand.side].copy(tip).sub(grip);
      ch.aim[`weight${hand.side}`] = 1;
      ch.palm[hand.side].set(hand.side === 'L' ? -0.5 : 0.5, -1, 0);
    }
    ch.pole.elbowL.set(0.9, -0.6, -0.4);
    ch.pole.elbowR.set(-0.9, -0.6, -0.4);
    this.attention.update(sig, ch, ctx, null, dt);
    ch.solve(dt, t);
    this.emitter.copy(this.kit.points.snare);
    this.kit.group.localToWorld(this.emitter);
  }
}

/** Lux: the fifth member, out at front-of-house, riding faders and reaching when the look changes. */
export class LightingArtist implements Performer {
  readonly role = 'lights' as const;
  readonly station: THREE.Group;
  readonly character: Character;
  readonly emitter = new THREE.Vector3();
  private readonly faders: THREE.Mesh[] = [];
  private readonly faderMats: THREE.MeshBasicMaterial[] = [];
  private readonly screen: THREE.MeshBasicMaterial;
  private seen = 0;
  private reach = 1;
  private reachX = 0;

  constructor(scene: THREE.Scene) {
    this.station = makeStation('lights', scene);
    const accent = new THREE.Color(personas.lights.color).getHex();
    this.character = new Character({
      seed: 91,
      height: 1.0,
      skin: 0x6a452f,
      shirt: new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.9 }),
      sleeve: 'tee',
      pants: new THREE.MeshStandardMaterial({ color: 0x2a2c33, roughness: 0.9 }),
      shoes: 0x111111,
      hair: 'cap',
      hairColor: 0x0f0c0a,
      accent,
      headphones: true,
    });
    this.station.add(this.character.root);
    const g = this.station;
    const caseMat = new THREE.MeshStandardMaterial({
      color: 0x141518,
      roughness: 0.7,
      metalness: 0.3,
    });
    box(g, 1.7, 0.86, 0.7, caseMat, 0, 0.43, 0.62).castShadow = true;
    const desk = new THREE.Group();
    desk.position.set(0, 0.9, 0.58);
    desk.rotation.x = 0.22;
    g.add(desk);
    box(
      desk,
      1.6,
      0.05,
      0.62,
      new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.5, metalness: 0.5 }),
    );
    const rng = random(9);
    for (let i = 0; i < 24; i++) {
      const x = -0.72 + i * 0.058;
      box(
        desk,
        0.006,
        0.002,
        0.2,
        new THREE.MeshBasicMaterial({ color: 0x050505 }),
        x,
        0.027,
        -0.05,
      );
      const mat = new THREE.MeshBasicMaterial({ color: accent });
      const cap = box(desk, 0.026, 0.02, 0.04, mat, x, 0.04, -0.05);
      cap.userData.phase = rng() * 6.28;
      this.faders.push(cap);
      this.faderMats.push(mat);
    }
    for (let r = 0; r < 2; r++)
      for (let i = 0; i < 12; i++)
        box(
          desk,
          0.04,
          0.012,
          0.04,
          new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(i / 12, 0.9, 0.5) }),
          -0.66 + i * 0.058,
          0.032,
          0.16 + r * 0.06,
        );
    this.screen = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const monitor = mesh(desk, new THREE.PlaneGeometry(0.5, 0.26), this.screen, 0.4, 0.2, 0.26);
    monitor.rotation.x = -0.5;
    box(desk, 0.54, 0.3, 0.02, caseMat, 0.4, 0.2, 0.275).rotation.x = -0.5;
    this.character.handL.curl = this.character.handR.curl = 0.5;
  }

  update(sig: Signals, dt: number, ctx: PerformerContext) {
    const ch = this.character;
    const t = sig.time;
    groove(ch, sig, { level: sig.energy, solo: false, active: true }, t, 5.2, 0.7);
    ch.spine.rotation.x = 0.16;
    if (sig.lightingChanges !== this.seen) {
      this.seen = sig.lightingChanges;
      this.reach = 0;
      this.reachX = Math.sin(this.seen * 2.4) * 0.5;
    }
    this.reach = Math.min(1, this.reach + dt / 1.1);
    const go = Math.sin(smooth(this.reach) * Math.PI);
    const ride = Math.sin(t * 0.7) * 0.04;
    ch.target.handR.set(lerp(-0.3, this.reachX, go), 1.0 + go * 0.03, lerp(0.5, 0.72, go) + ride);
    ch.target.handL.set(
      0.32 + ride,
      0.99,
      0.5 + Math.sin(t * 0.9 + 1) * 0.04 * (0.3 + sig.lighting.motion),
    );
    for (const side of ['L', 'R'] as const) {
      ch.aim[side].set(0, -0.35, 1);
      ch.aim[`weight${side}`] = 0.85;
      ch.palm[side].set(0, -1, 0);
    }
    ch.pole.elbowL.set(0.9, -0.6, -0.4);
    ch.pole.elbowR.set(-0.9, -0.6, -0.4);
    // Eyes up on the rig, glancing down at the desk on a change.
    _a.copy(sig.soloists.length ? ctx.heads[sig.soloists[0]] : _b.set(0, 5.5, -3));
    worldIntoRoot(ch, _a);
    if (go > 0.3) _a.set(this.reachX, 0.9, 0.7);
    dampV(ch.gaze, _a, 3, dt);
    ch.gazeWeight = 0.9;
    ch.solve(dt, t);
    this.faders.forEach((f, i) => {
      const level =
        0.5 + 0.5 * Math.sin(t * (0.2 + sig.lighting.motion * 0.8) + (f.userData.phase as number));
      f.position.z =
        -0.14 + level * 0.18 * sig.lighting.intensity + (1 - sig.lighting.intensity) * 0.02;
      this.faderMats[i].color.setHSL((sig.hue + i / 48) % 1, 0.85, 0.35 + level * 0.3);
    });
    this.screen.color.setHSL(sig.hue, 0.7, 0.18 + sig.lighting.intensity * 0.3 + sig.kick * 0.05);
    ch.head.getWorldPosition(this.emitter);
  }
}
