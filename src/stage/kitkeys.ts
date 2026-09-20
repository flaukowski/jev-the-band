import * as THREE from 'three';
import type { Patch } from '../../shared/music';
import type { DrumVoice } from './signals';
import { Spring, ball, box, cyl, damp, mergeStatic, mesh, sharedMaterial } from './util';
import { kickHead, label } from './textures';

const chrome = () =>
  sharedMaterial(
    'chrome',
    () => new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.18, metalness: 1 }),
  );
const black = () =>
  sharedMaterial(
    'black',
    () => new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.45 }),
  );

const BLACK = [1, 3, 6, 8, 10];
const WHITE_W = 0.0235;

/** A real 61-key layout (C2–C7). Keys dip and light for exactly as long as the note sounds. */
export class Keyboard {
  readonly group = new THREE.Group();
  readonly low = 36;
  readonly count = 61;
  readonly width: number;
  private readonly whites: THREE.InstancedMesh;
  private readonly blacks: THREE.InstancedMesh;
  private readonly info: { white: boolean; slot: number; x: number }[] = [];
  private readonly depth = new Float32Array(61);
  private readonly down = new Uint8Array(61);
  private readonly glows: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly tint = new THREE.Color();
  private readonly ivory = new THREE.Color(0xb9b3a2);
  private readonly ebony = new THREE.Color(0x111114);
  readonly lamp: THREE.MeshBasicMaterial;

