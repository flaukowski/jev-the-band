import * as THREE from 'three';
import { fxNames, type Effects } from '../../shared/music';
import { SegmentBatch, ball, box, cyl, damp, mergeStatic, mesh, sharedMaterial } from './util';
import { grille, label, pebble, softDot } from './textures';

const chrome = () =>
  sharedMaterial(
    'chrome',
    () => new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.18, metalness: 1 }),
  );
const blackPlastic = () =>
  sharedMaterial(
    'black',
    () => new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.45 }),
  );

/**
 * Electric guitar or bass, modelled to scale length so fret positions are real:
 * fret n sits at scale·(1 − 2^(−n/12)) from the nut, and the fretting hand goes there.
 * Local frame: +X toward the headstock, +Y toward the low string, +Z out of the top.
 */
export class StringInstrument {
  readonly group = new THREE.Group();
  readonly jack = new THREE.Object3D();
  readonly strapFront = new THREE.Object3D();
  readonly strapBack = new THREE.Object3D();
  readonly headstock = new THREE.Object3D();
  readonly open: number[];
  readonly scaleLength: number;
  readonly nutX: number;
  readonly bridgeX: number;
  private readonly spacing: number;
  private readonly ringing: number[];
  private readonly blurs: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly stringZ: number;

  constructor(kind: 'guitar' | 'bass', finish: number, accent: number) {
    const bass = kind === 'bass';
    this.open = bass ? [28, 33, 38, 43] : [40, 45, 50, 55, 59, 64];
    this.scaleLength = bass ? 0.864 : 0.648;
    this.bridgeX = bass ? -0.15 : -0.12;
    this.nutX = this.bridgeX + this.scaleLength;
    this.spacing = bass ? 0.0135 : 0.0082;
    this.ringing = this.open.map(() => 0);
    const g = this.group;
    const k = bass ? 1.12 : 1;

    // Body outline.
    const hornU = bass ? 0.3 : 0.2;
    const hornL = bass ? 0.2 : 0.18;
    const s = new THREE.Shape();
    s.moveTo(0.15 * k, 0.034);
    s.bezierCurveTo(0.16 * k, 0.08 * k, hornU * k, 0.1 * k, hornU * k, 0.145 * k);
    s.bezierCurveTo((hornU - 0.03) * k, 0.18 * k, 0.08 * k, 0.172 * k, 0.03 * k, 0.142 * k);
    s.bezierCurveTo(-0.01 * k, 0.118 * k, -0.05 * k, 0.118 * k, -0.09 * k, 0.142 * k);
    s.bezierCurveTo(-0.17 * k, 0.19 * k, -0.3 * k, 0.13 * k, -0.3 * k, 0.0);
    s.bezierCurveTo(-0.3 * k, -0.14 * k, -0.17 * k, -0.195 * k, -0.09 * k, -0.146 * k);
    s.bezierCurveTo(-0.05 * k, -0.12 * k, -0.01 * k, -0.12 * k, 0.03 * k, -0.14 * k);
    s.bezierCurveTo(0.07 * k, -0.17 * k, (hornL - 0.03) * k, -0.17 * k, hornL * k, -0.14 * k);
    s.bezierCurveTo(hornL * k, -0.1 * k, 0.16 * k, -0.08 * k, 0.15 * k, -0.034);
    s.closePath();
    const bodyGeometry = new THREE.ExtrudeGeometry(s, {
      depth: 0.036,
      bevelEnabled: true,
      bevelSize: 0.008,
      bevelThickness: 0.008,
      bevelSegments: 3,
      curveSegments: 18,
    });
    bodyGeometry.translate(0, 0, -0.018);
    const burst = document.createElement('canvas');
    burst.width = burst.height = 256;
    const ctx = burst.getContext('2d')!;
    const c = new THREE.Color(finish);
    const grad = ctx.createRadialGradient(140, 128, 10, 128, 128, 150);
    grad.addColorStop(0, `#${c.clone().lerp(new THREE.Color(0xffe2a0), 0.55).getHexString()}`);
    grad.addColorStop(0.45, `#${c.getHexString()}`);
    grad.addColorStop(0.8, `#${c.clone().multiplyScalar(0.28).getHexString()}`);
    grad.addColorStop(1, '#0a0605');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    // Flame figure under the lacquer.
    ctx.globalAlpha = 0.12;
    for (let y = 0; y < 256; y += 5) {
      ctx.fillStyle = y % 10 ? '#000' : '#fff';
      ctx.fillRect(0, y + Math.sin(y * 0.4) * 2, 256, 2.5);
    }
    const burstTexture = new THREE.CanvasTexture(burst);
    burstTexture.colorSpace = THREE.SRGBColorSpace;
    burstTexture.repeat.set(1 / (0.62 * k), 1 / (0.4 * k));
    burstTexture.offset.set(0.31 / 0.62 + 0.02, 0.5);
    const lacquer = new THREE.MeshPhysicalMaterial({
      map: burstTexture,
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    });
    const body = mesh(g, bodyGeometry, lacquer);
    body.castShadow = true;
    const top = 0.027;
    const metal = chrome();
    const plastic = blackPlastic();
    const cream = new THREE.MeshStandardMaterial({ color: 0xe9dfc3, roughness: 0.5 });

    // Neck, fretboard, frets, inlays.
    const neckStart = 0.11 * k;
    const neckLen = this.nutX - neckStart;
    const maple = new THREE.MeshStandardMaterial({
      color: bass ? 0xc99a5b : 0x7a4526,
      roughness: 0.4,
    });
    const rosewood = new THREE.MeshStandardMaterial({ color: 0x23140d, roughness: 0.55 });
    const neckWidth = (this.open.length - 1) * this.spacing + 0.014;
    const neck = cyl(g, 0.5, 0.5, neckLen, maple, neckStart + neckLen / 2, 0, top - 0.004, 14);
    neck.rotation.z = Math.PI / 2;
    neck.scale.set(neckWidth, 1, 0.024);
    neck.castShadow = true;
    const boardZ = top + 0.011;
    box(g, neckLen + 0.035, neckWidth, 0.006, rosewood, neckStart + neckLen / 2 - 0.017, 0, boardZ);
    const fretCount = bass ? 20 : 22;
    for (let f = 1; f <= fretCount; f++) {
      const x = this.nutX - this.scaleLength * (1 - 2 ** (-f / 12));
      box(g, 0.0022, neckWidth, 0.0025, metal, x, 0, boardZ + 0.004);
      if ([3, 5, 7, 9, 15, 17, 19, 21].includes(f) || f === 12) {
        const x0 = this.nutX - this.scaleLength * (1 - 2 ** (-(f - 0.5) / 12));
        for (const y of f === 12 ? [-neckWidth * 0.25, neckWidth * 0.25] : [0]) {
          const dot = cyl(g, 0.0032, 0.0032, 0.001, cream, x0, y, boardZ + 0.0033, 10);
          dot.rotation.x = Math.PI / 2;
        }
      }
    }
    box(g, 0.005, neckWidth, 0.008, cream, this.nutX + 0.002, 0, boardZ + 0.003);
    // Headstock, slightly pitched back, with tuners.
    const head = new THREE.Group();
    head.position.set(this.nutX + 0.004, 0, top);
    head.rotation.y = 0.14;
    g.add(head);
    const hs = new THREE.Shape();
    const hl = bass ? 0.2 : 0.17;
    hs.moveTo(0, -neckWidth / 2);
    hs.bezierCurveTo(0.03, -0.04, hl * 0.8, -0.045, hl, -0.025);
    hs.bezierCurveTo(hl + 0.015, 0.0, hl, 0.035, hl * 0.85, 0.042);
    hs.bezierCurveTo(hl * 0.4, 0.05, 0.03, 0.04, 0, neckWidth / 2);
    const headGeo = new THREE.ExtrudeGeometry(hs, {
      depth: 0.013,
      bevelEnabled: true,
      bevelSize: 0.002,
      bevelThickness: 0.002,
      bevelSegments: 1,
    });
    headGeo.translate(0, 0, -0.008);
    mesh(head, headGeo, lacquer);
    this.headstock.position.set(hl, 0, 0.01);
    head.add(this.headstock);
    this.open.forEach((_, i) => {
      const n = this.open.length;
      const side = bass ? 1 : i < n / 2 ? 1 : -1;
      const slot = bass ? i : i < n / 2 ? i : n - 1 - i;
      const x = 0.035 + slot * (bass ? 0.042 : 0.043);
      const y = side * (bass ? 0.03 : 0.034);
      const post = cyl(head, 0.0035, 0.0035, 0.018, metal, x, y * 0.55, 0.01, 8);
      post.rotation.x = Math.PI / 2;
      const key = ball(head, 1, metal, x, y + side * 0.014, -0.004, 8);
      key.scale.set(bass ? 0.013 : 0.009, 0.007, 0.004);
    });

    // Hardware.
    const pickup = (x: number, covered: boolean) => {
      const w = (this.open.length - 1) * this.spacing + 0.022;
      box(g, bass ? 0.03 : 0.038, w, 0.012, covered ? metal : plastic, x, 0, top + 0.004);
      for (let i = 0; i < this.open.length; i++)
        for (const dx of bass ? [0] : [-0.009, 0.009]) {
          const pole = cyl(
            g,
            0.0022,
            0.0022,
            0.002,
            covered ? plastic : metal,
            x + dx,
            this.stringY(i),
            top + 0.0108,
            8,
          );
          pole.rotation.x = Math.PI / 2;
        }
    };
    if (bass) {
      pickup(this.bridgeX + 0.2, false);
      pickup(this.bridgeX + 0.09, false);
      const guard = new THREE.Shape();
      guard.moveTo(0.14 * k, -0.03);
      guard.bezierCurveTo(0.2 * k, -0.06, 0.2 * k, -0.13 * k, 0.12 * k, -0.135 * k);
      guard.bezierCurveTo(0.0, -0.13 * k, -0.06 * k, -0.11 * k, -0.1 * k, -0.06);
      guard.lineTo(-0.02, 0.05);
      guard.lineTo(0.14 * k, 0.05);
      const tortoise = new THREE.MeshPhysicalMaterial({
        color: 0x3b1408,
        roughness: 0.25,
        clearcoat: 1,
      });
      mesh(g, new THREE.ShapeGeometry(guard), tortoise, 0, 0, top + 0.0012);
    } else {
      pickup(this.bridgeX + 0.155, true);
      pickup(this.bridgeX + 0.045, true);
      for (const side of [1, -1]) {
        // f-holes: this one is semi-hollow, like the guitars that built the genre.
        const hole = ball(g, 1, plastic, -0.07, side * 0.1, top + 0.0005, 10);
        hole.scale.set(0.05, 0.007, 0.0012);
        hole.rotation.z = side * 0.2;
      }
    }
    box(
      g,
      0.016,
      (this.open.length - 1) * this.spacing + 0.03,
      0.012,
      metal,
      this.bridgeX,
      0,
      top + 0.006,
    );
    if (!bass) box(g, 0.012, 0.085, 0.01, metal, this.bridgeX - 0.045, 0, top + 0.005);
    const knobMat = new THREE.MeshStandardMaterial({
      color: bass ? 0xcfd3d6 : 0xe0b15a,
      roughness: 0.3,
      metalness: bass ? 1 : 0.2,
    });
    (bass
      ? [
          [-0.16, -0.1],
          [-0.2, -0.085],
          [-0.235, -0.06],
        ]
      : [
          [-0.16, -0.09],
          [-0.205, -0.075],
          [-0.175, -0.125],
          [-0.225, -0.11],
        ]
    ).forEach(([x, y]) => {
      const knob = cyl(g, 0.009, 0.011, 0.012, knobMat, x * k, y * k, top + 0.007, 12);
      knob.rotation.x = Math.PI / 2;
    });
    const sw = cyl(g, 0.002, 0.002, 0.018, metal, 0.06 * k, 0.12 * k, top + 0.01, 6);
    sw.rotation.x = Math.PI / 2 - 0.4;
    this.jack.position.set(-0.22 * k, -0.15 * k, 0);
    this.strapFront.position.set((hornU - 0.01) * k, 0.15 * k, -0.005);
    this.strapBack.position.set(-0.3 * k, 0, -0.005);
    g.add(this.jack, this.strapFront, this.strapBack);

    // Strings, plus an additive blur that widens while a string rings.
    this.stringZ = boardZ + 0.0075;
    this.open.forEach((_, i) => {
      const wound = i < (bass ? 4 : 3);
      const r = bass ? 0.0021 - i * 0.0003 : 0.0013 - i * 0.00014;
      const stringMat = sharedMaterial(
        wound ? 'string-wound' : 'string-plain',
        () =>
          new THREE.MeshStandardMaterial({
            color: wound ? 0xb9a27a : 0xe6e8ea,
            roughness: 0.3,
            metalness: 1,
          }),
      );
      const str = cyl(
        g,
        r,
        r,
        this.scaleLength + 0.02,
        stringMat,
        (this.nutX + this.bridgeX) / 2,
        this.stringY(i),
        this.stringZ,
        5,
      );
      str.rotation.z = Math.PI / 2;
      const blur = mesh(
        g,
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          color: accent,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
        0,
        this.stringY(i),
        this.stringZ + 0.0006,
      );
      blur.userData.dynamic = true;
      this.blurs.push(blur as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>);
    });
    mergeStatic(g);
  }

