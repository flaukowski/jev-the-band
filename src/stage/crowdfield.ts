import * as THREE from 'three';
import type { Signals } from './signals';
import { NOISE } from './wall';
import type { Atmosphere } from './weather';

export const GROUND = -0.74;

/**
 * The festival ground: flat where the stage and the front of the crowd stand, rising into a
 * shallow natural bowl so the far audience stacks up into view, with rolling hills on the horizon.
 */
export function terrainHeight(x: number, z: number, hills = 1) {
  const bowl = Math.min(Math.max(0, Math.hypot(x, z + 2) - 34), 110);
  return GROUND + bowl * bowl * 0.00085 + hillHeight(x, z) * hills;
}

/**
 * The rolling hills alone. Ground and crowd carry this as a vertex attribute so a song set in a
 * city or an arena can press them flat without rebuilding anything.
 */
export function hillHeight(x: number, z: number) {
  const r = Math.hypot(x, z + 2);
  const a = Math.atan2(x, z + 2);
  const t = Math.min(1, Math.max(0, (r - 95) / 90));
  return t * t * (3 - 2 * t) * (7 + 5 * Math.sin(a * 3 + 1.1) + 3 * Math.sin(a * 7 + 2.3));
}

/**
 * Where people are standing, 0..1, for any point on the field. Shared by the crowd cards and by
 * the ground (which paints the same people as dots, so the view from above agrees).
 */
export const CROWD_DENSITY = /* glsl */ `
${NOISE}
float crowdDensity(vec2 p){
  vec2 q = p - vec2(0.0, -2.0);
  float R = length(q);
  float th = abs(atan(q.x, q.y));
  float ragged = fbm(p * 0.035) * 2.0 - 1.0;
  float ang = smoothstep(1.5 + ragged * 0.4, 1.0 + ragged * 0.4, th);
  float far = smoothstep(150.0 + ragged * 30.0, 60.0 + ragged * 25.0, R);
  float front = smoothstep(4.9, 6.2, p.y);
  // People gather in drifts and leave paths between them.
  float clumps = 0.5 + 0.5 * smoothstep(0.28, 0.62, fbm(p * 0.085 + 7.0));
  // The individually animated dancers already stand here. Behind their first dozen rows the two
  // crowds interleave, so there is no seam and the pit looks as packed from the air as it is.
  float inside = step(abs(p.x), 10.8 + max(0.0, p.y - 5.6) * 0.8) * step(p.y, 25.2);
  float pit = inside * (1.0 - 0.55 * smoothstep(13.0, 19.0, p.y));
  // The picnic lawn behind the pit belongs to the people sitting on blankets; only a few stand there.
  float lawn = smoothstep(25.6, 27.2, p.y) * smoothstep(35.6, 33.8, p.y) * smoothstep(27.5, 25.0, abs(p.x));
  return ang * far * front * mix(clumps, 1.0, inside) * (1.0 - pit) * (1.0 - 0.88 * lawn);
}`;