  constructor(
    shell: THREE.Material,
    private readonly accent: THREE.Color,
    style: 'stage' | 'synth' | 'organ',
  ) {
    const g = this.group;
    let whiteCount = 0;
    let blackCount = 0;
    for (let i = 0; i < this.count; i++) {
      const pc = (this.low + i) % 12;
      const white = !BLACK.includes(pc);
      if (white) {
        this.info.push({ white, slot: whiteCount, x: whiteCount * WHITE_W });
        whiteCount++;
      } else {
        this.info.push({ white, slot: blackCount, x: whiteCount * WHITE_W - WHITE_W / 2 });
        blackCount++;
      }
    }
    this.width = whiteCount * WHITE_W;
    const half = this.width / 2 - WHITE_W / 2;
    this.info.forEach((k) => (k.x -= half));
    const keyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.32,
      envMapIntensity: 0.5,
    });
    this.whites = new THREE.InstancedMesh(
      new THREE.BoxGeometry(WHITE_W * 0.93, 0.016, 0.14),
      keyMat,
      whiteCount,
    );
    this.blacks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(WHITE_W * 0.55, 0.014, 0.088),
      keyMat,
      blackCount,
    );
    this.whites.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.blacks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    g.add(this.whites, this.blacks);
    const deep = style === 'organ' ? 0.44 : style === 'synth' ? 0.34 : 0.3;
    const caseW = this.width + (style === 'synth' ? 0.2 : 0.1);
    const body = box(
      g,
      caseW,
      0.07,
      deep,
      shell,
      style === 'synth' ? -0.05 : 0,
      -0.03,
      -deep / 2 + 0.085,
    );
    body.castShadow = true;
    box(g, caseW, 0.05, 0.02, shell, style === 'synth' ? -0.05 : 0, 0.0, 0.08);
    // Control panel behind the keys.
    const panel = new THREE.Group();
    panel.position.set(0, 0.012, -0.12);
    panel.rotation.x = style === 'stage' ? 0 : -0.35;
    g.add(panel);
    const knobMat = black();
    this.lamp = new THREE.MeshBasicMaterial({ color: 0x201008 });
    if (style === 'organ') {
      // Nine drawbars, each pulled to a different length.
      const pulls = [8, 8, 8, 5, 3, 2, 0, 4, 6];
      pulls.forEach((pull, i) => {
        const tone = i < 2 ? 0x6b3a1e : [3, 4, 6, 7].includes(i) ? 0x111111 : 0xf1ead7;
        box(
          panel,
          0.014,
          0.012,
          0.03 + pull * 0.008,
          new THREE.MeshStandardMaterial({ color: tone, roughness: 0.4 }),
          -0.3 + i * 0.02,
          0.012,
          -0.03 + pull * 0.004,
        );
      });
      box(g, caseW, 0.6, 0.03, shell, 0, -0.36, -deep + 0.1);
      for (const x of [-caseW / 2 + 0.015, caseW / 2 - 0.015])
        box(g, 0.03, 0.95, deep, shell, x, -0.5, -deep / 2 + 0.085).castShadow = true;
    } else {
      const n = style === 'synth' ? 16 : 9;
      for (let i = 0; i < n; i++) {
        const k = cyl(
          panel,
          0.0085,
          0.01,
          0.016,
          knobMat,
          -this.width / 2 + 0.06 + i * ((this.width - 0.3) / n),
          0.014,
          -0.025 - (i % 2) * (style === 'synth' ? 0.04 : 0),
          10,
        );
        k.rotation.y = i;
      }
      if (style === 'synth') {
        // Pitch and mod wheels, and a row of patch-cable points.
        for (const dx of [0, 0.035]) {
          const w = cyl(g, 0.02, 0.02, 0.014, knobMat, -this.width / 2 - 0.095 + dx, 0.0, 0.02, 14);
          w.rotation.z = Math.PI / 2;
        }
      }
    }
    const screen = mesh(
      panel,
      new THREE.PlaneGeometry(0.09, 0.03),
      this.lamp,
      this.width / 2 - 0.1,
      0.014,
      -0.03,
    );
    screen.rotation.x = -Math.PI / 2;
    for (let i = 0; i < 12; i++) {
      const glow = mesh(
        g,
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          color: accent,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      ) as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
      glow.rotation.x = -Math.PI / 2;
      glow.visible = false;
      glow.userData.dynamic = true;
      this.glows.push(glow);
    }
    this.write(0, true);
  }
  /** Fold any pitch onto this keybed. */
  index(midi: number) {
    let m = midi;
    while (m < this.low) m += 12;
    while (m > this.low + this.count - 1) m -= 12;
    return m - this.low;
  }
  keyPoint(midi: number, out: THREE.Vector3) {
    const k = this.info[this.index(midi)];
    return out.set(k.x, k.white ? 0.012 : 0.026, k.white ? 0.045 : -0.005);
  }
  clear() {
    this.down.fill(0);
  }
  hold(midi: number) {
    this.down[this.index(midi)] = 1;
  }
  write(dt: number, force = false) {
    let glow = 0;
    let dirty = force;
    for (let i = 0; i < this.count; i++) {
      const k = this.info[i];
      const before = this.depth[i];
      const d = (this.depth[i] = dt
        ? damp(before, this.down[i], this.down[i] ? 60 : 22, dt)
        : this.down[i]);
      if (!force && Math.abs(d - before) < 1e-4 && d < 1e-3) continue;
      dirty = true;
      const target = k.white ? this.whites : this.blacks;
      this.dummy.position.set(k.x, (k.white ? 0 : 0.013) - d * 0.0085, k.white ? 0 : -0.026);
      this.dummy.rotation.x = d * 0.045;
      this.dummy.updateMatrix();
      target.setMatrixAt(k.slot, this.dummy.matrix);
      this.tint.copy(k.white ? this.ivory : this.ebony).lerp(this.accent, d * 0.75);
      target.setColorAt(k.slot, this.tint);
      if (d > 0.05 && glow < this.glows.length) {
        const gl = this.glows[glow++];
        gl.visible = true;
        gl.position.set(k.x, (k.white ? 0.0095 : 0.0215) - d * 0.006, k.white ? 0.012 : -0.028);
        gl.scale.set(WHITE_W * (k.white ? 0.9 : 0.55), k.white ? 0.11 : 0.08, 1);
        gl.material.opacity = d * 0.55;
      }
    }
    for (; glow < this.glows.length; glow++) this.glows[glow].visible = false;
    if (dirty) {
      this.whites.instanceMatrix.needsUpdate = true;
      this.blacks.instanceMatrix.needsUpdate = true;
      if (this.whites.instanceColor) this.whites.instanceColor.needsUpdate = true;
      if (this.blacks.instanceColor) this.blacks.instanceColor.needsUpdate = true;
    }
  }
}