  stringY(i: number) {
    return ((this.open.length - 1) / 2 - i) * this.spacing;
  }
  /** Choose the string a player would actually use: mid-neck positions over open strings. */
  locate(midi: number): { string: number; fret: number } {
    let best = { string: 0, fret: 0 };
    let cost = Infinity;
    this.open.forEach((open, string) => {
      const fret = midi - open;
      if (fret < 0 || fret > 19) return;
      const c = Math.abs(fret - 7) + (fret === 0 ? 3 : 0);
      if (c < cost) {
        cost = c;
        best = { string, fret };
      }
    });
    if (cost === Infinity)
      best = {
        string: midi < this.open[0] ? 0 : this.open.length - 1,
        fret: midi < this.open[0] ? 1 : 17,
      };
    return best;
  }
  fretX(fret: number) {
    return this.nutX - this.scaleLength * (1 - 2 ** (-Math.max(0.3, fret - 0.45) / 12));
  }
  ring(string: number, fret: number, amount: number) {
    this.ringing[string] = Math.max(this.ringing[string], amount);
    const from = this.fretX(fret);
    const blur = this.blurs[string];
    blur.position.x = (from + this.bridgeX) / 2;
    blur.scale.x = from - this.bridgeX;
  }
  update(dt: number, time: number) {
    this.blurs.forEach((blur, i) => {
      this.ringing[i] *= Math.exp(-dt * (2.2 + i * 0.5));
      const a = this.ringing[i];
      blur.material.opacity = Math.min(0.85, a * 1.4);
      blur.scale.y = 0.0015 + a * (0.011 - i * 0.0008) * (0.75 + 0.25 * Math.sin(time * 90 + i));
    });
  }
  localPoint(x: number, string: number, lift: number, out: THREE.Vector3) {
    return out.set(x, this.stringY(string), this.stringZ + lift);
  }
}