const vertex = /* glsl */ `
attribute float aRow;
attribute float aRadius;
attribute float aHill;
uniform float uHills;
varying vec2 vCard;
varying float vRow, vRadius, vDensity, vDist;
varying vec3 vWorld;
${CROWD_DENSITY}
void main(){
  vCard = uv;
  vRow = aRow;
  vRadius = aRadius;
  vec4 w = modelMatrix * vec4(position + vec3(0.0, aHill * uHills, 0.0), 1.0);
  vWorld = w.xyz;
  vDensity = crowdDensity(w.xz);
  vec4 mv = viewMatrix * w;
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const fragment = /* glsl */ `
uniform float uBeat, uBeatsPerSecond, uEnergy, uTime, uNight, uFogDensity, uCrash, uLive;
uniform vec3 uAmbient, uSpill, uFogColor, uAccent;
varying vec2 vCard;
varying float vRow, vRadius, vDensity, vDist;
varying vec3 vWorld;
float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 hsl(float h, float s, float l){
  vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
}
float seg(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
void main(){
  const float CELL = 0.64;
  float sx = vCard.x / CELL + hash21(vec2(vRow, 3.0)) * 7.0;
  float id = floor(sx);
  vec2 key = vec2(id, vRow);
  float who = hash21(key);
  if (hash21(key + 17.0) > vDensity) discard;
  float x = (fract(sx) - 0.5) * CELL;
  float y = vCard.y * 2.7;

  // The beat reaches the back of the field late, so the bounce rolls outward like a wave.
  float delay = vRadius / 343.0 * uBeatsPerSecond * 2.2;
  float fervour = (uEnergy + uCrash * 0.4) * (1.1 - 0.55 * smoothstep(20.0, 140.0, vRadius)) * uLive;
  float phase = uBeat - delay + who * 0.12;
  float bounce = pow(abs(sin(phase * 3.14159)), 1.5) * (0.03 + fervour * 0.2);
  float sway = sin(phase * 1.5708 * (who > 0.5 ? 1.0 : -1.0) + who * 6.28) * (0.02 + fervour * 0.06);
  float tall = 1.46 + 0.36 * hash21(key + 5.0);
  vec2 p = vec2(x - sway - (hash21(key + 9.0) - 0.5) * 0.16, y - bounce);

  float head = length(p - vec2(0.0, tall)) - 0.118;
  float shoulders = length((p - vec2(0.0, tall - 0.4)) / vec2(0.27, 0.2)) - 1.0;
  float torso = max(abs(p.x) - 0.21, p.y - (tall - 0.38));
  float body = min(shoulders * 0.2, torso);
  // Hands go up when the field is hotter than this person's threshold.
  float up = smoothstep(0.0, 0.12, fervour - 0.22 - 0.55 * hash21(key + 23.0));
  float wave = sin(phase * 3.14159 * (who > 0.5 ? 1.0 : 2.0) + who * 9.0) * 0.07;
  float arms = 1e3;
  if (up > 0.01){
    arms = min(seg(p, vec2(-0.2, tall - 0.3), vec2(-0.27 + wave, tall - 0.3 + 0.62 * up)),
               seg(p, vec2( 0.2, tall - 0.3), vec2( 0.27 + wave, tall - 0.3 + 0.62 * up))) - 0.045;
  }
  float d = min(min(head, body), arms);

  // A light in the air: phones and lighters when it is quiet and dark, glowsticks when it is not.
  float carries = hash21(key + 31.0);
  float quiet = uNight * (0.4 + 0.6 * (1.0 - smoothstep(0.25, 0.6, uEnergy))) * uLive;
  float lit = carries < 0.07 ? quiet : (carries > 0.93 ? uNight * smoothstep(0.35, 0.7, fervour) : 0.0);
  vec2 lightAt = vec2(0.24 + wave, tall + 0.42 + bounce * 0.5);
  // The light keeps about a pixel of size however far away it is, as a real point of light would.
  float spark = lit * smoothstep(0.06 + vDist * 0.0016, 0.0, length(p - lightAt));
  vec3 sparkColor = carries < 0.07 ? vec3(1.0, 0.86, 0.62) : hsl(hash21(key + 41.0), 1.0, 0.6);
  sparkColor *= 0.7 + 0.3 * sin(uTime * (1.0 + who * 2.0) + who * 40.0);

  // Far away, outlines dissolve: the edge is dithered wider the further the card is from the lens.
  float soft = mix(0.004, 0.05, smoothstep(12.0, 110.0, vDist));
  float cover = smoothstep(soft, -soft, d);
  float dither = hash21(gl_FragCoord.xy + who);
  if (cover < mix(0.5, dither, smoothstep(10.0, 60.0, vDist)) && spark < 0.04) discard;
  // These are figures for the distance. Near the lens they give way to the modelled dancers.
  if (vDist < mix(11.0, 19.0, dither)) discard;

  vec3 shirt = hash21(key + 51.0) < 0.3 ? hsl(hash21(key + 53.0), 0.7, 0.45) : mix(vec3(0.07, 0.08, 0.1), vec3(0.75, 0.7, 0.6), hash21(key + 57.0));
  vec3 skin = mix(vec3(0.94, 0.76, 0.62), vec3(0.36, 0.23, 0.15), hash21(key + 61.0));
  vec3 hair = mix(vec3(0.05, 0.03, 0.02), vec3(0.7, 0.55, 0.3), pow(hash21(key + 67.0), 3.0));
  // Seen from the stage you get faces; from behind, the backs of heads.
  vec3 headColor = gl_FrontFacing ? mix(skin, hair, smoothstep(tall + 0.04, tall + 0.08, p.y)) : hair;
  bool isHead = head < body && head < arms;
  vec3 albedo = isHead ? headColor : (arms < body ? skin : shirt);
  // Stage light falls off with distance and catches the tops of heads and raised hands.
  float reach = 1.0 / (1.0 + pow(vRadius / 38.0, 2.0));
  float top = smoothstep(tall - 0.5, tall + 0.3, p.y);
  vec3 light = uAmbient + uSpill * reach * (0.25 + 0.75 * top) * (gl_FrontFacing ? 1.0 : 0.45);
  light += uAccent * reach * top * 0.2;
  vec3 col = albedo * light + sparkColor * spark * 2.6;
  // Air this clear would hide nothing; a crowd this large is what the fog is for. Lights carry.
  float thick = uFogDensity * 0.62;
  float fog = 1.0 - exp(-thick * thick * vDist * vDist);
  col = mix(col, uFogColor, fog * (1.0 - spark * 0.85));
  gl_FragColor = vec4(col, 1.0);
}`;

/**
 * The thousands beyond the dancers. Not people: concentric ribbons of card standing on the bowl,
 * on which a shader draws bouncing head-and-shoulder shapes. One draw call, no per-frame CPU
 * work, no textures. Up close the individually animated crowd takes over.
 */
export class CrowdField {
  private readonly material: THREE.ShaderMaterial;
  readonly mesh: THREE.Mesh;

  constructor(scene: THREE.Scene, lowPower: boolean) {
    const rows = lowPower ? 30 : 96;
    const segments = lowPower ? 40 : 72;
    const positions: number[] = [];
    const uvs: number[] = [];
    const rowIds: number[] = [];
    const radii: number[] = [];
    const hills: number[] = [];
    const indices: number[] = [];
    for (let k = 0; k < rows; k++) {
      const f = k / (rows - 1);
      // Rows are a pace apart near the front and spread out where nobody can tell.
      const R = 9 + f * 60 + f * f * 86;
      const reach = 1.62;
      const base = positions.length / 3;
      for (let i = 0; i <= segments; i++) {
        const th = -reach + (i / segments) * reach * 2;
        const x = Math.sin(th) * R;
        const z = -2 + Math.cos(th) * R;
        const y = terrainHeight(x, z, 0);
        for (const top of [0, 1]) {
          positions.push(x, y + top * 2.7, z);
          uvs.push(R * th, top);
          rowIds.push(k);
          radii.push(R);
          hills.push(hillHeight(x, z));
        }
        if (i < segments) {
          const a = base + i * 2;
          indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('aRow', new THREE.Float32BufferAttribute(rowIds, 1));
    geometry.setAttribute('aRadius', new THREE.Float32BufferAttribute(radii, 1));
    geometry.setAttribute('aHill', new THREE.Float32BufferAttribute(hills, 1));
    geometry.setIndex(indices);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uBeat: { value: 0 },
        uBeatsPerSecond: { value: 1.6 },
        uEnergy: { value: 0 },
        uCrash: { value: 0 },
        uLive: { value: 0 },
        uTime: { value: 0 },
        uNight: { value: 1 },
        uHills: { value: 1 },
        uFogDensity: { value: 0.012 },
        uAmbient: { value: new THREE.Color() },
        uSpill: { value: new THREE.Color() },
        uAccent: { value: new THREE.Color() },
        uFogColor: { value: new THREE.Color() },
      },
      vertexShader: vertex,
      fragmentShader: fragment,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(
    sig: Signals,
    palette: [THREE.Color, THREE.Color, THREE.Color],
    air: Atmosphere,
    hills: number,
  ) {
    const u = this.material.uniforms;
    u.uHills.value = hills;
    u.uBeat.value = sig.beat;
    u.uBeatsPerSecond.value = sig.bpm / 60;
    u.uEnergy.value = sig.energy;
    u.uCrash.value = sig.crash;
    u.uLive.value = sig.playing && !sig.reduced ? 1 : 0;
    u.uTime.value = sig.time;
    u.uNight.value = air.night;
    u.uFogDensity.value = air.fogDensity;
    (u.uFogColor.value as THREE.Color).copy(air.fogColor);
    (u.uAmbient.value as THREE.Color).copy(air.ambient);
    const dark = sig.lighting.wash === 'blackout' ? 0.1 : 1;
    (u.uSpill.value as THREE.Color)
      .copy(palette[0])
      .multiplyScalar((0.25 + sig.lighting.intensity * 0.9) * dark);
    (u.uAccent.value as THREE.Color).copy(palette[2]).multiplyScalar(dark);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
