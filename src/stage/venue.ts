import * as THREE from 'three';
import { random } from '../../shared/music';
import type { Signals } from './signals';
import { Amp, sharedAmpTextures } from './strings';
import { banner as bannerArt, grille, softDot, stageDeck, weave } from './textures';
import { box, cyl, damp, mergeStatic, mesh } from './util';
import { CROWD_DENSITY, GROUND, terrainHeight } from './crowdfield';
import { NOISE, Wall, type WallContext } from './wall';
import type { Atmosphere } from './weather';

const groundVertex = /* glsl */ `
varying vec3 vWorld;
varying float vDensity, vDist;
${CROWD_DENSITY}
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vDensity = crowdDensity(w.xz);
  vec4 mv = viewMatrix * w;
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const groundFragment = /* glsl */ `
uniform float uTime, uKickAge, uKickPower, uEnergy, uFogDensity, uWet, uNight;
uniform vec3 uPalA, uAmbient, uSpill, uFogColor;
varying vec3 vWorld;
varying float vDensity, vDist;
${NOISE}
vec3 hsl(float h, float s, float l){
  vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
}
void main(){
  vec2 p = vWorld.xz;
  float d = length(p - vec2(0.0, -1.0));
  float n = fbm(p * 0.35);
  // Trodden festival grass: only the daylight shows how green it is.
  vec3 grass = mix(vec3(0.16, 0.2, 0.07), vec3(0.3, 0.26, 0.14), fbm(p * 0.06 + 3.0)) * (0.55 + 0.7 * n);
  grass = mix(grass, vec3(0.2, 0.16, 0.11), smoothstep(0.35, 0.8, vDensity) * 0.7);
  vec3 col = vec3(0.007, 0.008, 0.011) * (0.6 + n) + grass * uAmbient * 1.9 * (1.0 - 0.35 * uWet);
  // Seen from above, the far crowd is a field of heads. Same people as the cards standing on it.
  vec2 cell = p / 0.64;
  vec2 id = floor(cell);
  float present = step(hash21(id + 17.0), vDensity);
  vec2 jitter = vec2(hash21(id + 3.0), hash21(id + 9.0)) - 0.5;
  float person = smoothstep(0.34, 0.2, length(fract(cell) - 0.5 - jitter * 0.3)) * present;
  vec3 cloth = hash21(id + 51.0) < 0.3 ? hsl(hash21(id + 53.0), 0.7, 0.45) : mix(vec3(0.07, 0.08, 0.1), vec3(0.75, 0.7, 0.6), hash21(id + 57.0));
  // A head of hair in the middle of each pair of shoulders.
  vec3 hair = mix(vec3(0.05, 0.03, 0.02), vec3(0.7, 0.55, 0.3), pow(hash21(id + 67.0), 3.0));
  cloth = mix(cloth, hair, smoothstep(0.13, 0.09, length(fract(cell) - 0.5 - jitter * 0.3)));
  float reach = 1.0 / (1.0 + pow(d / 38.0, 2.0));
  col = mix(col, cloth * (uAmbient + uSpill * reach * 0.8), person);
  // Phones and lighters held up in the dark.
  float carries = hash21(id + 31.0);
  float glint = step(carries, 0.07) * present * uNight * smoothstep(0.1, 0.0, length(fract(cell) - 0.5 - jitter * 0.3 - 0.18));
  col += vec3(1.0, 0.86, 0.62) * glint * (0.6 + 0.4 * sin(uTime * (1.0 + carries * 30.0) + carries * 400.0)) * 1.4;
  // Each kick sends one ring out through the field, under the crowd's feet.
  float ring = exp(-pow((d - 4.0 - uKickAge * 26.0) * 0.55, 2.0)) * uKickPower * exp(-uKickAge * 1.6);
  col += uPalA * ring * 0.16;
  col += uPalA * 0.05 * uEnergy * exp(-d * 0.06) * (0.5 + 0.5 * sin(d * 1.3 - uTime * 0.8));
  float thick = uFogDensity * 0.62;
  float fog = 1.0 - exp(-thick * thick * vDist * vDist);
  gl_FragColor = vec4(mix(col, uFogColor, fog * (1.0 - glint * 0.85)), 1.0);
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
  readonly wall: Wall;
  private readonly deckMaterial: THREE.MeshStandardMaterial;
  private readonly ground: THREE.ShaderMaterial;
  private readonly bannerMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private readonly bannerRest: Float32Array;
  private readonly haze: THREE.Sprite[] = [];
  private readonly monitors: Amp[] = [];
  private readonly lip: THREE.InstancedMesh;
  private readonly lipColor = new THREE.Color();
  private readonly reflection: THREE.MeshBasicMaterial;
  private kickAge = 9;
  private kickPower = 0;

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
    this.deckMaterial = deckMat;
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
    this.wall = new Wall(lowPower);
    const wallMaterial = new THREE.MeshBasicMaterial({ map: this.wall.texture });
    mesh(stage, new THREE.PlaneGeometry(17, 7.4), wallMaterial, 0, 3.95, RIG.screenZ);
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
      map: this.wall.texture,
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

    // The field the crowd stands in: flat out front, rising into a bowl, hills on the horizon.
    this.ground = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uKickAge: { value: 9 },
        uKickPower: { value: 0 },
        uEnergy: { value: 0 },
        uWet: { value: 0 },
        uNight: { value: 1 },
        uFogDensity: { value: 0.012 },
        uPalA: { value: new THREE.Color() },
        uAmbient: { value: new THREE.Color() },
        uSpill: { value: new THREE.Color() },
        uFogColor: { value: new THREE.Color() },
      },
      vertexShader: groundVertex,
      fragmentShader: groundFragment,
    });
    const fieldGeo = new THREE.PlaneGeometry(620, 620, lowPower ? 80 : 160, lowPower ? 80 : 160);
    fieldGeo.rotateX(-Math.PI / 2);
    const fieldPos = fieldGeo.attributes.position;
    for (let i = 0; i < fieldPos.count; i++)
      fieldPos.setY(i, terrainHeight(fieldPos.getX(i), fieldPos.getZ(i)) - GROUND);
    mesh(scene, fieldGeo, this.ground, 0, GROUND, 0);

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
    this.wall.ripple(index, x, y, strength);
  }

  update(
    sig: Signals,
    palette: [THREE.Color, THREE.Color, THREE.Color],
    renderer: THREE.WebGLRenderer,
    dt: number,
    air: Atmosphere,
    context: WallContext,
  ) {
    const live = sig.reduced ? 0 : 1;
    const dark = sig.lighting.wash === 'blackout' ? 0.12 : 1;
    this.wall.update(sig, palette, renderer, dt, context);
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
    g.uWet.value = air.wet;
    g.uNight.value = air.night;
    g.uFogDensity.value = air.fogDensity;
    (g.uFogColor.value as THREE.Color).copy(air.fogColor);
    (g.uAmbient.value as THREE.Color).copy(air.ambient);
    (g.uSpill.value as THREE.Color)
      .copy(palette[0])
      .multiplyScalar((0.25 + sig.lighting.intensity * 0.9) * dark);
    // Rain lacquers the deck: sharper highlights and a stronger smear of the wall.
    this.deckMaterial.roughness = damp(this.deckMaterial.roughness, 0.42 - air.wet * 0.3, 1, dt);

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
    this.reflection.opacity = 0.2 + air.wet * 0.25;
  }

  dispose() {
    this.wall.dispose();
  }
}