/** A chain of short flat segments re-threaded each frame through moving anchor points. */
export class Ribbon {
  private readonly batch: SegmentBatch;
  private readonly curve = new THREE.CatmullRomCurve3([], false, 'catmullrom', 0.5);
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  constructor(
    parent: THREE.Object3D,
    private readonly segments: number,
    width: number,
    thickness: number,
    material: THREE.Material,
  ) {
    this.batch = new SegmentBatch(
      parent,
      new THREE.BoxGeometry(width, 1, thickness),
      material,
      segments,
    );
    this.batch.mesh.castShadow = true;
  }
  thread(points: THREE.Vector3[]) {
    this.curve.points = points;
    const n = this.segments;
    this.curve.getPoint(0, this.a);
    for (let i = 0; i < n; i++) {
      this.curve.getPoint((i + 1) / n, this.b);
      this.batch.set(i, this.a, this.b, 1.08);
      this.a.copy(this.b);
    }
    this.batch.commit();
  }
}

/** Verlet instrument cable: pinned at the jack and the amp, draped on the deck between. */
export class Cable {
  private readonly points: THREE.Vector3[] = [];
  private readonly previous: THREE.Vector3[] = [];
  private readonly batch: SegmentBatch;
  private readonly rest: number;
  constructor(
    parent: THREE.Object3D,
    from: THREE.Vector3,
    private readonly to: THREE.Vector3,
    slack = 1.35,
    color = 0x0b0b0c,
    private readonly floor = 0.012,
  ) {
    const n = 18;
    this.rest = (from.distanceTo(to) * slack) / (n - 1);
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    this.batch = new SegmentBatch(
      parent,
      new THREE.CylinderGeometry(0.0085, 0.0085, 1, 6),
      material,
      n - 1,
    );
    for (let i = 0; i < n; i++) {
      const p = from.clone().lerp(to, i / (n - 1));
      this.points.push(p);
      this.previous.push(p.clone());
    }
  }
  update(from: THREE.Vector3, dt: number) {
    const pts = this.points;
    const n = pts.length;
    const h = Math.min(dt, 1 / 30);
    for (let i = 1; i < n - 1; i++) {
      const p = pts[i];
      const q = this.previous[i];
      const vx = (p.x - q.x) * 0.96;
      const vy = (p.y - q.y) * 0.96;
      const vz = (p.z - q.z) * 0.96;
      q.copy(p);
      p.x += vx;
      p.y += vy - 9.8 * h * h;
      p.z += vz;
    }
    for (let iteration = 0; iteration < 6; iteration++) {
      pts[0].copy(from);
      pts[n - 1].copy(this.to);
      for (let i = 0; i < n - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        _d.copy(b).sub(a);
        const len = _d.length() || 1e-6;
        const diff = ((len - this.rest) / len) * 0.5;
        if (i > 0) a.addScaledVector(_d, diff);
        if (i < n - 2) b.addScaledVector(_d, -diff);
      }
      for (let i = 1; i < n - 1; i++) {
        if (pts[i].y < this.floor) {
          pts[i].y = this.floor;
          // Rubber on wood: the cable grips the deck rather than sliding forever.
          this.previous[i].x = damp(this.previous[i].x, pts[i].x, 30, h);
          this.previous[i].z = damp(this.previous[i].z, pts[i].z, 30, h);
        }
      }
    }
    for (let i = 0; i < n - 1; i++) this.batch.set(i, pts[i], pts[i + 1], 1.05);
    this.batch.commit();
  }
}
const _d = new THREE.Vector3();

