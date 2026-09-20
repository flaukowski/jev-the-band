import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { random } from '../../shared/music';
import type { Signals } from './signals';
import { STATION_SCALE } from './performers';

/** What somebody is holding in their right hand. */
const enum Item {
  None,
  Glowstick,
  Phone,
  Camera,
  Smoke,
  Sign,
}

interface Fan {
  x: number;
  z: number;
  height: number;
  phase: number;
  /** How easily this person gets their hands up. */
  spark: number;
  sway: number;
  arms: number;
  item: Item;
  /** Index into the instanced mesh for whatever they are holding. */
  slot: number;
  /** Filming with both hands, landscape. */
  twoHands: boolean;
  sits: boolean;
  /** Turned a little toward their friends rather than square to the stage. */
  turn: number;
  /** The spinners: they roam a circle, twirl, and collide with their neighbours. */
  wild: boolean;
  roam: number;
  orbit: number;
  spin: number;
  near: number[];
  /** Being shoved: a damped spring back to their own spot. */
  px: number;
  pz: number;
  pvx: number;
  pvz: number;
  bumpCool: number;
  /** Where they actually are this frame, and the top of their head. */
  cx: number;
  cz: number;
  hy: number;
  /** Seconds between drags, and the exhale timer. */
  period: number;
  puff: number;
}

const GROUND = -0.74;
/** Cardboard held over the pit: file under public/signs, and width over height. */
const SIGNS: [string, number][] = [
  ['in-this-house.png', 1.4],
  ['scaling-laws.png', 1.315],
  ['logo.png', 1],
];
const UP = new THREE.Vector3(0, 1, 0);