/** Which instrument in June's rig a patch lives on. */
export const patchBoard = (patch: Patch | undefined): 'stage' | 'synth' | 'organ' =>
  patch === 'organ'
    ? 'organ'
    : patch === 'analog' || patch === 'pad' || patch === 'bell'
      ? 'synth'
      : 'stage';
const patchLamp: Record<Patch, number> = {
  piano: 0xfff4d6,
  rhodes: 0xffa53a,
  organ: 0xff5a36,
  analog: 0x4af0ff,
  pad: 0xb37bff,
  bell: 0x9dffb0,
};

/**
 * June's rig: a stage piano/Rhodes with a synth stacked above it, and an organ at her left hand.
 * A hand moves to whichever board carries the patch Jev chose for it.
 */
export class KeysRig {
  readonly group = new THREE.Group();
  readonly boards: Record<'stage' | 'synth' | 'organ', Keyboard>;
  readonly leslieHorn = new THREE.Group();
  private hornSpeed = 0;
  constructor(accent: THREE.Color) {
    const g = this.group;
    const tolex = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.8 });
    const redShell = new THREE.MeshStandardMaterial({
      color: 0x7a1414,
      roughness: 0.35,
      metalness: 0.3,
    });
    const walnut = new THREE.MeshPhysicalMaterial({
      color: 0x4b2813,
      roughness: 0.45,
      clearcoat: 0.5,
    });
    const metal = chrome();
    const stage = new Keyboard(tolex, accent, 'stage');
    // The player stands at the origin facing +Z; every keybed turns its front edge toward her.
    stage.group.position.set(0, 0.93, 0.4);
    stage.group.rotation.y = Math.PI;
    const synth = new Keyboard(redShell, accent, 'synth');
    synth.group.position.set(0, 1.1, 0.57);
    synth.group.rotation.set(-0.2, Math.PI, 0);
    const organ = new Keyboard(walnut, accent, 'organ');
    organ.group.position.set(0.88, 0.98, 0.22);
    organ.group.rotation.y = -Math.PI / 2 - 0.22;
    g.add(stage.group, synth.group, organ.group);
    this.boards = { stage, synth, organ };
    // Z-stand under the stack.
    for (const x of [-0.42, 0.42]) {
      box(g, 0.035, 0.035, 0.62, metal, x, 0.03, 0.5);
      const up = box(g, 0.035, 0.95, 0.035, metal, x, 0.47, 0.62);
      up.rotation.x = -0.14;
      box(g, 0.035, 0.035, 0.34, metal, x, 0.88, 0.46);
      const arm = box(g, 0.03, 0.03, 0.34, metal, x, 1.05, 0.6);
      arm.rotation.x = -0.2;
    }
    box(g, 0.84, 0.03, 0.03, metal, 0, 0.45, 0.64);
    // Sustain and expression pedals.
    const pedal = box(g, 0.07, 0.02, 0.2, metal, -0.1, 0.03, 0.2);
    pedal.rotation.x = 0.12;
    const swell = box(g, 0.1, 0.03, 0.24, black(), 0.14, 0.04, 0.22);
    swell.rotation.x = 0.2;
    const plate = mesh(
      g,
      new THREE.PlaneGeometry(0.22, 0.055),
      new THREE.MeshStandardMaterial({ map: label('JUNE · 73'), roughness: 0.4 }),
      0,
      0.905,
      0.572,
    );
    plate.castShadow = false;
    // Leslie horn, visible through the top louvres, spins up with the organ.
    this.leslieHorn.position.set(1.55, 1.1, -0.85);
    const horn = box(
      this.leslieHorn,
      0.34,
      0.06,
      0.08,
      new THREE.MeshStandardMaterial({ color: 0xcfa048, roughness: 0.3, metalness: 0.8 }),
    );
    horn.castShadow = false;
    this.leslieHorn.userData.dynamic = true;
    g.add(this.leslieHorn);
    mergeStatic(g);
  }
  update(dt: number, left: Patch | undefined, right: Patch | undefined, organActive: boolean) {
    for (const board of Object.values(this.boards)) board.write(dt);
    const lampFor = (board: 'stage' | 'synth' | 'organ') => {
      const p = [left, right].find((x) => x && patchBoard(x) === board);
      this.boards[board].lamp.color.setHex(p ? patchLamp[p] : 0x201008).multiplyScalar(p ? 2.2 : 1);
    };
    lampFor('stage');
    lampFor('synth');
    lampFor('organ');
    // Chorale when idle, tremolo when the organ is speaking.
    this.hornSpeed = damp(this.hornSpeed, organActive ? 40 : 4.5, 1.1, dt);
    this.leslieHorn.rotation.y += this.hornSpeed * dt;
  }
}