const pedalColors: Record<(typeof fxNames)[number], number> = {
  drive: 0xf2b21b,
  wah: 0x16161a,
  envelope: 0x8a2be2,
  chorus: 0x2aa9e0,
  tremolo: 0x2fae66,
  delay: 0xe8e4d8,
  reverb: 0xd0432f,
};

/**
 * Seven pedals matching the seven effects Jev can switch. Each LED shows the player's actual
 * committed effect state, so the floor tells the same truth as the decision feed.
 */
export class Pedalboard {
  readonly group = new THREE.Group();
  private readonly leds = new Map<string, THREE.MeshBasicMaterial>();
  private readonly glow = new Map<string, number>();
  readonly switches = new Map<string, THREE.Vector3>();
  constructor() {
    const g = this.group;
    const boardMat = new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.8 });
    const b = box(g, 0.98, 0.03, 0.34, boardMat, 0, 0.05, 0);
    b.rotation.x = 0.16;
    b.castShadow = true;
    const metal = chrome();
    fxNames.forEach((name, i) => {
      const x = -0.39 + i * 0.13;
      const wah = name === 'wah';
      const pedal = new THREE.Group();
      pedal.position.set(x, 0.085, 0.0);
      pedal.rotation.x = 0.16;
      g.add(pedal);
      const shell = new THREE.MeshStandardMaterial({
        color: pedalColors[name],
        roughness: 0.35,
        metalness: 0.45,
      });
      box(pedal, 0.105, 0.045, wah ? 0.27 : 0.17, shell);
      if (wah) {
        const rocker = box(
          pedal,
          0.09,
          0.015,
          0.24,
          new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.9 }),
          0,
          0.035,
          0,
        );
        rocker.rotation.x = -0.18;
      } else {
        const sw = cyl(pedal, 0.011, 0.011, 0.016, metal, 0, 0.03, 0.05, 10);
        sw.castShadow = false;
        for (const dx of [-0.028, 0, 0.028])
          cyl(pedal, 0.009, 0.01, 0.014, blackPlastic(), dx, 0.03, -0.05, 10);
      }
      const led = new THREE.MeshBasicMaterial({ color: 0x180000 });
      ball(pedal, 0.0075, led, wah ? 0.04 : 0, 0.028, wah ? -0.12 : -0.012, 8);
      this.leds.set(name, led);
      this.glow.set(name, 0);
      this.switches.set(name, new THREE.Vector3(x, 0.13, 0.05));
    });
    // Patch cables between pedals.
    const patch = new THREE.MeshStandardMaterial({ color: 0x1d5fd1, roughness: 0.5 });
    for (let i = 0; i < 6; i++) {
      const loop = mesh(
        g,
        new THREE.TorusGeometry(0.03, 0.005, 6, 12, Math.PI),
        patch,
        -0.325 + i * 0.13,
        0.085,
        -0.1,
      );
      loop.rotation.x = -0.4;
    }
    mergeStatic(g);
  }
  update(effects: Effects | undefined, dt: number) {
    for (const name of fxNames) {
      const on = effects?.[name] ? 1 : 0;
      const v = damp(this.glow.get(name)!, on, 16, dt);
      this.glow.set(name, v);
      this.leds.get(name)!.color.setRGB(0.1 + v * 3.2, v * 0.35, v * 0.2);
    }
  }
}

