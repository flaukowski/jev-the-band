import * as THREE from 'three';
import { random } from '../../shared/music';
import type { Signals } from './signals';
import { Amp, sharedAmpTextures } from './strings';
import { banner as bannerArt, grille, softDot, stageDeck, weave } from './textures';
import { box, cyl, damp, mergeStatic, mesh } from './util';

const NOISE = /* glsl */ `
float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1,0)), u.x), mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float a = 0.5, v = 0.0;
  for (int i = 0; i < 4; i++){ v += a * vnoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 3.1; a *= 0.5; }
  return v;
}
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
`;

/**
 * The liquid light show. One pattern family per mode, cross-faded as the band modulates:
 *   dorian → oil-and-water projection · mixolydian → turning mandala
 *   minor  → deep tunnel               · major      → op-art sunburst
 * Hue follows the key around the circle of fifths. Each musician owns a ripple source, so a
 * bass note visibly pushes the oil from Moss's side of the wall.
 */
const backdropFragment = /* glsl */ `
uniform float uTime, uBeat, uEnergy, uKick, uHue, uIntensity, uSolo, uAspect;
uniform vec4 uMode;
uniform vec3 uPalA, uPalB, uPalC;
uniform vec4 uRipple[4];
varying vec2 vUv;
${NOISE}
vec3 pal(float t){
  t = fract(t);
  vec3 c = t < 0.3333 ? mix(uPalA, uPalB, t * 3.0) : t < 0.6667 ? mix(uPalB, uPalC, (t - 0.3333) * 3.0) : mix(uPalC, uPalA, (t - 0.6667) * 3.0);
  // Thin-film shimmer on top of Lux's chosen chord of colours.
  return c + 0.12 * cos(6.2831 * (t * 2.0 + vec3(0.0, 0.33, 0.67) + uHue));
}
vec3 liquid(vec2 p, float t){
  vec2 q = p * 1.15;
  vec2 w1 = vec2(fbm(q + t * 0.11), fbm(q + 5.2 - t * 0.09));
  vec2 w2 = vec2(fbm(q + 3.0 * w1 + 1.7 + t * 0.06), fbm(q + 3.0 * w1 + 9.2 - t * 0.05));
  float v = fbm(q + 3.4 * w2);
  vec3 col = pal(v * 1.5 + uHue + length(w2) * 0.35);
  float cell = fbm(q * 0.75 + w1 * 2.2 + 11.0);
  float blob = smoothstep(0.47, 0.5, cell);
  col = mix(col, pal(v * 0.7 + uHue + 0.45) * 1.25, blob);
  col *= 0.35 + 0.65 * smoothstep(0.0, 0.035, abs(cell - 0.485));
  return col * (0.55 + 0.75 * v);
}
vec3 mandala(vec2 p, float t){
  float r = length(p);
  float n = 8.0;
  float a = atan(p.y, p.x) + t * 0.05;
  a = mod(a, 6.2831 / n);
  a = abs(a - 3.14159 / n);
  vec2 q = r * vec2(cos(a), sin(a));
  q = rot(t * 0.07) * q;
  float v = fbm(q * 2.6 + vec2(t * 0.12, -t * 0.08)) + 0.3 * sin(r * 9.0 - uBeat * 1.5708);
  vec3 col = pal(v + r * 0.45 + uHue);
  float petal = 0.5 + 0.5 * cos(a * n * 2.0 + r * 6.0);
  col *= 0.45 + 0.75 * petal;
  col += pal(uHue + 0.5) * 0.35 * smoothstep(0.02, 0.0, abs(fract(r * 3.0 - t * 0.1) - 0.5) - 0.46);
  return col;
}
vec3 tunnel(vec2 p, float t){
  float r = length(p) + 0.04;
  float a = atan(p.y, p.x);
  vec2 u = vec2(0.32 / r + t * (0.25 + uEnergy * 0.25), a / 3.14159 * 3.0 + sin(t * 0.1) * 0.5);
  float v = fbm(u * vec2(1.5, 1.0));
  float stripes = 0.5 + 0.5 * sin(u.x * 9.0 + sin(u.y * 3.14159) * 1.5);
  vec3 col = pal(v * 0.8 + u.x * 0.08 + uHue) * (0.25 + 0.85 * stripes);
  col *= smoothstep(0.0, 0.45, r);
  float star = step(0.992, hash21(floor(u * vec2(14.0, 9.0))));
  return col + star * 0.8 * smoothstep(0.1, 0.6, r);
}
vec3 sunburst(vec2 p, float t){
  float r = length(p);
  float a = atan(p.y, p.x);
  float rays = 0.5 + 0.5 * sin(a * 12.0 + t * 0.35 + sin(r * 5.0 - t * 0.8) * 1.3);
  float rings = 0.5 + 0.5 * sin(r * 15.0 - uBeat * 3.14159);
  vec3 col = pal(rays * 0.3 + rings * 0.22 + r * 0.35 + uHue);
  col *= 0.4 + 0.7 * rays;
  float dots = smoothstep(0.32, 0.28, length(fract(vec2(a * 3.8197, r * 5.0 - t * 0.2)) - 0.5));
  return col + pal(uHue + 0.33) * dots * 0.35;
}
void main(){
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) * 2.0;
  for (int i = 0; i < 4; i++){
    vec2 o = uRipple[i].xy;
    float age = uRipple[i].z;
    float d = distance(p, o);
    float wave = sin(d * 16.0 - age * 9.0) * exp(-age * 1.7) * exp(-d * 1.2) * uRipple[i].w;
    p += normalize(p - o + 1e-4) * wave * 0.085;
  }
  float t = uTime * (0.55 + uEnergy * 0.9);
  p *= 1.0 - uKick * 0.035;
  vec3 col = vec3(0.0);
  float total = 0.0;
  if (uMode.x > 0.01){ col += liquid(p, t) * uMode.x; total += uMode.x; }
  if (uMode.y > 0.01){ col += mandala(p, t) * uMode.y; total += uMode.y; }
  if (uMode.z > 0.01){ col += tunnel(p, t) * uMode.z; total += uMode.z; }
  if (uMode.w > 0.01){ col += sunburst(p, t) * uMode.w; total += uMode.w; }
  col /= max(total, 0.001);
  col = max(col, 0.0);
  col *= 1.0 + uKick * 0.14 * exp(-length(p) * 1.2);
  // A soloist pulls a slow bright iris open in the middle of the wall.
  col += pal(uHue + 0.5) * uSolo * 0.25 * exp(-pow(length(p) * 1.4, 2.0));
  vec2 edge = smoothstep(0.0, 0.08, vUv) * smoothstep(0.0, 0.08, 1.0 - vUv);
  col *= edge.x * edge.y;
  gl_FragColor = vec4(col * (0.05 + uIntensity * (0.5 + 0.55 * uEnergy)), 1.0);
}`;

