import * as THREE from 'three';
import { random } from '../../shared/music';
import { hairStreaks } from './textures';
import {
  Spring,
  ball,
  box,
  clamp01,
  cyl,
  damp,
  limbGeometry,
  mergeStatic,
  mesh,
  orient,
  placeSegment,
  sharedMaterial,
  solveIK,
} from './util';

/**
 * A jointed performer. Torso, neck and head are a nested hierarchy that controllers pose directly;
 * arms and legs are solved every frame with two-bone IK so hands land on real frets, keys and
 * drum heads. Stylised, hand-built anatomy rather than motion capture.
 */
export type HairStyle = 'long' | 'curly' | 'beanie' | 'ponytail' | 'cap';
export interface Look {
  seed: number;
  height?: number;
  build?: number;
  skin: number;
  shirt: THREE.Material;
  sleeve?: 'tee' | 'long' | 'tank';
  pants: THREE.Material;
  shoes: number;
  hair: HairStyle;
  hairColor: number;
  accent: number;
  beard?: boolean;
  glasses?: 'round' | 'shades';
  headphones?: boolean;
}

interface Limb {
  upper: THREE.Mesh;
  lower: THREE.Mesh;
  joint: THREE.Mesh;
  l1: number;
  l2: number;
  mid: THREE.Vector3;
  end: THREE.Vector3;
}
interface Hand {
  group: THREE.Group;
  detail: THREE.Group;
  mitt: THREE.Mesh;
  fingers: THREE.Group[][];
  thumb: THREE.Group[];
  curl: number;
  /** Per-finger additional curl, index→pinky, for fretting and key presses. */
  press: [number, number, number, number];
}
interface Curtain {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  rest: Float32Array;
  rows: number;
  cols: number;
  sx: Spring;
  sz: Spring;
}
interface Strand {
  pivot: THREE.Group;
  sx: Spring;
  sz: Spring;
  weight: number;
}

const ARM1 = 0.285;
const ARM2 = 0.255;
const LEG1 = 0.43;
const LEG2 = 0.42;

export class Character {
  readonly root = new THREE.Group();
  readonly hips = new THREE.Group();
  readonly spine = new THREE.Group();
  readonly chest = new THREE.Group();
  readonly neck = new THREE.Group();
  readonly head = new THREE.Group();
  readonly hipsRest = 0.95;
  readonly target = {
    handL: new THREE.Vector3(0.28, 0.95, 0.12),
    handR: new THREE.Vector3(-0.28, 0.95, 0.12),
    footL: new THREE.Vector3(0.12, 0.07, 0.02),
    footR: new THREE.Vector3(-0.12, 0.07, 0.02),
  };
  readonly pole = {
    elbowL: new THREE.Vector3(0.6, -0.5, -0.7),
    elbowR: new THREE.Vector3(-0.6, -0.5, -0.7),
    kneeL: new THREE.Vector3(0.12, 0, 1),
    kneeR: new THREE.Vector3(-0.12, 0, 1),
  };
  /** Which way each palm faces. */
  readonly palm = { L: new THREE.Vector3(0, 0, 1), R: new THREE.Vector3(0, 0, 1) };
  /** Optional wrist break: direction the fingers should point, blended with the forearm. */
  readonly aim = { L: new THREE.Vector3(), R: new THREE.Vector3(), weightL: 0, weightR: 0 };
  readonly footYaw = { L: 0.18, R: -0.18 };
  readonly footPitch = { L: 0, R: 0 };
  readonly handL: Hand;
  readonly handR: Hand;
  readonly face = { mouth: 0, eyesClosed: 0, brow: 0 };
  /** Where the eyes and head want to go, in root space. */
  readonly gaze = new THREE.Vector3(0, 1.6, 6);
  gazeWeight = 0.7;
  /** Extra head motion layered on the gaze: nods and tilts. */
  readonly headBob = new THREE.Euler();
  readonly shoulderL = new THREE.Object3D();
  readonly shoulderR = new THREE.Object3D();
  private readonly hipL = new THREE.Object3D();
  private readonly hipR = new THREE.Object3D();
  private readonly armL: Limb;
  private readonly armR: Limb;
  private readonly legL: Limb;
  private readonly legR: Limb;
  private readonly footL: THREE.Group;
  private readonly footR: THREE.Group;
  private readonly lids: THREE.Mesh[] = [];
  private readonly brows: THREE.Mesh[] = [];
  private readonly eyes: THREE.Group[] = [];
  private readonly mouth: THREE.Mesh;
  private readonly strands: Strand[] = [];
  private curtain: Curtain | null = null;
  private readonly yaw = new Spring(0, 60, 11);
  private readonly pitch = new Spring(0, 60, 11);
  private blinkAt = 1.5;
  private blink = 0;
  private readonly rng: () => number;
  private readonly lastHead = new THREE.Vector3();
  private readonly headVel = new THREE.Vector3();
  readonly skin: THREE.MeshStandardMaterial;
  readonly scale: number;