interface Struck {
  shell?: THREE.Object3D;
  pulse: number;
  tiltX?: Spring;
  tiltZ?: Spring;
  pivot?: THREE.Object3D;
  glow?: THREE.MeshBasicMaterial;
}

/** Five-piece kit with hats, ride and two crashes. Hit points are where sticks really land. */
export class DrumKit {
  readonly group = new THREE.Group();
  readonly points: Record<DrumVoice | 'crash2', THREE.Vector3> = {
    kick: new THREE.Vector3(0, 0.3, 0.52),
    snare: new THREE.Vector3(0.13, 0.66, 0.36),
    hat: new THREE.Vector3(0.46, 0.86, 0.34),
    ride: new THREE.Vector3(-0.56, 0.93, 0.5),
    crash: new THREE.Vector3(0.52, 1.2, 0.74),
    crash2: new THREE.Vector3(-0.3, 1.27, 0.86),
    tomHi: new THREE.Vector3(0.17, 0.86, 0.66),
    tomMid: new THREE.Vector3(-0.17, 0.86, 0.66),
    tomLo: new THREE.Vector3(-0.5, 0.64, 0.2),
  };
  readonly kickPedal = new THREE.Vector3(-0.13, 0.09, 0.42);
  readonly hatPedal = new THREE.Vector3(0.42, 0.09, 0.4);
  private readonly parts = new Map<string, Struck>();
  private readonly beater = new THREE.Group();
  private readonly beaterSpring = new Spring(0, 260, 16);
  private readonly hatTop = new THREE.Group();
  private hatOpen = 0;
  private readonly frontHead: THREE.Mesh;

