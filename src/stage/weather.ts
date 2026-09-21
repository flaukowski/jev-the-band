import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lightRecipes, random, type Sky } from '../../shared/music';
import { GROUND, terrainHeight } from './crowdfield';
import type { Signals } from './signals';
import { softDot } from './textures';
import { box, damp } from './util';
import { NOISE } from './wall';

/** What the rest of the stage needs to know about the air it is standing in. */
export interface Atmosphere {
  /** Light that reaches unlit shaders (the far crowd, the grass). */
  ambient: THREE.Color;
  fogColor: THREE.Color;
  fogDensity: number;
  /** 1 under a dark sky, 0 in full daylight. */
  night: number;
  wet: number;
}

interface Look {
  zenith: number;
  horizon: number;
  sun: number;
  /** Elevation and compass bearing of the sun in radians; bearing 0 is straight behind the stage. */
  elevation: number;
  bearing: number;
  sunLight: number;
  ambient: number;
  ambientLevel: number;
  cloud: number;
  cloudColor: number;
  fog: number;
  fogDensity: number;
  stars: number;
  aurora: number;
  night: number;
  rain?: number;
  snow?: number;
  meteors?: number;
  saucer?: number;
}
const night = {
  zenith: 0x010207,
  horizon: 0x04050c,
  sun: 0x000000,
  elevation: -0.4,
  bearing: 0.4,
  sunLight: 0,
  ambient: 0x3a4468,
  ambientLevel: 0.05,
  cloud: 0,
  cloudColor: 0x0a0c16,
  fog: 0x000000,
  fogDensity: 0.012,
  stars: 1,
  aurora: 1,
  night: 1,
};
const looks: Record<Sky, Look> = {
  'starry night': night,
  sunrise: {
    zenith: 0x1d3a78,
    horizon: 0xf2946e,
    sun: 0xffb27a,
    elevation: 0.075,
    bearing: -0.75,
    sunLight: 0.9,
    ambient: 0xc9a8b8,
    ambientLevel: 0.42,
    cloud: 0.42,
    cloudColor: 0xffb4a0,
    fog: 0x8a5a58,
    fogDensity: 0.0075,
    stars: 0.12,
    aurora: 0,
    night: 0.35,
  },
  'high noon': {
    zenith: 0x1d59b8,
    horizon: 0x9cc4ee,
    sun: 0xfff6e0,
    elevation: 1.12,
    bearing: 0.5,
    sunLight: 1.25,
    ambient: 0xdce8ff,
    ambientLevel: 0.8,
    cloud: 0.34,
    cloudColor: 0xffffff,
    fog: 0x8fb2dc,
    fogDensity: 0.0038,
    stars: 0,
    aurora: 0,
    night: 0,
  },
  sunset: {
    zenith: 0x171545,
    horizon: 0xff6a24,
    sun: 0xff7a35,
    elevation: 0.055,
    bearing: 0.22,
    sunLight: 1.0,
    ambient: 0xd08a6a,
    ambientLevel: 0.4,
    cloud: 0.55,
    cloudColor: 0xff8a5a,
    fog: 0x7a3426,
    fogDensity: 0.0075,
    stars: 0.2,
    aurora: 0,
    night: 0.4,
  },
  rain: {
    zenith: 0x0b0e14,
    horizon: 0x1d232c,
    sun: 0x000000,
    elevation: 0.5,
    bearing: 0,
    sunLight: 0,
    ambient: 0x7a8aa6,
    ambientLevel: 0.2,
    cloud: 1,
    cloudColor: 0x2a303a,
    fog: 0x161b22,
    fogDensity: 0.019,
    stars: 0,
    aurora: 0,
    night: 0.8,
    rain: 1,
  },
  snow: {
    zenith: 0x080a12,
    horizon: 0x181c28,
    sun: 0x000000,
    elevation: 0.5,
    bearing: 0,
    sunLight: 0,
    ambient: 0x8f9cc4,
    ambientLevel: 0.16,
    cloud: 0.9,
    cloudColor: 0x232838,
    fog: 0x12151f,
    fogDensity: 0.017,
    stars: 0,
    aurora: 0,
    night: 0.9,
    snow: 1,
  },
  'meteor shower': { ...night, aurora: 0.25, stars: 1.35, meteors: 1 } as Look,
  'alien abduction': {
    ...night,
    zenith: 0x010806,
    horizon: 0x04100c,
    aurora: 0.15,
    cloud: 0.3,
    cloudColor: 0x0c1a16,
    saucer: 1,
  } as Look,
};

