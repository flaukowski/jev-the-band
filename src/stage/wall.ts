import * as THREE from 'three';
import {
  lightRecipes,
  musicians,
  personas,
  type Frame,
  type Musician,
  type WallOverlay,
  type WallVisual,
} from '../../shared/music';
import { drumVoice, type Signals } from './signals';
import { clamp01, damp } from './util';

export const NOISE = /* glsl */ `
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

const BANDS = 32;
const ASPECT = 17 / 7.4;
const quadVertex =
  'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

/**
 * The projection wall. Lux picks one picture and, optionally, a second laid over it:
 *   0 liquid light   the original oil show, one pattern family per mode
 *   1 jev logo       the band's mark with zooming echoes
 *   2 piano roll     the committed notes of all four players, scrolling past "now"
 *   3 band camera    a live feed of a player; goes to the soloist
 *   4 graphic eq     32 LED columns with falling peak caps
 *   5 radial spectrum
 *   6 plasma trails  a warping feedback buffer around a waveform
 *   7 mandala        seeded line-art geometry, a new figure every two phrases
 *   8 decision stream  the room's raw decision JSON as falling code
 *   9 song title     the current title as animated poster lettering
 * Whatever Lux has up, a new song or theme also gets a title card laid over it for a few seconds.
 * Spectrum pictures use the listener's real master bus when sound is on and the committed notes
 * otherwise. Nothing here asks a model for anything.
 */
const pictureHeader = /* glsl */ `
uniform float uTime, uBeat, uEnergy, uKick, uHue, uAspect;
uniform float uSeedA, uSeedB, uSeedMix, uBass, uTreat, uGain;
uniform vec4 uMode;
uniform vec3 uPalA, uPalB, uPalC;
uniform float uSpec[${BANDS}];
uniform float uPeak[${BANDS}];
uniform vec4 uVoice[4];
uniform sampler2D tLogo, tMap;
varying vec2 vUv;
${NOISE}
vec3 pal(float t){
  t = fract(t);
  vec3 c = t < 0.3333 ? mix(uPalA, uPalB, t * 3.0) : t < 0.6667 ? mix(uPalB, uPalC, (t - 0.3333) * 3.0) : mix(uPalC, uPalA, (t - 0.6667) * 3.0);
  // Thin-film shimmer on top of Lux's chosen chord of colours.
  return c + 0.12 * cos(6.2831 * (t * 2.0 + vec3(0.0, 0.33, 0.67) + uHue));
}
float h1(float n){ return fract(sin(n * 127.1) * 43758.5453); }
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
vec3 softMandala(vec2 p, float t){
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
vec3 liquidShow(vec2 p, float t){
  vec3 col = vec3(0.0);
  float total = 0.0;
  if (uMode.x > 0.01){ col += liquid(p, t) * uMode.x; total += uMode.x; }
  if (uMode.y > 0.01){ col += softMandala(p, t) * uMode.y; total += uMode.y; }
  if (uMode.z > 0.01){ col += tunnel(p, t) * uMode.z; total += uMode.z; }
  if (uMode.w > 0.01){ col += sunburst(p, t) * uMode.w; total += uMode.w; }
  return max(col / max(total, 0.001), 0.0);
}

vec2 logoUv(vec2 p, float scale){ return (p / scale) / vec2(uAspect, 1.0) * 0.5 + 0.5; }
float logoMask(vec2 uv){
  vec2 inside = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  return texture2DLodEXT(tLogo, uv, 0.0).r * inside.x * inside.y;
}
vec3 logo(vec2 p, float t){
  float r = length(p);
  float a = atan(p.y, p.x);
  // Rays and a slow plasma behind the letters.
  float rays = pow(0.5 + 0.5 * sin(a * 9.0 + t * 0.2 + sin(r * 3.0 - t * 0.5)), 3.0);
  vec3 col = pal(uHue + r * 0.25 + t * 0.01) * rays * 0.22 * smoothstep(0.1, 1.4, r);
  float breathe = 1.0 + uKick * 0.045 + 0.02 * sin(uBeat * 1.5708);
  p = rot(sin(t * 0.13) * 0.035) * p;
  // Echoes of the outline zoom out of the mark and fade, one per beat.
  float march = fract(uBeat * 0.5);
  for (int i = 0; i < 6; i++){
    float k = float(i) + march;
    float m = logoMask(logoUv(p, breathe * (1.0 + k * 0.16)));
    float edge = smoothstep(0.25, 0.5, m) * smoothstep(0.75, 0.5, m);
    col += pal(uHue + 0.12 * k + 0.4) * edge * (1.0 - k / 6.0) * (0.35 + uEnergy * 0.5);
  }
  vec2 uv = logoUv(p, breathe);
  float m = logoMask(uv);
  float body = smoothstep(0.48, 0.56, m);
  float rim = smoothstep(0.3, 0.5, m) * (1.0 - body);
  vec2 w = p * 1.6 + vec2(fbm(p * 2.0 + t * 0.15), fbm(p * 2.0 - t * 0.12)) * 1.4;
  vec3 fill = pal(fbm(w) * 1.3 + uHue + p.x * 0.12) * (0.9 + 0.5 * uEnergy);
  // A slow specular sweep, like foil catching a follow-spot.
  fill += vec3(1.0) * smoothstep(0.08, 0.0, abs(fract(p.x * 0.18 - p.y * 0.1 - t * 0.06) - 0.5)) * 0.55;
  col = mix(col, fill, body);
  col += pal(uHue + 0.5) * rim * (1.1 + uKick * 0.8);
  return col;
}

vec3 screenTone(vec3 c){ return c / (1.0 + c) * 1.35; }
vec3 bandCam(vec2 uv, float t){
  // IMAG screens are made of LED tiles; keep a little of that structure and a soft colour split.
  vec2 d = vec2(0.0018, 0.0);
  vec3 c = vec3(texture2DLodEXT(tMap, uv + d, 0.0).r, texture2DLodEXT(tMap, uv, 0.0).g, texture2DLodEXT(tMap, uv - d, 0.0).b);
  c = screenTone(c * 1.5);
  float tile = 0.88 + 0.12 * smoothstep(0.0, 0.3, abs(fract(uv.y * 140.0) - 0.5));
  c *= tile;
  c = mix(c, c * pal(uHue + 0.2) * 1.6, 0.18);
  vec2 v = uv - 0.5;
  return c * (1.0 - dot(v, v) * 0.9) * 1.7;
}

float specAt(float x){
  float f = clamp(x, 0.0, 0.9999) * ${BANDS}.0;
  int i = int(floor(f));
  int j = i + 1 > ${BANDS - 1} ? ${BANDS - 1} : i + 1;
  float k = fract(f);
  return mix(uSpec[i], uSpec[j], k * k * (3.0 - 2.0 * k));
}
vec3 graphicEq(vec2 uv, float t){
  float x = uv.x * 0.94 + 0.03;
  float f = clamp(x, 0.0, 0.9999) * ${BANDS}.0;
  int i = int(floor(f));
  float within = fract(f);
  float level = uSpec[i];
  float peak = uPeak[i];
  float base = 0.16;
  float y = (uv.y - base) / 0.74;
  float gap = smoothstep(0.08, 0.14, within) * smoothstep(0.92, 0.86, within);
  float rows = 26.0;
  float led = smoothstep(0.12, 0.22, fract(y * rows)) * smoothstep(0.95, 0.85, fract(y * rows));
  float cellY = (floor(y * rows) + 0.5) / rows;
  float lit = step(cellY, level) * step(0.0, y);
  float cap = step(abs(cellY - peak), 0.5 / rows) * step(0.0, y);
  vec3 tint = pal(uHue + cellY * 0.55 + float(i) * 0.006);
  tint = mix(tint, vec3(1.0, 0.35, 0.2), smoothstep(0.78, 1.0, cellY));
  vec3 col = tint * lit * (0.55 + 0.75 * cellY) + vec3(1.0) * cap * 0.9;
  // Unlit LEDs are still there, faintly.
  col += tint * 0.035 * step(0.0, y) * step(y, 1.0);
  col *= gap * led;
  // Mirror in the black glass under the desk.
  float ry = (base - uv.y) / 0.74 * 2.4;
  float rcell = (floor(ry * rows) + 0.5) / rows;
  float rlit = step(rcell, level) * step(0.0, ry) * step(ry, 1.0);
  col += pal(uHue + rcell * 0.55) * rlit * gap * 0.22 * (1.0 - ry);
  return col;
}
float waveAt(float x, float t){
  float y = 0.0;
  for (int i = 0; i < 4; i++) y += uVoice[i].y * sin(x * uVoice[i].x + t * (2.0 + float(i) * 1.3) + float(i) * 1.7);
  return y;
}
vec3 radial(vec2 p, float t){
  float r = length(p);
  float a = atan(p.y, p.x);
  float turn = a / 6.2831 + 0.25 + t * 0.008;
  float m = abs(fract(turn) * 2.0 - 1.0);
  float level = specAt(m);
  float r0 = 0.3 + uKick * 0.035 + uBass * 0.04;
  float spokes = 96.0;
  float sp = abs(fract(turn * spokes) - 0.5);
  float bar = smoothstep(0.42, 0.3, sp) * step(r0, r) * smoothstep(r0 + 0.05 + level * 0.62, r0 + 0.03 + level * 0.62, r);
  vec3 col = pal(uHue + m * 0.6 + r * 0.2) * bar * (0.7 + level);
  // The core: a waveform drawn around a circle, and a soft heart that swells with the low end.
  float wave = waveAt(a * 3.0, t) * 0.035;
  col += pal(uHue + 0.5) * smoothstep(0.012, 0.0, abs(r - (r0 - 0.035) - wave)) * 1.3;
  col += pal(uHue + 0.15) * exp(-r * r * 18.0) * (0.35 + uBass * 1.3 + uKick * 0.5);
  // Peak sparks flung off the ring.
  float ring = fract(r * 1.6 - t * 0.12);
  col += pal(uHue + 0.33 + r * 0.1) * smoothstep(0.04, 0.0, abs(ring - 0.5)) * 0.1 * smoothstep(r0 + 0.5, r0 + 0.9, r) * (0.4 + uEnergy);
  return col;
}

vec3 geoMandala(vec2 p, float t, float seed){
  float n = floor(3.0 + h1(seed) * 6.0) * 2.0;
  float seg = 6.2831 / n;
  float r = length(p);
  float a = atan(p.y, p.x);
  vec3 col = vec3(0.0);
  for (int L = 0; L < 6; L++){
    float fl = float(L);
    float s = seed + fl * 7.31;
    float dirn = h1(s + 1.0) > 0.5 ? 1.0 : -1.0;
    float aa = a + dirn * t * (0.02 + 0.05 * h1(s + 2.0)) + fl * seg * 0.5 * floor(h1(s + 6.0) * 2.0);
    float fa = abs(mod(aa, seg) - seg * 0.5);
    vec2 q = r * vec2(cos(fa), sin(fa));
    float R = 0.14 + fl * 0.21 + 0.03 * sin(t * 0.21 + fl * 1.9) + uKick * 0.012 * fl;
    float size = 0.05 + 0.1 * h1(s + 4.0) + fl * 0.012;
    float kind = floor(h1(s + 3.0) * 5.0);
    float d;
    if (kind < 0.5) d = abs(length(q - vec2(R, 0.0)) - size);
    else if (kind < 1.5) d = min(abs(r - R), abs(r - R - size * 0.5));
    else if (kind < 2.5) { vec2 w = abs(q - vec2(R, 0.0)); d = abs(w.x + w.y - size); }
    else if (kind < 3.5) d = abs(r - R - size * 0.8 * cos(aa * n));
    else { vec2 w = rot(0.7854) * (q - vec2(R, 0.0)); d = abs(max(abs(w.x), abs(w.y)) - size * 0.8); }
    float line = smoothstep(0.014, 0.0, d) + 0.35 * smoothstep(0.08, 0.0, d);
    // A second, fainter copy of each figure nested inside itself.
    line += 0.5 * smoothstep(0.009, 0.0, abs(d - size * 0.32));
    col += pal(fl * 0.16 + uHue + h1(s + 5.0) * 0.35) * line * (0.75 + 0.5 * uSpec[L * 4 + 2]);
  }
  // Stained glass between the lines: folded, banded colour that turns against the figures.
  float ga = abs(mod(a - t * 0.02, seg * 2.0) - seg);
  float glass = 0.5 + 0.5 * sin(r * (9.0 + 6.0 * h1(seed + 9.0)) - ga * n * 1.5 + t * 0.3);
  col += pal(uHue + 0.3 + r * 0.3 + glass * 0.2) * glass * glass * 0.16 * smoothstep(0.08, 0.4, r);
  // Spokes and a jewel at the hub.
  float fa = abs(mod(a + t * 0.015, seg) - seg * 0.5);
  col += pal(uHue + 0.6) * smoothstep(0.006, 0.0, r * sin(fa)) * smoothstep(0.1, 0.3, r) * smoothstep(1.5, 0.9, r) * 0.5;
  col += pal(uHue + 0.5) * exp(-r * r * 60.0) * (0.8 + uKick);
  return col * smoothstep(1.75, 1.2, r);
}
vec3 mandalaLayer(vec2 p, float t){
  vec3 b = geoMandala(p, t, uSeedB);
  if (uSeedMix > 0.995) return b;
  // The old figure is drawn outward and thinned while the new one opens from the hub.
  float r = length(p);
  float iris = smoothstep(uSeedMix * 2.4 - 0.5, uSeedMix * 2.4, r);
  return mix(b, geoMandala(p * (1.0 - uSeedMix * 0.25), t, uSeedA), iris);
}

`;

/**
 * Each picture is its own small program drawn into its own target. One program holding all nine
 * (three times over, for base, outgoing and overlay) took the D3D compiler half a minute.
 */
const picture = (call: string) => /* glsl */ `${pictureHeader}
void main(){
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) * 2.0;
  float t = uTime * (0.55 + uEnergy * 0.9);
  gl_FragColor = vec4(max(${call}, 0.0), 1.0);
}`;
const pictures = {
  liquid: picture('liquidShow(p, t)'),
  logo: picture('logo(p, t)'),
  eq: picture('graphicEq(vUv, t)'),
  radial: picture('radial(p, t)'),
  mandala: picture('mandalaLayer(p, t)'),
  // Canvas and camera pictures: a straight copy, with the IMAG treatment for the camera.
  copy: picture('(uTreat > 0.5 ? bandCam(vUv, t) : texture2DLodEXT(tMap, vUv, 0.0).rgb * uGain)'),
};
type PictureKind = keyof typeof pictures;
/** Program for each entry of lightRecipes.visual, in order. */
const kinds: PictureKind[] = [
  'liquid',
  'logo',
  'copy',
  'copy',
  'eq',
  'radial',
  'copy',
  'mandala',
  'copy',
  'copy',
];
/** How much the players' ripples may bend each picture: text and faces stay readable. */
const bendOf = [1, 0.6, 0.12, 0.12, 0.35, 1, 1, 1, 0.12, 0.2];
const TITLE = 9;
/** How long a new song's title card stays over whatever else is on the wall. */
const TITLE_CARD_SECONDS = 10;

const compositeFragment = /* glsl */ `
uniform sampler2D tBase, tPrev, tOver;
uniform float uBaseMix, uOverAmt, uKick, uSolo, uIntensity, uEnergy, uHue, uAspect;
uniform vec3 uBend;
uniform vec3 uPalA, uPalB, uPalC;
uniform vec4 uRipple[4];
varying vec2 vUv;
vec3 pal(float t){
  t = fract(t);
  vec3 c = t < 0.3333 ? mix(uPalA, uPalB, t * 3.0) : t < 0.6667 ? mix(uPalB, uPalC, (t - 0.3333) * 3.0) : mix(uPalC, uPalA, (t - 0.6667) * 3.0);
  return c + 0.12 * cos(6.2831 * (t * 2.0 + vec3(0.0, 0.33, 0.67) + uHue));
}
vec3 pick(sampler2D map, vec2 bend, float amount){
  vec2 uv = vUv + bend * amount / (vec2(uAspect, 1.0) * 2.0);
  uv = (uv - 0.5) * (1.0 - uKick * 0.035 * amount) + 0.5;
  return texture2DLodEXT(map, uv, 0.0).rgb;
}
void main(){
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) * 2.0;
  vec2 bend = vec2(0.0);
  for (int i = 0; i < 4; i++){
    vec2 o = uRipple[i].xy;
    float age = uRipple[i].z;
    float d = distance(p, o);
    float wave = sin(d * 16.0 - age * 9.0) * exp(-age * 1.7) * exp(-d * 1.2) * uRipple[i].w;
    bend += normalize(p - o + 1e-4) * wave * 0.085;
  }
  vec3 col = pick(tBase, bend, uBend.x);
  if (uBaseMix < 0.995) col = mix(pick(tPrev, bend, uBend.y), col, smoothstep(0.0, 1.0, uBaseMix));
  if (uOverAmt > 0.005){
    vec3 over = pick(tOver, bend, uBend.z) * uOverAmt;
    // Screen-style: the overlay adds light where the base picture has room for it.
    col = col * (1.0 - 0.35 * uOverAmt * clamp(dot(over, vec3(0.4)), 0.0, 1.0)) + over * (1.0 - 0.45 * clamp(col, 0.0, 1.0));
  }
  col *= 1.0 + uKick * 0.14 * exp(-length(p) * 1.2);
  // A soloist pulls a slow bright iris open in the middle of the wall.
  col += pal(uHue + 0.5) * uSolo * 0.25 * exp(-pow(length(p) * 1.4, 2.0));
  vec2 edge = smoothstep(0.0, 0.08, vUv) * smoothstep(0.0, 0.08, 1.0 - vUv);
  col *= edge.x * edge.y;
  gl_FragColor = vec4(col * (0.05 + uIntensity * (0.5 + 0.55 * uEnergy)), 1.0);
}`;

/** One step of the feedback buffer behind "plasma trails". */
const trailFragment = /* glsl */ `
uniform sampler2D tOld;
uniform float uTime, uKick, uEnergy, uHue, uAspect, uBass;
uniform vec3 uPalA, uPalB, uPalC;
uniform vec4 uVoice[4];
uniform float uSpec[${BANDS}];
varying vec2 vUv;
vec3 pal(float t){
  t = fract(t);
  return t < 0.3333 ? mix(uPalA, uPalB, t * 3.0) : t < 0.6667 ? mix(uPalB, uPalC, (t - 0.3333) * 3.0) : mix(uPalC, uPalA, (t - 0.6667) * 3.0);
}
vec3 hueRotate(vec3 c, float a){
  const vec3 k = vec3(0.57735);
  float ca = cos(a), sa = sin(a);
  return c * ca + cross(k, c) * sa + k * dot(k, c) * (1.0 - ca);
}
void main(){
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float r = length(p);
  // Warp: slow zoom toward the viewer, a breathing rotation and a curl that changes with time.
  float ang = 0.012 * sin(uTime * 0.17) + 0.02 * sin(r * 5.0 - uTime * 0.3);
  float c = cos(ang), s = sin(ang);
  vec2 q = mat2(c, -s, s, c) * p * (0.982 - uKick * 0.012);
  q += 0.0035 * vec2(sin(p.y * 9.0 + uTime * 0.7), cos(p.x * 7.0 - uTime * 0.9));
  vec3 old = texture2DLodEXT(tOld, q / vec2(uAspect, 1.0) + 0.5, 0.0).rgb;
  old = hueRotate(old, 0.025) * 0.955;
  old = min(old, vec3(1.5));
  // The scope: every player adds a sine at their own pitch, scaled by how loud they are.
  float y = 0.0;
  for (int i = 0; i < 4; i++) y += uVoice[i].y * sin(p.x * uVoice[i].x * 2.2 + uTime * (3.0 + float(i) * 1.7) + float(i) * 2.1);
  float spin = uTime * 0.09;
  vec2 w = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * p;
  float line = smoothstep(0.012, 0.0, abs(w.y - y * 0.16)) * smoothstep(1.05, 0.7, abs(w.x));
  vec3 fresh = pal(uHue + w.x * 0.35 + uTime * 0.02) * line * (0.9 + uEnergy);
  // Low end throws a ring from the centre; the spectrum speckles the rim.
  fresh += pal(uHue + 0.5) * smoothstep(0.02, 0.0, abs(r - 0.06 - uBass * 0.22)) * uKick * 1.2;
  float a = atan(p.y, p.x) / 6.2831 + 0.5;
  float band = uSpec[int(clamp(abs(a * 2.0 - 1.0), 0.0, 0.999) * ${BANDS}.0)];
  fresh += pal(uHue + a) * smoothstep(0.015, 0.0, abs(r - 0.42 - band * 0.12)) * band * 0.9;
  gl_FragColor = vec4(max(old, fresh), 1.0);
}`;

const personaColors = Object.fromEntries(musicians.map((r) => [r, personas[r].color])) as Record<
  Musician,
  string
>;
const drumRows = ['crash', 'ride', 'hat', 'tomHi', 'tomMid', 'tomLo', 'snare', 'kick'] as const;

export interface WallShot {
  position: [number, number, number];
  target: [number, number, number];
}
export interface WallContext {
  scene: THREE.Scene;
  shot: (role: Musician) => WallShot;
  /** Recent raw decision JSON, newest last. */
  stream?: () => string[];
  spectrum?: () => Uint8Array | null;
  visual?: WallVisual;
  overlay?: WallOverlay;
}

export class Wall {
  readonly target: THREE.WebGLRenderTarget;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: THREE.Mesh;
  private readonly painters: Record<PictureKind, THREE.ShaderMaterial>;
  private readonly painterScene = new THREE.Scene();
  private readonly painterQuad: THREE.Mesh;
  /** Base, outgoing and overlay pictures. */
  private readonly slots: THREE.WebGLRenderTarget[];
  private fadingFrom = -1;
  private readonly trailMaterial: THREE.ShaderMaterial;
  private readonly trailScene = new THREE.Scene();
  private trailA: THREE.WebGLRenderTarget;
  private trailB: THREE.WebGLRenderTarget;
  private readonly feed: THREE.WebGLRenderTarget;
  private readonly feedCamera = new THREE.PerspectiveCamera(26, ASPECT, 0.1, 300);
  private feedSubject: Musician | '' = '';
  private feedTick = 0;
  private readonly roll: HTMLCanvasElement;
  private readonly rollTexture: THREE.CanvasTexture;
  private readonly streamCanvas: HTMLCanvasElement;
  private readonly streamTexture: THREE.CanvasTexture;
  private readonly logoTexture: THREE.CanvasTexture;
  private readonly spec = new Float32Array(BANDS);
  private readonly peak = new Float32Array(BANDS);
  private readonly peakHold = new Float32Array(BANDS);
  private readonly target32 = new Float32Array(BANDS);
  private readonly rippleAges = [9, 9, 9, 9];
  private base = 0;
  private over = -1;
  private overWant = -1;
  private seedPhrase = -1;
  private previousFrame: Frame | null = null;
  private currentFrame: Frame | null = null;
  private canvasClock = 0;
  private readonly columns: { y: number; speed: number; text: string; at: number }[] = [];
  private streamCursor = 0;
  private readonly titleCanvas: HTMLCanvasElement;
  private readonly titleTexture: THREE.CanvasTexture;
  private title = '';
  private titleLayout: TitleLayout | null = null;
  /** Seconds since this title first went up; drives the letter-by-letter entrance. */
  private titleAge = 0;
  private titleCard = 0;
  private titleStill = false;
  private readonly titleSprites = new Map<string, HTMLCanvasElement>();
  private titleInk = '';

  constructor(private readonly lowPower: boolean) {
    const w = lowPower ? 256 : 1280;
    const h = lowPower ? 112 : 560;
    const options = { type: THREE.HalfFloatType, depthBuffer: false };
    this.target = new THREE.WebGLRenderTarget(w, h, options);
    this.trailA = new THREE.WebGLRenderTarget(lowPower ? 192 : 640, lowPower ? 84 : 280, options);
    this.trailB = this.trailA.clone();
    this.feed = new THREE.WebGLRenderTarget(lowPower ? 256 : 768, lowPower ? 112 : 336, {
      type: THREE.HalfFloatType,
    });

    this.roll = document.createElement('canvas');
    this.roll.width = lowPower ? 384 : 896;
    this.roll.height = lowPower ? 168 : 390;
    this.rollTexture = new THREE.CanvasTexture(this.roll);
    this.streamCanvas = document.createElement('canvas');
    this.streamCanvas.width = lowPower ? 384 : 896;
    this.streamCanvas.height = lowPower ? 168 : 390;
    const sctx = this.streamCanvas.getContext('2d')!;
    sctx.fillStyle = '#000';
    sctx.fillRect(0, 0, this.streamCanvas.width, this.streamCanvas.height);
    this.streamTexture = new THREE.CanvasTexture(this.streamCanvas);
    this.logoTexture = new THREE.CanvasTexture(drawLogo());
    this.titleCanvas = document.createElement('canvas');
    this.titleCanvas.width = lowPower ? 512 : 1024;
    this.titleCanvas.height = lowPower ? 223 : 446;
    this.titleTexture = new THREE.CanvasTexture(this.titleCanvas);
    for (const t of [this.rollTexture, this.streamTexture, this.logoTexture, this.titleTexture]) {
      t.colorSpace = THREE.NoColorSpace;
      t.generateMipmaps = false;
      t.minFilter = THREE.LinearFilter;
    }

    const shared = {
      uTime: { value: 0 },
      uEnergy: { value: 0 },
      uKick: { value: 0 },
      uHue: { value: 0 },
      uAspect: { value: ASPECT },
      uBass: { value: 0 },
      uPalA: { value: new THREE.Color() },
      uPalB: { value: new THREE.Color() },
      uPalC: { value: new THREE.Color() },
      uSpec: { value: this.spec },
      uVoice: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(8, 0, 0, 0)) },
    };
    const pw = lowPower ? 256 : 960;
    const ph = lowPower ? 112 : 418;
    this.slots = [0, 1, 2].map(() => new THREE.WebGLRenderTarget(pw, ph, options));
    const pictureUniforms = {
      ...shared,
      uBeat: { value: 0 },
      uMode: { value: new THREE.Vector4(1, 0, 0, 0) },
      uSeedA: { value: 1 },
      uSeedB: { value: 1 },
      uSeedMix: { value: 1 },
      uPeak: { value: this.peak },
      uTreat: { value: 0 },
      uGain: { value: 1 },
      tLogo: { value: this.logoTexture },
      tMap: { value: this.rollTexture as THREE.Texture },
    };
    // Every painter reads the same uniform objects, so they are written once per frame.
    this.painters = Object.fromEntries(
      (Object.keys(pictures) as PictureKind[]).map((kind) => [
        kind,
        new THREE.ShaderMaterial({
          uniforms: pictureUniforms,
          vertexShader: quadVertex,
          fragmentShader: pictures[kind],
          depthTest: false,
          depthWrite: false,
        }),
      ]),
    ) as Record<PictureKind, THREE.ShaderMaterial>;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uKick: shared.uKick,
        uEnergy: shared.uEnergy,
        uHue: shared.uHue,
        uAspect: shared.uAspect,
        uPalA: shared.uPalA,
        uPalB: shared.uPalB,
        uPalC: shared.uPalC,
        uIntensity: { value: 0.5 },
        uSolo: { value: 0 },
        uRipple: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 9, 0)) },
        uBaseMix: { value: 1 },
        uOverAmt: { value: 0 },
        uBend: { value: new THREE.Vector3(1, 1, 1) },
        tBase: { value: this.slots[0].texture },
        tPrev: { value: this.slots[1].texture },
        tOver: { value: this.slots[2].texture },
      },
      vertexShader: quadVertex,
      fragmentShader: compositeFragment,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.painterQuad = new THREE.Mesh(this.quad.geometry, this.painters.liquid);
    this.painterQuad.frustumCulled = false;
    this.painterScene.add(this.painterQuad);
    this.trailMaterial = new THREE.ShaderMaterial({
      uniforms: { ...shared, tOld: { value: this.trailB.texture } },
      vertexShader: quadVertex,
      fragmentShader: trailFragment,
      depthTest: false,
      depthWrite: false,
    });
    const trailQuad = new THREE.Mesh(this.quad.geometry, this.trailMaterial);
    trailQuad.frustumCulled = false;
    this.trailScene.add(trailQuad);
  }

  get texture() {
    return this.target.texture;
  }

  /**
   * Build the wall's programs before the first frame, off the main thread where the driver allows.
   * They are large, and compiling them inside a frame would stall audio decoding.
   */
  async precompile(renderer: THREE.WebGLRenderer) {
    // One throwaway scene holding every program, so the driver can build them side by side.
    const all = new THREE.Scene();
    for (const material of [...Object.values(this.painters), this.trailMaterial, this.material]) {
      const quad = new THREE.Mesh(this.quad.geometry, material);
      quad.frustumCulled = false;
      all.add(quad);
    }
    await renderer.compileAsync(all, this.camera);
  }

  /** A musician's note pushes the wall from their side of the stage. */
  ripple(index: number, x: number, y: number, strength: number) {
    (this.material.uniforms.uRipple.value[index] as THREE.Vector4).set(x, y, 0, strength);
    this.rippleAges[index] = 0;
  }

  update(
    sig: Signals,
    palette: [THREE.Color, THREE.Color, THREE.Color],
    renderer: THREE.WebGLRenderer,
    dt: number,
    ctx: WallContext,
  ) {
    const u = this.material.uniforms;
    const pu = this.painters.liquid.uniforms;
    const live = sig.reduced ? 0 : 1;
    pu.uTime.value = sig.time;
    pu.uBeat.value = sig.beat;
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
    (pu.uMode.value as THREE.Vector4).set(...sig.modeMix);
    (u.uPalA.value as THREE.Color).copy(palette[0]);
    (u.uPalB.value as THREE.Color).copy(palette[1]);
    (u.uPalC.value as THREE.Color).copy(palette[2]);
    (u.uRipple.value as THREE.Vector4[]).forEach((r, i) => {
      this.rippleAges[i] += dt;
      r.z = this.rippleAges[i];
    });

    // Which pictures are up. A change of base cross-fades; an overlay fades out before it is swapped.
    const visuals = lightRecipes.visual as readonly string[];
    const want = Math.max(0, visuals.indexOf(ctx.visual ?? sig.lighting.visual ?? 'liquid light'));
    let wantOver = visuals.indexOf(ctx.overlay ?? sig.lighting.overlay ?? 'none');
    // A new song or queued theme announces itself: its title rides over the wall for a few seconds.
    const title = (sig.playing ? (sig.frame?.themeTitle ?? '') : '').trim();
    if (title !== this.title) {
      this.title = title;
      this.titleLayout = null;
      this.titleAge = 0;
      this.titleCard = title ? TITLE_CARD_SECONDS : 0;
    }
    this.titleAge += dt;
    this.titleCard = Math.max(0, this.titleCard - dt);
    if (this.titleCard > 0) wantOver = TITLE;
    if (wantOver === want) wantOver = -1;
    if (want !== this.base) {
      this.fadingFrom = this.base;
      u.uBaseMix.value = 1 - Math.min(1, u.uBaseMix.value);
      this.base = want;
    }
    u.uBaseMix.value = Math.min(1, u.uBaseMix.value + (sig.reduced ? 1 : dt / 1.6));
    this.overWant = wantOver;
    if (this.over !== this.overWant) {
      u.uOverAmt.value = Math.max(0, u.uOverAmt.value - (sig.reduced ? 1 : dt / 0.8));
      if (u.uOverAmt.value <= 0) this.over = this.overWant;
    } else if (this.over >= 0)
      u.uOverAmt.value = Math.min(0.85, u.uOverAmt.value + (sig.reduced ? 1 : dt / 1.2));
    const fading = u.uBaseMix.value < 0.995 ? this.fadingFrom : -2;
    const showing = (id: number) => this.base === id || this.over === id || fading === id;

    // A new mandala every two phrases, drawn from the phrase number so every viewer sees the same one.
    const phrase = Math.floor(sig.phrase / 2);
    if (phrase !== this.seedPhrase) {
      this.seedPhrase = phrase;
      pu.uSeedA.value = pu.uSeedB.value;
      pu.uSeedB.value = 1 + ((phrase * 37 + 11) % 997);
      pu.uSeedMix.value = 0;
    }
    pu.uSeedMix.value = Math.min(1, pu.uSeedMix.value + (sig.reduced ? 1 : dt / 2.5));

    this.listen(sig, dt, ctx.spectrum?.());
    if (sig.frame && sig.frame.id !== this.currentFrame?.id) {
      this.previousFrame = this.currentFrame;
      this.currentFrame = sig.frame;
    }
    // Canvas pictures repaint at video rate at most, and only while they are on the wall.
    this.canvasClock += dt;
    const tick = this.canvasClock > (this.lowPower ? 0.12 : 0.04);
    if (tick && !sig.reduced) {
      if (showing(2)) this.paintRoll(sig);
      if (showing(8)) this.paintStream(ctx.stream?.() ?? [], this.canvasClock);
      this.canvasClock = 0;
    }
    // Lettering is readable standing still, so with less movement it is drawn once, settled.
    if (showing(TITLE) && (sig.reduced ? !this.titleStill || !this.titleLayout : tick))
      this.paintTitle(sig, palette);

    const previous = renderer.getRenderTarget();
    if (showing(3)) this.shoot(sig, renderer, ctx);
    if (showing(6) && !sig.reduced) {
      [this.trailA, this.trailB] = [this.trailB, this.trailA];
      this.trailMaterial.uniforms.tOld.value = this.trailB.texture;
      renderer.setRenderTarget(this.trailA);
      renderer.render(this.trailScene, this.camera);
    }
    // Paint only the pictures that are up, each with its own small program, then mix them.
    [this.base, fading, u.uOverAmt.value > 0.005 ? this.over : -2].forEach((id, slot) => {
      if (id < 0) return;
      const kind = kinds[id];
      if (kind === 'copy') {
        pu.uTreat.value = id === 3 ? 1 : 0;
        pu.uGain.value = id === 2 ? 1.5 : id === 8 ? 1.6 : id === TITLE ? 1.7 : 1;
        pu.tMap.value =
          id === 2
            ? this.rollTexture
            : id === 3
              ? this.feed.texture
              : id === 6
                ? this.trailA.texture
                : id === TITLE
                  ? this.titleTexture
                  : this.streamTexture;
      }
      this.painterQuad.material = this.painters[kind];
      renderer.setRenderTarget(this.slots[slot]);
      renderer.render(this.painterScene, this.camera);
      (u.uBend.value as THREE.Vector3).setComponent(slot, bendOf[id]);
    });
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(previous);
  }

  /** 32 log-spaced bands, from the real master bus when it is sounding and from the notes otherwise. */
  private listen(sig: Signals, dt: number, bins?: Uint8Array | null) {
    const want = this.target32.fill(0);
    let heard = false;
    if (bins && sig.playing) {
      // 40 Hz .. 12 kHz across a 1024-bin, ~23 Hz-per-bin analyser.
      for (let b = 0; b < BANDS; b++) {
        const lo = Math.floor((40 * 300 ** (b / BANDS)) / 23.4);
        const hi = Math.max(lo + 1, Math.floor((40 * 300 ** ((b + 1) / BANDS)) / 23.4));
        let m = 0;
        for (let i = lo; i < hi && i < bins.length; i++) m = Math.max(m, bins[i]);
        want[b] = clamp01((m / 255) ** 1.6 * (0.9 + b * 0.025));
        if (m > 8) heard = true;
      }
    }
    if (!heard) {
      want.fill(0);
      if (sig.playing && !sig.reduced) {
        const put = (hz: number, amount: number, width: number) => {
          const centre = (Math.log(hz / 40) / Math.log(300)) * BANDS;
          for (let b = Math.max(0, Math.floor(centre - width * 2)); b < BANDS; b++) {
            const d = (b + 0.5 - centre) / width;
            if (d > 2) break;
            want[b] += amount * Math.exp(-d * d);
          }
        };
        for (const role of musicians) {
          const p = sig.players[role];
          if (role === 'drums') continue;
          for (const n of p.held) {
            const f0 = 440 * 2 ** ((n.midi - 69) / 12);
            const loud = n.velocity * (0.35 + p.level);
            for (let h = 1; h <= 6; h++) put(f0 * h, (loud * 0.8) / h ** 0.8, 0.9);
          }
        }
        put(62, sig.kick * 1.1, 1.6);
        put(240, sig.snare * 0.5, 2.2);
        put(3200, sig.snare * 0.45, 4);
        put(8200, sig.hat * 0.7, 3);
        put(5200, sig.crash * 0.6, 5);
      }
    }
    let bass = 0;
    for (let b = 0; b < BANDS; b++) {
      const v = clamp01(want[b]);
      this.spec[b] = damp(this.spec[b], v, v > this.spec[b] ? 40 : 9, dt);
      if (this.spec[b] >= this.peak[b]) {
        this.peak[b] = this.spec[b];
        this.peakHold[b] = 0.45;
      } else if ((this.peakHold[b] -= dt) < 0) this.peak[b] = Math.max(0, this.peak[b] - dt * 0.55);
      if (b < 5) bass += this.spec[b] / 5;
    }
    this.painters.liquid.uniforms.uBass.value = bass;
    const voices = this.painters.liquid.uniforms.uVoice.value as THREE.Vector4[];
    musicians.forEach((role, i) => {
      const p = sig.players[role];
      voices[i].set(role === 'drums' ? 31 : 3 + (p.pitchGlide - 24) * 0.42, p.level, 0, 0);
    });
  }

  /** A hard-cut live camera, like the IMAG screens at a real festival. */
  private shoot(sig: Signals, renderer: THREE.WebGLRenderer, ctx: WallContext) {
    if (++this.feedTick % (this.lowPower ? 4 : 2) && this.feedSubject) return;
    const active = musicians.filter((r) => sig.players[r].active);
    const pool = active.length ? active : [...musicians];
    const subject = sig.soloists[0] ?? pool[Math.floor(sig.phrase / 2) % pool.length];
    const cam = this.feedCamera;
    if (subject !== this.feedSubject) {
      this.feedSubject = subject;
      const shot = ctx.shot(subject);
      cam.position.set(...shot.position);
      cam.userData.target = new THREE.Vector3(...shot.target);
      // Push in: the wall is a close-up, not a second wide shot.
      cam.position.lerp(cam.userData.target as THREE.Vector3, 0.18);
    }
    const target = cam.userData.target as THREE.Vector3;
    cam.lookAt(
      target.x + Math.sin(sig.time * 0.31) * 0.06,
      target.y + Math.sin(sig.time * 0.23) * 0.04,
      target.z,
    );
    const shadows = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.feed);
    renderer.render(ctx.scene, cam);
    renderer.shadowMap.autoUpdate = shadows;
  }

  private paintRoll(sig: Signals) {
    const c = this.roll;
    const g = c.getContext('2d')!;
    const { width: w, height: h } = c;
    g.fillStyle = '#05060b';
    g.fillRect(0, 0, w, h);
    const keys = w * 0.035;
    const nowX = w * 0.3;
    const perBeat = (w - nowX) / 7;
    const lo = 26;
    const hi = 98;
    const drumBand = h * 0.2;
    const pitchH = h - drumBand - 6;
    const row = pitchH / (hi - lo);
    // Keyboard gutter and octave lines.
    for (let m = lo; m < hi; m++) {
      const black = [1, 3, 6, 8, 10].includes(m % 12);
      const y = pitchH - (m - lo + 1) * row;
      g.fillStyle = black ? '#0b0c12' : '#c9ccd6';
      g.fillRect(0, y, keys, row - 0.5);
      if (m % 12 === 0) {
        g.fillStyle = 'rgba(255,255,255,0.09)';
        g.fillRect(keys, y + row, w, 1);
      }
    }
    // Beat grid travels with the music.
    const beat = sig.beat;
    for (let b = Math.floor(beat) - 3; b < beat + 8; b++) {
      const x = nowX + (b - beat) * perBeat;
      if (x < keys) continue;
      g.fillStyle = b % 4 === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)';
      g.fillRect(x, 0, b % 4 === 0 ? 2 : 1, h);
    }
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(keys, pitchH + 2, w, 1);
    const frames: [Frame | null, number][] = [];
    const cur = sig.playing ? sig.frame : null;
    if (cur) {
      frames.push([cur, 0]);
      if (this.previousFrame && this.previousFrame.id !== cur.id)
        frames.push([this.previousFrame, ((this.previousFrame.at - cur.at) * cur.bpm) / 60000]);
      if (sig.upcoming && sig.upcoming.id !== cur.id)
        frames.push([sig.upcoming, ((sig.upcoming.at - cur.at) * cur.bpm) / 60000]);
    }
    for (const [frame, offset] of frames)
      for (const part of frame!.parts) {
        const color = personaColors[part.role];
        for (const n of part.notes) {
          const start = n.beat + offset;
          const x = nowX + (start - beat) * perBeat;
          const len = Math.max(3, n.duration * perBeat - 1.5);
          if (x + len < keys || x > w) continue;
          const sounding = beat >= start && beat < start + n.duration;
          let y: number;
          let tall: number;
          if (part.role === 'drums') {
            const r = drumRows.indexOf(drumVoice(n.midi));
            tall = drumBand / drumRows.length - 1.5;
            y = pitchH + 5 + r * (drumBand / drumRows.length);
          } else {
            tall = Math.max(3, row * 1.5);
            y = pitchH - (Math.min(hi - 1, Math.max(lo, n.midi)) - lo + 1) * row - row * 0.25;
          }
          const past = start + n.duration < beat;
          g.globalAlpha = past ? 0.32 : 0.45 + n.velocity * 0.55;
          g.fillStyle = color;
          const width = part.role === 'drums' ? Math.min(len, perBeat * 0.12) : len;
          g.fillRect(Math.max(keys, x), y, width - Math.max(0, keys - x), tall);
          if (sounding || (part.role === 'drums' && beat - start >= 0 && beat - start < 0.2)) {
            g.globalAlpha = 1;
            g.shadowColor = color;
            g.shadowBlur = 14;
            g.fillStyle = '#fff';
            g.fillRect(Math.max(keys, x), y, width - Math.max(0, keys - x), tall);
            g.shadowBlur = 0;
            if (part.role !== 'drums') {
              g.fillStyle = color;
              g.fillRect(0, y, keys, tall);
            }
          }
        }
      }
    g.globalAlpha = 1;
    // The playhead.
    const glow = g.createLinearGradient(nowX - 24, 0, nowX + 3, 0);
    glow.addColorStop(0, 'rgba(255,255,255,0)');
    glow.addColorStop(1, 'rgba(255,255,255,0.28)');
    g.fillStyle = glow;
    g.fillRect(nowX - 24, 0, 27, h);
    g.fillStyle = '#fff';
    g.fillRect(nowX, 0, 2, h);
    this.rollTexture.needsUpdate = true;
  }

  /** Falling code: each column reads down through one line of raw decision JSON. */
  private paintStream(lines: string[], elapsed: number) {
    const c = this.streamCanvas;
    const g = c.getContext('2d')!;
    const { width: w, height: h } = c;
    const size = this.lowPower ? 11 : 19;
    const count = Math.floor(w / size);
    if (this.columns.length !== count) {
      this.columns.length = 0;
      for (let i = 0; i < count; i++)
        this.columns.push({
          y: Math.random() * h,
          speed: 5 + Math.random() * 12,
          text: '',
          at: 0,
        });
    }
    g.fillStyle = `rgba(0,0,0,${Math.min(0.5, elapsed * 1.2)})`;
    g.fillRect(0, 0, w, h);
    g.font = `700 ${size}px ui-monospace, Consolas, Menlo, monospace`;
    g.textBaseline = 'top';
    const source = lines.length ? lines : ['{"room":"waiting for the first decision"}'];
    for (let i = 0; i < count; i++) {
      const col = this.columns[i];
      const before = Math.floor(col.y / size);
      col.y += col.speed * size * elapsed;
      const after = Math.floor(col.y / size);
      for (let rowIndex = before + 1; rowIndex <= after; rowIndex++) {
        if (!col.text || col.at >= col.text.length) {
          // Newest decisions first, then wander back through the recent ones.
          col.text =
            source[
              (source.length - 1 - (this.streamCursor++ % source.length) + source.length) %
                source.length
            ];
          col.at = 0;
        }
        const y = rowIndex * size;
        if (y < 0) continue;
        // The previous head cools to green as a new white one lands beneath it.
        g.fillStyle = '#031a08';
        g.fillRect(i * size, y - size, size, size);
        g.fillStyle = '#35f06a';
        g.fillText(col.text[Math.max(0, col.at - 1)] ?? ' ', i * size + 1, y - size);
        g.fillStyle = '#eafff0';
        g.fillText(col.text[col.at++] ?? ' ', i * size + 1, y);
      }
      if (col.y > h + size * 6 && Math.random() < 0.3) {
        col.y = -Math.random() * h * 0.4;
        col.speed = 5 + Math.random() * 12;
        col.text = '';
      }
    }
    this.streamTexture.needsUpdate = true;
  }

  /**
   * The song title as a gig poster that will not hold still: fat capitals that drop in one at a
   * time, ride a wave across the line, lean with the groove and trail a stack of coloured echoes.
   */
  private paintTitle(sig: Signals, palette: [THREE.Color, THREE.Color, THREE.Color]) {
    const c = this.titleCanvas;
    const g = c.getContext('2d')!;
    const { width: w, height: h } = c;
    const still = sig.reduced;
    this.titleStill = still;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    const text = (this.title || 'JEV').toUpperCase();
    const layout = (this.titleLayout ??= layoutTitle(g, text, w * 0.9, h * 0.66));
    const t = sig.time;
    const css = (color: THREE.Color, gain = 1) =>
      `rgb(${[color.r, color.g, color.b].map((v) => Math.round(255 * Math.min(1, Math.sqrt(Math.max(0, v)) * gain))).join(',')})`;

    // A slow fan of rays behind the words, so the title also stands up as a picture on its own.
    // Laid over another picture, the words go up alone and that picture is the background.
    g.save();
    g.translate(w / 2, h * 0.54);
    g.rotate(still ? 0 : t * 0.04);
    g.globalAlpha = this.base === TITLE ? 0.16 : 0;
    for (let i = 0; i < 24; i += 2) {
      g.fillStyle = css(palette[(i / 2) % 3]);
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, w, (i / 24) * Math.PI * 2, ((i + 1) / 24) * Math.PI * 2);
      g.fill();
    }
    g.restore();

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.globalAlpha = still ? 1 : Math.min(1, this.titleAge * 2);
    g.font = `700 ${Math.round(h * 0.05)}px 'Arial Black', 'Helvetica Neue', system-ui, sans-serif`;
    g.fillStyle = css(palette[2], 1.2);
    g.fillText('N O W   P L A Y I N G', w / 2, h * 0.09);

    // Each letter is drawn once into a sprite (echoes, outline, face) and only re-inked when the
    // echo colours step on, so a frame of animation is a handful of image blits.
    const march = still ? 0 : Math.floor(t * 1.5);
    const ink = `${layout.font}|${march}|${still}`;
    if (ink !== this.titleInk) {
      this.titleInk = ink;
      this.titleSprites.clear();
    }
    const box = Math.ceil(layout.size * 1.7);
    const sprite = (ch: string, phase: number) => {
      const key = ch + phase;
      let made = this.titleSprites.get(key);
      if (made) return made;
      made = document.createElement('canvas');
      made.width = made.height = box;
      const s = made.getContext('2d')!;
      s.font = layout.font;
      s.textAlign = 'center';
      s.textBaseline = 'middle';
      s.lineJoin = 'round';
      s.translate(box / 2, box / 2);
      const step = layout.size * 0.035;
      // Echoes march down and to the right, cycling through Lux's colours.
      for (let e = 5; e >= 1; e--) {
        s.fillStyle = css(palette[(e + march + phase) % 3], 0.95 - e * 0.09);
        s.fillText(ch, e * step, e * step);
      }
      s.strokeStyle = '#05030a';
      s.lineWidth = layout.size * 0.09;
      s.strokeText(ch, 0, 0);
      const face = s.createLinearGradient(0, -layout.size * 0.5, 0, layout.size * 0.5);
      face.addColorStop(0, '#fffbe8');
      face.addColorStop(0.55, css(palette[0], 1.5));
      face.addColorStop(1, css(palette[1], 1.3));
      s.fillStyle = face;
      s.fillText(ch, 0, 0);
      this.titleSprites.set(key, made);
      return made;
    };
    layout.letters.forEach((letter, i) => {
      // Entrance: each letter falls in a beat after its neighbour and overshoots before settling.
      const since = still ? 9 : this.titleAge * 1.6 - i * 0.07;
      if (since <= 0) return;
      const k = Math.min(1, since);
      const pop = 1 + Math.sin(k * Math.PI) * 0.35 * (1 - k * 0.5);
      const drop = (1 - k) ** 3 * -h * 0.5;
      const wave = still ? 0 : Math.sin(sig.beat * Math.PI * 0.5 - i * 0.42) * layout.size * 0.075;
      const lean = still ? 0 : Math.sin(sig.beat * Math.PI * 0.25 - i * 0.3) * 0.07;
      const scale = pop * (still ? 1 : 1 + sig.kick * 0.06);
      g.save();
      g.translate(letter.x, h * 0.13 + letter.y + drop + wave);
      g.rotate(lean);
      g.scale(scale, scale);
      g.globalAlpha = Math.min(1, since * 3);
      g.drawImage(sprite(letter.ch, i % 3), -box / 2, -box / 2);
      g.restore();
    });
    g.globalAlpha = 1;
    this.titleTexture.needsUpdate = true;
  }

  dispose() {
    for (const t of [this.target, this.trailA, this.trailB, this.feed, ...this.slots]) t.dispose();
    for (const m of Object.values(this.painters)) m.dispose();
    for (const t of [this.rollTexture, this.streamTexture, this.logoTexture, this.titleTexture])
      t.dispose();
    this.material.dispose();
    this.trailMaterial.dispose();
    this.quad.geometry.dispose();
  }
}

interface TitleLayout {
  font: string;
  size: number;
  /** Letter centres, relative to the top-left of the lettering block. */
  letters: { ch: string; x: number; y: number }[];
}

/** Break a title over up to three lines and find the largest heavy type that fits the block. */
function layoutTitle(
  g: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
): TitleLayout {
  const words = text.split(/\s+/).filter(Boolean);
  const face = "'Arial Black', Impact, 'Helvetica Neue', system-ui, sans-serif";
  let best: { lines: string[]; size: number } = { lines: [text], size: 0 };
  for (let count = 1; count <= Math.min(3, words.length); count++) {
    // Balance the lines by character count.
    const target = text.length / count;
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && lines.length < count - 1 && next.length > target + word.length / 2) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
    g.font = `900 100px ${face}`;
    const widest = Math.max(...lines.map((l) => g.measureText(l).width * 1.06));
    const size = Math.min((maxWidth / widest) * 100, maxHeight / (lines.length * 1.08));
    if (size > best.size) best = { lines, size };
  }
  const size = Math.floor(best.size);
  const font = `900 ${size}px ${face}`;
  g.font = font;
  const letters: TitleLayout['letters'] = [];
  const canvasWidth = g.canvas.width;
  const blockTop = (maxHeight - best.lines.length * size * 1.08) / 2;
  best.lines.forEach((line, row) => {
    const tracking = size * 0.03;
    const widths = [...line].map((ch) => g.measureText(ch).width + tracking);
    let x = (canvasWidth - widths.reduce((a, b) => a + b, 0)) / 2;
    [...line].forEach((ch, i) => {
      if (ch !== ' ')
        letters.push({ ch, x: x + widths[i] / 2, y: blockTop + (row + 0.5) * size * 1.08 });
      x += widths[i];
    });
  });
  return { font, size, letters };
}

/** The band's mark as a soft-edged mask; the shader does the colour and the movement. */
function drawLogo() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 446;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const draw = (blur: number, alpha: number) => {
    g.shadowColor = `rgba(255,255,255,${alpha})`;
    g.shadowBlur = blur;
    g.fillStyle = `rgba(255,255,255,${alpha})`;
    g.font = "900 290px 'Arial Black', 'Helvetica Neue', Impact, system-ui, sans-serif";
    // Wide tracking, drawn letter by letter so it is identical on every platform.
    ['J', 'E', 'V'].forEach((letter, i) => g.fillText(letter, c.width / 2 + (i - 1) * 250, 196));
    g.font = "700 46px 'Arial Black', 'Helvetica Neue', system-ui, sans-serif";
    const tag = 'T H E   B A N D';
    g.fillText(tag, c.width / 2, 386);
  };
  // A wide halo gives the shader a gradient to find edges and echoes in; the core is solid.
  draw(38, 0.5);
  draw(12, 0.8);
  g.shadowBlur = 0;
  draw(0, 1);
  return c;
}
