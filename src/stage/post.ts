import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { Signals } from './signals';
import { damp } from './util';

const quadVertex =
  'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const feedbackFragment = /* glsl */ `
uniform sampler2D tNew; uniform sampler2D tOld;
uniform float uDecay, uZoom, uRot, uHue;
varying vec2 vUv;
vec3 hueRotate(vec3 c, float a){
  const vec3 k = vec3(0.57735);
  float ca = cos(a), sa = sin(a);
  return c * ca + cross(k, c) * sa + k * dot(k, c) * (1.0 - ca);
}
void main(){
  vec3 cur = texture2D(tNew, vUv).rgb;
  vec2 p = vUv - 0.5;
  float c = cos(uRot), s = sin(uRot);
  p = mat2(c, -s, s, c) * p * (1.0 - uZoom);
  vec3 old = hueRotate(texture2D(tOld, p + 0.5).rgb, uHue);
  // Only light leaves a trail. Faces and hands stay crisp; beams, lasers and sparks smear.
  float l = max(old.r, max(old.g, old.b));
  old *= smoothstep(0.45, 1.3, l);
  // History is capped so a trail can never grow brighter than the light that drew it.
  old = min(max(old, 0.0), vec3(1.6));
  gl_FragColor = vec4(max(cur, old * uDecay), 1.0);
}`;

const compositeFragment = /* glsl */ `
uniform sampler2D tMain;
uniform float uAberration, uGrain, uVignette, uTime, uWobble, uPulse, uSaturation;
uniform vec2 uResolution;
varying vec2 vUv;
float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
void main(){
  vec2 p = vUv - 0.5;
  float r2 = dot(p, p);
  vec2 w = vUv + uWobble * 0.0035 * vec2(sin(vUv.y * 18.0 + uTime * 2.0), cos(vUv.x * 16.0 + uTime * 1.7));
  vec2 dir = p * uAberration * (0.35 + r2 * 1.4);
  vec3 col = vec3(texture2D(tMain, w + dir).r, texture2D(tMain, w).g, texture2D(tMain, w - dir).b);
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, uSaturation);
  col *= 1.0 + uPulse;
  col *= 1.0 - uVignette * smoothstep(0.12, 0.62, r2);
  float g = hash(vUv * uResolution + fract(uTime) * 91.7) - 0.5;
  col += g * uGrain * (0.25 + 0.75 * (1.0 - clamp(luma, 0.0, 1.0)));
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

/** Video-feedback tracers plus lens character, in one pass with a ping-pong history buffer. */
class TripPass extends Pass {
  private a: THREE.WebGLRenderTarget;
  private b: THREE.WebGLRenderTarget;
  readonly feedback = new THREE.ShaderMaterial({
    uniforms: {
      tNew: { value: null },
      tOld: { value: null },
      uDecay: { value: 0.8 },
      uZoom: { value: 0.004 },
      uRot: { value: 0 },
      uHue: { value: 0 },
    },
    vertexShader: quadVertex,
    fragmentShader: feedbackFragment,
    depthTest: false,
    depthWrite: false,
  });
  readonly composite = new THREE.ShaderMaterial({
    uniforms: {
      tMain: { value: null },
      uAberration: { value: 0.002 },
      uGrain: { value: 0.03 },
      uVignette: { value: 0.5 },
      uTime: { value: 0 },
      uWobble: { value: 0 },
      uPulse: { value: 0 },
      uSaturation: { value: 1.08 },
      uResolution: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: quadVertex,
    fragmentShader: compositeFragment,
    depthTest: false,
    depthWrite: false,
  });
  private readonly quad = new FullScreenQuad(this.feedback);
  constructor() {
    super();
    const options = { type: THREE.HalfFloatType, depthBuffer: false };
    this.a = new THREE.WebGLRenderTarget(4, 4, options);
    this.b = new THREE.WebGLRenderTarget(4, 4, options);
  }
  setSize(width: number, height: number) {
    this.a.setSize(width, height);
    this.b.setSize(width, height);
    (this.composite.uniforms.uResolution.value as THREE.Vector2).set(width, height);
  }
  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ) {
    this.feedback.uniforms.tNew.value = readBuffer.texture;
    this.feedback.uniforms.tOld.value = this.b.texture;
    this.quad.material = this.feedback;
    renderer.setRenderTarget(this.a);
    this.quad.render(renderer);
    this.composite.uniforms.tMain.value = this.a.texture;
    this.quad.material = this.composite;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
    [this.a, this.b] = [this.b, this.a];
  }
  dispose() {
    this.a.dispose();
    this.b.dispose();
    this.feedback.dispose();
    this.composite.dispose();
    this.quad.dispose();
  }
}