const skyFragment = /* glsl */ `
uniform float uTime, uEnergy, uStars, uAurora, uCloud, uMeteors, uBeam;
uniform vec3 uPalA, uPalB, uZenith, uHorizon, uSun, uSunDir, uCloudColor, uBeamAt;
varying vec3 vDir;
${NOISE}
float streak(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return smoothstep(0.006, 0.0, length(pa - ba * h)) * h;
}
void main(){
  vec3 d = normalize(vDir);
  vec2 uv = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0)));
  float up = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(up, 0.42));
  // Low suns stain the horizon on their own side of the sky.
  float toward = max(dot(normalize(d.xz + 1e-5), normalize(uSunDir.xz + 1e-5)), 0.0);
  float facing = max(dot(d, uSunDir), 0.0);
  col += uSun * pow(toward, 3.0) * exp(-up * 5.5) * 0.55 * (1.0 - uSunDir.y);
  col += uSun * (pow(facing, 900.0) * 9.0 + pow(facing, 28.0) * 0.45 + pow(facing, 5.0) * 0.12);
  // Stars on three depths, twinkling out of phase.
  if (uStars > 0.01){
    for (int i = 0; i < 3; i++){
      float s = 60.0 + float(i) * 70.0;
      vec2 g = uv * s;
      vec2 id = floor(g);
      float h = hash21(id + float(i) * 17.0);
      float star = smoothstep(0.12, 0.0, length(fract(g) - 0.5 - (vec2(hash21(id + 3.1), hash21(id + 7.7)) - 0.5) * 0.6));
      star *= step(0.93, h) * (0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 40.0));
      col += star * mix(vec3(0.8, 0.85, 1.0), vec3(1.0, 0.85, 0.7), h) * (1.0 - float(i) * 0.25) * uStars;
    }
  }
  if (uMeteors > 0.01){
    for (int i = 0; i < 9; i++){
      float fi = float(i);
      float clock = uTime * (0.2 + fi * 0.031) + fi * 0.37;
      float slot = floor(clock);
      float ph = fract(clock);
      vec2 from = vec2(hash21(vec2(slot, fi)) * 6.2831 - 3.1416, 0.35 + hash21(vec2(fi, slot)) * 0.9);
      vec2 dir = normalize(vec2(hash21(vec2(slot + 5.0, fi)) - 0.5, -0.45));
      float go = smoothstep(0.0, 0.35, ph);
      vec2 headAt = from + dir * go * 0.75;
      float life = smoothstep(0.0, 0.04, ph) * smoothstep(0.36, 0.22, ph);
      col += vec3(0.9, 0.95, 1.0) * streak(uv, headAt - dir * 0.2, headAt) * life * 2.2 * uMeteors;
    }
  }
  // Aurora: the room has no ceiling, and the sky listens too.
  float band = fbm(vec2(uv.x * 2.0 + uTime * 0.02, uv.y * 5.0 - uTime * 0.03));
  if (uAurora > 0.01){
    float curtain = smoothstep(0.35, 0.8, band) * smoothstep(0.05, 0.5, d.y) * smoothstep(1.2, 0.5, d.y);
    float fold = 0.5 + 0.5 * sin(uv.x * 22.0 + band * 9.0 + uTime * 0.25);
    vec3 aur = mix(uPalA, uPalB, fold) * curtain * (0.05 + uEnergy * 0.22);
    float neb = fbm(uv * 1.6 + 4.0) * fbm(uv * 3.1 - uTime * 0.01);
    col += (aur + mix(uPalB, uPalA, neb) * neb * 0.05 * smoothstep(-0.1, 0.4, d.y)) * uAurora;
  }
  if (uCloud > 0.01 && d.y > -0.02){
    vec2 c = d.xz / (up + 0.16) * 0.5 + uTime * vec2(0.006, 0.0025);
    float body = fbm(c * 1.25) + 0.3 * fbm(c * 3.3 + 9.0) - 0.15;
    float dens = smoothstep(0.78 - uCloud * 0.62, 1.0 - uCloud * 0.55, body) * smoothstep(-0.01, 0.1, d.y);
    // Sunward edges glow; the thick middles go grey.
    float thin = 1.0 - smoothstep(0.78 - uCloud * 0.62, 1.15 - uCloud * 0.5, body);
    vec3 cloud = uCloudColor * (0.35 + 0.65 * thin) + uSun * pow(facing, 3.0) * thin * 0.5;
    // The saucer's beam lights the cloud base from below.
    cloud += vec3(0.3, 1.0, 0.75) * uBeam * 0.25 * exp(-distance(d, normalize(uBeamAt)) * 6.0);
    col = mix(col, cloud, dens * 0.92);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const rainVertex = /* glsl */ `