const skyFragment = /* glsl */ `
uniform float uTime, uEnergy, uHue;
uniform vec3 uPalA, uPalB;
varying vec3 vDir;
${NOISE}
void main(){
  vec3 d = normalize(vDir);
  vec2 uv = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0)));
  vec3 col = vec3(0.004, 0.006, 0.014);
  // Stars on three depths, twinkling out of phase.
  for (int i = 0; i < 3; i++){
    float s = 60.0 + float(i) * 70.0;
    vec2 g = uv * s;
    vec2 id = floor(g);
    float h = hash21(id + float(i) * 17.0);
    float star = smoothstep(0.12, 0.0, length(fract(g) - 0.5 - (vec2(hash21(id + 3.1), hash21(id + 7.7)) - 0.5) * 0.6));
    star *= step(0.93, h) * (0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 40.0));
    col += star * mix(vec3(0.8, 0.85, 1.0), vec3(1.0, 0.85, 0.7), h) * (1.0 - float(i) * 0.25);
  }
  // Aurora: the room has no ceiling, and the sky listens too.
  float band = fbm(vec2(uv.x * 2.0 + uTime * 0.02, uv.y * 5.0 - uTime * 0.03));
  float curtain = smoothstep(0.35, 0.8, band) * smoothstep(0.05, 0.5, d.y) * smoothstep(1.2, 0.5, d.y);
  float fold = 0.5 + 0.5 * sin(uv.x * 22.0 + band * 9.0 + uTime * 0.25);
  vec3 aur = mix(uPalA, uPalB, fold) * curtain * (0.05 + uEnergy * 0.22);
  float neb = fbm(uv * 1.6 + 4.0) * fbm(uv * 3.1 - uTime * 0.01);
  col += aur + mix(uPalB, uPalA, neb) * neb * 0.05 * smoothstep(-0.1, 0.4, d.y);
  gl_FragColor = vec4(col, 1.0);
}`;