function limb(a: [number, number, number], b: [number, number, number], r0: number, r1: number) {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const dir = to.clone().sub(from);
  const g = new THREE.CylinderGeometry(r1, r0, dir.length(), 8);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
  const mid = from.add(to).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

/** A box that only glows on the face toward its holder: a screen. */
function screenBox(w: number, h: number, d: number, extra: THREE.BufferGeometry[] = []) {
  const g = mergeGeometries([new THREE.BoxGeometry(w, h, d), ...extra]);
  const normal = g.attributes.normal;
  const colors = new Float32Array(normal.count * 3);
  for (let i = 0; i < normal.count; i++)
    colors.fill(normal.getZ(i) < -0.9 ? 1 : 0.02, i * 3, i * 3 + 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/**
 * The audience: a few hundred instanced people. Everyone moves on the band's beat, but each has
 * their own phase, their own threshold for putting their hands up, and their own night: most dance,
 * a few spin through their neighbours, some film, some smoke, and the blanket people sit out back.
 */
export class Crowd {
  /** Somebody exhaled: position, velocity, size. */
  onPuff?: (p: THREE.Vector3, vx: number, vy: number, vz: number, size: number) => void;

  private readonly fans: Fan[] = [];
  private readonly standing: number;
  private readonly body: THREE.InstancedMesh;
  private readonly sitBody: THREE.InstancedMesh;
  private readonly head: THREE.InstancedMesh;
  private readonly hair: THREE.InstancedMesh;
  private readonly armL: THREE.InstancedMesh;
  private readonly armR: THREE.InstancedMesh;
  private readonly sticks: THREE.InstancedMesh;
  private readonly phones: THREE.InstancedMesh;
  private readonly cameras: THREE.InstancedMesh;
  private readonly cherries: THREE.InstancedMesh;
  private readonly moving: THREE.InstancedMesh[];
  private readonly balloons: { mesh: THREE.Mesh; v: THREE.Vector3 }[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly arm = new THREE.Object3D();
  private readonly tip = new THREE.Object3D();
  private readonly base = new THREE.Matrix4();
  private readonly point = new THREE.Vector3();
  private readonly rng = random(771);
  private readonly color = new THREE.Color();
  private readonly signs: THREE.Group[] = [];
  private readonly signArt: THREE.Texture[] = [];
  private bumped = -1;

  constructor(scene: THREE.Scene, lowPower: boolean) {
    const rng = this.rng;
    const person = (x: number, z: number, sits: boolean): Fan => ({
      x,
      z,
      height: 0.88 + rng() * 0.22,
      phase: rng() * Math.PI * 2,
      spark: rng(),
      sway: rng() > 0.5 ? 1 : -1,
      arms: 0,
      item: Item.None,
      slot: 0,
      twoHands: false,
      sits,
      turn: 0,
      wild: false,
      roam: 0,
      orbit: rng() * Math.PI * 2,
      spin: 0,
      near: [],
      px: 0,
      pz: 0,
      pvx: 0,
      pvz: 0,
      bumpCool: 0,
      cx: x,
      cz: z,
      hy: 1,
      period: 9 + rng() * 9,
      puff: 0,
    });
    const rows = lowPower ? 9 : 20;
    let backZ = 0;
    let backHalf = 0;
    for (let row = 0; row < rows; row++) {
      const z = 5.6 + row * 0.92 + (row > 8 ? (row - 8) * 0.25 : 0);
      const half = 11.5 + row * 0.8;
      const step = 0.78 + row * 0.035;
      backZ = z;
      backHalf = half;
      for (let x = -half; x <= half; x += step) {
        const px = x + (rng() - 0.5) * 0.45;
        const pz = z + (rng() - 0.5) * 0.5;
        // Leave room around the lighting desk.
        if (Math.hypot(px + 6.2, pz - 8.4) < 1.9) continue;
        // The crowd thins toward the back and the edges, like a real field.
        if (rng() < row * 0.02 + Math.max(0, Math.abs(px) - 9) * 0.035) continue;
        const f = person(px, pz, false);
        const roll = rng();
        if (roll < 0.16) f.item = Item.Glowstick;
        else if (roll < 0.23) f.item = Item.Phone;
        else if (roll < 0.25) f.item = Item.Camera;
        else if (roll < 0.31) f.item = Item.Smoke;
        f.twoHands = f.item === Item.Camera || (f.item === Item.Phone && rng() < 0.4);
        this.fans.push(f);
      }
    }
    this.standing = this.fans.length;

    // A handful of spinners in the thick of it, spaced so each has their own victims.
    const spinners: Fan[] = [];
    const wanted = lowPower ? 3 : 9;
    for (let tries = 0; tries < 400 && spinners.length < wanted; tries++) {
      const f = this.fans[Math.floor(rng() * this.standing)];
      if (f.z < 6.3 || f.z > 15 || Math.abs(f.x) > 10 || f.wild) continue;
      if (spinners.some((s) => Math.hypot(s.x - f.x, s.z - f.z) < 3.4)) continue;
      f.wild = true;
      f.item = rng() < 0.4 ? Item.Glowstick : Item.None;
      f.twoHands = false;
      spinners.push(f);
    }
    // Sign people, spread through the pit so every camera finds one.
    const signers: Fan[] = [];
    for (let tries = 0; tries < 400 && signers.length < (lowPower ? 3 : 9); tries++) {
      const f = this.fans[Math.floor(rng() * this.standing)];
      if (f.z < 6.5 || f.z > 19 || f.wild || f.item === Item.Sign) continue;
      if (signers.some((s) => Math.hypot(s.x - f.x, s.z - f.z) < 3.2)) continue;
      f.item = Item.Sign;
      f.twoHands = true;
      signers.push(f);
    }
    for (const s of spinners)
      this.fans.forEach((f, i) => {
        if (f !== s && Math.hypot(f.x - s.x, f.z - s.z) < 2.6) s.near.push(i);
      });

    // Blankets behind the pit for the people who came to sit down.
    const blankets: { x: number; z: number; w: number; d: number; yaw: number }[] = [];
    const blanketCount = lowPower ? 4 : 15;
    for (let tries = 0; tries < 300 && blankets.length < blanketCount; tries++) {
      const x = (rng() - 0.5) * 2 * (backHalf - 2);
      const z = backZ + 2 + rng() * 5.5;
      if (blankets.some((b) => Math.hypot(b.x - x, b.z - z) < 2.9)) continue;
      const b = { x, z, w: 1.7 + rng() * 0.7, d: 1.3 + rng() * 0.4, yaw: (rng() - 0.5) * 0.5 };
      blankets.push(b);
      const sitters = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < sitters; k++) {
        const f = person(
          x + (k - (sitters - 1) / 2) * 0.62 + (rng() - 0.5) * 0.15,
          z + (rng() - 0.5) * 0.35,
          true,
        );
        f.turn = sitters > 1 ? ((sitters - 1) / 2 - k) * 0.45 + (rng() - 0.5) * 0.3 : 0;
        const roll = rng();
        f.item = roll < 0.3 ? Item.Smoke : roll < 0.4 ? Item.Phone : Item.None;
        this.fans.push(f);
      }
    }

    const n = this.fans.length;
    const seated = n - this.standing;
    const cloth = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const torso = new THREE.CapsuleGeometry(0.17, 0.42, 3, 10);
    torso.translate(0, 1.18, 0);
    torso.scale(1, 1, 0.68);
    const legs = [-0.085, 0.085].map((x) => {
      const g = new THREE.CylinderGeometry(0.075, 0.06, 0.86, 8);
      g.translate(x, 0.43, 0);
      return g;
    });
    this.body = new THREE.InstancedMesh(mergeGeometries([torso, ...legs]), cloth, this.standing);
    // Seated: leaning back a touch, knees up.
    const sitTorso = new THREE.CapsuleGeometry(0.17, 0.42, 3, 10);
    sitTorso.scale(1, 1, 0.68);
    sitTorso.rotateX(-0.18);
    sitTorso.translate(0, 0.5, 0);
    const sitLegs = [-1, 1].flatMap((s) => [
      limb([s * 0.09, 0.13, 0.06], [s * 0.12, 0.44, 0.46], 0.08, 0.065),
      limb([s * 0.12, 0.44, 0.46], [s * 0.12, 0.07, 0.8], 0.065, 0.055),
    ]);
    this.sitBody = new THREE.InstancedMesh(
      mergeGeometries([sitTorso, ...sitLegs]),
      cloth,
      Math.max(1, seated),
    );
    this.sitBody.count = seated;
    this.head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.115, 10, 8), cloth, n);
    this.hair = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.123, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
      cloth,
      n,
    );
    const armGeo = new THREE.CapsuleGeometry(0.04, 0.5, 2, 6);
    armGeo.translate(0, -0.27, 0);
    this.armL = new THREE.InstancedMesh(armGeo, cloth, n);
    this.armR = new THREE.InstancedMesh(armGeo, cloth, n);

    const counts = [0, 0, 0, 0, 0, 0];
    for (const f of this.fans) f.slot = counts[f.item]++;
    const held = (geo: THREE.BufferGeometry, material: THREE.Material, item: Item) => {
      const m = new THREE.InstancedMesh(geo, material, Math.max(1, counts[item]));
      m.count = counts[item];
      return m;
    };
    const glow = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const screen = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
    this.sticks = held(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 5), glow, Item.Glowstick);
    this.phones = held(screenBox(0.085, 0.17, 0.012), screen, Item.Phone);
    const lens = new THREE.CylinderGeometry(0.035, 0.04, 0.07, 10);
    lens.rotateX(Math.PI / 2);
    lens.translate(0, 0, 0.07);
    this.cameras = held(screenBox(0.17, 0.11, 0.07, [lens]), screen, Item.Camera);
    this.cherries = held(new THREE.SphereGeometry(0.02, 6, 5), glow, Item.Smoke);

    const shirts = [
      0x8a3b2e, 0x2f5d50, 0xd9a441, 0x3b4a7a, 0x7a3b6b, 0xcfc6ae, 0x1f2a2e, 0xb4552d, 0x4f7a3b,
      0x8f8f98, 0xe07a9a, 0x2a2a30,
    ];
    const skins = [0xf0c6a4, 0xd9a47e, 0xb07a55, 0x8a5a3c, 0x5e3d28];
    const hairs = [0x17100d, 0x3b2415, 0x6b4a2a, 0xc39a52, 0x8a2a1c, 0xd9d2c2, 0x2a5a8a];
    this.fans.forEach((f, i) => {
      // Tie-dye is over-represented in this demographic, and compulsory for spinners.
      const shirt =
        f.wild || rng() < 0.3
          ? this.color.setHSL(rng(), f.wild ? 0.95 : 0.75, 0.5)
          : this.color.setHex(shirts[Math.floor(rng() * shirts.length)]);
      if (f.sits) this.sitBody.setColorAt(i - this.standing, shirt);
      else this.body.setColorAt(i, shirt);
      const skin = skins[Math.floor(rng() * skins.length)];
      const sleeve = rng() > 0.5;
      const armColor = sleeve ? shirt.clone() : new THREE.Color(skin);
      this.armL.setColorAt(i, armColor);
      this.armR.setColorAt(i, armColor);
      this.head.setColorAt(i, this.color.setHex(skin));
      this.hair.setColorAt(i, this.color.setHex(hairs[Math.floor(rng() * hairs.length)]));
      if (f.item === Item.Glowstick)
        this.sticks.setColorAt(f.slot, this.color.setHSL(rng(), 1, 0.6).multiplyScalar(2.2));
      // Screens are a cold white with the odd warm one; bright enough to catch the bloom.
      if (f.item === Item.Phone || f.item === Item.Camera)
        (f.item === Item.Phone ? this.phones : this.cameras).setColorAt(
          f.slot,
          this.color
            .setHSL(rng() < 0.75 ? 0.58 : 0.08, 0.35, 0.72)
            .multiplyScalar(f.item === Item.Phone ? 1.25 : 0.9),
        );
      if (f.item === Item.Smoke) this.cherries.setColorAt(f.slot, this.color.setRGB(1, 0.3, 0.05));
    });
    // Signs read from both sides: the band sees them, and so does the balcony.
    const loader = new THREE.TextureLoader();
    const card = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });
    SIGNS.forEach(([file], k) => {
      const art = loader.load(`${import.meta.env.BASE_URL}signs/${file}`);
      art.colorSpace = THREE.SRGBColorSpace;
      art.anisotropy = 4;
      this.signArt[k] = art;
    });
    signers.forEach((f, k) => {
      const [, aspect] = SIGNS[k % SIGNS.length];
      const height = 0.8;
      const width = height * aspect;
      const face = new THREE.MeshBasicMaterial({
        map: this.signArt[k % SIGNS.length],
        color: 0xb0b0b0,
      });
      const sign = new THREE.Group();
      const board = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, height + 0.04, 0.012), card);
      const front = new THREE.Mesh(new THREE.PlaneGeometry(width, height), face);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(width, height), face);
      front.position.z = 0.008;
      back.position.z = -0.008;
      back.rotation.y = Math.PI;
      sign.add(board, front, back);
      scene.add(sign);
      this.signs[f.slot] = sign;
    });
    this.moving = [
      this.body,
      this.sitBody,
      this.head,
      this.hair,
      this.armL,
      this.armR,
      this.sticks,
      this.phones,
      this.cameras,
      this.cherries,
    ];
    for (const m of this.moving) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      scene.add(m);
    }

    // The blankets themselves, and the odd cooler.
    const weave = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 0.03, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      Math.max(1, blankets.length),
    );
    const coolers = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.5, 0.34, 0.32),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      Math.max(1, blankets.length),
    );
    const blanketColors = [0x7a2f2a, 0x2f4f6b, 0x9a7a3a, 0x3f5f3a, 0x6b3f6b, 0xb8a98a];
    let coolerCount = 0;
    blankets.forEach((b, k) => {
      const { dummy } = this;
      dummy.position.set(b.x, GROUND + 0.015, b.z + 0.25);
      dummy.rotation.set(0, b.yaw, 0);
      dummy.scale.set(b.w, 1, b.d);
      dummy.updateMatrix();
      weave.setMatrixAt(k, dummy.matrix);
      weave.setColorAt(
        k,
        this.color.setHex(blanketColors[Math.floor(rng() * blanketColors.length)]),
      );
      if (rng() < 0.55) {
        dummy.position.set(
          b.x + (b.w / 2 - 0.3) * (rng() > 0.5 ? 1 : -1),
          GROUND + 0.2,
          b.z + 0.55,
        );
        dummy.rotation.set(0, b.yaw + (rng() - 0.5), 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        coolers.setMatrixAt(coolerCount, dummy.matrix);
        coolers.setColorAt(
          coolerCount++,
          this.color.setHex([0xd8dde0, 0x2f5f9a, 0xa8322a][Math.floor(rng() * 3)]),
        );
      }
    });
    weave.count = blankets.length;
    coolers.count = coolerCount;
    weave.receiveShadow = true;
    scene.add(weave, coolers);

    // Balloons kept aloft by whoever is underneath.
    const count = lowPower ? 3 : 7;
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(i / count, 0.9, 0.55),
        roughness: 0.15,
        metalness: 0.1,
        transparent: true,
        opacity: 0.92,
      });
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 12), mat);
      b.scale.y = 1.12;
      b.position.set((rng() - 0.5) * 16, 3 + rng() * 3, 7 + rng() * 8);
      scene.add(b);
      this.balloons.push({
        mesh: b,
        v: new THREE.Vector3((rng() - 0.5) * 0.6, 0, (rng() - 0.5) * 0.6),
      });
    }
  }

  dispose() {
    for (const art of this.signArt) art.dispose();
  }

  get count() {
    return this.fans.length;
  }

  /** Where a speech bubble for this person should point. */
  anchor(i: number, out: THREE.Vector3) {
    const f = this.fans[i];
    return out.set(f.cx, f.hy + 0.22, f.cz);
  }

  /** The most recent person a spinner crashed into, once. */
  takeBumped() {
    const i = this.bumped;
    this.bumped = -1;
    return i;
  }

  update(sig: Signals, dt: number) {
    const live = sig.playing && !sig.reduced;
    const still = sig.reduced;
    const energy = sig.energy;
    const solo = sig.soloists.length > 0 ? 0.25 : 0;
    const beat = sig.beat;
    const t = sig.time;
    const { dummy, arm, tip, base, point } = this;
    const S = STATION_SCALE * 0.98;
    const step = Math.min(dt, 0.1);
    this.fans.forEach((f, i) => {
      const excitement = live ? energy + solo + sig.crash * 0.4 : 0;
      // Front rows go harder; the blankets barely at all.
      const fervour =
        excitement * (1.25 - Math.min(1, (f.z - 5) / 16) * 0.55) * (f.sits ? 0.35 : 1);
      const steady = f.item === Item.Phone || f.item === Item.Camera ? 0.45 : 1;
      let ox = 0;
      let oz = 0;
      let facing = f.turn;
      let tilt = 0;
      if (f.wild) {
        f.roam += ((live ? Math.min(1, 0.45 + fervour) : 0) - f.roam) * Math.min(1, step * 1.5);
        f.orbit += step * (0.7 + fervour * 1.5) * f.sway;
        ox = Math.cos(f.orbit) * 0.95 * f.roam;
        oz = Math.sin(f.orbit * 0.73 + f.phase) * 0.7 * f.roam;
        // Twirl in episodes, then come back round to face the band.
        const twirling = live && Math.sin(t * 0.37 + f.phase) > 0.2;
        if (twirling) f.spin = (f.spin + step * (2 + fervour * 4.5)) % (Math.PI * 2);
        else f.spin += ((f.spin > Math.PI ? Math.PI * 2 : 0) - f.spin) * Math.min(1, step * 3);
        facing += f.sway * f.spin + Math.sin(t * 1.3 + f.phase) * 0.8 * f.roam;
        tilt = Math.sin(t * 2.1 + f.phase) * 0.16 * f.roam;
      }
      if (f.px || f.pz || f.pvx || f.pvz) {
        f.pvx += (-f.px * 26 - f.pvx * 5) * step;
        f.pvz += (-f.pz * 26 - f.pvz * 5) * step;
        f.px += f.pvx * step;
        f.pz += f.pvz * step;
        if (Math.abs(f.px) + Math.abs(f.pz) + Math.abs(f.pvx) + Math.abs(f.pvz) < 1e-3)
          f.px = f.pz = f.pvx = f.pvz = 0;
      }
      f.bumpCool -= step;
      const bounce = live
        ? Math.pow(Math.abs(Math.sin((beat + f.phase * 0.06) * Math.PI)), 1.5) *
          (0.03 + fervour * 0.16) *
          (f.wild ? 1.7 : f.sits ? 0.2 : steady)
        : 0;
      const sway = still
        ? 0
        : (Math.sin(beat * Math.PI * 0.5 * f.sway + f.phase) * (0.03 + fervour * 0.09) +
            Math.sin(t * 0.4 + f.phase) * 0.015) *
          steady;
      const h = f.height * S;
      f.cx = f.x + f.px + ox + sway * 0.5;
      f.cz = f.z + f.pz + oz;
      dummy.position.set(f.cx, GROUND + bounce, f.cz);
      const yaw = Math.atan2(-f.x * 0.25, -(f.z + 2)) + sway * 0.5 + facing;
      // Somebody who has just been shoved staggers with it.
      dummy.rotation.set(-fervour * 0.06 + tilt + f.pvz * 0.1, yaw, sway - f.pvx * 0.1, 'YXZ');
      dummy.scale.set(S, h, S);
      dummy.updateMatrix();
      base.copy(dummy.matrix);
      if (f.sits) this.sitBody.setMatrixAt(i - this.standing, base);
      else this.body.setMatrixAt(i, base);
      // Head nods a touch behind the body.
      const nod = live
        ? Math.sin((beat - 0.08) * Math.PI * 2 + f.phase * 0.1) * 0.05 * (0.4 + fervour)
        : 0;
      point.set(0, f.sits ? 0.99 : 1.62, f.sits ? -0.085 : 0).applyMatrix4(base);
      dummy.position.set(point.x, point.y + nod * 0.3, point.z);
      f.hy = point.y;
      dummy.scale.setScalar(S);
      dummy.updateMatrix();
      this.head.setMatrixAt(i, dummy.matrix);
      this.hair.setMatrixAt(i, dummy.matrix);
      const headX = point.x;
      const headY = point.y;
      const headZ = point.z;

      // A drag: hand to mouth, hold, and let it out.
      let drag = 0;
      let inhale = 0;
      if (f.item === Item.Smoke && !still) {
        const u = ((t + f.phase * 3) % f.period) / f.period;
        drag =
          THREE.MathUtils.smoothstep(u, 0, 0.04) * (1 - THREE.MathUtils.smoothstep(u, 0.13, 0.17));
        inhale =
          THREE.MathUtils.smoothstep(u, 0.04, 0.07) *
          (1 - THREE.MathUtils.smoothstep(u, 0.11, 0.13));
        if (u > 0.17 && u < 0.3) {
          f.puff += dt;
          if (f.puff > 0.09) {
            f.puff = 0;
            const out = 0.55 + this.rng() * 0.3;
            point.set(headX + Math.sin(yaw) * 0.16, headY - 0.04, headZ + Math.cos(yaw) * 0.16);
            this.onPuff?.(
              point,
              Math.sin(yaw) * out + (this.rng() - 0.5) * 0.15,
              0.12 + this.rng() * 0.15,
              Math.cos(yaw) * out + (this.rng() - 0.5) * 0.15,
              0.1 + this.rng() * 0.05,
            );
          }
        }
      }

      // Hands go up when the room is hotter than this person's threshold.
      const want = live && fervour > 0.25 + f.spark * 0.55 + (f.sits ? 0.2 : 0) ? 1 : 0;
      f.arms += (want - f.arms) * Math.min(1, dt * (want ? 2.5 : 1.2));
      const rest = f.sits ? 0.8 : 0.12;
      for (const side of [1, -1]) {
        const wave =
          Math.sin(beat * Math.PI * (f.spark > 0.5 ? 1 : 2) + f.phase + side) * 0.25 * f.arms;
        let raise =
          f.arms * (2.75 + wave) +
          (1 - f.arms) *
            (rest + Math.sin(beat * Math.PI + f.phase + side * 1.5) * 0.12 * (0.3 + fervour));
        let roll = side * (0.15 + f.arms * 0.2);
        let reach = 1;
        if (f.wild) {
          // Noodle arms.
          const k = f.roam;
          raise += (1.7 + Math.sin(t * (3 + f.spark * 2) + f.phase + side * 1.7) * 1.3 - raise) * k;
          roll += side * (0.45 + Math.sin(t * 2.3 + f.phase + side) * 0.4) * k;
        }
        const holding = side === -1 || f.twoHands;
        if (f.item === Item.Sign) {
          // Both hands overhead, pumping it at the band when the room lifts.
          raise = 2.9 + (live ? Math.sin(beat * Math.PI + f.phase) * 0.07 * (0.4 + fervour) : 0);
          roll = -side * 0.12;
        } else if (holding && (f.item === Item.Phone || f.item === Item.Camera)) {
          // Held up over the heads in front, as still as a dancing person can manage.
          raise = (f.sits ? 2.1 : 2.5) + (still ? 0 : Math.sin(t * 1.7 + f.phase) * 0.03);
          roll = f.twoHands ? -side * 0.34 : side * 0.08;
        } else if (side === -1 && drag > 0) {
          raise += (2.49 - raise) * drag;
          roll += (0.83 - roll) * drag;
          reach = 1 - 0.5 * drag;
        }
        point.set(side * 0.2, f.sits ? 0.8 : 1.43, f.sits ? -0.05 : 0).applyMatrix4(base);
        arm.position.copy(point);
        arm.rotation.set(-raise, yaw, roll, 'YXZ');
        arm.scale.set(S, S * reach, S);
        arm.updateMatrix();
        (side === 1 ? this.armL : this.armR).setMatrixAt(i, arm.matrix);
        if (side !== -1 || f.item === Item.None) continue;
        tip.position.set(0, -0.62, 0).applyMatrix4(arm.matrix);
        tip.scale.setScalar(S);
        if (f.item === Item.Glowstick) {
          tip.quaternion.copy(arm.quaternion);
          tip.updateMatrix();
          this.sticks.setMatrixAt(f.slot, tip.matrix);
        } else if (f.item === Item.Sign) {
          const sign = this.signs[f.slot];
          point.set(0.2, -0.62 - 0.34, 0).applyMatrix4(arm.matrix);
          sign.position.copy(point);
          sign.rotation.set(-0.12, yaw, sway * 1.5, 'YXZ');
          sign.scale.setScalar(S);
        } else if (f.item === Item.Smoke) {
          tip.updateMatrix();
          this.cherries.setMatrixAt(f.slot, tip.matrix);
          this.cherries.setColorAt(
            f.slot,
            this.color.setRGB(1, 0.3, 0.05).multiplyScalar(0.8 + inhale * 4),
          );
          // A wisp off the end between drags.
          if (!still && this.rng() < dt * 0.9)
            this.onPuff?.(tip.position, 0, 0.18, 0, 0.035 + this.rng() * 0.02);
        } else {
          if (f.twoHands) tip.position.x += Math.cos(yaw) * 0.04;
          tip.rotation.set(0, yaw, f.twoHands && f.item === Item.Phone ? Math.PI / 2 : 0, 'YXZ');
          tip.updateMatrix();
          (f.item === Item.Phone ? this.phones : this.cameras).setMatrixAt(f.slot, tip.matrix);
        }
      }
    });

    // Spinners do not look where they are going.
    for (const s of this.fans) {
      if (!s.wild || s.roam < 0.05) continue;
      for (const j of s.near) {
        const o = this.fans[j];
        const dx = o.cx - s.cx;
        const dz = o.cz - s.cz;
        const d = Math.hypot(dx, dz);
        if (d > 0.62 || d < 1e-4) continue;
        const shove = ((0.62 - d) * 55 * step) / d;
        o.pvx += dx * shove;
        o.pvz += dz * shove;
        s.pvx -= dx * shove * 0.5;
        s.pvz -= dz * shove * 0.5;
        if (d < 0.5 && o.bumpCool <= 0 && !o.wild) {
          o.bumpCool = 6;
          this.bumped = j;
        }
      }
    }

    for (const m of this.moving) m.instanceMatrix.needsUpdate = true;
    if (this.cherries.instanceColor) this.cherries.instanceColor.needsUpdate = true;

    for (const b of this.balloons) {
      const p = b.mesh.position;
      if (!sig.reduced) {
        b.v.y -= 1.1 * dt;
        b.v.multiplyScalar(1 - dt * 0.35);
        p.addScaledVector(b.v, dt);
        if (p.y < 1.9) {
          // Someone punches it back up, harder when the band is cooking.
          p.y = 1.9;
          b.v.y = 1.6 + this.rng() * 1.2 + energy * 1.6;
          b.v.x = (this.rng() - 0.5) * 2.2 - p.x * 0.06;
          b.v.z = (this.rng() - 0.5) * 2.2 - (p.z - 10) * 0.08;
        }
        b.mesh.rotation.z += b.v.x * dt * 0.5;
      }
    }
  }
}