/** Backline cabinet whose grille breathes light with the player's real signal level. */
export class Amp {
  readonly group = new THREE.Group();
  readonly input = new THREE.Object3D();
  private readonly cones: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly pilot: THREE.MeshBasicMaterial;
  private readonly color: THREE.Color;
  constructor(
    kind: 'combo' | 'fridge' | 'leslie' | 'wedge',
    accent: number,
    shared: { pebble: THREE.Texture },
  ) {
    const g = this.group;
    this.color = new THREE.Color(accent);
    const tolex = new THREE.MeshStandardMaterial({
      color: kind === 'combo' ? 0xb08a4a : kind === 'leslie' ? 0x4a2a16 : 0x121214,
      roughness: 0.85,
      bumpMap: shared.pebble,
      bumpScale: 0.6,
    });
    const cloth = new THREE.MeshStandardMaterial({
      map: kind === 'combo' ? grille(0x6b4a26, 0xd9b36a) : grille(0x101012, 0x5a5a60, 4),
      roughness: 0.95,
    });
    const metal = chrome();
    this.pilot = new THREE.MeshBasicMaterial({ color: 0x300000 });
    const cone = (x: number, y: number, r: number, z: number) => {
      const m = mesh(
        g,
        new THREE.CircleGeometry(r, 24),
        new THREE.MeshBasicMaterial({
          color: accent,
          map: softDot(),
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
        x,
        y,
        z,
      ) as THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
      m.userData.dynamic = true;
      this.cones.push(m);
    };
    if (kind === 'combo') {
      const cab = box(g, 0.78, 0.62, 0.3, tolex, 0, 0.45, 0);
      cab.castShadow = true;
      cab.rotation.x = -0.12;
      const front = box(g, 0.7, 0.44, 0.01, cloth, 0, 0.42, 0.163);
      front.rotation.x = -0.12;
      const panel = box(g, 0.7, 0.05, 0.08, metal, 0, 0.765, 0.04);
      panel.rotation.x = -0.12;
      for (let i = 0; i < 7; i++)
        cyl(g, 0.014, 0.016, 0.02, blackPlastic(), -0.24 + i * 0.075, 0.8, 0.045, 10);
      ball(g, 0.012, this.pilot, 0.3, 0.8, 0.045, 8);
      for (const x of [-0.3, 0.3])
        box(g, 0.03, 0.2, 0.34, metal, x, 0.08, -0.02).rotation.x = -0.12;
      cone(-0.17, 0.42, 0.15, 0.172);
      cone(0.17, 0.42, 0.15, 0.172);
      this.cones.forEach((c) => (c.rotation.x = -0.12));
      this.input.position.set(-0.3, 0.8, 0.06);
    } else if (kind === 'fridge') {
      box(g, 0.66, 1.2, 0.42, tolex, 0, 0.6, 0).castShadow = true;
      box(g, 0.6, 1.1, 0.01, cloth, 0, 0.6, 0.212);
      for (let r = 0; r < 4; r++)
        for (const x of [-0.145, 0.145]) cone(x, 0.18 + r * 0.28, 0.125, 0.22);
      box(g, 0.62, 0.22, 0.34, tolex, 0, 1.31, 0).castShadow = true;
      box(g, 0.56, 0.1, 0.01, metal, 0, 1.31, 0.172);
      for (let i = 0; i < 8; i++) {
        const k = cyl(g, 0.013, 0.015, 0.02, blackPlastic(), -0.22 + i * 0.058, 1.31, 0.185, 10);
        k.rotation.x = Math.PI / 2;
      }
      ball(g, 0.011, this.pilot, 0.25, 1.31, 0.18, 8);
      const plate = mesh(
        g,
        new THREE.PlaneGeometry(0.2, 0.05),
        new THREE.MeshStandardMaterial({ map: label('MOSS'), roughness: 0.5 }),
        -0.18,
        1.14,
        0.218,
      );
      plate.castShadow = false;
      this.input.position.set(-0.26, 1.31, 0.19);
    } else if (kind === 'leslie') {
      const wood = new THREE.MeshPhysicalMaterial({
        color: 0x5a3018,
        roughness: 0.4,
        clearcoat: 0.6,
      });
      box(g, 0.72, 1.02, 0.52, wood, 0, 0.51, 0).castShadow = true;
      for (let i = 0; i < 5; i++) {
        box(g, 0.6, 0.018, 0.02, blackPlastic(), 0, 0.82 + i * 0.035, 0.262).rotation.x = 0.5;
        box(g, 0.6, 0.018, 0.02, blackPlastic(), 0, 0.12 + i * 0.035, 0.262).rotation.x = 0.5;
      }
      cone(0, 0.89, 0.16, 0.27);
      cone(0, 0.19, 0.2, 0.27);
      this.cones[0].scale.set(1.8, 0.5, 1);
      this.cones[1].scale.set(1.5, 0.4, 1);
      ball(g, 0.01, this.pilot, 0.3, 0.52, 0.265, 8);
      this.input.position.set(0.3, 0.1, -0.2);
    } else {
      // Floor monitor wedge.
      const wedge = new THREE.Shape();
      wedge.moveTo(-0.24, 0);
      wedge.lineTo(0.2, 0);
      wedge.lineTo(0.2, 0.12);
      wedge.lineTo(-0.1, 0.34);
      wedge.lineTo(-0.24, 0.34);
      const geo = new THREE.ExtrudeGeometry(wedge, { depth: 0.62, bevelEnabled: false });
      geo.translate(0, 0, -0.31);
      const m = mesh(g, geo, tolex);
      m.rotation.y = Math.PI / 2;
      m.castShadow = true;
      const face = box(g, 0.56, 0.01, 0.36, cloth, 0, 0.235, -0.05);
      face.rotation.x = -0.63;
      cone(0, 0.245, 0.13, -0.045);
      this.cones[0].rotation.x = -0.63 - Math.PI / 2;
    }
    g.add(this.input);
    mergeStatic(g);
  }
  update(level: number, time: number) {
    const pulse = Math.min(1, level * 1.5);
    this.cones.forEach((c, i) => {
      c.material.opacity = pulse * 0.5;
      const s = 1 + pulse * 0.18 * (0.7 + 0.3 * Math.sin(time * 40 + i));
      c.scale.x = (c.userData.sx ??= c.scale.x) * s;
      c.scale.y = (c.userData.sy ??= c.scale.y) * s;
    });
    this.pilot.color.setRGB(1.6 + pulse * 2.5, 0.12 + pulse * 0.5, 0.05);
  }
}

let ampTextures: { pebble: THREE.Texture } | null = null;
export function sharedAmpTextures() {
  return ampTextures ?? (ampTextures = { pebble: pebble() });
}
export function resetAmpTextures() {
  ampTextures = null;
}
