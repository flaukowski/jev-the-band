import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _m = new THREE.Matrix4();

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
/** Frame-rate independent exponential approach. */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));
export const dampV = (current: THREE.Vector3, target: THREE.Vector3, lambda: number, dt: number) =>
  current.lerp(target, 1 - Math.exp(-lambda * dt));

/** Damped spring for anything that should overshoot: hair, cymbals, cables, heads. */
export class Spring {
  x: number;
  v = 0;
  constructor(
    x = 0,
    public stiffness = 120,
    public damping = 14,
  ) {
    this.x = x;
  }
  step(target: number, dt: number) {
    const h = Math.min(dt, 1 / 30);
    this.v += (this.stiffness * (target - this.x) - this.damping * this.v) * h;
    this.x += this.v * h;
    return this.x;
  }
  kick(amount: number) {
    this.v += amount;
  }
}

/** Put a Y-aligned, centered mesh between two points. +Y end lands on `b`. */
export function placeSegment(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  _a.copy(b).sub(a);
  const len = _a.length();
  if (len < 1e-6) return len;
  mesh.quaternion.setFromUnitVectors(UP, _a.multiplyScalar(1 / len));
  return len;
}

/** Orient so local +Y follows `yAxis` and local +Z leans toward `zHint`. */
export function orient(obj: THREE.Object3D, yAxis: THREE.Vector3, zHint: THREE.Vector3) {
  const y = _a.copy(yAxis).normalize();
  const x = _b.crossVectors(y, zHint);
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0);
  x.normalize();
  const z = _c.crossVectors(x, y);
  _m.makeBasis(x, y, z);
  obj.quaternion.setFromRotationMatrix(_m);
}

const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
/** Analytic two-bone IK. `pole` is the direction the middle joint should bulge toward. */
export function solveIK(
  root: THREE.Vector3,
  target: THREE.Vector3,
  pole: THREE.Vector3,
  l1: number,
  l2: number,
  outMid: THREE.Vector3,
  outEnd: THREE.Vector3,
) {
  _d.copy(target).sub(root);
  let dist = _d.length();
  if (dist < 1e-5) {
    _d.set(0, -1, 0);
    dist = 1e-5;
  } else _d.multiplyScalar(1 / dist);
  dist = Math.max(Math.abs(l1 - l2) + 0.002, Math.min((l1 + l2) * 0.998, dist));
  outEnd.copy(root).addScaledVector(_d, dist);
  const along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const height = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-8) _p.set(0, 0, -1).addScaledVector(_d, _d.z);
  _p.normalize();
  outMid.copy(root).addScaledVector(_d, along).addScaledVector(_p, height);
}

/** Tapered limb segment: Y-aligned, centered, radius `r1` at -Y and `r2` at +Y. */
export function limbGeometry(r1: number, r2: number, length: number, radial = 12) {
  return new THREE.CylinderGeometry(r2, r1, length, radial, 1, false);
}

export function mesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

const boxCache = new Map<string, THREE.BoxGeometry>();
export function box(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
) {
  const key = `${w}|${h}|${d}`;
  let g = boxCache.get(key);
  if (!g) boxCache.set(key, (g = new THREE.BoxGeometry(w, h, d)));
  return mesh(parent, g, material, x, y, z);
}
export function cyl(
  parent: THREE.Object3D,
  rTop: number,
  rBottom: number,
  h: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  radial = 20,
  open = false,
) {
  return mesh(
    parent,
    new THREE.CylinderGeometry(rTop, rBottom, h, radial, 1, open),
    material,
    x,
    y,
    z,
  );
}
export function ball(
  parent: THREE.Object3D,
  r: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  detail = 14,
) {
  return mesh(
    parent,
    new THREE.SphereGeometry(r, detail, Math.max(8, detail - 4)),
    material,
    x,
    y,
    z,
  );
}
export function clearBoxCache() {
  boxCache.clear();
}

/**
 * Lux names a wash; the rig answers with a three-colour chord, never a single flat hue.
 * [key, counter, accent] – key floods the stage, counter rims the players, accent rides beams.
 */
export const washPalettes: Record<string, [number, number, number]> = {
  'amber dusk': [0xff9a3c, 0xc2185b, 0xffd98a],
  'violet ocean': [0x8a4dff, 0x1565ff, 0x38e8ff],
  'acid sunrise': [0xc8ff3d, 0xff7a1a, 0xfff06a],
  'deep blue': [0x2447ff, 0x0b1a8c, 0x6fd6ff],
  'rose garden': [0xff4f93, 0x9c2bd6, 0xffb3c7],
  'forest floor': [0x3fd46b, 0x0e6b52, 0xd4ff7a],
  'moon white': [0xcfe2ff, 0x7c9cff, 0xffffff],
  'ember red': [0xff3b1f, 0xff8a00, 0xffc46b],
  'teal lagoon': [0x19e0c4, 0x0a6cff, 0x9dffea],
  ultraviolet: [0x7a2bff, 0x3a0ca3, 0xff4fd8],
  'peach haze': [0xffab8a, 0xff6f91, 0xffe3b0],
  blackout: [0x0a0f1e, 0x05070f, 0x1a2450],
};

