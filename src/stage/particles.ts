import * as THREE from 'three';
import { random, type Musician } from '../../shared/music';
import { drumVoice, type Signals } from './signals';
import { pitchColor } from './util';

const vertex = /* glsl */ `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
varying vec3 vColor; varying float vAlpha;
uniform float uScale;
void main(){
  vColor = aColor; vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(90.0, aSize * uScale / max(0.1, -mv.z));
  // Sparks that drift into the lens fade instead of filling it.
  vAlpha *= smoothstep(0.8, 3.5, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const fragment = /* glsl */ `
varying vec3 vColor; varying float vAlpha;
void main(){
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p) * 2.0;
  float core = smoothstep(1.0, 0.0, d);
  gl_FragColor = vec4(vColor * (core * core * 1.6 + pow(core, 8.0) * 2.0) * vAlpha, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const moteVertex = /* glsl */ `
attribute float aSeed; uniform float uTime, uScale; varying float vTwinkle;
void main(){
  vec3 p = position;
  p.x += sin(uTime * 0.11 + aSeed * 40.0) * 0.9;
  p.y += sin(uTime * 0.07 + aSeed * 17.0) * 0.7 + mod(uTime * 0.05 * (0.5 + aSeed), 1.0);
  p.z += cos(uTime * 0.09 + aSeed * 29.0) * 0.9;
  vTwinkle = 0.5 + 0.5 * sin(uTime * (0.6 + aSeed) + aSeed * 90.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (0.025 + aSeed * 0.035) * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const moteFragment = /* glsl */ `
uniform vec3 uColor; uniform float uLevel; varying float vTwinkle;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  gl_FragColor = vec4(uColor * smoothstep(1.0, 0.0, d) * vTwinkle * uLevel, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

type Kind = 'spark' | 'bubble' | 'orb' | 'shimmer' | 'glowstick' | 'smoke';
interface Ring {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  age: number;
  life: number;
  speed: number;
  power: number;
}

/**
 * Sound made visible. Each instrument has its own visual voice:
 * guitar throws pitch-coloured sparks off the headstock, bass rolls rings across the deck,
 * keys breathe slow bubbles, drums fire shockwaves and brass shimmer. Spawned only by real onsets.
 */
export class Particles {
  private readonly max: number;
  private readonly position: Float32Array;
  private readonly color: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly velocity: Float32Array;
  private readonly life: Float32Array;
  private readonly span: Float32Array;
  private readonly kind: Uint8Array;
  private readonly baseSize: Float32Array;
  private cursor = 0;
  private readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly motes: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly rings: Ring[] = [];
  private ringCursor = 0;
  private readonly rng = random(31337);
  private readonly tmp = new THREE.Color();
  private peak = 0;
  private sinceToss = 9;

  constructor(scene: THREE.Scene, lowPower: boolean) {
    const max = (this.max = lowPower ? 500 : 1800);
    this.position = new Float32Array(max * 3);
    this.color = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.velocity = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.span = new Float32Array(max).fill(1);
    this.kind = new Uint8Array(max);
    this.baseSize = new Float32Array(max);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute(
      'aColor',
      new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute(
      'aSize',
      new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute(
      'aAlpha',
      new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage),
    );
    this.points = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 600 } },
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);

    // Dust in the beams.
    const count = lowPower ? 150 : 700;
    const motePos = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      motePos[i * 3] = (this.rng() - 0.5) * 20;
      motePos[i * 3 + 1] = this.rng() * 8;
      motePos[i * 3 + 2] = -5.5 + this.rng() * 12;
      seeds[i] = this.rng();
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    moteGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this.motes = new THREE.Points(
      moteGeo,
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uScale: { value: 600 },
          uColor: { value: new THREE.Color() },
          uLevel: { value: 0.3 },
        },
        vertexShader: moteVertex,
        fragmentShader: moteFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.motes.frustumCulled = false;
    scene.add(this.motes);

    const ringGeo = new THREE.RingGeometry(0.93, 1, 64);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      m.visible = false;
      m.renderOrder = 3;
      scene.add(m);
      this.rings.push({ mesh: m, age: 9, life: 1, speed: 1, power: 0 });
    }
  }

  setViewport(height: number, fov: number) {
    const scale = height / (2 * Math.tan((fov * Math.PI) / 360));
    this.points.material.uniforms.uScale.value = scale;
    this.motes.material.uniforms.uScale.value = scale;
  }

  private spawn(
    kind: Kind,
    p: THREE.Vector3,
    v: [number, number, number],
    color: THREE.Color,
    size: number,
    life: number,
  ) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.position.set([p.x, p.y, p.z], i * 3);
    this.velocity.set(v, i * 3);
    this.color.set([color.r, color.g, color.b], i * 3);
    this.baseSize[i] = size;
    this.life[i] = life;
    this.span[i] = life;
    this.kind[i] = ['spark', 'bubble', 'orb', 'shimmer', 'glowstick', 'smoke'].indexOf(kind);
  }

  /** A breath of smoke from somebody in the crowd; it takes a little colour from the rig. */
  puff(p: THREE.Vector3, vx: number, vy: number, vz: number, size: number, tint: THREE.Color) {
    const grey = 0.05 + this.rng() * 0.03;
    this.tmp.setRGB(grey, grey, grey * 1.08).lerp(tint, 0.12);
    this.spawn('smoke', p, [vx, vy, vz], this.tmp, size, 3.2 + this.rng() * 2.2);
  }

  private ring(
    p: THREE.Vector3,
    color: THREE.Color,
    flat: boolean,
    speed: number,
    life: number,
    power: number,
  ) {
    const r = this.rings[this.ringCursor];
    this.ringCursor = (this.ringCursor + 1) % this.rings.length;
    r.mesh.position.copy(p);
    r.mesh.rotation.set(flat ? -Math.PI / 2 : 0, 0, 0);
    r.mesh.material.color.copy(color);
    r.age = 0;
    r.life = life;
    r.speed = speed;
    r.power = power;
    r.mesh.visible = true;
  }

  update(
    sig: Signals,
    dt: number,
    emitters: Record<Musician, THREE.Vector3>,
    feet: Record<Musician, THREE.Vector3>,
    palette: THREE.Color[],
    lowPower: boolean,
  ) {
    const rng = this.rng;
    const c = this.tmp;
    if (sig.playing && !sig.reduced) {
      const budget = lowPower ? 0.4 : 1;
      for (const n of sig.players.guitar.hits) {
        const solo = sig.players.guitar.solo;
        const count = Math.ceil((solo ? 7 : 3) * n.velocity * budget);
        pitchColor(n.midi, c);
        for (let k = 0; k < count; k++)
          this.spawn(
            'spark',
            emitters.guitar,
            [(rng() - 0.3) * 1.6, 1.2 + rng() * (solo ? 2.6 : 1.4), 0.4 + rng() * 1.4],
            c,
            0.06 + n.velocity * 0.08 + (n.bend ? 0.05 : 0),
            (solo ? 2.2 : 1.3) + rng(),
          );
      }
      for (const n of sig.players.bass.hits) {
        pitchColor(n.midi, c).lerp(palette[0], 0.35);
        // Lower notes roll further and slower, like the wavelength they are.
        const depth = 1 - Math.min(1, Math.max(0, (n.midi - 28) / 30));
        this.ring(feet.bass, c, true, 2.2 + depth * 2.2, 1.1 + depth * 0.9, n.velocity * 0.85);
        if (rng() < 0.6 * budget)
          this.spawn(
            'orb',
            emitters.bass,
            [(rng() - 0.5) * 0.5, 0.35 + rng() * 0.3, 0.5 + rng() * 0.4],
            c,
            0.16 + depth * 0.12,
            2.4,
          );
      }
      for (const n of sig.players.keys.hits) {
        pitchColor(n.midi, c).lerp(palette[2], 0.25);
        if (rng() < 0.85 * budget)
          this.spawn(
            'bubble',
            emitters.keys,
            [(rng() - 0.5) * 0.9, 0.45 + rng() * 0.5, (rng() - 0.2) * 0.7],
            c,
            0.08 + n.velocity * 0.1,
            3 + rng() * 2,
          );
      }
      for (const n of sig.players.drums.hits) {
        const voice = drumVoice(n.midi);
        if (voice === 'kick') {
          c.copy(palette[0]).lerp(palette[2], 0.3);
          this.ring(feet.drums, c, false, 5.5, 0.7, n.velocity * 0.7);
        } else if (voice === 'snare' && n.velocity > 0.35) {
          c.setRGB(1, 0.95, 0.85);
          for (let k = 0; k < 4 * budget; k++)
            this.spawn(
              'spark',
              emitters.drums,
              [(rng() - 0.5) * 2.4, 1.5 + rng() * 1.5, (rng() - 0.3) * 2],
              c,
              0.07,
              0.6 + rng() * 0.4,
            );
        } else if (voice === 'crash' || voice === 'ride') {
          c.setRGB(1, 0.78, 0.35);
          const count = (voice === 'crash' ? 26 : 3) * budget;
          for (let k = 0; k < count; k++)
            this.spawn(
              'shimmer',
              emitters.drums,
              [(rng() - 0.5) * 3.2, 1 + rng() * 2.6, (rng() - 0.5) * 3.2],
              c,
              0.06 + rng() * 0.07,
              1.6 + rng() * 1.6,
            );
        }
      }
      // Glowstick war: the crowd answers a sustained peak. At most once every few bars.
      this.peak = Math.max(this.peak * Math.exp(-dt * 0.3), sig.energy);
      this.sinceToss += dt;
      if (
        this.sinceToss > 9 &&
        sig.energy > 0.62 &&
        (sig.crash > 0.5 || sig.soloists.length > 0) &&
        sig.beatPhase < 0.1
      ) {
        this.sinceToss = 0;
        const origin = new THREE.Vector3();
        for (let k = 0; k < (lowPower ? 14 : 46); k++) {
          origin.set((rng() - 0.5) * 17, 1.4, 6 + rng() * 9);
          c.setHSL(rng(), 1, 0.6);
          this.spawn(
            'glowstick',
            origin,
            [(rng() - 0.5) * 3, 6.5 + rng() * 3.5, (rng() - 0.5) * 3 - 0.5],
            c,
            0.2,
            2.6,
          );
        }
      }
    }

    const swirl = 1.2;
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) this.alpha[i] = 0;
        continue;
      }
      alive++;
      this.life[i] -= dt;
      const j = i * 3;
      const u = 1 - Math.max(0, this.life[i]) / this.span[i];
      const kind = this.kind[i];
      let vx = this.velocity[j];
      let vy = this.velocity[j + 1];
      let vz = this.velocity[j + 2];
      if (kind === 0) {
        // Sparks curl as they rise.
        const px = this.position[j] * 0.7;
        vx += Math.cos(sig.time * 2 + px + i) * swirl * dt;
        vz += Math.sin(sig.time * 2 + px + i) * swirl * dt;
        vy -= 0.5 * dt;
        vx *= 1 - dt * 0.8;
        vz *= 1 - dt * 0.8;
      } else if (kind === 1) {
        vx += Math.sin(sig.time * 1.4 + i) * 0.5 * dt;
        vy *= 1 - dt * 0.25;
      } else if (kind === 2) {
        vy *= 1 - dt * 0.9;
        vz *= 1 - dt * 0.4;
      } else if (kind === 3) {
        vy -= 2.2 * dt;
        vx *= 1 - dt * 1.5;
        vz *= 1 - dt * 1.5;
      } else if (kind === 5) {
        // Smoke loses its push quickly, then just hangs and drifts up.
        vx = vx * (1 - dt * 1.6) + Math.sin(sig.time * 0.7 + i) * 0.12 * dt;
        vz *= 1 - dt * 1.6;
        vy += (0.22 - vy) * dt * 1.4;
      } else {
        vy -= 9 * dt;
      }
      this.velocity[j] = vx;
      this.velocity[j + 1] = vy;
      this.velocity[j + 2] = vz;
      this.position[j] += vx * dt;
      this.position[j + 1] += vy * dt;
      this.position[j + 2] += vz * dt;
      const fadeIn = Math.min(1, u * 12);
      const fade =
        kind === 3
          ? (1 - u) * (0.5 + 0.5 * Math.sin(sig.time * 30 + i))
          : kind === 4
            ? 1
            : kind === 5
              ? Math.min(1, u * 5) * Math.pow(1 - u, 1.2)
              : Math.pow(1 - u, 1.5);
      this.alpha[i] = fadeIn * fade * (this.life[i] > 0 ? 1 : 0);
      this.size[i] =
        this.baseSize[i] *
        (kind === 1 ? 0.6 + u * 0.9 : kind === 2 ? 1 + u : kind === 5 ? 1 + u * 3.5 : 1);
    }
    const g = this.points.geometry;
    this.points.visible = alive > 0;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;

    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.age += dt;
      const u = r.age / r.life;
      if (u >= 1) {
        r.mesh.visible = false;
        continue;
      }
      r.mesh.scale.setScalar(0.3 + r.age * r.speed);
      r.mesh.material.opacity = r.power * Math.pow(1 - u, 1.6);
    }
    const m = this.motes.material.uniforms;
    m.uTime.value = sig.time;
    (m.uColor.value as THREE.Color).copy(palette[0]).lerp(palette[2], 0.5);
    m.uLevel.value = sig.lighting.wash === 'blackout' ? 0.05 : 0.15 + sig.lighting.intensity * 0.5;
  }
}