  constructor(accent: number) {
    const g = this.group;
    const metal = chrome();
    const wrap = new THREE.MeshPhysicalMaterial({
      color: accent,
      roughness: 0.22,
      metalness: 0.55,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
    });
    const skin = new THREE.MeshStandardMaterial({ color: 0xa8a294, roughness: 0.6 });
    const brass = new THREE.MeshStandardMaterial({
      color: 0xd8a94a,
      roughness: 0.22,
      metalness: 1,
      side: THREE.DoubleSide,
    });
    const rubber = black();

    const drum = (
      name: string,
      p: THREE.Vector3,
      r: number,
      depth: number,
      tilt: [number, number],
      legs = false,
    ) => {
      const pivot = new THREE.Group();
      pivot.position.copy(p);
      pivot.rotation.set(tilt[0], 0, tilt[1]);
      g.add(pivot);
      const shell = cyl(pivot, r, r, depth, wrap, 0, -depth / 2, 0, 28, true);
      shell.castShadow = true;
      const glow = new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const head = cyl(pivot, r * 0.97, r * 0.97, 0.004, skin, 0, -0.002, 0, 28);
      head.userData.dynamic = true;
      const flash = mesh(pivot, new THREE.CircleGeometry(r * 0.95, 28), glow, 0, 0.002, 0);
      flash.rotation.x = -Math.PI / 2;
      flash.userData.dynamic = true;
      cyl(pivot, r * 0.97, r * 0.97, 0.004, skin, 0, -depth + 0.002, 0, 28);
      for (const y of [0.004, -depth - 0.004]) {
        const hoop = mesh(pivot, new THREE.TorusGeometry(r * 1.01, 0.007, 6, 32), metal, 0, y, 0);
        hoop.rotation.x = Math.PI / 2;
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        box(
          pivot,
          0.014,
          Math.min(0.06, depth * 0.5),
          0.012,
          metal,
          Math.cos(a) * (r + 0.004),
          -depth / 2,
          Math.sin(a) * (r + 0.004),
        ).rotation.y = -a;
      }
      if (legs)
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + 0.4;
          const leg = cyl(
            pivot,
            0.006,
            0.006,
            p.y + 0.02,
            metal,
            Math.cos(a) * (r + 0.03),
            -p.y / 2 + 0.01,
            Math.sin(a) * (r + 0.03),
            6,
          );
          leg.rotation.z = Math.cos(a) * 0.08;
        }
      this.parts.set(name, { shell: head, pulse: 0, glow });
      return pivot;
    };
    const snare = drum('snare', this.points.snare, 0.178, 0.14, [0.08, -0.03]);
    // Snare stand.
    cyl(
      g,
      0.012,
      0.012,
      this.points.snare.y - 0.14,
      metal,
      this.points.snare.x,
      (this.points.snare.y - 0.14) / 2,
      this.points.snare.z,
      8,
    );
    this.tripod(g, metal, this.points.snare.x, this.points.snare.z, 0.26);
    snare.castShadow = true;
    drum('tomHi', this.points.tomHi, 0.128, 0.2, [0.42, -0.12]);
    drum('tomMid', this.points.tomMid, 0.152, 0.23, [0.42, 0.12]);
    drum('tomLo', this.points.tomLo, 0.205, 0.4, [0.04, 0.06], true);

    // Kick: lies on its side, logo head faces the crowd.
    const kick = new THREE.Group();
    kick.position.set(0, 0.29, 0.78);
    kick.rotation.x = Math.PI / 2;
    g.add(kick);
    const kr = 0.285;
    cyl(kick, kr, kr, 0.42, wrap, 0, 0, 0, 36, true).castShadow = true;
    const logo = new THREE.MeshStandardMaterial({
      map: kickHead(accent),
      roughness: 0.6,
      emissive: 0xffffff,
      emissiveMap: null,
      emissiveIntensity: 0,
    });
    this.frontHead = mesh(kick, new THREE.CircleGeometry(kr * 0.98, 36), logo, 0, 0.212, 0);
    this.frontHead.rotation.x = -Math.PI / 2;
    this.frontHead.userData.dynamic = true;
    const batter = mesh(kick, new THREE.CircleGeometry(kr * 0.98, 36), skin, 0, -0.212, 0);
    batter.rotation.x = Math.PI / 2;
    const woodHoop = new THREE.MeshPhysicalMaterial({
      color: 0x2a1609,
      roughness: 0.3,
      clearcoat: 1,
    });
    for (const y of [0.215, -0.215]) {
      const hoop = mesh(kick, new THREE.TorusGeometry(kr * 1.02, 0.014, 8, 40), woodHoop, 0, y, 0);
      hoop.rotation.x = Math.PI / 2;
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      box(
        kick,
        0.016,
        0.3,
        0.014,
        metal,
        Math.cos(a) * (kr + 0.006),
        0,
        Math.sin(a) * (kr + 0.006),
      ).rotation.y = -a;
    }
    for (const side of [1, -1]) {
      const spur = cyl(g, 0.007, 0.007, 0.36, metal, side * 0.33, 0.13, 0.9, 6);
      spur.rotation.z = side * -0.75;
      spur.rotation.x = 0.35;
    }
    this.parts.set('kick', { pulse: 0 });
    // Pedal with a beater that actually swings at the batter head.
    box(g, 0.09, 0.012, 0.3, metal, this.kickPedal.x + 0.13, 0.012, 0.42);
    const footboard = box(g, 0.075, 0.01, 0.26, metal, this.kickPedal.x + 0.13, 0.05, 0.41);
    footboard.rotation.x = -0.22;
    this.beater.position.set(0, 0.1, 0.5);
    this.beater.userData.dynamic = true;
    g.add(this.beater);
    cyl(this.beater, 0.004, 0.004, 0.2, metal, 0, 0.1, 0, 6);
    const felt = cyl(
      this.beater,
      0.024,
      0.024,
      0.04,
      new THREE.MeshStandardMaterial({ color: 0xe9e2cf, roughness: 1 }),
      0,
      0.2,
      0,
      12,
    );
    felt.rotation.x = Math.PI / 2;