attribute vec3 aSeed;
attribute float aEnd;
uniform float uTime, uAmount;
uniform vec3 uEye, uWind;
varying float vAlpha;
void main(){
  const vec3 BOX = vec3(56.0, 30.0, 56.0);
  float speed = 17.0 + aSeed.y * 9.0;
  vec3 p = position;
  p.y -= uTime * speed;
  p.xz += uWind.xz * uTime;
  p = uEye + mod(p - uEye + BOX * 0.5, BOX) - BOX * 0.5;
  p.y += 9.0;
  // A streak is the drop plus where it was a moment ago.
  p -= (vec3(uWind.x, -speed, uWind.z)) * aEnd * 0.035;
  vAlpha = step(aSeed.x, uAmount) * (1.0 - aEnd) * (0.35 + 0.65 * aSeed.z);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const rainFragment = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main(){ gl_FragColor = vec4(uColor * vAlpha, vAlpha); }`;

const snowVertex = /* glsl */ `
attribute vec3 aSeed;
uniform float uTime, uAmount, uScale;
uniform vec3 uEye;
varying float vAlpha;
void main(){
  const vec3 BOX = vec3(48.0, 26.0, 48.0);
  vec3 p = position;
  p.y -= uTime * (0.9 + aSeed.y * 1.1);
  p.x += sin(uTime * (0.3 + aSeed.z) + aSeed.x * 40.0) * 0.9 + uTime * 0.35;
  p.z += cos(uTime * (0.23 + aSeed.y) + aSeed.z * 40.0) * 0.9;
  p = uEye + mod(p - uEye + BOX * 0.5, BOX) - BOX * 0.5;
  p.y += 7.0;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vAlpha = step(aSeed.x, uAmount);
  // Flakes that drift right past the lens stay small: no screen-filling sprites.
  gl_PointSize = min(14.0, uScale * (0.05 + aSeed.z * 0.07) / max(0.5, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;
const snowFragment = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor;
varying float vAlpha;
void main(){
  float a = texture2D(uMap, gl_PointCoord).r * vAlpha;
  gl_FragColor = vec4(uColor * a, a);
}`;

const beamFragment = /* glsl */ `
uniform float uTime, uAmount;
varying vec2 vUv;
void main(){
  // Rings climb the beam. Slow enough to read as a pull, never a flicker.
  float rings = 0.55 + 0.45 * sin(vUv.y * 26.0 - uTime * 2.4);
  float edge = pow(abs(sin(vUv.x * 3.14159 * 2.0)), 0.6);
  float fall = smoothstep(0.0, 0.2, vUv.y) * (0.35 + 0.65 * vUv.y);
  float a = uAmount * rings * fall * (0.2 + 0.25 * edge);
  gl_FragColor = vec4(vec3(0.35, 1.0, 0.72) * a, a);
}`;

const ease = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/**
 * Sky, sun, cloud, rain, snow, meteors and the occasional visitor. All procedural: one dome
 * shader, two GPU particle systems whose motion lives in their vertex shaders, and a saucer.
 */
export class Weather {
  readonly air: Atmosphere = {
    ambient: new THREE.Color(),
    fogColor: new THREE.Color(),
    fogDensity: 0.012,
    night: 1,
    wet: 0,
  };
  private readonly sky: THREE.ShaderMaterial;
  private readonly sun = new THREE.DirectionalLight(0xffffff, 0);
  private readonly hemi = new THREE.HemisphereLight(0xffffff, 0x2a2a22, 0);
  private readonly rain: THREE.ShaderMaterial;
  private readonly rainMesh: THREE.LineSegments;
  private readonly snow: THREE.ShaderMaterial;
  private readonly snowMesh: THREE.Points;
  private readonly now = { ...looks['starry night'], rain: 0, snow: 0, meteors: 0, saucer: 0 };
  private readonly colors = {
    zenith: new THREE.Color(looks['starry night'].zenith),
    horizon: new THREE.Color(looks['starry night'].horizon),
    sun: new THREE.Color(0),
    ambient: new THREE.Color(looks['starry night'].ambient),
    cloudColor: new THREE.Color(looks['starry night'].cloudColor),
    fog: new THREE.Color(0),
  };
  private readonly sunDir = new THREE.Vector3(0, -0.4, -1).normalize();
  private readonly wantDir = new THREE.Vector3();
  private readonly tmp = new THREE.Color();
  private started = false;
  // The visitor.
  private readonly saucer = new THREE.Group();
  private readonly saucerLights: THREE.InstancedMesh;
  private readonly beam: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private readonly beamLight = new THREE.SpotLight(0x66ffbb, 0, 60, 0.32, 0.8, 1.2);
  private readonly cow = new THREE.Group();
  private readonly hover = new THREE.Vector3(7, 15, 17);
  private readonly rng = random(1947);
  private visit = -1;
  private visits = 0;

  constructor(
    private readonly scene: THREE.Scene,
    lowPower: boolean,
  ) {
    this.sky = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0 },
        uStars: { value: 1 },
        uAurora: { value: 1 },
        uCloud: { value: 0 },
        uMeteors: { value: 0 },
        uBeam: { value: 0 },
        uBeamAt: { value: new THREE.Vector3(0, 1, 0) },
        uPalA: { value: new THREE.Color() },
        uPalB: { value: new THREE.Color() },
        uZenith: { value: this.colors.zenith },
        uHorizon: { value: this.colors.horizon },
        uSun: { value: this.colors.sun },
        uSunDir: { value: this.sunDir },
        uCloudColor: { value: this.colors.cloudColor },
      },
      vertexShader:
        'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: skyFragment,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(330, 32, 20), this.sky);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    scene.add(dome);
    scene.add(this.sun, this.sun.target, this.hemi);

    const rng = this.rng;
    const drops = lowPower ? 700 : 3200;
    const rainPos = new Float32Array(drops * 6);
    const rainSeed = new Float32Array(drops * 6);
    const rainEnd = new Float32Array(drops * 2);
    for (let i = 0; i < drops; i++) {
      const p = [rng() * 56, rng() * 30, rng() * 56];
      const s = [rng(), rng(), rng()];
      for (const end of [0, 1]) {
        rainPos.set(p, (i * 2 + end) * 3);
        rainSeed.set(s, (i * 2 + end) * 3);
        rainEnd[i * 2 + end] = end;
      }
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    rainGeo.setAttribute('aSeed', new THREE.BufferAttribute(rainSeed, 3));
    rainGeo.setAttribute('aEnd', new THREE.BufferAttribute(rainEnd, 1));
    const particleOptions = {
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    } as const;
    this.rain = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAmount: { value: 0 },
        uEye: { value: new THREE.Vector3() },
        uWind: { value: new THREE.Vector3(2.4, 0, 1.1) },
        uColor: { value: new THREE.Color(0.5, 0.56, 0.66) },
      },
      vertexShader: rainVertex,
      fragmentShader: rainFragment,
      ...particleOptions,
    });
    this.rainMesh = new THREE.LineSegments(rainGeo, this.rain);
    const flakes = lowPower ? 500 : 2600;
    const snowPos = new Float32Array(flakes * 3);
    const snowSeed = new Float32Array(flakes * 3);
    for (let i = 0; i < flakes * 3; i += 3) {
      snowPos.set([rng() * 48, rng() * 26, rng() * 48], i);
      snowSeed.set([rng(), rng(), rng()], i);
    }
    const snowGeo = new THREE.BufferGeometry();
    snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
    snowGeo.setAttribute('aSeed', new THREE.BufferAttribute(snowSeed, 3));
    this.snow = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAmount: { value: 0 },
        uScale: { value: 900 },
        uEye: { value: new THREE.Vector3() },
        uMap: { value: softDot() },
        uColor: { value: new THREE.Color(0.8, 0.84, 0.95) },
      },
      vertexShader: snowVertex,
      fragmentShader: snowFragment,
      ...particleOptions,
    });
    this.snowMesh = new THREE.Points(snowGeo, this.snow);
    for (const m of [this.rainMesh, this.snowMesh]) {
      m.frustumCulled = false;
      m.visible = false;
      m.renderOrder = 5;
      scene.add(m);
    }

    // Saucer: a spun hull, a glass dome, a ring of running lights and the beam.
    const hull = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 1, roughness: 0.22 });
    const profile = [
      [0.0, -0.55],
      [1.1, -0.5],
      [2.6, -0.22],
      [4.2, 0.0],
      [4.3, 0.1],
      [2.7, 0.42],
      [1.5, 0.62],
      [0.0, 0.66],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), hull);
    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(1.45, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({
        color: 0x7fffe0,
        emissive: 0x2affc0,
        emissiveIntensity: 0.7,
        transparent: true,
        opacity: 0.55,
        roughness: 0.05,
      }),
    );
    glass.position.y = 0.5;
    const port = new THREE.Mesh(
      new THREE.CircleGeometry(1.05, 32),
      new THREE.MeshBasicMaterial({ color: 0x9dffd6 }),
    );
    port.rotation.x = Math.PI / 2;
    port.position.y = -0.56;
    this.saucerLights = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.13, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      16,
    );
    const m = new THREE.Matrix4();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      this.saucerLights.setMatrixAt(
        i,
        m.makeTranslation(Math.cos(a) * 3.9, -0.04, Math.sin(a) * 3.9),
      );
      this.saucerLights.setColorAt(i, this.tmp.setHex(0x111111));
    }
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 3.4, 1, 40, 1, true),
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uAmount: { value: 0 } },
        vertexShader:
          'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: beamFragment,
        ...particleOptions,
        side: THREE.DoubleSide,
      }),
    );
    this.beam.renderOrder = 6;
    this.saucer.add(body, glass, port, this.saucerLights);
    this.saucer.visible = false;
    this.beam.visible = false;
    this.beamLight.castShadow = false;
    scene.add(this.saucer, this.beam, this.beamLight, this.beamLight.target);
    this.buildCow();
  }

  /** A Holstein, as understood by someone who has only seen one from orbit. */
  private buildCow() {
    const white = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.9 });
    const black = new THREE.MeshStandardMaterial({ color: 0x15130f, roughness: 0.9 });
    const pink = new THREE.MeshStandardMaterial({ color: 0xe9a3a0, roughness: 0.8 });
    const horn = new THREE.MeshStandardMaterial({ color: 0xd8cfb4, roughness: 0.6 });
    const c = this.cow;
    box(c, 0.72, 0.74, 1.5, white, 0, 1.05, 0);
    box(c, 0.74, 0.4, 0.5, black, 0, 1.2, 0.2);
    box(c, 0.3, 0.3, 0.4, black, 0.23, 0.95, -0.42);
    box(c, 0.44, 0.46, 0.56, white, 0, 1.42, 1.0);
    box(c, 0.46, 0.2, 0.3, black, 0, 1.56, 0.92);
    box(c, 0.34, 0.24, 0.2, pink, 0, 1.3, 1.34);
    box(c, 0.3, 0.16, 0.34, pink, 0, 0.62, -0.3);
    for (const x of [-1, 1]) {
      const h = box(c, 0.05, 0.16, 0.05, horn, x * 0.2, 1.72, 0.92);
      h.rotation.z = -x * 0.5;
      const ear = box(c, 0.2, 0.1, 0.04, black, x * 0.32, 1.56, 0.86);
      ear.rotation.z = x * 0.3;
      for (const z of [-0.55, 0.55]) {
        box(c, 0.16, 0.7, 0.16, z > 0 === x > 0 ? black : white, x * 0.24, 0.35, z);
        box(c, 0.17, 0.1, 0.17, black, x * 0.24, 0.05, z);
      }
    }
    const tail = box(c, 0.05, 0.7, 0.05, white, 0, 1.0, -0.8);
    tail.rotation.x = 0.35;
    // One draw per material instead of one per box.
    const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
    c.updateMatrixWorld(true);
    for (const child of [...c.children] as THREE.Mesh[]) {
      const g = child.geometry.clone().applyMatrix4(child.matrix);
      byMaterial.set(child.material as THREE.Material, [
        ...(byMaterial.get(child.material as THREE.Material) ?? []),
        g,
      ]);
      c.remove(child);
    }
    for (const [material, parts] of byMaterial)
      c.add(new THREE.Mesh(mergeGeometries(parts), material));
    c.visible = false;
    this.scene.add(c);
  }

  update(
    sig: Signals,
    palette: [THREE.Color, THREE.Color, THREE.Color],
    dt: number,
    camera: THREE.Camera,
    override?: Sky,
  ) {
    const name = override ?? sig.lighting.sky ?? 'starry night';
    const want =
      looks[(lightRecipes.sky as readonly string[]).includes(name) ? name : 'starry night'];
    // Weather arrives over about ten seconds. The first frame starts where Lux already is.
    const rate = !this.started || sig.reduced ? 1e6 : 0.32;
    this.started = true;
    const n = this.now;
    for (const key of [
      'sunLight',
      'ambientLevel',
      'cloud',
      'fogDensity',
      'stars',
      'aurora',
      'night',
    ] as const)
      n[key] = damp(n[key], want[key], rate, dt);
    n.rain = damp(n.rain, want.rain ?? 0, rate * 1.4, dt);
    n.snow = damp(n.snow, want.snow ?? 0, rate * 1.4, dt);
    n.meteors = damp(n.meteors, want.meteors ?? 0, rate, dt);
    const k = 1 - Math.exp(-rate * dt);
    // Light is linear: the last percent of a sunrise is still ten times brighter than a night
    // sky, so an exponential fade alone never seems to finish. A small constant step closes it.
    const step = 0.006 * dt * (rate > 1 ? 1e6 : 1);
    for (const key of ['zenith', 'horizon', 'sun', 'ambient', 'cloudColor', 'fog'] as const) {
      const c = this.colors[key].lerp(this.tmp.setHex(want[key]), k);
      c.r += Math.max(-step, Math.min(step, this.tmp.r - c.r));
      c.g += Math.max(-step, Math.min(step, this.tmp.g - c.g));
      c.b += Math.max(-step, Math.min(step, this.tmp.b - c.b));
    }
    this.wantDir.set(
      Math.sin(want.bearing) * Math.cos(want.elevation),
      Math.sin(want.elevation),
      -Math.cos(want.bearing) * Math.cos(want.elevation),
    );
    this.sunDir.lerp(this.wantDir, k).normalize();

    const s = this.sky.uniforms;
    s.uTime.value = sig.time;
    s.uEnergy.value = sig.energySlow;
    s.uStars.value = n.stars;
    s.uAurora.value = n.aurora;
    s.uCloud.value = n.cloud;
    s.uMeteors.value = n.meteors;
    (s.uPalA.value as THREE.Color).copy(palette[0]);
    (s.uPalB.value as THREE.Color).copy(palette[2]);

    this.sun.position.copy(this.sunDir).multiplyScalar(80);
    this.sun.color.copy(this.colors.sun);
    this.sun.intensity = n.sunLight * Math.max(0, Math.min(1, this.sunDir.y * 6 + 0.4));
    this.hemi.color.copy(this.colors.ambient);
    this.hemi.intensity = n.ambientLevel * 0.85;

    const air = this.air;
    air.night = n.night;
    air.wet = n.rain;
    air.fogDensity = n.fogDensity;
    // At night the haze takes its colour from the rig, as before; by day from the horizon.
    air.fogColor
      .copy(this.colors.fog)
      .add(this.tmp.copy(palette[1]).multiplyScalar(0.035 * n.night));
    air.ambient.copy(this.colors.ambient).multiplyScalar(n.ambientLevel);

    const eye = camera.position;
    this.rainMesh.visible = n.rain > 0.01;
    if (this.rainMesh.visible) {
      const r = this.rain.uniforms;
      r.uTime.value = sig.time;
      r.uAmount.value = n.rain;
      (r.uEye.value as THREE.Vector3).copy(eye);
      // Rain is lit by whatever the rig is throwing through it.
      (r.uColor.value as THREE.Color)
        .setRGB(0.32, 0.36, 0.44)
        .add(this.tmp.copy(palette[0]).multiplyScalar(0.22 * sig.lighting.intensity));
    }
    this.snowMesh.visible = n.snow > 0.01;
    if (this.snowMesh.visible) {
      const w = this.snow.uniforms;
      w.uTime.value = sig.time;
      w.uAmount.value = n.snow;
      (w.uEye.value as THREE.Vector3).copy(eye);
      (w.uColor.value as THREE.Color)
        .setRGB(0.62, 0.66, 0.78)
        .add(this.tmp.copy(palette[0]).multiplyScalar(0.3 * sig.lighting.intensity));
    }
    this.fly(sig, dt, !!want.saucer);
  }

  setViewport(heightPx: number) {
    this.snow.uniforms.uScale.value = heightPx;
  }

  /**
   * One visit: arrive 0–8 s, hover and light the beam 8–11, lift 11–25, stow 25–28, leave 28–36,
   * then a quiet sky until 46 and another pass somewhere else over the field.
   */
  private fly(sig: Signals, dt: number, wanted: boolean) {
    if (this.visit < 0 && !wanted) return;
    if (this.visit < 0) {
      this.visit = 0;
      this.visits++;
      this.hover.set((this.rng() - 0.5) * 26, 0, 13 + this.rng() * 16);
      this.hover.y = terrainHeight(this.hover.x, this.hover.z) - GROUND + 14.5;
    }
    if (!sig.reduced) this.visit += dt;
    // Called away early: drop the beam and go.
    if (!wanted && this.visit < 28) this.visit = 28;
    const T = this.visit;
    if (T > (wanted ? 46 : 36)) {
      this.visit = -1;
      this.saucer.visible = this.beam.visible = this.cow.visible = false;
      this.beamLight.intensity = 0;
      this.sky.uniforms.uBeam.value = 0;
      return;
    }
    const t = sig.time;
    const side = this.visits % 2 ? 1 : -1;
    const arrive = ease(T / 8);
    const leave = ease((T - 28) / 7);
    const pos = this.saucer.position;
    pos.set(
      this.hover.x + side * 90 * (1 - arrive) ** 2 - side * 70 * leave * leave,
      this.hover.y + 38 * (1 - arrive) + 95 * leave * leave,
      this.hover.z + 80 * (1 - arrive) ** 2 - 120 * leave * leave,
    );
    pos.x += Math.sin(t * 0.7) * 0.5;
    pos.y += Math.sin(t * 1.1) * 0.25;
    this.saucer.visible = T < 36;
    this.saucer.rotation.set(
      Math.sin(t * 0.9) * 0.06 + leave * 0.5,
      t * 0.6,
      Math.cos(t * 0.8) * 0.06 - side * (1 - arrive) * 0.35,
    );
    // Running lights chase around the rim at walking pace.
    for (let i = 0; i < 16; i++) {
      const chase = (Math.sin(t * 2.2 - (i / 16) * Math.PI * 4) + 1) / 2;
      this.saucerLights.setColorAt(
        i,
        this.tmp.setHSL(0.45 + (i % 4) * 0.05, 1, 0.5).multiplyScalar(0.4 + chase * 3),
      );
    }
    this.saucerLights.instanceColor!.needsUpdate = true;

    const beam = ease((T - 8) / 2.5) * (1 - ease((T - 25.5) / 2));
    const groundY = terrainHeight(this.hover.x, this.hover.z);
    const height = Math.max(1, pos.y - 0.6 - groundY);
    this.beam.visible = beam > 0.005;
    this.beam.position.set(pos.x, groundY + height / 2, pos.z);
    this.beam.scale.set(1, height, 1);
    this.beam.material.uniforms.uTime.value = t;
    this.beam.material.uniforms.uAmount.value = beam * (0.85 + 0.15 * Math.sin(t * 1.3));
    this.beamLight.position.copy(pos);
    this.beamLight.target.position.set(pos.x, groundY, pos.z);
    this.beamLight.intensity = beam * 900;
    this.sky.uniforms.uBeam.value = beam;
    (this.sky.uniforms.uBeamAt.value as THREE.Vector3).copy(pos);

    const lift = ease((T - 11) / 14);
    this.cow.visible = T > 9 && T < 25.6;
    if (this.cow.visible) {
      this.cow.position.set(pos.x, groundY + lift * (height - 1.4), pos.z);
      // Dignified at first. Less so once the hooves leave the ground.
      this.cow.rotation.set(
        Math.sin(t * 0.8) * 0.5 * lift,
        t * 0.5 * lift + 0.6,
        Math.cos(t * 0.6) * 0.7 * lift,
      );
      this.cow.scale.setScalar(1.25 * ease((T - 9) / 1.2) * (1 - 0.7 * ease((T - 23) / 2.5)));
    }
  }

  dispose() {
    this.rainMesh.geometry.dispose();
    this.snowMesh.geometry.dispose();
    this.rain.dispose();
    this.snow.dispose();
    this.sky.dispose();
  }
}