const groundFragment = /* glsl */ `
uniform float uTime, uKickAge, uKickPower, uEnergy;
uniform vec3 uPalA;
varying vec3 vWorld;
${NOISE}
void main(){
  vec2 p = vWorld.xz;
  float d = length(p - vec2(0.0, -1.0));
  float n = fbm(p * 0.35);
  vec3 col = vec3(0.012, 0.014, 0.018) * (0.6 + n);
  // Each kick sends one ring out through the field, under the crowd's feet.
  float ring = exp(-pow((d - 4.0 - uKickAge * 26.0) * 0.55, 2.0)) * uKickPower * exp(-uKickAge * 1.6);
  col += uPalA * ring * 0.16;
  col += uPalA * 0.05 * uEnergy * exp(-d * 0.06) * (0.5 + 0.5 * sin(d * 1.3 - uTime * 0.8));
  float fade = smoothstep(95.0, 30.0, d);
  gl_FragColor = vec4(col * fade, 1.0);
}`;

/** Collects thin struts and emits them as a single instanced draw. */
class Struts {
  private readonly items: [THREE.Vector3, THREE.Vector3, number][] = [];
  add(a: THREE.Vector3, b: THREE.Vector3, r: number) {
    this.items.push([a, b, r]);
  }
  /** Box truss between two points: four chords with zig-zag lacing. */
  truss(a: THREE.Vector3, b: THREE.Vector3, size = 0.34, bays = 10) {
    const axis = b.clone().sub(a);
    const len = axis.length();
    axis.normalize();
    const u = Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3().crossVectors(axis, u).normalize();
    u.crossVectors(v, axis).normalize();
    const corner = (i: number, t: number) =>
      a
        .clone()
        .addScaledVector(axis, t * len)
        .addScaledVector(u, (i & 1 ? 1 : -1) * size * 0.5)
        .addScaledVector(v, (i & 2 ? 1 : -1) * size * 0.5);
    for (let i = 0; i < 4; i++) this.add(corner(i, 0), corner(i, 1), 0.026);
    for (let bay = 0; bay < bays; bay++) {
      const t0 = bay / bays;
      const t1 = (bay + 1) / bays;
      for (const [i, j] of [
        [0, 1],
        [1, 3],
        [3, 2],
        [2, 0],
      ]) {
        this.add(corner(i, t0), corner(j, t1), 0.013);
        if (bay === 0) this.add(corner(i, 0), corner(j, 0), 0.013);
      }
      for (const [i, j] of [
        [0, 1],
        [1, 3],
        [3, 2],
        [2, 0],
      ])
        this.add(corner(i, t1), corner(j, t1), 0.013);
    }
  }
  build(parent: THREE.Object3D, material: THREE.Material) {
    const m = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(1, 1, 1, 6),
      material,
      this.items.length,
    );
    const dummy = new THREE.Object3D();
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();
    this.items.forEach(([a, b, r], i) => {
      dir.copy(b).sub(a);
      const len = dir.length();
      dummy.position.copy(a).add(b).multiplyScalar(0.5);
      dummy.quaternion.setFromUnitVectors(up, dir.normalize());
      dummy.scale.set(r, len, r);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.castShadow = false;
    parent.add(m);
    return m;
  }
}

export const RIG = {
  backTrussY: 8.6,
  backTrussZ: -5.0,
  midTrussY: 9.0,
  midTrussZ: -0.6,
  screenZ: -6.1,
};

export class Venue {
  readonly backdropTarget: THREE.WebGLRenderTarget;
  private readonly backdropScene = new THREE.Scene();
  private readonly backdropCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly backdrop: THREE.ShaderMaterial;
  private readonly sky: THREE.ShaderMaterial;
  private readonly ground: THREE.ShaderMaterial;
  private readonly bannerMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private readonly bannerRest: Float32Array;
  private readonly haze: THREE.Sprite[] = [];
  private readonly monitors: Amp[] = [];
  private readonly lip: THREE.InstancedMesh;
  private readonly lipColor = new THREE.Color();
  private readonly reflection: THREE.MeshBasicMaterial;
  private readonly rippleAges = [9, 9, 9, 9];
  private kickAge = 9;
  private kickPower = 0;
  private readonly wall: THREE.MeshBasicMaterial;