    // Cymbals: lathe profile with a bell, on sprung tilters.
    const cymbalGeo = (r: number) => {
      const pts = [
        new THREE.Vector2(0.004, 0.022 * (r / 0.23)),
        new THREE.Vector2(r * 0.12, 0.02 * (r / 0.23)),
        new THREE.Vector2(r * 0.22, 0.008 * (r / 0.23)),
      ];
      for (let i = 1; i <= 8; i++)
        pts.push(
          new THREE.Vector2(r * (0.22 + (i / 8) * 0.78), 0.008 * (r / 0.23) * (1 - (i / 8) ** 1.4)),
        );
      return new THREE.LatheGeometry(pts, 40);
    };
    const cymbal = (
      name: string,
      p: THREE.Vector3,
      r: number,
      baseTilt: [number, number],
      stiffness: number,
    ) => {
      cyl(g, 0.0085, 0.0085, p.y - 0.4, metal, p.x, (p.y - 0.4) / 2, p.z + 0.0, 8);
      cyl(g, 0.0065, 0.0065, 0.42, metal, p.x, p.y - 0.2, p.z, 8);
      this.tripod(g, metal, p.x, p.z, 0.3);
      const pivot = new THREE.Group();
      pivot.position.copy(p);
      pivot.userData.dynamic = true;
      g.add(pivot);
      const plate = mesh(pivot, cymbalGeo(r), brass);
      plate.castShadow = true;
      ball(pivot, 0.012, rubber, 0, 0.03, 0, 8);
      const st: Struck = {
        pulse: 0,
        pivot,
        tiltX: new Spring(baseTilt[0], stiffness, 1.6),
        tiltZ: new Spring(baseTilt[1], stiffness * 0.9, 1.6),
      };
      pivot.userData.base = baseTilt;
      this.parts.set(name, st);
      return pivot;
    };
    cymbal('ride', this.points.ride, 0.26, [0.22, 0.12], 55);
    cymbal('crash', this.points.crash, 0.225, [0.2, -0.16], 38);
    cymbal('crash2', this.points.crash2, 0.205, [0.24, 0.1], 42);
    // Hi-hat: bottom cymbal fixed, top rides the pull rod.
    const hp = this.points.hat;
    cyl(g, 0.009, 0.009, hp.y + 0.22, metal, hp.x, (hp.y + 0.22) / 2, hp.z, 8);
    this.tripod(g, metal, hp.x, hp.z, 0.27);
    const bottom = mesh(g, cymbalGeo(0.178), brass, hp.x, hp.y - 0.014, hp.z);
    bottom.rotation.x = Math.PI;
    this.hatTop.position.copy(hp);
    this.hatTop.userData.dynamic = true;
    g.add(this.hatTop);
    mesh(this.hatTop, cymbalGeo(0.178), brass).castShadow = true;
    ball(this.hatTop, 0.011, metal, 0, 0.035, 0, 8);
    this.parts.set('hat', {
      pulse: 0,
      tiltX: new Spring(0, 160, 5),
      tiltZ: new Spring(0, 160, 5),
      pivot: this.hatTop,
    });
    const hatBoard = box(g, 0.075, 0.01, 0.26, metal, hp.x, 0.05, hp.z + 0.06);
    hatBoard.rotation.x = -0.2;

