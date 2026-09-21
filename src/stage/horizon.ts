import * as THREE from 'three';
import type { Signals } from './signals';
import { damp, smooth } from './util';
import { NOISE } from './wall';
import type { Atmosphere } from './weather';

/** Where the festival has pitched up for this song. 'hills' is the open country it started in. */
export const places = ['hills', 'mountains', 'desert', 'city', 'night club', 'arena'] as const;
export type Place = (typeof places)[number];

/**
 * Every listener in the room, and every replay of the recording, lands in the same place: the
 * draw is a hash of the song's id rather than a roll of this browser's dice.
 */
export function placeFor(songId: string): Place {
  let h = 0x811c9dc5;
  for (let i = 0; i < songId.length; i++) h = Math.imul(h ^ songId.charCodeAt(i), 0x01000193);
  h ^= h >>> 15;
  return places[(h >>> 0) % places.length];
}

/** How much of the rolling hills survives in each place. Built places want level ground. */
const hillsIn: Record<Place, number> = {
  hills: 1,
  mountains: 1,
  desert: 0.55,
  city: 0.4,
  'night club': 0,
  arena: 0,
};

const vertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main(){
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

// Backdrops stand two hundred metres out, where scene fog would erase them. They carry their own
// haze instead, and their lights carry through it as real ones do.
const head = /* glsl */ `
uniform float uTime, uBeat, uEnergy, uCrash, uNight, uHaze, uSeed, uSpan, uShow;
uniform vec3 uAmbient, uFogColor, uPalA, uPalB;
varying vec2 vUv;
varying vec3 vWorld;
${NOISE}
vec4 finish(vec3 lit, vec3 glow){
  return vec4(mix(lit, uFogColor, uHaze) + glow * (1.0 - uHaze * 0.6), 1.0);
}`;

/** Mountain ranges and desert mesas: one silhouette shader, two temperaments. */
const ridgeFragment = /* glsl */ `
${head}
uniform float uBase, uAmp, uMesa, uSnow;
uniform vec3 uRock, uCap;
float ridged(vec2 p){
  float a = 0.55, v = 0.0;
  for (int i = 0; i < 4; i++){ v += a * (1.0 - abs(2.0 * vnoise(p) - 1.0)); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 3.1; a *= 0.5; }
  return v;
}
void main(){
  float a = vUv.x * 6.28318, y = vUv.y;
  // Noise is read around a circle, so the range closes on itself without a seam.
  vec2 c = vec2(cos(a), sin(a));
  float fine = fbm(c * 13.0 + uSeed * 1.7);
  float n = fbm(c * 2.4 + uSeed);
  float peaks = ridged(c * 2.1 + uSeed) * 0.85 + fine * 0.2;
  float mesa = smoothstep(0.43, 0.47, n) * 0.5 + smoothstep(0.56, 0.59, n) * 0.4 + fine * 0.07;
  float h = uBase + uAmp * mix(peaks, mesa, uMesa);
  if (y > h) discard;
  float facet = fbm(c * 36.0 + y * vec2(9.0, -6.0) + uSeed);
  float snow = uSnow * smoothstep(0.52, 0.64, y + (facet - 0.5) * 0.3);
  float strata = mix(1.0, 0.78 + 0.22 * sin(y * uSpan * 0.8 + facet * 5.0), uMesa);
  vec3 albedo = mix(uRock * (0.5 + 0.95 * facet) * strata, uCap, snow);
  // Moonlight: enough to find the snowline against the stars, no more.
  vec3 moon = vec3(0.02, 0.026, 0.045) * uNight * (0.4 + facet);
  gl_FragColor = finish(albedo * (uAmbient * 1.5 + moon) + vec3(0.003, 0.004, 0.007), vec3(0.0));
}`;

const cityFragment = /* glsl */ `
${head}
uniform float uCount, uBase, uAmp;
void main(){
  float y = vUv.y;
  float a = vUv.x * 6.28318;
  float bx = vUv.x * uCount;
  float id = floor(bx), fx = fract(bx);
  float r1 = hash21(vec2(id, uSeed)), r2 = hash21(vec2(id, uSeed + 7.0)), r3 = hash21(vec2(id, uSeed + 13.0));
  // Towers gather into a downtown or two; the rest of the ring is low-rise.
  float downtown = smoothstep(0.34, 0.66, fbm(vec2(cos(a), sin(a)) * 1.7 + uSeed));
  float h = uBase + uAmp * (0.12 + 0.88 * downtown) * (0.2 + 0.8 * r1 * r1);
  float inset = 0.03 + r2 * 0.16;
  float lo = inset, hi = 1.0 - inset * 0.5;
  // Tall towers step in near the top.
  float setback = step(0.45, r3) * step(h * (0.74 + 0.18 * r2), y);
  lo += setback * 0.16;
  hi -= setback * 0.16;
  float inside = step(lo, fx) * step(fx, hi);
  float mast = step(0.8, r1) * step(abs(fx - 0.5), 0.014) * step(y, h + 0.07);
  float top = inside > 0.5 ? h : uBase * 0.55;
  if (y > top && mast < 0.5) discard;

  float night = smoothstep(0.2, 0.6, uNight);
  vec3 facade = mix(vec3(0.09, 0.1, 0.12), vec3(0.3, 0.34, 0.4), r2);
  vec3 glow = vec3(0.0);
  if (mast > 0.5 && y > top){
    facade = vec3(0.05);
    float blink = step(0.5, fract(uTime * 0.45 + r2));
    glow = vec3(1.0, 0.08, 0.05) * step(h + 0.055, y) * blink * 2.5;
  } else if (inside > 0.5){
    float cols = 8.0 + floor(r2 * 9.0);
    vec2 g = vec2((fx - lo) / (hi - lo) * cols, y * uSpan / 3.0);
    vec2 cell = floor(g), f = fract(g);
    float pane = step(0.18, f.x) * step(f.x, 0.82) * step(0.25, f.y) * step(f.y, 0.78);
    float who = hash21(cell + id * 31.7 + uSeed);
    // Somebody is always working late; a few lights change hands over a minute.
    float lit = step(0.6 - 0.15 * r3, fract(who + floor(uTime * 0.03 + who * 9.0) * 0.37));
    vec3 lamp = who > 0.72 ? vec3(0.62, 0.82, 1.0) : vec3(1.0, 0.78, 0.46);
    glow += lamp * pane * lit * night * 1.1;
    facade = mix(facade, facade * 0.35 + uFogColor * 0.3, pane);
    // The skyline listens: crowns and corner strips in the rig's colours.
    float crown = step(0.55, r1) * step(h - 0.022, y) * step(y, h - 0.006);
    glow += uPalA * crown * (0.5 + 2.2 * uEnergy);
    float strip = step(0.78, r3) * (step(f.x + cell.x, 0.12) + step(cols - 0.12, f.x + cell.x));
    glow += uPalB * strip * (0.25 + 1.6 * uEnergy * exp(-fract(uBeat) * 3.0));
  } else facade *= 0.6;
  gl_FragColor = finish(facade * uAmbient * 1.4 + vec3(0.003, 0.004, 0.006), glow);
}`;

/** Two decks of seating on the inside of a cone: tiers, aisles, a concourse of suites, the rim. */
const arenaFragment = /* glsl */ `
${head}
vec3 hsl(float h, float s, float l){
  vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
}
void main(){
  float y = vUv.y, x = vUv.x;
  float night = smoothstep(0.2, 0.6, uNight);
  vec3 lit, glow = vec3(0.0);
  // House lights are down for the show. The stands live on stage spill and their own phones.
  vec3 light = uAmbient * 1.5 + uPalA * (0.05 + 0.22 * uEnergy) + vec3(0.05, 0.052, 0.06) * night;
  if (y > 0.93){
    // The rim: fascia, then a bank of floods that flares on a crash.
    float bank = fract(x * 96.0);
    float lamp = step(0.2, bank) * step(bank, 0.8) * step(0.955, y) * step(y, 0.985);
    lit = vec3(0.05, 0.055, 0.065) * light;
    glow = vec3(1.0, 0.96, 0.88) * lamp * night * (0.35 + 2.4 * uCrash);
  } else if (y > 0.41 && y < 0.5){
    // Concourse: a wall of suites with a scoreboard ribbon running along its top.
    vec2 g = vec2(x * 288.0, (y - 0.41) / 0.07);
    float pane = step(0.12, fract(g.x)) * step(fract(g.x), 0.88) * step(0.2, g.y) * step(g.y, 0.8);
    float who = hash21(vec2(floor(g.x), 3.0));
    lit = vec3(0.04, 0.042, 0.05) * light;
    glow = vec3(1.0, 0.8, 0.5) * pane * step(0.35, who) * night * 0.5;
    float ribbon = step(0.485, y);
    float chase = 0.5 + 0.5 * sin(x * 6.28318 * 24.0 - uTime * 2.0);
    glow += mix(uPalA, uPalB, chase) * ribbon * (0.35 + 1.8 * uEnergy);
  } else {
    float upper = step(0.5, y);
    float sections = mix(40.0, 56.0, upper);
    float sx = fract(x * sections);
    float aisle = step(sx, 0.035) + step(0.965, sx);
    vec2 g = vec2(x * 1700.0, y * 84.0);
    vec2 cell = floor(g), f = fract(g);
    float who = hash21(cell);
    float tunnel = (1.0 - upper) * step(0.1, y) * step(y, 0.17) * step(abs(sx - 0.5), 0.09);
    float seated = step(who, 0.9) * (1.0 - min(1.0, aisle + tunnel));
    vec3 cloth = hash21(cell + 51.0) < 0.3 ? hsl(hash21(cell + 53.0), 0.7, 0.45) : mix(vec3(0.07, 0.08, 0.1), vec3(0.75, 0.7, 0.6), hash21(cell + 57.0));
    // A wave goes round the bowl with the bar line, stronger as the band heats up.
    float wave = 0.5 + 0.5 * sin(x * 6.28318 * 3.0 - uBeat * 1.5708);
    float person = seated * smoothstep(0.5, 0.3, length(f - vec2(0.5, 0.45 + 0.1 * wave * uEnergy)));
    vec3 concrete = mix(vec3(0.11, 0.115, 0.125), vec3(0.015), tunnel) * (0.7 + 0.3 * step(0.5, f.y));
    lit = mix(concrete, cloth * (0.8 + 0.5 * wave * uEnergy), person) * light;
    float carries = hash21(cell + 31.0);
    float quiet = 0.35 + 0.65 * (1.0 - smoothstep(0.25, 0.6, uEnergy));
    float spark = step(carries, 0.06) * seated * smoothstep(0.32, 0.05, length(f - 0.5));
    glow = vec3(1.0, 0.86, 0.62) * spark * night * quiet * (0.6 + 0.4 * sin(uTime * (1.0 + carries * 30.0) + carries * 400.0)) * 1.5;
  }
  gl_FragColor = finish(lit, glow);
}`;

/** The arena's roof canopy and its leading-edge light. */
const canopyFragment = /* glsl */ `
${head}
void main(){
  float spoke = smoothstep(0.42, 0.5, abs(fract(vUv.x * 96.0) - 0.5));
  float ring = smoothstep(0.4, 0.5, abs(fract(vUv.y * 4.0) - 0.5));
  vec3 lit = mix(vec3(0.16, 0.17, 0.19), vec3(0.04), max(spoke, ring)) * (uAmbient * 1.3 + uPalA * 0.06 * uEnergy);
  vec3 glow = mix(uPalB, uPalA, 0.5 + 0.5 * sin(vUv.x * 6.28318 * 12.0 + uTime)) * step(0.94, vUv.y) * (0.3 + 1.5 * uEnergy);
  gl_FragColor = finish(lit, glow);
}`;

/** A gutted warehouse, painted black: level-meter bars, neon shapes, and a busy mezzanine. */
const clubFragment = /* glsl */ `
${head}
float seg(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
void main(){
  float y = vUv.y, x = vUv.x;
  vec2 panel = vec2(x * 144.0, y * 8.0);
  float seam = max(smoothstep(0.47, 0.5, abs(fract(panel.x) - 0.5)), smoothstep(0.47, 0.5, abs(fract(panel.y) - 0.5)));
  float grime = fbm(vec2(cos(x * 6.28318), sin(x * 6.28318)) * 40.0 + y * vec2(7.0, -5.0));
  vec3 wall = vec3(0.05, 0.05, 0.06) * (0.5 + grime) * (1.0 - 0.5 * seam);
  vec3 lit = wall * (uAmbient * 1.4 + uPalA * (0.08 + 0.3 * uEnergy));
  vec3 glow = vec3(0.0);
  float pulse = exp(-fract(uBeat) * 3.0);

  // Bays of twelve metres: every bay has a level meter, every third one a neon sign.
  float bx = x * 96.0;
  float id = floor(bx), fx = fract(bx);
  float who = hash21(vec2(id, 5.0));
  float level = 0.12 + (0.2 + 0.8 * uEnergy) * (0.5 + 0.5 * sin(id * 1.7 + uBeat * 3.14159)) * 0.34;
  float bar = step(abs(fx - 0.5), 0.035) * step(0.08, y) * step(y, level) * step(0.15, fract(y * 60.0));
  glow += mix(uPalA, uPalB, who) * bar * (0.7 + 1.3 * pulse);

  if (mod(id, 3.0) < 0.5){
    vec2 p = vec2((fx - 0.5) * 2.2, (y - 0.31) * 9.0);
    float kind = floor(who * 4.0);
    float d = kind < 0.5 ? abs(length(p) - 0.5)
      : kind < 1.5 ? min(min(seg(p, vec2(-0.55, -0.4), vec2(0.55, -0.4)), seg(p, vec2(0.55, -0.4), vec2(0.0, 0.55))), seg(p, vec2(0.0, 0.55), vec2(-0.55, -0.4)))
      : kind < 2.5 ? min(min(seg(p, vec2(-0.2, 0.6), vec2(0.15, 0.05)), seg(p, vec2(0.15, 0.05), vec2(-0.15, -0.05))), seg(p, vec2(-0.15, -0.05), vec2(0.2, -0.6)))
      : min(seg(p, vec2(-0.5, 0.0), vec2(0.5, 0.0)), seg(p, vec2(0.0, -0.5), vec2(0.0, 0.5)));
    float tube = smoothstep(0.07, 0.02, d) + 0.25 * smoothstep(0.35, 0.0, d);
    // Old transformers: a tube drops out for a moment now and then, never in time with anything.
    float steady = step(0.04, hash21(vec2(id, floor(uTime * 7.0))));
    vec3 ink = who < 0.33 ? vec3(1.0, 0.18, 0.6) : who < 0.66 ? vec3(0.15, 0.9, 1.0) : vec3(1.0, 0.85, 0.2);
    glow += ink * tube * steady * 1.2;
  }

  // The mezzanine: a warm slot in the wall with a rail and a row of heads moving to the beat.
  if (y > 0.5 && y < 0.64){
    float v = (y - 0.5) / 0.14;
    float hx = x * 1500.0;
    float hid = floor(hx);
    float there = step(hash21(vec2(hid, 9.0)), 0.7);
    float bob = abs(sin((uBeat + hash21(vec2(hid, 2.0)) * 0.2) * 3.14159)) * (0.04 + 0.14 * uEnergy);
    float tall = 0.38 + 0.16 * hash21(vec2(hid, 4.0)) + bob;
    float head = smoothstep(0.42, 0.3, length(vec2((fract(hx) - 0.5) * 0.9, (v - tall) * 2.4)));
    float body = step(v, tall - 0.08) * step(abs(fract(hx) - 0.5), 0.36);
    float people = there * max(head, body);
    float rail = step(abs(v - 0.3), 0.025) + step(v, 0.06);
    float post = step(fx, 0.03) + step(0.97, fx);
    lit *= 0.4;
    glow = (vec3(1.0, 0.55, 0.3) * 0.22 + uPalB * 0.2 * uEnergy) * (1.0 - max(people, min(1.0, rail + post)) * 0.93);
  }
  glow += uPalB * step(0.93, y) * step(y, 0.95) * (0.4 + 1.4 * uEnergy);
  gl_FragColor = finish(lit, glow);
}`;

/** Roof trusses with the cladding long gone: weather still gets in, and so do the stars. */
const trussFragment = /* glsl */ `
${head}
void main(){
  vec2 g = vWorld.xz / 24.0;
  vec2 f = abs(fract(g) - 0.5);
  float beam = max(step(0.47, f.x), step(0.47, f.y));
  float brace = step(abs(f.x - f.y), 0.012) * step(0.25, max(f.x, f.y));
  vec2 cell = floor(g + 0.5);
  // The roof assembles bay by bay when the club arrives.
  if (max(beam, brace) < 0.5 || hash21(cell) > uShow * 1.05 - 0.02) discard;
  float tube = beam * smoothstep(0.492, 0.498, max(f.x, f.y));
  float run = 0.5 + 0.5 * sin((vWorld.x + vWorld.z) * 0.16 - uTime * 1.6);
  vec3 lit = vec3(0.07, 0.072, 0.08) * (uAmbient * 1.4 + uPalA * (0.1 + 0.3 * uEnergy));
  vec3 glow = mix(uPalA, uPalB, run) * tube * (0.3 + 1.6 * uEnergy * exp(-fract(uBeat) * 2.5));
  gl_FragColor = finish(lit, glow);
}`;

interface Piece {
  place: Place;
  group: THREE.Group;
  materials: THREE.ShaderMaterial[];
  /** How far the set sinks into the ground when it is not in use. */
  sink: number;
  presence: number;
}

/**
 * What stands at the edge of the field. Each song is somewhere: open hills, a mountain valley,
 * the desert, a city park, a roofless warehouse club, an arena. One place is drawn per song; the
 * last one sinks into the ground while the next rises, like scenery on a very large stage.
 * All of it is shader on a few cylinders: no textures, no per-frame CPU work.
 */
export class Horizon {
  /** Current height of the rolling hills, 0..1, for the ground and the far crowd. */
  hills = 1;
  place: Place = 'hills';
  private readonly pieces: Piece[] = [];
  private song = '';
  private drawn: Place = 'hills';
  private started = false;

  constructor(private readonly scene: THREE.Scene) {
    const ridge = (mesa: number, rock: number, cap: number) => (layer: number) =>
      this.material(ridgeFragment, {
        uSeed: 3.7 + layer * 11.3 + mesa * 5.1,
        uHaze: [0.62, 0.45, 0.28][layer] * (mesa ? 0.8 : 1),
        uSpan: [120, 92, 62][layer],
        uBase: [0.3, 0.3, 0.46][layer],
        uAmp: mesa ? [0.5, 0.5, 0.4][layer] : [0.62, 0.6, 0.42][layer],
        uMesa: mesa,
        uSnow: mesa ? 0 : [1, 0.8, 0][layer],
        uRock: new THREE.Color(rock),
        uCap: new THREE.Color(cap),
      });
    for (const [place, make] of [
      ['mountains', ridge(0, 0x3d4350, 0xe6ecf5)],
      ['desert', ridge(1, 0xb5553a, 0xd98a5a)],
    ] as const) {
      const piece = this.piece(place, 125);
      [250, 232, 214].forEach((radius, layer) =>
        this.ring(piece, make(layer), radius, radius, -5, [120, 92, 62][layer]),
      );
    }

    const city = this.piece('city', 115);
    [
      { radius: 250, span: 110, count: 132, haze: 0.5, base: 0.2, seed: 2.0 },
      { radius: 224, span: 72, count: 104, haze: 0.28, base: 0.3, seed: 9.0 },
    ].forEach((l) =>
      this.ring(
        city,
        this.material(cityFragment, {
          uSeed: l.seed,
          uHaze: l.haze,
          uSpan: l.span,
          uCount: l.count,
          uBase: l.base,
          uAmp: 1 - l.base - 0.08,
        }),
        l.radius,
        l.radius,
        -5,
        l.span,
      ),
    );

    const arena = this.piece('arena', 95);
    this.ring(arena, this.material(arenaFragment, { uHaze: 0.22 }), 168, 252, 8, 64);
    this.ring(arena, this.material(canopyFragment, { uHaze: 0.22 }), 252, 212, 72, 15);

    const club = this.piece('night club', 75);
    this.ring(club, this.material(clubFragment, { uHaze: 0.12 }), 178, 178, 5, 62);
    const roof = new THREE.Mesh(
      new THREE.CircleGeometry(178, 48).rotateX(-Math.PI / 2),
      this.material(trussFragment, { uHaze: 0.1 }),
    );
    // The roof would pass through the band if it sank with the walls; it dissolves instead.
    roof.position.y = 67;
    roof.userData.stays = true;
    roof.frustumCulled = false;
    club.group.add(roof);
    club.materials.push(roof.material);
  }

  private material(fragmentShader: string, values: Record<string, number | THREE.Color>) {
    const uniforms: Record<string, THREE.IUniform> = {
      uTime: { value: 0 },
      uBeat: { value: 0 },
      uEnergy: { value: 0 },
      uCrash: { value: 0 },
      uNight: { value: 1 },
      uHaze: { value: 0.3 },
      uSeed: { value: 0 },
      uSpan: { value: 60 },
      uShow: { value: 0 },
      uAmbient: { value: new THREE.Color() },
      uFogColor: { value: new THREE.Color() },
      uPalA: { value: new THREE.Color() },
      uPalB: { value: new THREE.Color() },
    };
    for (const [name, value] of Object.entries(values)) uniforms[name] = { value };
    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader: vertex,
      fragmentShader,
      side: THREE.DoubleSide,
      fog: false,
    });
  }

  private piece(place: Place, sink: number) {
    // Pieces start visible but buried, so the engine's precompile pass builds their programs
    // before the first frame rather than in the middle of somebody's song.
    const piece: Piece = { place, group: new THREE.Group(), materials: [], sink, presence: 0 };
    piece.group.position.y = -sink;
    this.scene.add(piece.group);
    this.pieces.push(piece);
    return piece;
  }

  /** An open band of wall from `bottom` radius at height `y` to `top` radius at `y + height`. */
  private ring(
    piece: Piece,
    material: THREE.ShaderMaterial,
    bottom: number,
    top: number,
    y: number,
    height: number,
  ) {
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(top, bottom, height, 160, 1, true),
      material,
    );
    band.position.y = y + height / 2;
    band.frustumCulled = false;
    piece.group.add(band);
    piece.materials.push(material);
  }

  update(
    sig: Signals,
    palette: [THREE.Color, THREE.Color, THREE.Color],
    dt: number,
    air: Atmosphere,
    override?: Place,
  ) {
    const song = sig.frame?.themeId;
    if (song && song !== this.song) {
      this.song = song;
      this.drawn = placeFor(song);
    }
    this.place = override ?? this.drawn;
    // A change of scene takes about eight seconds. The first frame is already wherever it is.
    const snap = !this.started || sig.reduced;
    this.started = true;
    this.hills = snap ? hillsIn[this.place] : damp(this.hills, hillsIn[this.place], 0.5, dt);
    const dark = sig.lighting.wash === 'blackout' ? 0.15 : 1;
    for (const piece of this.pieces) {
      const want = piece.place === this.place ? 1 : 0;
      piece.presence = snap
        ? want
        : Math.max(0, Math.min(1, piece.presence + (want ? dt : -dt) / 8));
      piece.group.visible = piece.presence > 0;
      if (!piece.group.visible) continue;
      const sunk = -(1 - smooth(piece.presence)) * piece.sink;
      piece.group.position.y = sunk;
      for (const child of piece.group.children)
        if (child.userData.stays) child.position.y = 67 - sunk;
      for (const material of piece.materials) {
        const u = material.uniforms;
        u.uTime.value = sig.time;
        u.uBeat.value = sig.beat;
        u.uEnergy.value = sig.playing && !sig.reduced ? sig.energy * dark : 0;
        u.uCrash.value = sig.reduced ? 0 : sig.crash * dark;
        u.uNight.value = air.night;
        u.uShow.value = piece.presence;
        (u.uAmbient.value as THREE.Color).copy(air.ambient);
        (u.uFogColor.value as THREE.Color).copy(air.fogColor);
        (u.uPalA.value as THREE.Color).copy(palette[0]).multiplyScalar(dark);
        (u.uPalB.value as THREE.Color).copy(palette[2]).multiplyScalar(dark);
      }
    }
  }
}