  constructor(readonly look: Look) {
    this.rng = random(look.seed);
    const build = look.build ?? 1;
    this.scale = look.height ?? 1;
    const skin = (this.skin = new THREE.MeshStandardMaterial({
      color: look.skin,
      roughness: 0.62,
      metalness: 0,
    }));
    const hairMat = new THREE.MeshStandardMaterial({ color: look.hairColor, roughness: 0.85 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: look.shoes, roughness: 0.7 });
    const soleMat = new THREE.MeshStandardMaterial({ color: 0xe9e2cf, roughness: 0.9 });
    const { root, hips, spine, chest, neck, head } = this;
    root.add(hips);
    hips.position.y = this.hipsRest;
    hips.add(spine);
    spine.position.y = 0.1;
    spine.add(chest);
    chest.position.y = 0.17;
    chest.add(neck);
    neck.position.set(0, 0.26, -0.005);
    neck.add(head);
    head.position.y = 0.115;

    // Torso: overlapping ellipsoids read as one body under cloth.
    const pelvis = ball(hips, 1, look.pants, 0, 0, 0, 18);
    pelvis.scale.set(0.165 * build, 0.13, 0.115 * build);
    const belly = ball(spine, 1, look.shirt, 0, 0.04, 0.005, 18);
    belly.scale.set(0.155 * build, 0.17, 0.112 * build);
    const hem = cyl(spine, 0.158 * build, 0.17 * build, 0.16, look.shirt, 0, -0.08, 0, 20, true);
    hem.scale.z = 0.72;
    const ribs = ball(chest, 1, look.shirt, 0, 0.08, 0, 20);
    ribs.scale.set(0.185 * build, 0.2, 0.125 * build);
    const yoke = ball(chest, 1, look.shirt, 0, 0.19, -0.01, 16);
    yoke.scale.set(0.2 * build, 0.075, 0.095 * build);
    for (const m of [pelvis, belly, ribs, yoke, hem]) m.castShadow = true;
    const sx = 0.195 * build;
    this.shoulderL.position.set(sx, 0.2, 0);
    this.shoulderR.position.set(-sx, 0.2, 0);
    chest.add(this.shoulderL, this.shoulderR);
    const sleeveMat = look.sleeve === 'tank' ? skin : look.shirt;
    ball(chest, 0.062 * build, sleeveMat, sx, 0.2, 0);
    ball(chest, 0.062 * build, sleeveMat, -sx, 0.2, 0);
    this.hipL.position.set(0.09 * build, -0.04, 0);
    this.hipR.position.set(-0.09 * build, -0.04, 0);
    hips.add(this.hipL, this.hipR);
    cyl(neck, 0.048, 0.056, 0.13, skin, 0, 0.03, 0, 12);

    // Head.
    const skull = ball(head, 1, skin, 0, 0.02, 0, 22);
    skull.scale.set(0.098, 0.12, 0.112);
    skull.castShadow = true;
    const jaw = ball(head, 1, skin, 0, -0.045, 0.018, 16);
    jaw.scale.set(0.082, 0.075, 0.09);
    const nose = ball(head, 1, skin, 0, -0.005, 0.112, 10);
    nose.scale.set(0.017, 0.028, 0.024);
    for (const side of [1, -1]) {
      const ear = ball(head, 1, skin, side * 0.097, 0.005, 0, 8);
      ear.scale.set(0.012, 0.03, 0.02);
      const eye = new THREE.Group();
      eye.position.set(side * 0.04, 0.028, 0.092);
      head.add(eye);
      ball(
        eye,
        0.0165,
        sharedMaterial(
          'sclera',
          () => new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.25 }),
        ),
        0,
        0,
        0,
        10,
      );
      const iris = mesh(
        eye,
        new THREE.CircleGeometry(0.0085, 12),
        sharedMaterial(
          'iris',
          () => new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.2 }),
        ),
        0,
        0,
        0.0162,
      );
      mesh(
        iris,
        new THREE.CircleGeometry(0.004, 10),
        sharedMaterial('pupil', () => new THREE.MeshBasicMaterial({ color: 0x050505 })),
        0,
        0,
        0.0006,
      );
      eye.userData.dynamic = true;
      this.eyes.push(eye);
      const lid = mesh(
        head,
        new THREE.SphereGeometry(0.0185, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        skin,
        side * 0.04,
        0.028,
        0.092,
      );
      lid.userData.dynamic = true;
      this.lids.push(lid);
      const brow = box(head, 0.036, 0.007, 0.01, hairMat, side * 0.041, 0.056, 0.103);
      brow.rotation.z = side * -0.12;
      brow.userData.dynamic = true;
      this.brows.push(brow);
    }
    this.mouth = ball(
      head,
      1,
      new THREE.MeshStandardMaterial({ color: 0x3a1418, roughness: 0.5 }),
      0,
      -0.058,
      0.098,
      10,
    );
    this.mouth.scale.set(0.026, 0.004, 0.01);
    this.mouth.userData.dynamic = true;
    if (look.beard) {
      const beard = ball(head, 1, hairMat, 0, -0.062, 0.02, 14);
      beard.scale.set(0.088, 0.072, 0.094);
      const stache = box(head, 0.05, 0.012, 0.012, hairMat, 0, -0.04, 0.106);
      stache.rotation.x = 0.2;
    }
    if (look.glasses) {
      const dark = look.glasses === 'shades';
      const frame = new THREE.MeshStandardMaterial({
        color: dark ? 0x111111 : 0xc9a24a,
        roughness: 0.3,
        metalness: 0.8,
      });
      const lens = new THREE.MeshStandardMaterial({
        color: dark ? 0x120a18 : 0xd8f0ff,
        roughness: 0.05,
        metalness: dark ? 0.9 : 0.1,
        transparent: !dark,
        opacity: dark ? 1 : 0.25,
      });
      for (const side of [1, -1]) {
        const ring = mesh(
          head,
          new THREE.TorusGeometry(0.026, 0.003, 6, 20),
          frame,
          side * 0.041,
          0.027,
          0.112,
        );
        mesh(ring, new THREE.CircleGeometry(0.025, 18), lens);
        const temple = box(head, 0.003, 0.003, 0.11, frame, side * 0.083, 0.03, 0.055);
        temple.rotation.y = side * 0.24;
      }
      box(head, 0.03, 0.003, 0.003, frame, 0, 0.034, 0.113);
    }
    this.buildHair(look, hairMat);
    if (look.headphones) {
      const band = mesh(
        head,
        new THREE.TorusGeometry(0.112, 0.011, 8, 24, Math.PI),
        new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.5 }),
        0,
        0.035,
        0,
      );
      band.rotation.y = 0;
      for (const side of [1, -1]) {
        const cup = cyl(
          head,
          0.042,
          0.042,
          0.035,
          band.material as THREE.Material,
          side * 0.108,
          0.005,
          0,
          16,
        );
        cup.rotation.z = Math.PI / 2;
        const led = cyl(
          head,
          0.018,
          0.018,
          0.004,
          new THREE.MeshBasicMaterial({ color: look.accent }),
          side * 0.127,
          0.005,
          0,
          12,
        );
        led.rotation.z = Math.PI / 2;
      }
    }

    // Skull, jaw, ears, glasses and a whole head of curls collapse into a few draws.
    mergeStatic(head);
    neck.userData.dynamic = true;
    mergeStatic(chest);
    chest.userData.dynamic = true;
    mergeStatic(spine);

    // Limbs live in root space and are re-placed from solved joints each frame.
    const upperArmMat = look.sleeve === 'long' ? look.shirt : skin;
    const foreArmMat = look.sleeve === 'long' ? look.shirt : skin;
    const limb = (
      r1: number,
      r2: number,
      r3: number,
      l1: number,
      l2: number,
      m1: THREE.Material,
      m2: THREE.Material,
    ): Limb => {
      const upper = mesh(root, limbGeometry(r1, r2, l1), m1);
      const lower = mesh(root, limbGeometry(r2, r3, l2), m2);
      const joint = ball(root, r2 * 1.02, m2, 0, 0, 0, 10);
      upper.castShadow = lower.castShadow = true;
      return { upper, lower, joint, l1, l2, mid: new THREE.Vector3(), end: new THREE.Vector3() };
    };
    this.armL = limb(0.05 * build, 0.04 * build, 0.029, ARM1, ARM2, upperArmMat, foreArmMat);
    this.armR = limb(0.05 * build, 0.04 * build, 0.029, ARM1, ARM2, upperArmMat, foreArmMat);
    this.legL = limb(0.078 * build, 0.055 * build, 0.042, LEG1, LEG2, look.pants, look.pants);
    this.legR = limb(0.078 * build, 0.055 * build, 0.042, LEG1, LEG2, look.pants, look.pants);
    if (look.sleeve === 'tee') {
      // Short sleeves ride the upper arm.
      for (const arm of [this.armL, this.armR]) {
        const sleeve = cyl(
          arm.upper,
          0.05 * build,
          0.061 * build,
          0.15,
          look.shirt,
          0,
          -0.07,
          0,
          12,
          true,
        );
        sleeve.castShadow = true;
      }
    }
    this.handL = this.buildHand(1, skin);
    this.handR = this.buildHand(-1, skin);
    const foot = () => {
      const g = new THREE.Group();
      const shoe = ball(g, 1, shoeMat, 0, -0.015, 0.06, 12);
      shoe.scale.set(0.05, 0.045, 0.125);
      shoe.castShadow = true;
      const toe = ball(g, 1, soleMat, 0, -0.035, 0.125, 10);
      toe.scale.set(0.048, 0.022, 0.05);
      box(g, 0.092, 0.018, 0.24, soleMat, 0, -0.058, 0.06);
      mergeStatic(g);
      root.add(g);
      return g;
    };
    this.footL = foot();
    this.footR = foot();
    root.scale.setScalar(this.scale);
  }

  private buildHair(look: Look, hairMat: THREE.Material) {
    const { head } = this;
    const rng = this.rng;
    const strand = (
      x: number,
      y: number,
      z: number,
      length: number,
      r: number,
      weight: number,
      mat = hairMat,
    ) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      pivot.userData.dynamic = true;
      head.add(pivot);
      const m = mesh(pivot, limbGeometry(r * 0.35, r, length, 7), mat, 0, -length / 2, 0);
      m.castShadow = true;
      this.strands.push({
        pivot,
        sx: new Spring(0, 38 + rng() * 22, 3.2 + rng() * 2),
        sz: new Spring(0, 38 + rng() * 22, 3.2 + rng() * 2),
        weight,
      });
    };
    if (look.hair === 'long') {
      const cap = ball(head, 1, hairMat, 0, 0.045, -0.012, 18);
      cap.scale.set(0.105, 0.108, 0.118);
      // One continuous sheet of hair from temple to temple, swung as a whole by head motion.
      const cols = 30;
      const rows = 8;
      const positions: number[] = [];
      const uvs: number[] = [];
      const index: number[] = [];
      for (let j = 0; j <= cols; j++) {
        const u = j / cols;
        const a = Math.PI * (0.27 + u * 1.46) + Math.PI / 2;
        // Shorter around the face, longest down the back, with an uneven hem.
        const length = 0.25 + Math.sin(u * Math.PI) * 0.13 + rng() * 0.025;
        for (let i = 0; i <= rows; i++) {
          const t = i / rows;
          const r = 0.099 + Math.sin(t * Math.PI * 0.85) * 0.024 + Math.sin(j * 1.9) * 0.004;
          positions.push(
            Math.cos(a) * r * 0.97,
            0.085 - t * length,
            Math.sin(a) * r * 1.05 - 0.016,
          );
          uvs.push(u, 1 - t);
          if (j < cols && i < rows) {
            const p = j * (rows + 1) + i;
            index.push(p, p + rows + 1, p + 1, p + 1, p + rows + 1, p + rows + 2);
          }
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(index);
      geometry.computeVertexNormals();
      const sheet = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          map: hairStreaks(look.hairColor),
          roughness: 0.55,
          side: THREE.DoubleSide,
        }),
      );
      sheet.castShadow = true;
      sheet.frustumCulled = false;
      sheet.userData.dynamic = true;
      head.add(sheet);
      this.curtain = {
        mesh: sheet,
        rest: Float32Array.from(positions),
        rows,
        cols,
        sx: new Spring(0, 42, 3.4),
        sz: new Spring(0, 42, 3.4),
      };
    } else if (look.hair === 'curly') {
      const under = ball(head, 1, hairMat, 0, 0.03, -0.022, 16);
      under.scale.set(0.106, 0.118, 0.112);
      for (let i = 0; i < 44; i++) {
        const u = rng() * Math.PI * 2;
        const v = Math.acos(1 - rng() * 1.25);
        const r = 0.125 + rng() * 0.03;
        const x = Math.sin(v) * Math.cos(u) * r * 0.95;
        const y = Math.cos(v) * r + 0.04;
        const z = Math.sin(v) * Math.sin(u) * r - 0.015;
        if (z > 0.01 && y < 0.11) continue;
        ball(head, 0.035 + rng() * 0.022, hairMat, x, y, z, 8);
      }
      strand(0.09, 0.0, -0.02, 0.14, 0.03, 0.6);
      strand(-0.09, 0.0, -0.02, 0.14, 0.03, 0.6);
    } else if (look.hair === 'beanie') {
      const knit = new THREE.MeshStandardMaterial({ color: look.accent, roughness: 0.95 });
      const dome = mesh(
        head,
        new THREE.SphereGeometry(0.113, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
        knit,
        0,
        0.04,
        -0.005,
      );
      dome.scale.y = 1.12;
      dome.castShadow = true;
      const cuff = mesh(head, new THREE.TorusGeometry(0.108, 0.018, 8, 24), knit, 0, 0.055, -0.004);
      cuff.rotation.x = Math.PI / 2 + 0.12;
      ball(head, 0.022, knit, 0, 0.172, -0.012, 8);
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * (1.15 + (i / 5) * 0.7);
        strand(Math.cos(a) * 0.095, 0.01, Math.sin(a) * 0.1, 0.09 + rng() * 0.04, 0.026, 0.4);
      }
    } else if (look.hair === 'ponytail') {
      const cap = ball(head, 1, hairMat, 0, 0.042, -0.014, 18);
      cap.scale.set(0.103, 0.105, 0.115);
      const bandMat = new THREE.MeshStandardMaterial({ color: look.accent, roughness: 0.8 });
      const band = mesh(head, new THREE.TorusGeometry(0.104, 0.011, 6, 24), bandMat, 0, 0.07, 0);
      band.rotation.x = Math.PI / 2 - 0.18;
      strand(0, 0.07, -0.118, 0.3, 0.036, 1.4);
      strand(0.015, 0.06, -0.116, 0.24, 0.03, 1.2);
    } else {
      const capMat = new THREE.MeshStandardMaterial({ color: look.accent, roughness: 0.8 });
      const dome = mesh(
        head,
        new THREE.SphereGeometry(0.112, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
        capMat,
        0,
        0.055,
        -0.003,
      );
      dome.castShadow = true;
      const brim = cyl(head, 0.085, 0.085, 0.008, capMat, 0, 0.06, 0.1, 18);
      brim.scale.z = 1.25;
      brim.rotation.x = 0.12;
      const tuft = ball(head, 1, hairMat, 0, 0.0, -0.05, 12);
      tuft.scale.set(0.1, 0.07, 0.085);
    }
  }

  private buildHand(side: 1 | -1, skin: THREE.Material): Hand {
    const group = new THREE.Group();
    this.root.add(group);
    const palm = ball(group, 1, skin, 0, 0.045, 0, 10);
    palm.scale.set(0.043, 0.05, 0.017);
    // Far from the lens a hand is one soft shape; up close it is five articulated fingers.
    const detail = new THREE.Group();
    group.add(detail);
    const mitt = ball(group, 1, skin, 0, 0.1, 0.012, 8);
    mitt.scale.set(0.04, 0.05, 0.022);
    mitt.visible = false;
    const fingers: THREE.Group[][] = [];
    const lengths = [0.04, 0.045, 0.042, 0.034];
    for (let i = 0; i < 4; i++) {
      // Index finger sits on the thumb side.
      const x = -side * (0.03 - i * 0.02);
      const base = new THREE.Group();
      base.position.set(x, 0.088 - Math.abs(i - 1.3) * 0.006, 0);
      detail.add(base);
      mesh(base, limbGeometry(0.0095, 0.0085, lengths[i], 6), skin, 0, lengths[i] / 2, 0);
      const tip = new THREE.Group();
      tip.position.y = lengths[i];
      base.add(tip);
      mesh(tip, limbGeometry(0.0085, 0.007, lengths[i] * 0.85, 6), skin, 0, lengths[i] * 0.42, 0);
      fingers.push([base, tip]);
    }
    const thumbBase = new THREE.Group();
    thumbBase.position.set(-side * 0.04, 0.03, 0.006);
    thumbBase.rotation.z = side * 0.75;
    detail.add(thumbBase);
    mesh(thumbBase, limbGeometry(0.0115, 0.0095, 0.042, 6), skin, 0, 0.021, 0);
    const thumbTip = new THREE.Group();
    thumbTip.position.y = 0.042;
    thumbBase.add(thumbTip);
    mesh(thumbTip, limbGeometry(0.0095, 0.008, 0.032, 6), skin, 0, 0.016, 0);
    return {
      group,
      detail,
      mitt,
      fingers,
      thumb: [thumbBase, thumbTip],
      curl: 0.35,
      press: [0, 0, 0, 0],
    };
  }

  /** Point the head and eyes toward a root-space position, with springy follow-through. */
  private updateHead(dt: number) {
    const { neck, head } = this;
    const local = _v1.copy(this.gaze);
    local.y -= this.hipsRest + 0.1 + 0.17 + 0.26 + 0.115;
    const yawTarget = Math.atan2(local.x, Math.max(0.2, local.z)) * this.gazeWeight;
    const pitchTarget = -Math.atan2(local.y, Math.hypot(local.x, local.z)) * this.gazeWeight;
    const yaw =
      this.yaw.step(Math.max(-1.1, Math.min(1.1, yawTarget)), dt) -
      this.chest.rotation.y -
      this.spine.rotation.y -
      this.hips.rotation.y;
    const pitch = this.pitch.step(Math.max(-0.6, Math.min(0.7, pitchTarget)), dt);
    neck.rotation.set(pitch * 0.4 + this.headBob.x * 0.4, yaw * 0.45, this.headBob.z * 0.4);
    head.rotation.set(
      pitch * 0.6 + this.headBob.x * 0.6,
      yaw * 0.55 + this.headBob.y,
      this.headBob.z * 0.6,
    );
    // Eyes lead the head a little.
    const lead = (yawTarget - this.yaw.x) * 0.6;
    for (const eye of this.eyes) eye.rotation.set(0, Math.max(-0.45, Math.min(0.45, lead)), 0);
  }

  solve(dt: number, time: number) {
    const { root } = this;
    this.updateHead(dt);
    root.updateMatrixWorld(true);
    const inv = _m1.copy(root.matrixWorld).invert();
    const local = (o: THREE.Object3D, out: THREE.Vector3) =>
      o.getWorldPosition(out).applyMatrix4(inv);
    this.solveArm(
      this.armL,
      this.handL,
      local(this.shoulderL, _v2),
      this.target.handL,
      this.pole.elbowL,
      this.palm.L,
      this.aim.L,
      this.aim.weightL,
    );
    this.solveArm(
      this.armR,
      this.handR,
      local(this.shoulderR, _v2),
      this.target.handR,
      this.pole.elbowR,
      this.palm.R,
      this.aim.R,
      this.aim.weightR,
    );
    this.solveLeg(
      this.legL,
      this.footL,
      local(this.hipL, _v2),
      this.target.footL,
      this.pole.kneeL,
      this.footYaw.L,
      this.footPitch.L,
    );
    this.solveLeg(
      this.legR,
      this.footR,
      local(this.hipR, _v2),
      this.target.footR,
      this.pole.kneeR,
      this.footYaw.R,
      this.footPitch.R,
    );

    // Face.
    this.blinkAt -= dt;
    if (this.blinkAt < 0) {
      this.blinkAt = 1.8 + this.rng() * 4.5;
      this.blink = 1;
    }
    this.blink = Math.max(0, this.blink - dt * 7);
    const closed = clamp01(Math.max(this.face.eyesClosed, Math.sin(clamp01(this.blink) * Math.PI)));
    for (const lid of this.lids) lid.rotation.x = -0.55 + closed * 1.75;
    this.brows.forEach((b, i) => {
      b.position.y = 0.056 + this.face.brow * 0.009;
      b.rotation.z = (i ? 1 : -1) * (0.12 - this.face.brow * 0.22);
    });
    this.mouth.scale.y = damp(this.mouth.scale.y, 0.004 + this.face.mouth * 0.02, 18, dt);
    this.mouth.scale.x = 0.026 - this.face.mouth * 0.006;

    // Hair lags behind the head and swings back.
    const headPos = this.head.getWorldPosition(_v3);
    if (this.lastHead.lengthSq() === 0) this.lastHead.copy(headPos);
    this.headVel
      .copy(headPos)
      .sub(this.lastHead)
      .multiplyScalar(1 / Math.max(dt, 1e-3));
    this.lastHead.copy(headPos);
    const hq = this.head.getWorldQuaternion(_q1).invert();
    const v = _v4.copy(this.headVel).applyQuaternion(hq);
    const gravity = _v5.set(0, -1, 0).applyQuaternion(hq);
    for (const s of this.strands) {
      const breeze = Math.sin(time * 1.3 + s.pivot.position.x * 40) * 0.03;
      s.pivot.rotation.x = s.sx.step(-gravity.z * 0.9 + v.z * 0.35 * s.weight + breeze, dt);
      s.pivot.rotation.z = s.sz.step(gravity.x * 0.9 - v.x * 0.35 * s.weight, dt);
    }
    if (this.curtain) {
      const c = this.curtain;
      const swingZ = c.sz.step(-gravity.z * 0.16 + v.z * 0.07, dt);
      const swingX = c.sx.step(-gravity.x * 0.16 + v.x * 0.07, dt);
      const pos = c.mesh.geometry.attributes.position as THREE.BufferAttribute;
      const rest = c.rest;
      for (let j = 0; j <= c.cols; j++)
        for (let i = 1; i <= c.rows; i++) {
          const k = (j * (c.rows + 1) + i) * 3;
          const t = i / c.rows;
          // Tips travel furthest and each lock lags its neighbour a little.
          const w = t * t;
          const ripple = Math.sin(time * 2.1 + j * 0.7) * 0.004 * w;
          pos.setXYZ(
            k / 3,
            rest[k] - swingX * w + ripple,
            rest[k + 1] + Math.abs(swingX + swingZ) * w * 0.25,
            rest[k + 2] - swingZ * w + ripple,
          );
        }
      pos.needsUpdate = true;
    }
    this.poseHand(this.handL, dt);
    this.poseHand(this.handR, dt);
  }

  private poseHand(hand: Hand, _dt: number) {
    hand.fingers.forEach(([base, tip], i) => {
      const c = hand.curl + hand.press[i];
      base.rotation.x = c * 1.0;
      tip.rotation.x = c * 1.25;
    });
    hand.thumb[1].rotation.x = hand.curl * 0.6;
  }

  private solveArm(
    limb: Limb,
    hand: Hand,
    shoulder: THREE.Vector3,
    target: THREE.Vector3,
    pole: THREE.Vector3,
    palm: THREE.Vector3,
    aim: THREE.Vector3,
    aimWeight: number,
  ) {
    const s = _v6.copy(shoulder);
    solveIK(s, target, pole, limb.l1, limb.l2, limb.mid, limb.end);
    placeSegment(limb.upper, s, limb.mid);
    placeSegment(limb.lower, limb.mid, limb.end);
    limb.joint.position.copy(limb.mid);
    const dir = _v7.copy(limb.end).sub(limb.mid).normalize();
    if (aimWeight > 0) dir.lerp(_v8.copy(aim).normalize(), aimWeight).normalize();
    hand.group.position.copy(limb.end);
    orient(hand.group, dir, palm);
  }

  private solveLeg(
    limb: Limb,
    foot: THREE.Group,
    hip: THREE.Vector3,
    ankle: THREE.Vector3,
    pole: THREE.Vector3,
    yaw: number,
    pitch: number,
  ) {
    const h = _v6.copy(hip);
    solveIK(h, ankle, pole, limb.l1, limb.l2, limb.mid, limb.end);
    placeSegment(limb.upper, h, limb.mid);
    placeSegment(limb.lower, limb.mid, limb.end);
    limb.joint.position.copy(limb.mid);
    foot.position.copy(limb.end);
    foot.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  private near = true;
  /** Drop fingers and facial animation when the camera is too far away to see them. */
  setDetail(near: boolean) {
    if (near === this.near) return;
    this.near = near;
    for (const hand of [this.handL, this.handR]) {
      hand.detail.visible = near;
      hand.mitt.visible = !near;
    }
    for (const part of [...this.lids, ...this.brows, ...this.eyes, this.mouth]) part.visible = near;
  }

  /** Root-space position of any object riding this character. */
  toRoot(o: THREE.Object3D, out: THREE.Vector3) {
    return o.getWorldPosition(out).applyMatrix4(_m2.copy(this.root.matrixWorld).invert());
  }
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();
const _v7 = new THREE.Vector3();
const _v8 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _m1 = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