    // Throne.
    const seat = cyl(
      g,
      0.17,
      0.16,
      0.075,
      new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.7 }),
      0,
      0.535,
      -0.04,
      20,
    );
    seat.castShadow = true;
    cyl(g, 0.018, 0.018, 0.5, metal, 0, 0.25, -0.04, 8);
    this.tripod(g, metal, 0, -0.04, 0.26);
    // Mics: overheads are part of the silhouette of every real stage.
    for (const x of [-0.45, 0.45]) {
      cyl(g, 0.008, 0.008, 1.75, metal, x * 1.9, 0.875, 0.2, 6);
      const boom = cyl(g, 0.006, 0.006, 0.75, metal, x * 1.45, 1.72, 0.32, 6);
      boom.rotation.z = Math.PI / 2 + (x > 0 ? 0.25 : -0.25);
      boom.rotation.y = x > 0 ? -0.3 : 0.3;
      const micBody = cyl(g, 0.014, 0.014, 0.11, black(), x, 1.6, 0.45, 8);
      micBody.rotation.x = 0.3;
    }
    mergeStatic(g);
  }

  private tripod(g: THREE.Object3D, metal: THREE.Material, x: number, z: number, spread: number) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + x * 3;
      const leg = cyl(
        g,
        0.006,
        0.006,
        spread * 1.12,
        metal,
        x + Math.cos(a) * spread * 0.45,
        0.11,
        z + Math.sin(a) * spread * 0.45,
        6,
      );
      leg.rotation.set(Math.sin(a) * 1.05, 0, -Math.cos(a) * 1.05);
      ball(
        g,
        0.012,
        metal,
        x + Math.cos(a) * spread * 0.92,
        0.012,
        z + Math.sin(a) * spread * 0.92,
        6,
      );
    }
  }

  strike(voice: DrumVoice | 'crash2', velocity: number) {
    const part = this.parts.get(voice);
    if (!part) return;
    part.pulse = Math.max(part.pulse, velocity);
    if (voice === 'kick') this.beaterSpring.kick(34 * velocity);
    if (part.tiltX && part.tiltZ) {
      const big = voice === 'hat' ? 2.2 : 6.5;
      part.tiltX.kick(-big * velocity);
      part.tiltZ.kick((voice === 'ride' ? 1 : -1) * big * 0.6 * velocity);
    }
    if (voice === 'hat') this.hatOpen = Math.max(this.hatOpen, velocity * 0.6);
  }

  update(dt: number) {
    for (const [name, part] of this.parts) {
      part.pulse *= Math.exp(-dt * (name === 'kick' ? 9 : 13));
      if (part.glow) part.glow.opacity = Math.min(0.3, part.pulse * 0.32);
      if (part.shell) part.shell.position.y = -0.002 - part.pulse * 0.006;
      if (part.pivot && part.tiltX && part.tiltZ) {
        const base = (part.pivot.userData.base as [number, number] | undefined) ?? [0, 0];
        part.pivot.rotation.x = part.tiltX.step(base[0], dt);
        part.pivot.rotation.z = part.tiltZ.step(base[1], dt);
      }
    }
    const kick = this.parts.get('kick')!;
    this.frontHead.position.y = 0.212 + kick.pulse * 0.012;
    (this.frontHead.material as THREE.MeshStandardMaterial).emissiveIntensity = kick.pulse * 0.25;
    this.beater.rotation.x = -0.35 + Math.min(1, Math.max(0, this.beaterSpring.step(0, dt))) * 0.68;
    this.hatOpen = damp(this.hatOpen, 0, 9, dt);
    this.hatTop.position.y = this.points.hat.y + 0.004 + this.hatOpen * 0.02;
  }
}