  constructor(
    private readonly scene: THREE.Scene,
    lowPower: boolean,
  ) {
    const stage = new THREE.Group();
    scene.add(stage);
    const steel = new THREE.MeshStandardMaterial({
      color: 0x8d949b,
      roughness: 0.35,
      metalness: 1,
    });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.85 });

    // Deck.
    const deckArt = stageDeck();
    deckArt.map.wrapS =
      deckArt.map.wrapT =
      deckArt.bump.wrapS =
      deckArt.bump.wrapT =
        THREE.RepeatWrapping;
    deckArt.map.repeat.set(3, 1.6);
    deckArt.bump.repeat.set(3, 1.6);
    const deckMat = new THREE.MeshStandardMaterial({
      map: deckArt.map,
      bumpMap: deckArt.bump,
      bumpScale: 0.5,
      roughness: 0.42,
      metalness: 0.05,
    });
    const deck = box(stage, 18, 0.72, 10, deckMat, 0, -0.36, -1.8);
    deck.receiveShadow = true;
    box(stage, 18.06, 0.7, 0.04, blackMat, 0, -0.38, 3.22);
    // Drum riser with carpeted top and a skirt.
    const riser = box(stage, 4.2, 0.5, 3.4, blackMat, 1.0, 0.25, -2.75);
    riser.receiveShadow = riser.castShadow = true;
    box(stage, 4.24, 0.04, 3.44, blackMat, 1.0, 0.49, -2.75);

