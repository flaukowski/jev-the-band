import * as THREE from 'three';
import { musicians, type Musician } from '../../shared/music';
import { stagePositions } from './performers';
import type { Signals } from './signals';
import { softDot } from './textures';
import { SegmentBatch, ball, box, cyl, damp, dampV, mergeStatic, mesh, washPalettes } from './util';
import { RIG } from './venue';

const beamVertex = /* glsl */ `
varying vec3 vN; varying vec3 vV; varying float vH; varying vec3 vLocal; varying float vDist;
void main(){
  vLocal = position;
  vH = -position.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const beamFragment = /* glsl */ `
uniform vec3 uColor; uniform float uOpacity, uTime, uGobo;
varying vec3 vN; varying vec3 vV; varying float vH; varying vec3 vLocal; varying float vDist;
void main(){
  // Grazing angles fade out, so a hollow cone reads as a lit volume of haze.
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float soft = pow(facing, 1.7);
  float fall = 1.0 - vH;
  fall = fall * fall * 0.8 + 0.2 * (1.0 - vH);
  float a = atan(vLocal.z, vLocal.x);
  float gobo = mix(1.0, 0.25 + 0.75 * smoothstep(0.25, 0.75, 0.5 + 0.5 * sin(a * 7.0 + uTime * 0.6)), uGobo);
  float haze = 0.78 + 0.22 * sin(vH * 9.0 - uTime * 0.7 + a * 2.0);
  // A camera standing inside a beam should see air, not a wall of colour.
  float near = smoothstep(2.5, 11.0, vDist);
  gl_FragColor = vec4(uColor * uOpacity * soft * fall * gobo * haze * near, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

interface Head {
  base: THREE.Vector3;
  yoke: THREE.Group;
  tilt: THREE.Group;
  beam: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  lens: THREE.MeshBasicMaterial;
  pool: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  target: THREE.Vector3;
  goal: THREE.Vector3;
  on: number;
  color: THREE.Color;
  group: 'back' | 'mid';
  index: number;
  count: number;
}
interface Cue {
  on: number;
  spread: number;
  /** 0 = palette key, 1 = counter, 2 = accent, or a full hue for prism looks. */
  color: number;
  hue?: number;
  gobo?: number;
}

const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

/**
 * Lux's rig. Every named recipe in the decision schema is a distinct, hand-written cue:
 * moving heads physically pan and tilt toward computed targets, beams are lit volumes,
 * and lasers re-aim into named geometry. Transitions glide; nothing flashes.
 */
export class LightRig {
  readonly palette: [THREE.Color, THREE.Color, THREE.Color] = [
    new THREE.Color(),
    new THREE.Color(),
    new THREE.Color(),
  ];
  private readonly heads: Head[] = [];
  private readonly pars: THREE.MeshBasicMaterial[] = [];
  private readonly washes: THREE.PointLight[] = [];
  private readonly key: THREE.SpotLight;
  private readonly follow: THREE.SpotLight;
  private readonly rim: THREE.DirectionalLight;
  private readonly crowdLight: THREE.PointLight;
  private readonly ambient: THREE.HemisphereLight;
  private readonly lasers: {
    from: THREE.Vector3;
    to: THREE.Vector3;
    goalFrom: THREE.Vector3;
    goalTo: THREE.Vector3;
    on: number;
  }[] = [];
  private readonly laserBatch: SegmentBatch;
  private readonly laserEmitters = [
    new THREE.Vector3(0, 7.85, -5.7),
    new THREE.Vector3(-6.5, 7.5, -5.4),
    new THREE.Vector3(6.5, 7.5, -5.4),
  ];
  private readonly followTarget = new THREE.Vector3(0, 1.2, 0);
  private readonly followSpotBeam: Head;
  private solo = 0;
  private laserLevel = 0;
  private readonly laserColor = new THREE.Color(0x44ff99);

  constructor(
    private readonly scene: THREE.Scene,
    lowPower: boolean,
  ) {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x101114,
      roughness: 0.5,
      metalness: 0.4,
    });
    const fixtures = new THREE.Group();
    scene.add(fixtures);
    const dot = softDot();
    const beamGeo = new THREE.CylinderGeometry(0.1, 1, 1, 40, 1, true);
    beamGeo.translate(0, -0.5, 0);
    const makeHead = (
      x: number,
      y: number,
      z: number,
      group: 'back' | 'mid',
      index: number,
      count: number,
    ): Head => {
      const base = new THREE.Vector3(x, y, z);
      box(fixtures, 0.34, 0.14, 0.3, bodyMat, x, y + 0.22, z);
      const yoke = new THREE.Group();
      yoke.position.copy(base);
      scene.add(yoke);
      for (const side of [-1, 1]) box(yoke, 0.05, 0.4, 0.16, bodyMat, side * 0.2, -0.05, 0);
      box(yoke, 0.45, 0.06, 0.18, bodyMat, 0, 0.14, 0);
      const tilt = new THREE.Group();
      tilt.position.y = -0.12;
      tilt.userData.dynamic = true;
      yoke.add(tilt);
      const can = cyl(tilt, 0.15, 0.17, 0.4, bodyMat, 0, -0.05, 0, 16);
      can.castShadow = false;
      const lens = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const glass = cyl(tilt, 0.14, 0.14, 0.02, lens, 0, -0.26, 0, 20);
      glass.castShadow = false;
      const beam = new THREE.Mesh(
        beamGeo,
        new THREE.ShaderMaterial({
          uniforms: {
            uColor: { value: new THREE.Color() },
            uOpacity: { value: 0 },
            uTime: { value: 0 },
            uGobo: { value: 0 },
          },
          vertexShader: beamVertex,
          fragmentShader: beamFragment,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
      );
      beam.position.y = -0.27;
      beam.frustumCulled = false;
      tilt.add(beam);
      const pool = mesh(
        scene,
        new THREE.CircleGeometry(1, 28),
        new THREE.MeshBasicMaterial({
          map: dot,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      ) as Head['pool'];
      pool.rotation.x = -Math.PI / 2;
      pool.renderOrder = 2;
      mergeStatic(yoke);
      return {
        base,
        yoke,
        tilt,
        beam,
        lens,
        pool,
        target: new THREE.Vector3(x, 0, z + 4),
        goal: new THREE.Vector3(x, 0, z + 4),
        on: 0,
        color: new THREE.Color(),
        group,
        index,
        count,
      };
    };
    const backCount = lowPower ? 6 : 8;
    const midCount = lowPower ? 4 : 6;
    for (let i = 0; i < backCount; i++)
      this.heads.push(
        makeHead(
          -7.35 + (i * 14.7) / (backCount - 1),
          RIG.backTrussY - 0.42,
          RIG.backTrussZ + 0.05,
          'back',
          i,
          backCount,
        ),
      );
    for (let i = 0; i < midCount; i++)
      this.heads.push(
        makeHead(
          -6.5 + (i * 13) / (midCount - 1),
          RIG.midTrussY - 0.42,
          RIG.midTrussZ,
          'mid',
          i,
          midCount,
        ),
      );
    // Follow spot from front of house: a visible beam, because seeing who the light picks is the point.
    this.followSpotBeam = makeHead(0.5, 9.5, 19, 'mid', 0, 1);
    this.followSpotBeam.yoke.visible = true;

    // Par cans on the side ladders.
    for (const side of [-1, 1])
      for (let i = 0; i < 5; i++) {
        const mat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const par = new THREE.Group();
        par.position.set(side * 8.85, 2.2 + i * 1.3, RIG.midTrussZ + (i % 2 ? 0.25 : -0.25));
        par.rotation.set(0.5, side * -1.0, 0);
        fixtures.add(par);
        const can = cyl(par, 0.14, 0.11, 0.34, bodyMat, 0, 0, 0, 14);
        can.rotation.x = Math.PI / 2;
        const lens = cyl(par, 0.125, 0.125, 0.01, mat, 0, 0, 0.175, 16);
        lens.rotation.x = Math.PI / 2;
        this.pars.push(mat);
      }

    // Real lights are few and deliberate; the look comes from the volumes above.
    this.ambient = new THREE.HemisphereLight(0x8fa0c8, 0x120c08, 0.35);
    scene.add(this.ambient);
    // Every real light uses physical inverse-square falloff so intensities can be reasoned about.
    this.key = new THREE.SpotLight(0xffe6c4, 600, 70, 0.42, 0.7, 2);
    this.key.position.set(1.5, 12.5, 12);
    this.key.target.position.set(0, 0.8, -0.8);
    this.key.castShadow = !lowPower;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    this.key.shadow.camera.near = 6;
    this.key.shadow.camera.far = 32;
    scene.add(this.key, this.key.target);
    this.rim = new THREE.DirectionalLight(0xffffff, 1.4);
    this.rim.position.set(-3, 7, -9);
    this.rim.target.position.set(0, 1, 0);
    scene.add(this.rim, this.rim.target);
    for (const x of [-5.5, 0, 5.5]) {
      const wash = new THREE.PointLight(0xffffff, 50, 26, 2);
      wash.position.set(x, 6.4, 0.2);
      scene.add(wash);
      this.washes.push(wash);
    }
    this.follow = new THREE.SpotLight(0xfff4e0, 0, 60, 0.085, 0.5, 2);
    this.follow.position.set(0.5, 9.5, 19);
    scene.add(this.follow, this.follow.target);
    this.crowdLight = new THREE.PointLight(0xffffff, 0, 40, 2);
    this.crowdLight.position.set(0, 6.5, 9);
    scene.add(this.crowdLight);

    const laserCount = lowPower ? 18 : 36;
    this.laserBatch = new SegmentBatch(
      scene,
      new THREE.CylinderGeometry(0.009, 0.009, 1, 5, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
      laserCount,
      true,
    );
    for (let i = 0; i < laserCount; i++) {
      const e = this.laserEmitters[0];
      this.lasers.push({
        from: e.clone(),
        to: new THREE.Vector3(0, 2, 18),
        goalFrom: e.clone(),
        goalTo: new THREE.Vector3(0, 2, 18),
        on: 0,
      });
    }
    for (const e of this.laserEmitters) {
      box(fixtures, 0.4, 0.22, 0.5, bodyMat, e.x, e.y, e.z - 0.2);
      ball(
        fixtures,
        0.03,
        new THREE.MeshBasicMaterial({ color: 0x66ffcc }),
        e.x,
        e.y,
        e.z + 0.06,
        8,
      );
    }
    mergeStatic(fixtures);
  }

  private musicianPoint(role: Musician, out: THREE.Vector3) {
    const [x, y, z] = stagePositions[role];
    return out.set(x, y + 1.2, z);
  }

  /** One hand-written cue per beam recipe. */
  private cue(h: Head, sig: Signals, t: number, goal: THREE.Vector3): Cue {
    const u = h.count > 1 ? (h.index / (h.count - 1)) * 2 - 1 : 0;
    const back = h.group === 'back';
    const alt = h.index % 2;
    const soloist = sig.soloists[0];
    switch (sig.lighting.beam) {
      case 'wide fan':
        goal.set(
          u * (back ? 17 : 12),
          back ? 0.5 : 0,
          back ? 12 + Math.sin(t * 0.25 + u) * 2 : 1.5,
        );
        return { on: back ? 1 : 0.35, spread: 0.075, color: alt };
      case 'crossing arches': {
        const swing = Math.sin(t * 0.4 + h.index * 0.5);
        goal.set(
          -u * 10 + swing * 3,
          back ? 1 : 0,
          back ? 6 + Math.cos(t * 0.4 + h.index) * 4 : 0.5,
        );
        return { on: back ? 1 : 0.5, spread: 0.06, color: alt };
      }
      case 'slow orbit': {
        const a = t * 0.3 + (h.index / h.count) * Math.PI * 2 + (back ? 0 : Math.PI / h.count);
        goal.set(
          Math.cos(a) * (back ? 7 : 4.5),
          0,
          (back ? 4 : -0.5) + Math.sin(a) * (back ? 5 : 2.5),
        );
        return { on: 1, spread: 0.06, color: back ? 0 : 2 };
      }
      case 'ceiling bounce':
        goal.set(u * 13, 17 + Math.sin(t * 0.3 + u * 2) * 2, back ? 9 : 3);
        return { on: back ? 1 : 0.6, spread: 0.09, color: alt ? 2 : 0 };
      case 'solo pool': {
        // Everything leans toward whoever is speaking; the rest of the stage falls away.
        if (soloist) this.musicianPoint(soloist, goal);
        else goal.set(0, 1, 0);
        goal.x += Math.cos(h.index * 2.4) * 0.5;
        goal.z += Math.sin(h.index * 2.4) * 0.5;
        goal.y = stagePositions[soloist ?? 'bass'][1];
        return { on: back ? (alt ? 0.25 : 0.7) : 1, spread: 0.05, color: back ? 1 : 2 };
      }
      case 'four pillars': {
        // One column of light per musician, straight down the middle of each.
        const role = musicians[h.index % 4];
        this.musicianPoint(role, goal);
        goal.y = stagePositions[role][1];
        const chosen = !back && h.index < 4;
        const backPillar = back && [1, 3, 4, 6].includes(h.index);
        if (backPillar) goal.set(h.base.x, 0, h.base.z + 0.6);
        return { on: chosen ? 1 : backPillar ? 0.55 : 0, spread: 0.04, color: chosen ? 2 : 0 };
      }
      case 'low sweep':
        goal.set(
          Math.sin(t * 0.35 + h.index * 0.45) * 14,
          back ? 1.6 : 0,
          back ? 16 : 1 + Math.sin(t * 0.35 + h.index) * 1.5,
        );
        return { on: back ? 1 : 0.3, spread: 0.05, color: alt };
      case 'prism bloom': {
        // White light split through a prism: a flower of separate hues opening over the crowd.
        const a =
          (h.index / h.count) * Math.PI * (back ? 1 : -1) +
          (back ? 0 : Math.PI) +
          Math.sin(t * 0.2) * 0.2;
        goal.set(Math.cos(a) * 11, 5.5 + Math.sin(a) * 6.5, back ? 11 : 6);
        return {
          on: 1,
          spread: 0.1,
          color: 0,
          hue: (h.index / h.count + (back ? 0 : 0.5) + t * 0.01) % 1,
          gobo: 1,
        };
      }
      case 'inward focus':
        goal.set(u * 0.8, 0.9, -0.8);
        return { on: 1, spread: 0.045, color: back ? 0 : 1 };
      case 'horizon line':
        goal.set(h.base.x * 1.15, back ? 6.2 : 7.2, 24);
        return { on: back ? 1 : 0.4, spread: 0.035, color: 0 };
      case 'rain curtain': {
        // Narrow verticals along the downstage edge, brightness rolling across like a shower passing.
        goal.set(back ? h.base.x : h.base.x, 0, back ? h.base.z + 1.4 : 2.6);
        const roll = 0.5 + 0.5 * Math.sin(t * 0.9 - h.base.x * 0.5);
        return { on: 0.35 + 0.65 * roll, spread: 0.028, color: alt ? 2 : 0, gobo: 0.6 };
      }
      default:
        return { on: 0, spread: 0.05, color: 0 };
    }
  }

  private laserCue(
    sig: Signals,
    k: number,
    n: number,
    t: number,
    from: THREE.Vector3,
    to: THREE.Vector3,
  ): number {
    const u = (k / (n - 1)) * 2 - 1;
    const [c, l, r] = this.laserEmitters;
    switch (sig.lighting.laser) {
      case 'emerald fan':
        from.copy(c);
        to.set(u * 15, 1.2 + Math.sin(t * 0.4 + u * 2.5) * 1.4, 17);
        return 1;
      case 'cyan tunnel': {
        const a = (k / n) * Math.PI * 2 + t * 0.22;
        from.copy(c);
        to.set(Math.cos(a) * 9, 4.6 + Math.sin(a) * 4.2, 18);
        return 1;
      }
      case 'violet lattice': {
        const left = k % 2 === 0;
        from.copy(left ? l : r);
        const row = Math.floor(k / 2) % 6;
        const col = Math.floor(k / 12);
        to.set((left ? 1 : -1) * (4 + col * 5 + Math.sin(t * 0.2) * 1.5), 0.6 + row * 1.5, 17);
        return 1;
      }
      case 'amber horizon':
        from.copy(c);
        to.set(u * 20, 2.3 + Math.sin(t * 0.25) * 0.6, 18);
        return 1;
      case 'blue spokes': {
        const e = this.laserEmitters[k % 3];
        const a = (k / n) * Math.PI * 2 + t * 0.14 * (k % 3 === 1 ? -1 : 1);
        from.copy(e);
        to.set(e.x + Math.cos(a) * 16, e.y + Math.sin(a) * 9, e.z + 18);
        return to.y > -0.2 ? 1 : 0;
      }
      case 'pink canopy':
        from.copy(c);
        to.set(u * 17, 8.2 + Math.cos(u * 3 + t * 0.3) * 1.4, 12 + Math.sin(k * 1.7) * 5);
        return 1;
      case 'slow spiral': {
        const a = k * 0.55 + t * 0.28;
        const radius = 1.5 + (k / n) * 9.5;
        from.copy(c);
        to.set(Math.cos(a) * radius, 4.8 + Math.sin(a) * radius * 0.45, 18);
        return 1;
      }
      default:
        return 0;
    }
  }

  update(sig: Signals, dt: number, soloPoint: THREE.Vector3 | null) {
    const L = sig.lighting;
    const t = sig.time * (0.35 + L.motion * 1.5);
    const blackout = L.wash === 'blackout';
    const hex = washPalettes[L.wash] ?? washPalettes['amber dusk'];
    const glide = 1 - Math.exp(-dt * 0.9);
    this.palette.forEach((c, i) => c.lerp(_c.setHex(hex[i]), glide));
    const [A, B, C] = this.palette;
    // Breathing with the bar, never faster: gentle enough to feel, too slow to flash.
    const breath = sig.reduced
      ? 1
      : 0.9 + 0.1 * Math.cos(sig.barPhase * Math.PI * 2) + sig.kick * 0.06;
    const level = (blackout ? 0.04 : 0.25 + L.intensity * 0.75) * breath;
    this.solo = damp(this.solo, sig.soloists.length ? 1 : 0, 1.5, dt);

    this.ambient.intensity = blackout ? 0.06 : 0.16 + L.intensity * 0.22;
    this.key.intensity = (blackout ? 25 : 330 + L.intensity * 480) * (1 - this.solo * 0.4);
    this.key.color.setHex(0xffe6c4).lerp(A, 0.25);
    this.rim.color.copy(C);
    this.rim.intensity = level * 2.2;
    this.washes.forEach((w, i) => {
      w.color.copy(i === 1 ? B : A);
      w.intensity = level * (i === 1 ? 62 : 52);
    });
    this.crowdLight.color.copy(B).lerp(A, 0.5);
    this.crowdLight.intensity = level * (14 + sig.energy * 42);
    this.pars.forEach((mat, i) => mat.color.copy(i % 2 ? B : A).multiplyScalar(level * 2.4));

    const beamOff = L.beam === 'off' || blackout;
    const everyHead = [...this.heads, this.followSpotBeam];
    for (const h of everyHead) {
      let cue: Cue;
      if (h === this.followSpotBeam) {
        if (soloPoint) dampV(this.followTarget, soloPoint, 2.2, dt);
        h.goal.copy(this.followTarget);
        cue = { on: this.solo * (blackout ? 0.5 : 1), spread: 0.022, color: 2 };
      } else {
        cue = beamOff ? { on: 0, spread: 0.05, color: 0 } : this.cue(h, sig, t, h.goal);
      }
      // Heads travel like real fixtures: quick, but with mass.
      dampV(h.target, h.goal, 2.4, dt);
      h.on = damp(h.on, cue.on, 2.2, dt);
      if (cue.hue !== undefined) _c.setHSL(cue.hue, 1, 0.55);
      else _c.copy(this.palette[cue.color]);
      if (h === this.followSpotBeam) _c.setHex(0xfff1dc);
      h.color.lerp(_c, 1 - Math.exp(-dt * 2.5));
      _d.copy(h.target).sub(h.base).normalize();
      const tilt = Math.acos(Math.max(-1, Math.min(1, -_d.y)));
      h.yoke.rotation.y = Math.atan2(-_d.x, -_d.z);
      h.tilt.rotation.x = tilt;
      const floorY =
        Math.abs(h.target.x) < 9 && h.target.z > -6.8 && h.target.z < 3.2
          ? Math.max(0, h.goal.y < 0.6 ? h.goal.y : 0)
          : -0.72;
      let length = _d.y < -0.05 ? (h.base.y - 0.4 - floorY) / -_d.y : 24;
      const hits = length < 30;
      length = Math.min(length, 30);
      const spread =
        damp(h.beam.scale.x / Math.max(length, 0.001), cue.spread, 3, dt) || cue.spread;
      h.beam.scale.set(spread * length, length, spread * length);
      const u = h.beam.material.uniforms;
      const power =
        h.on * (h === this.followSpotBeam ? 0.5 : level) * (h.group === 'mid' ? 0.75 : 1);
      (u.uColor.value as THREE.Color).copy(h.color);
      u.uOpacity.value = power * 0.34;
      u.uTime.value = sig.time + h.index;
      u.uGobo.value = damp(u.uGobo.value, cue.gobo ?? 0, 2, dt);
      h.beam.visible = power > 0.004;
      h.lens.color.copy(h.color).multiplyScalar(power * 5 + 0.02);
      h.pool.visible = hits && power > 0.004;
      if (h.pool.visible) {
        _p.copy(h.base).addScaledVector(_d, length + 0.3);
        h.pool.position.set(_p.x, floorY + 0.015 + h.index * 0.0007, _p.z);
        const r = spread * length * 1.7;
        h.pool.scale.set(r, r / Math.max(0.35, -_d.y), 1);
        h.pool.rotation.z = Math.atan2(_d.x, _d.z);
        h.pool.material.color.copy(h.color);
        h.pool.material.opacity = power * 0.5;
      }
    }
    this.follow.target.position.copy(this.followTarget);
    this.follow.intensity = this.solo * 1300;

    // Lasers: colour is in the recipe's name, geometry is in its noun.
    const name = L.laser;
    const laserOn = name !== 'off' && !sig.reduced ? 1 : name !== 'off' ? 0.6 : 0;
    this.laserLevel = damp(this.laserLevel, laserOn, 1.6, dt);
    const tint: Record<string, number> = {
      emerald: 0x21ff7a,
      cyan: 0x2ff3ff,
      violet: 0x9a4dff,
      amber: 0xffa21f,
      blue: 0x2f6bff,
      pink: 0xff4fb8,
      slow: 0xaafff0,
    };
    this.laserColor.lerp(_c.setHex(tint[name.split(' ')[0]] ?? 0x44ff99), 1 - Math.exp(-dt * 2));
    const n = this.lasers.length;
    let any = false;
    this.lasers.forEach((laser, k) => {
      const want = name === 'off' ? 0 : this.laserCue(sig, k, n, t, laser.goalFrom, laser.goalTo);
      laser.on = damp(laser.on, want, 3, dt);
      dampV(laser.from, laser.goalFrom, 3, dt);
      dampV(laser.to, laser.goalTo, 2.2, dt);
      const power = laser.on * this.laserLevel;
      if (power <= 0.01) {
        this.laserBatch.hide(k);
        return;
      }
      any = true;
      this.laserBatch.set(k, laser.from, laser.to);
      const shimmer = 0.75 + 0.25 * Math.sin(sig.time * 3 + k * 1.3);
      const c = _c.copy(this.laserColor);
      if (name === 'slow spiral') c.offsetHSL((k / n) * 0.35, 0, 0);
      this.laserBatch.mesh.setColorAt(
        k,
        c.multiplyScalar(power * shimmer * (0.55 + L.intensity * 0.75)),
      );
    });
    this.laserBatch.mesh.visible = any;
    if (any) this.laserBatch.commit();
  }
}