/**
 * The lens listens to the pedalboards. Each effect Jev switches on bends the picture the way it
 * bends the sound: delay leaves echoes of light, reverb widens the bloom, drive adds grit and
 * colour fringing, wah and envelope make the glass swim, chorus doubles and swirls, tremolo breathes.
 */
export class PostChain {
  readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly trip = new TripPass();
  private readonly lastCamera = new THREE.Vector3();
  private readonly lastQuat = new THREE.Quaternion();
  private motion = 0;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
  ) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.6, 0.7, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.trip);
    this.composer.addPass(new OutputPass());
  }
  setSize(width: number, height: number, pixelRatio: number) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }
  update(sig: Signals, dt: number, trip: number) {
    // A moving camera would drag trails across everything, so tracers yield to camera motion.
    const moved =
      this.camera.position.distanceTo(this.lastCamera) +
      this.camera.quaternion.angleTo(this.lastQuat) * 6;
    this.lastCamera.copy(this.camera.position);
    this.lastQuat.copy(this.camera.quaternion);
    this.motion = damp(this.motion, Math.min(1, moved * 9), moved * 9 > this.motion ? 30 : 3, dt);
    const still = 1 - this.motion;
    const fx = sig.fx;
    const live = sig.reduced ? 0 : trip;
    const f = this.trip.feedback.uniforms;
    // Feedback memory is per-frame; keep its half-life constant across frame rates.
    const halfLife = 0.05 + fx.delay * 0.2 + sig.energySlow * 0.04;
    f.uDecay.value = live * still * Math.pow(0.5, dt / halfLife);
    f.uZoom.value = (0.0012 + fx.delay * 0.003 + sig.kick * 0.001) * live;
    f.uRot.value = (fx.chorus * 0.004 + 0.0008) * Math.sin(sig.time * 0.2) * live;
    f.uHue.value = (fx.envelope * 0.12 + fx.wah * 0.06) * live;
    const c = this.trip.composite.uniforms;
    c.uTime.value = sig.time;
    c.uAberration.value =
      (0.0012 + fx.drive * 0.0045 + fx.chorus * 0.002 + sig.energy * 0.0012) * (0.3 + live * 0.7);
    c.uGrain.value = 0.008 + fx.drive * 0.022 * live;
    c.uWobble.value = (fx.wah * 0.9 + fx.envelope * 0.7 * sig.players.guitar.level) * live;
    // Tremolo: a slow 1.8 Hz breath of a few percent. Far below any flash threshold.
    c.uPulse.value = fx.tremolo * 0.035 * Math.sin(sig.time * Math.PI * 2 * 1.8) * live;
    c.uSaturation.value = 1.05 + fx.drive * 0.2 + sig.energy * 0.1;
    c.uVignette.value = 0.55 - sig.energy * 0.15;
    this.bloom.strength = 0.45 + fx.reverb * 0.3 * live + sig.energy * 0.18;
    this.bloom.radius = 0.55 + fx.reverb * 0.3;
  }
  render(dt: number) {
    this.composer.render(dt);
  }
  dispose() {
    this.trip.dispose();
    this.bloom.dispose();
    this.composer.dispose();
  }
}