    // The stage lip is the band's pulse: one LED zone per musician, in their colour.
    this.lip = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.24, 0.05, 0.03),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      64,
    );
    const lipMatrix = new THREE.Matrix4();
    for (let i = 0; i < 64; i++) {
      this.lip.setMatrixAt(i, lipMatrix.makeTranslation(-8.4 + i * (16.8 / 63), -0.05, 3.25));
      this.lip.setColorAt(i, new THREE.Color(0x111111));
    }
    scene.add(this.lip);

    // Truss: back goalpost, a mid span for washes, and two side ladders.
    const struts = new Struts();
    const { backTrussY: by, backTrussZ: bz, midTrussY: my, midTrussZ: mz } = RIG;
    struts.truss(new THREE.Vector3(-9.2, by, bz), new THREE.Vector3(9.2, by, bz), 0.4, 26);
    struts.truss(new THREE.Vector3(-9.2, my, mz), new THREE.Vector3(9.2, my, mz), 0.4, 26);
    for (const x of [-9.2, 9.2]) {
      struts.truss(new THREE.Vector3(x, -0.7, bz), new THREE.Vector3(x, by + 0.2, bz), 0.4, 14);
      struts.truss(new THREE.Vector3(x, -0.7, mz), new THREE.Vector3(x, my + 0.2, mz), 0.4, 14);
      struts.truss(new THREE.Vector3(x, by, bz), new THREE.Vector3(x, my, mz), 0.34, 6);
      box(stage, 0.9, 0.08, 0.9, steel, x, -0.68, bz);
      box(stage, 0.9, 0.08, 0.9, steel, x, -0.68, mz);
    }
    struts.build(stage, steel);

    // Projection wall, rendered once per frame into a small target and reused.
    this.backdropTarget = new THREE.WebGLRenderTarget(lowPower ? 256 : 1280, lowPower ? 112 : 560, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
    });
    this.backdrop = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBeat: { value: 0 },
        uEnergy: { value: 0 },
        uKick: { value: 0 },
        uHue: { value: 0 },
        uIntensity: { value: 0.5 },
        uSolo: { value: 0 },
        uAspect: { value: 17 / 7.4 },
        uMode: { value: new THREE.Vector4(1, 0, 0, 0) },
        uPalA: { value: new THREE.Color() },
        uPalB: { value: new THREE.Color() },
        uPalC: { value: new THREE.Color() },
        uRipple: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 9, 0)) },
      },
      vertexShader:
        'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: backdropFragment,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.backdrop);
    quad.frustumCulled = false;
    this.backdropScene.add(quad);
    this.wall = new THREE.MeshBasicMaterial({ map: this.backdropTarget.texture });
    mesh(stage, new THREE.PlaneGeometry(17, 7.4), this.wall, 0, 3.95, RIG.screenZ);
    box(stage, 17.4, 7.8, 0.2, blackMat, 0, 3.95, RIG.screenZ - 0.12);
    // The lacquered deck picks up the wall as a soft smear of colour.
    const fade = document.createElement('canvas');
    fade.width = 4;
    fade.height = 64;
    const fctx = fade.getContext('2d')!;
    const grad = fctx.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, '#000');
    grad.addColorStop(1, '#fff');
    fctx.fillStyle = grad;
    fctx.fillRect(0, 0, 4, 64);
    const fadeTexture = new THREE.CanvasTexture(fade);
    this.reflection = new THREE.MeshBasicMaterial({
      map: this.backdropTarget.texture,
      alphaMap: fadeTexture,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const smear = mesh(
      scene,
      new THREE.PlaneGeometry(17, 6),
      this.reflection,
      0,
      0.006,
      RIG.screenZ + 3.05,
    );
    smear.rotation.x = -Math.PI / 2;
    smear.scale.y = -1;

    // Banner: hung from the back truss, above the wall. Cloth, so it breathes.
    const art = bannerArt();
    const bannerGeo = new THREE.PlaneGeometry(11.6, 3.6, 36, 8);
    this.bannerMesh = new THREE.Mesh(
      bannerGeo,
      new THREE.MeshStandardMaterial({
        map: art.map,
        emissiveMap: art.glow,
        emissive: 0xffffff,
        emissiveIntensity: 0.15,
        bumpMap: weave(),
        bumpScale: 0.2,
        roughness: 0.95,
        side: THREE.DoubleSide,
      }),
    );
    this.bannerMesh.position.set(0, RIG.backTrussY + 0.95, RIG.backTrussZ + 0.3);
    scene.add(this.bannerMesh);
    this.bannerRest = Float32Array.from(bannerGeo.attributes.position.array);
    for (let i = 0; i < 12; i++)
      cyl(
        stage,
        0.012,
        0.012,
        0.3,
        steel,
        -5.5 + i,
        RIG.backTrussY + 2.85,
        RIG.backTrussZ + 0.3,
        6,
      );
    box(stage, 11.8, 0.06, 0.06, steel, 0, RIG.backTrussY + 2.98, RIG.backTrussZ + 0.3);
    for (const x of [-5.9, 5.9])
      cyl(stage, 0.03, 0.03, 3.0, steel, x, RIG.backTrussY + 1.5, RIG.backTrussZ + 0.3, 8);

    // Side masking drapes.
    const drape = new THREE.MeshStandardMaterial({
      color: 0x120a18,
      roughness: 1,
      bumpMap: weave(),
      bumpScale: 0.6,
      side: THREE.DoubleSide,
    });
    for (const side of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(4.2, 9, 24, 1);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 7) * 0.12);
      geo.computeVertexNormals();
      const d = mesh(stage, geo, drape, side * 9.0, 4.2, -3.6);
      d.rotation.y = side * -1.25;
    }

    // PA: flown line arrays and ground subs.
    const paCloth = new THREE.MeshStandardMaterial({
      map: grille(0x0a0a0b, 0x3a3a40, 3),
      roughness: 0.9,
    });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const cab = box(
          stage,
          1.25,
          0.46,
          0.7,
          blackMat,
          side * 10.6,
          7.6 - i * 0.49,
          2.1 + i * i * 0.022,
        );
        cab.rotation.x = i * 0.055;
        cab.rotation.y = side * -0.15;
        const face = box(cab, 1.18, 0.4, 0.02, paCloth, 0, 0, 0.352);
        face.castShadow = false;
      }
      cyl(stage, 0.02, 0.02, 3.2, steel, side * 10.6, 9.4, 2.1, 6);
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 2; j++) {
          const sub = box(
            stage,
            1.3,
            0.72,
            1.0,
            blackMat,
            side * (9.9 + j * 1.34),
            -0.36 + i * 0.74,
            3.3,
          );
          box(sub, 1.2, 0.62, 0.02, paCloth, 0, 0, 0.502);
        }
    }
    // Crowd barricade.
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x9aa0a6,
      roughness: 0.4,
      metalness: 0.9,
    });
    for (let i = 0; i < 12; i++) {
      const x = -8.8 + i * 1.6;
      box(stage, 1.56, 1.0, 0.04, railMat, x, -0.2, 4.55);
      box(stage, 1.56, 0.05, 0.4, railMat, x, -0.7, 4.75);
      const brace = box(stage, 0.04, 1.1, 0.04, railMat, x, -0.24, 4.78);
      brace.rotation.x = -0.38;
    }
    // Wedges for each standing player.
    for (const [x, z, r, accent] of [
      [-4.6, 2.35, 0.1, 0xf4a66d],
      [-1.6, 2.5, 0, 0xc8ef79],
      [3.2, 2.0, -0.45, 0xcbafff],
    ] as const) {
      const wedge = new Amp('wedge', accent, sharedAmpTextures());
      wedge.group.position.set(x, 0, z);
      wedge.group.rotation.y = r;
      wedge.group.scale.setScalar(1.25);
      scene.add(wedge.group);
      this.monitors.push(wedge);
    }
    // Road cases in the wings: nobody tidies a real stage completely.
    const caseMat = new THREE.MeshStandardMaterial({
      color: 0x15171a,
      roughness: 0.6,
      bumpMap: sharedAmpTextures().pebble,
      bumpScale: 0.4,
    });
    const rng = random(404);
    for (const [x, z] of [
      [-7.6, -3.6],
      [-7.9, -2.3],
      [7.7, -3.9],
      [7.3, -2.6],
    ]) {
      const h = 0.5 + rng() * 0.5;
      const c = box(stage, 1.1, h, 0.7, caseMat, x, h / 2, z);
      c.rotation.y = rng() - 0.5;
      c.castShadow = true;
      box(c, 1.12, 0.03, 0.72, steel, 0, h / 2 - 0.02, 0);
      box(c, 1.12, 0.03, 0.72, steel, 0, -h / 2 + 0.02, 0);
    }

    // Sky dome and the field the crowd stands in.
    this.sky = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0 },
        uHue: { value: 0 },
        uPalA: { value: new THREE.Color() },
        uPalB: { value: new THREE.Color() },
      },
      vertexShader:
        'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: skyFragment,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const dome = mesh(scene, new THREE.SphereGeometry(160, 32, 20), this.sky);
    dome.renderOrder = -10;
    this.ground = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uKickAge: { value: 9 },
        uKickPower: { value: 0 },
        uEnergy: { value: 0 },
        uPalA: { value: new THREE.Color() },
      },
      vertexShader:
        'varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: groundFragment,
    });
    const field = mesh(scene, new THREE.CircleGeometry(110, 48), this.ground, 0, -0.74, 0);
    field.rotation.x = -Math.PI / 2;

    // Haze: big soft sprites that catch whatever colour is in the air.
    const dot = softDot();
    const hazeCount = lowPower ? 6 : 18;
    for (let i = 0; i < hazeCount; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: dot,
          transparent: true,
          opacity: 0.05,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: false,
        }),
      );
      sprite.position.set((rng() - 0.5) * 22, 1 + rng() * 7, -5 + rng() * 12);
      sprite.scale.setScalar(7 + rng() * 9);
      sprite.userData = {
        x: sprite.position.x,
        y: sprite.position.y,
        phase: rng() * 6.28,
        speed: 0.04 + rng() * 0.08,
      };
      scene.add(sprite);
      this.haze.push(sprite);
    }
    mergeStatic(stage);
  }

  /** A musician's note pushes the wall from their side of the stage. */
  ripple(index: number, x: number, y: number, strength: number) {
    const r = this.backdrop.uniforms.uRipple.value[index] as THREE.Vector4;
    r.set(x, y, 0, strength);
    this.rippleAges[index] = 0;
  }

  update(
    sig: Signals,
    palette: [THREE.Color, THREE.Color, THREE.Color],
    renderer: THREE.WebGLRenderer,
    dt: number,
  ) {
    const u = this.backdrop.uniforms;
    const live = sig.reduced ? 0 : 1;
    u.uTime.value = sig.time;
    u.uBeat.value = sig.beat;
    u.uEnergy.value = sig.energy;
    u.uKick.value = sig.kick * live;
    u.uHue.value = sig.hue;
    const dark = sig.lighting.wash === 'blackout' ? 0.12 : 1;
    u.uIntensity.value = damp(
      u.uIntensity.value,
      (sig.playing ? 0.3 + sig.lighting.intensity * 0.7 : 0.4) * dark,
      1.5,
      dt,
    );
    u.uSolo.value = damp(u.uSolo.value, sig.soloists.length ? 1 : 0, 1.2, dt);
    (u.uMode.value as THREE.Vector4).set(...sig.modeMix);
    (u.uPalA.value as THREE.Color).copy(palette[0]);
    (u.uPalB.value as THREE.Color).copy(palette[1]);
    (u.uPalC.value as THREE.Color).copy(palette[2]);
    (u.uRipple.value as THREE.Vector4[]).forEach((r, i) => {
      this.rippleAges[i] += dt;
      r.z = this.rippleAges[i];
    });
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(this.backdropTarget);
    renderer.render(this.backdropScene, this.backdropCamera);
    renderer.setRenderTarget(previous);

    const s = this.sky.uniforms;
    s.uTime.value = sig.time;
    s.uEnergy.value = sig.energySlow;
    (s.uPalA.value as THREE.Color).copy(palette[0]);
    (s.uPalB.value as THREE.Color).copy(palette[2]);
    if (sig.kick > this.kickPower * Math.exp(-this.kickAge * 3) + 0.25 && this.kickAge > 0.18) {
      this.kickAge = 0;
      this.kickPower = sig.kick;
    }
    this.kickAge += dt;
    const g = this.ground.uniforms;
    g.uTime.value = sig.time;
    g.uKickAge.value = this.kickAge;
    g.uKickPower.value = this.kickPower * live;
    g.uEnergy.value = sig.energy;
    (g.uPalA.value as THREE.Color).copy(palette[0]);

    // Cloth: slow billow, with a little extra lift from the low end.
    const pos = this.bannerMesh.geometry.attributes.position;
    const rest = this.bannerRest;
    const t = sig.time;
    for (let i = 0; i < pos.count; i++) {
      const x = rest[i * 3];
      const y = rest[i * 3 + 1];
      const hang = (1.8 - y) / 3.6;
      pos.setZ(
        i,
        (Math.sin(x * 0.9 + t * 1.1) * 0.07 + Math.sin(x * 2.3 - t * 1.7 + y) * 0.03) *
          hang *
          (1 + sig.players.bass.level * 1.2),
      );
    }
    pos.needsUpdate = true;
    // Fluorescent inks answer to ultraviolet.
    const uv =
      sig.lighting.wash === 'ultraviolet' ? 1.5 : sig.lighting.wash === 'blackout' ? 0.5 : 0.12;
    this.bannerMesh.material.emissiveIntensity = damp(
      this.bannerMesh.material.emissiveIntensity,
      uv,
      1.5,
      dt,
    );

    this.haze.forEach((sprite, i) => {
      const d = sprite.userData as { x: number; y: number; phase: number; speed: number };
      sprite.position.x = d.x + Math.sin(t * d.speed + d.phase) * 3;
      sprite.position.y = d.y + Math.sin(t * d.speed * 1.7 + d.phase) * 0.8;
      const c = palette[i % 3];
      sprite.material.color.copy(c);
      sprite.material.opacity =
        (0.008 + sig.lighting.intensity * 0.022 + sig.energy * 0.012) * dark;
    });
    this.monitors.forEach((m, i) =>
      m.update(sig.players[(['guitar', 'bass', 'keys'] as const)[i]].level * 0.6, t),
    );
    // Stage lip meter.
    const roles = ['guitar', 'bass', 'drums', 'keys'] as const;
    const colors = [0xf4a66d, 0xc8ef79, 0x7cdedc, 0xcbafff];
    for (let i = 0; i < 64; i++) {
      const zone = Math.min(3, Math.floor(i / 16));
      const within = Math.abs(((i % 16) + 0.5) / 16 - 0.5) * 2;
      const level = sig.players[roles[zone]].level;
      const lit = Math.max(0, Math.min(1, (level * 1.25 - within) * 4));
      this.lip.setColorAt(i, this.lipColor.setHex(colors[zone]).multiplyScalar(0.05 + lit * 2.2));
    }
    this.lip.instanceColor!.needsUpdate = true;
    this.reflection.opacity = 0.2;
  }

  dispose() {
    this.backdropTarget.dispose();
    this.backdrop.dispose();
    (this.backdropScene.children[0] as THREE.Mesh).geometry.dispose();
  }
}