/** Circle of fifths → colour wheel. A modulation up a fifth turns the room one step. */
export const rootHue = (root: number) => (((root * 7) % 12) / 12 + 0.04) % 1;

/** Twelve pitch classes as twelve hues, used by note particles. */
export function pitchColor(midi: number, target = new THREE.Color()) {
  return target.setHSL(rootHue(((midi % 12) + 12) % 12), 0.95, 0.62);
}

const materialCache = new Map<string, THREE.Material>();
/** One shared instance per named material, so static parts can be merged into single draws. */
export function sharedMaterial<T extends THREE.Material>(key: string, make: () => T): T {
  let m = materialCache.get(key);
  if (!m) materialCache.set(key, (m = make()));
  return m as T;
}
export function clearMaterialCache() {
  materialCache.clear();
}

/**
 * Bake every non-moving mesh under `root` into one mesh per material. A detailed prop is hundreds
 * of tiny parts (frets, lugs, knobs, tuners); drawn separately they cost more CPU than the whole
 * light show. Anything flagged `userData.dynamic` — and everything beneath it — is left alone.
 */
export function mergeStatic(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const buckets = new Map<
    THREE.Material,
    { parts: THREE.BufferGeometry[]; cast: boolean; receive: boolean }
  >();
  const local = new THREE.Matrix4();
  const visit = (o: THREE.Object3D) => {
    if (o.userData.dynamic) return;
    for (const child of [...o.children]) visit(child);
    const m = o as THREE.Mesh;
    if (
      !m.isMesh ||
      (o as THREE.InstancedMesh).isInstancedMesh ||
      Array.isArray(m.material) ||
      o === root
    )
      return;
    const source = m.geometry;
    if (!source.attributes.position || !source.attributes.normal || !source.attributes.uv) return;
    const baked = source.index ? source.toNonIndexed() : source.clone();
    for (const name of Object.keys(baked.attributes))
      if (!['position', 'normal', 'uv'].includes(name)) baked.deleteAttribute(name);
    local.multiplyMatrices(inverse, m.matrixWorld);
    baked.applyMatrix4(local);
    // Mirrored parts flip their winding when baked.
    if (local.determinant() < 0) {
      const p = baked.attributes.position.array as Float32Array;
      const nrm = baked.attributes.normal.array as Float32Array;
      const uv = baked.attributes.uv.array as Float32Array;
      for (let i = 0; i < p.length; i += 9)
        for (let k = 0; k < 3; k++) {
          [p[i + k], p[i + 3 + k]] = [p[i + 3 + k], p[i + k]];
          [nrm[i + k], nrm[i + 3 + k]] = [nrm[i + 3 + k], nrm[i + k]];
        }
      for (let i = 0; i < uv.length; i += 6)
        for (let k = 0; k < 2; k++) [uv[i + k], uv[i + 2 + k]] = [uv[i + 2 + k], uv[i + k]];
    }
    let bucket = buckets.get(m.material);
    if (!bucket) buckets.set(m.material, (bucket = { parts: [], cast: false, receive: false }));
    bucket.parts.push(baked);
    bucket.cast ||= m.castShadow;
    bucket.receive ||= m.receiveShadow;
    const parent = m.parent!;
    if (m.children.length) {
      const holder = new THREE.Group();
      holder.position.copy(m.position);
      holder.quaternion.copy(m.quaternion);
      holder.scale.copy(m.scale);
      holder.userData = m.userData;
      while (m.children.length) holder.add(m.children[0]);
      parent.add(holder);
    }
    parent.remove(m);
  };
  visit(root);
  for (const [material, bucket] of buckets) {
    const geometry = mergeGeometries(bucket.parts, false);
    bucket.parts.forEach((g) => g.dispose());
    if (!geometry) continue;
    const merged = new THREE.Mesh(geometry, material);
    merged.castShadow = bucket.cast;
    merged.receiveShadow = bucket.receive;
    merged.userData = { ...root.userData };
    root.add(merged);
  }
}

/** Many thin segments (strap links, cable links, laser beams) drawn as one instanced mesh. */
export class SegmentBatch {
  readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  constructor(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    count: number,
    colored = false,
  ) {
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    if (colored) for (let i = 0; i < count; i++) this.mesh.setColorAt(i, new THREE.Color(0));
    parent.add(this.mesh);
  }
  /** Stretch segment `i` from `a` to `b`. Geometry must be unit length along Y. */
  set(i: number, a: THREE.Vector3, b: THREE.Vector3, stretch = 1) {
    const len = placeSegment(this.dummy, a, b);
    this.dummy.scale.set(1, len * stretch, 1);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this.dummy.matrix);
  }
  hide(i: number) {
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this.dummy.matrix);
  }
  commit() {
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
