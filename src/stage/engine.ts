import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  musicians,
  roles,
  type Frame,
  type Musician,
  type Role,
  type Sky,
  type WallOverlay,
  type WallVisual,
} from '../../shared/music';
import { Bubbles } from './bubbles';
import { Cat } from './cat';
import { Chatter } from './chatter';
import { Crowd } from './crowd';
import { CrowdField } from './crowdfield';
import { LightRig } from './lightrig';
import { Particles } from './particles';
import {
  Bassist,
  Drummer,
  Guitarist,
  Keyboardist,
  LightingArtist,
  resetPerformerCaches,
  stagePositions,
  type Performer,
} from './performers';
import { PostChain } from './post';
import { SignalTracker } from './signals';
import { resetAmpTextures } from './strings';
import { disposeTextures } from './textures';
import { clearBoxCache, clearMaterialCache, damp } from './util';
import { Venue } from './venue';
import { Weather } from './weather';

export interface StageInput {
  frame: Frame | null;
  upcoming: Frame | null;
  playing: boolean;
  reduced: boolean;
  serverOffset: number;
  loadingAudio: boolean;
  follow: boolean;
  director: boolean;
  trip: number;
  levels?: () => Record<Musician, number>;
  /** The listener's master-bus spectrum, when their sound is on. */
  spectrum?: () => Uint8Array | null;
  /** Recent raw decision JSON for the "decision stream" wall. */
  stream?: () => string[];
  /** Viewer-local overrides of Lux's wall and sky; undefined follows Lux. */
  visual?: WallVisual;
  overlay?: WallOverlay;
  sky?: Sky;
}
export interface StageCallbacks {
  onSelect: (role: Role) => void;
  onView: (name: string) => void;
  onManualCamera: () => void;
}
export interface StageEngine {
  view: (name: string) => void;
  zoom: (factor: number) => void;
  dispose: () => void;
}

type Shot = {
  position: [number, number, number];
  target: [number, number, number];
  drift?: number;
};
const shots: Record<string, Shot> = {
  wide: { position: [13, 11, 24.5], target: [1.2, 3.3, -1.5], drift: 0.6 },
  front: { position: [0, 2.4, 14.5], target: [0, 2.6, -1.5], drift: 0.5 },
  overhead: { position: [0, 25, 3.5], target: [0, 0, -0.8], drift: 0.2 },
  crowd: { position: [-3.5, 1.35, 12.5], target: [0.5, 3.2, -2], drift: 0.35 },
  lux: { position: [-8.6, 2.6, 12.2], target: [-1, 3.4, -2], drift: 0.25 },
  wing: { position: [-8.0, 2.7, -3.9], target: [1.5, 1.4, 0.6], drift: 0.3 },
  // The two shots that show how many people came.
  drone: { position: [-16, 27, 80], target: [0, 2, 6], drift: 1.2 },
  stage: { position: [2.6, 4.6, -4.9], target: [-1, 2.2, 34], drift: 0.25 },
};
const memberShot = (role: Musician): Shot => {
  const [x, y, z, yaw] = stagePositions[role];
  // Each player is framed from their open side: the neck hand for strings, over the shoulder for
  // keys so the keybeds read, and above the cymbals for drums.
  const angle = yaw + (role === 'keys' ? 2.35 : role === 'drums' ? -0.5 : 0.62);
  const reach = role === 'drums' ? 3.4 : role === 'keys' ? 2.6 : 3.1;
  const lift = role === 'drums' ? 2.5 : role === 'keys' ? 2.7 : 1.85;
  return {
    position: [x + Math.sin(angle) * reach, y + lift, z + Math.cos(angle) * reach],
    target: [
      x + (role === 'keys' ? -0.35 : 0),
      y + (role === 'keys' ? 1.2 : 1.45),
      z + (role === 'keys' ? 0.45 : 0.15),
    ],
    drift: 0.18,
  };
};
const directorCycle = [
  'wide',
  'guitar',
  'front',
  'keys',
  'crowd',
  'drums',
  'wing',
  'bass',
  'overhead',
  'drone',
  'lux',
  'stage',
];

export function createStage(
  container: HTMLElement,
  getInput: () => StageInput,
  callbacks: StageCallbacks,
): StageEngine | null {
  const initStart = performance.now();
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
  } catch {
    container.dataset.unavailable = 'true';
    return null;
  }
  const gl = renderer.getContext();
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const lowPower =
    !!debug &&
    /swiftshader|llvmpipe|software/i.test(String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)));
  let pixelRatio = lowPower ? 0.7 : Math.min(devicePixelRatio, 1.6);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x020308);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !lowPower;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // With the post chain, tone mapping happens once in the output pass.
  renderer.toneMapping = lowPower ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.info.autoReset = false;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const fog = (scene.fog = new THREE.FogExp2(0x04050c, 0.012));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.2;
  room.dispose();
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
  camera.position.set(...shots.wide.position);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(...shots.wide.target);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.075;
  orbit.minDistance = 1.6;
  orbit.maxDistance = 130;
  orbit.maxPolarAngle = Math.PI * 0.53;
  const cameraGoal = camera.position.clone();
  const targetGoal = orbit.target.clone();
  let movingCamera = false;
  let currentShot: Shot = shots.wide;
  orbit.addEventListener('start', () => {
    movingCamera = false;
    callbacks.onManualCamera();
  });

  // The venue is built in slices so the page, the room connection and the audio clock stay responsive.
  let venue!: Venue;
  let band!: Record<Role, Performer>;
  let rig!: LightRig;
  let crowd!: Crowd;
  let field!: CrowdField;
  let weather!: Weather;
  let particles!: Particles;
  let cat!: Cat;
  let chatter: Chatter | null = null;
  const bubbles = new Bubbles(container, camera);
  const bubblePoint = new THREE.Vector3();
  let nextLine = 4;
  let post: PostChain | null = null;
  let stations: THREE.Object3D[] = [];
  let emitters!: Record<Musician, THREE.Vector3>;
  let ready = false;
  let disposed = false;
  const tracker = new SignalTracker();

  function view(name: string) {
    const shot = (musicians as string[]).includes(name)
      ? memberShot(name as Musician)
      : (shots[name] ?? shots.wide);
    currentShot = shot;
    const small = container.clientWidth < 650 && name === 'wide';
    cameraGoal.set(...shot.position);
    if (small) cameraGoal.multiplyScalar(1.3);
    targetGoal.set(...shot.target);
    movingCamera = true;
    container.dataset.camera = name;
  }
  view('wide');
  camera.position.copy(cameraGoal);

  const applySize = () => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h);
    if (!ready) return;
    post?.setSize(w, h, pixelRatio);
    camera.aspect = w / h;
    // Portrait phones need a wider lens to hold the whole stage.
    camera.fov = w / h < 1 ? 52 : 36;
    camera.updateProjectionMatrix();
    particles.setViewport(h * pixelRatio, camera.fov);
    weather.setViewport(h * pixelRatio);
  };
  const resize = new ResizeObserver(applySize);
  resize.observe(container);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downX = 0;
  let downY = 0;
  const pressed = (e: PointerEvent) => {
    downX = e.clientX;
    downY = e.clientY;
  };
  const clicked = (e: PointerEvent) => {
    if (!ready || Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      (-(e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.intersectObject(cat.group, true).length) {
      cat.meow();
      bubbles.say('cat', 'Le Chaton Fat: MEOW!', (out) => cat.anchor(out), 2.6, 'cat');
      return;
    }
    const hit = raycaster.intersectObjects(stations, true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && !o.userData.role) o = o.parent;
    if (o) callbacks.onSelect(o.userData.role as Role);
  };
  renderer.domElement.addEventListener('pointerdown', pressed);
  renderer.domElement.addEventListener('pointerup', clicked);

  const heads = Object.fromEntries(
    roles.map((r) => [
      r,
      new THREE.Vector3(stagePositions[r][0], stagePositions[r][1] + 2, stagePositions[r][2]),
    ]),
  ) as Record<Role, THREE.Vector3>;
  const feet = Object.fromEntries(
    musicians.map((r) => {
      const [x, y, z] = stagePositions[r];
      return [
        r,
        r === 'drums'
          ? new THREE.Vector3(x, y + 0.36, z + 1.25)
          : new THREE.Vector3(x, y + 0.03, z),
      ];
    }),
  ) as Record<Musician, THREE.Vector3>;
  const soloPoint = new THREE.Vector3();
  const sway = new THREE.Vector3();

  const debugStats = {
    cpu: 0,
    calls: 0,
    band: 0,
    world: 0,
    render: 0,
    build: 0,
    compile: 0,
    worst: 0,
  };
  let capped = false;
  let crowdTick = false;
  let crowdDt = 0;
  let raf = 0;
  let last = 0;
  let lastDraw = 0;
  let slow = 0;
  let followed = '';
  let directed = '';
  let directorIndex = 0;
  let directorPhrase = -99;

  function draw(now: number) {
    raf = requestAnimationFrame(draw);
    const frameStart = performance.now();
    const input = getInput();
    // Leave the main thread to audio decoding while instruments load, and be gentle on software GL.
    // When a frame costs the main thread real time, hold 30 fps so audio scheduling and the rest of
    // the page keep at least half of every second; fast machines run uncapped.
    if (debugStats.cpu > 9.5) capped = true;
    else if (debugStats.cpu < 6) capped = false;
    const interval = input.loadingAudio ? 1000 : lowPower ? 1000 / 12 : capped ? 1000 / 30 : 0;
    if (document.hidden || now - lastDraw < interval - 1) return;
    lastDraw = now;
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0.016);
    last = now;
    const sig = tracker.update(input, dt);

    // Camera direction.
    const soloist = sig.soloists[0] ?? 'wide';
    if (input.director) {
      const phraseTurn = sig.phrase - directorPhrase >= 2 || sig.phrase < directorPhrase;
      const want = sig.soloists[0];
      if (want && directed !== want) {
        directed = want;
        directorPhrase = sig.phrase;
        view(want);
        callbacks.onView(want);
      } else if (!want && phraseTurn) {
        directorPhrase = sig.phrase;
        directorIndex = (directorIndex + 1) % directorCycle.length;
        directed = directorCycle[directorIndex];
        view(directed);
        callbacks.onView(directed);
      }
    } else {
      directed = '';
      if (input.follow && followed !== soloist) {
        followed = soloist;
        view(soloist);
        callbacks.onView(soloist);
      }
      if (!input.follow) followed = '';
    }
    if (movingCamera) {
      const k = sig.reduced ? 1 : 1 - Math.exp(-dt * 2.6);
      camera.position.lerp(cameraGoal, k);
      orbit.target.lerp(targetGoal, k);
      if (camera.position.distanceTo(cameraGoal) < 0.02) movingCamera = false;
    }
    orbit.update();

    for (const role of roles) {
      band[role].character.head.getWorldPosition(heads[role]);
      band[role].character.setDetail(camera.position.distanceTo(heads[role]) < 12);
    }
    const ctx = { heads, scene };
    const t0 = performance.now();
    for (const role of roles) band[role].update(sig, dt, ctx);
    const t1 = performance.now();
    let solo: THREE.Vector3 | null = null;
    if (sig.soloists[0]) {
      solo = soloPoint.copy(heads[sig.soloists[0]]);
      solo.y -= 0.55;
    }
    rig.update(sig, dt, solo);
    // Notes push the projection wall from the player's side of the stage.
    musicians.forEach((role, i) => {
      const p = sig.players[role];
      if (!p.hits.length) return;
      const strongest = p.hits.reduce((a, b) => (b.velocity > a.velocity ? b : a));
      const x = (stagePositions[role][0] / 8.5) * 2.3;
      const y =
        role === 'drums'
          ? -0.55
          : -0.85 + Math.min(1, Math.max(0, (strongest.midi - 28) / 60)) * 1.3;
      venue.ripple(
        i,
        x,
        y,
        strongest.velocity * (role === 'bass' ? 1.5 : role === 'drums' ? 0.6 : 1),
      );
    });
    weather.update(sig, rig.palette, dt, camera, input.sky);
    venue.update(sig, rig.palette, renderer, dt, weather.air, {
      scene,
      shot: memberShot,
      stream: input.stream,
      spectrum: input.spectrum,
      visual: input.visual,
      overlay: input.overlay,
    });
    field.update(sig, rig.palette, weather.air);
    // The crowd is the single biggest CPU item; at a distance, every other frame is indistinguishable.
    crowdTick = !crowdTick;
    crowdDt += dt;
    if (crowdTick || lowPower) {
      crowd.update(sig, crowdDt);
      crowdDt = 0;
    }
    particles.update(sig, dt, emitters, feet, rig.palette, lowPower);
    cat.update(sig, dt);
    // Crowd talk: a line every few seconds from somebody the camera can actually see.
    nextLine -= dt;
    const ouch = crowd.takeBumped();
    if (
      chatter &&
      ouch >= 0 &&
      Math.random() < 0.35 &&
      bubbles.count('fan') < 3 &&
      bubbles.visible(crowd.anchor(ouch, bubblePoint), 22)
    )
      bubbles.say(`fan${ouch}`, chatter.ouch(), (out) => crowd.anchor(ouch, out), 2.8);
    if (chatter && nextLine <= 0) {
      nextLine = 1;
      if (bubbles.count('fan') < 3)
        for (let tries = 0; tries < 14; tries++) {
          const i = Math.floor(Math.random() * crowd.count);
          if (bubbles.has(`fan${i}`) || !bubbles.visible(crowd.anchor(i, bubblePoint), 26))
            continue;
          bubbles.say(`fan${i}`, chatter.line(), (out) => crowd.anchor(i, out));
          nextLine = 2.5 + Math.random() * 5.5;
          break;
        }
    }
    const t2 = performance.now();
    scene.environmentIntensity = damp(
      scene.environmentIntensity,
      (sig.lighting.wash === 'blackout' ? 0.03 : 0.1 + sig.lighting.intensity * 0.22) +
        (1 - weather.air.night) * 0.45,
      2,
      dt,
    );
    fog.color.copy(weather.air.fogColor);
    fog.density = weather.air.fogDensity;

    // Handheld life: a breath of drift on top of wherever the operator parked the camera.
    const drift = sig.reduced ? 0 : (currentShot.drift ?? 0.3) * 0.05;
    sway.set(
      Math.sin(sig.time * 0.23) * drift * 2,
      Math.sin(sig.time * 0.31 + 1) * drift,
      Math.cos(sig.time * 0.19) * drift * 2,
    );
    camera.position.add(sway);
    camera.lookAt(orbit.target);
    if (post) {
      post.update(sig, dt, input.trip, weather.air.night);
      post.render(dt);
    } else renderer.render(scene, camera);
    bubbles.update(dt);
    camera.position.sub(sway);

    // Adaptive resolution: if frames run long for a few seconds, trade pixels for fluidity.
    const cost = performance.now() - frameStart;
    debugStats.band += (t1 - t0 - debugStats.band) * 0.05;
    debugStats.world += (t2 - t1 - debugStats.world) * 0.05;
    debugStats.render += (performance.now() - t2 - debugStats.render) * 0.05;
    debugStats.cpu += (cost - debugStats.cpu) * 0.05;
    debugStats.worst = Math.max(debugStats.worst, cost);
    debugStats.calls = renderer.info.render.calls;
    renderer.info.reset();
    slow = cost > 24 ? slow + dt : Math.max(0, slow - dt * 2);
    if (slow > 3 && pixelRatio > 0.8) {
      slow = 0;
      pixelRatio = Math.max(0.8, pixelRatio - 0.2);
      renderer.setPixelRatio(pixelRatio);
      post?.setSize(container.clientWidth, container.clientHeight, pixelRatio);
      particles.setViewport(container.clientHeight * pixelRatio, camera.fov);
    }
  }
  const pause = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  async function build() {
    venue = new Venue(scene, lowPower);
    await pause();
    const players = {} as Record<Role, Performer>;
    const makers: [Role, () => Performer][] = [
      ['guitar', () => new Guitarist(scene)],
      ['bass', () => new Bassist(scene)],
      ['keys', () => new Keyboardist(scene)],
      ['drums', () => new Drummer(scene)],
      ['lights', () => new LightingArtist(scene)],
    ];
    for (const [role, make] of makers) {
      if (disposed) return;
      players[role] = make();
      await pause();
    }
    if (disposed) return;
    band = players;
    rig = new LightRig(scene, lowPower);
    crowd = new Crowd(scene, lowPower);
    field = new CrowdField(scene, lowPower);
    weather = new Weather(scene, lowPower);
    await pause();
    if (disposed) return;
    particles = new Particles(scene, lowPower);
    crowd.onPuff = (p, vx, vy, vz, size) => particles.puff(p, vx, vy, vz, size, rig.palette[0]);
    cat = new Cat(scene, camera);
    chatter = new Chatter();
    post = lowPower ? null : new PostChain(renderer, scene, camera);
    stations = roles.map((r) => band[r].station);
    emitters = Object.fromEntries(musicians.map((r) => [r, band[r].emitter])) as Record<
      Musician,
      THREE.Vector3
    >;
    // Players shadow themselves and their instruments as well as the deck.
    for (const role of roles)
      band[role].station.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.receiveShadow = true;
      });
    ready = true;
    applySize();
    debugStats.build = performance.now() - initStart;
    // Compile every shader off the main thread before the first frame.
    await Promise.all([
      renderer.compileAsync(scene, camera).catch(() => undefined),
      venue.wall.precompile(renderer).catch(() => undefined),
    ]);
    debugStats.compile = performance.now() - initStart - debugStats.build;
    if (!disposed) raf = requestAnimationFrame(draw);
  }
  void build();
  if (import.meta.env.DEV)
    (window as unknown as { __jevStage?: unknown }).__jevStage = {
      renderer,
      scene,
      camera,
      orbit,
      view,
      stats: debugStats,
    };

  return {
    view,
    zoom(factor) {
      movingCamera = false;
      const offset = camera.position.clone().sub(orbit.target).multiplyScalar(factor);
      offset.setLength(Math.max(orbit.minDistance, Math.min(orbit.maxDistance, offset.length())));
      camera.position.copy(orbit.target).add(offset);
      orbit.update();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      orbit.dispose();
      renderer.domElement.removeEventListener('pointerdown', pressed);
      renderer.domElement.removeEventListener('pointerup', clicked);
      scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        const materials = Array.isArray(m.material) ? m.material : [m.material];
        materials.filter(Boolean).forEach((material) => material.dispose());
      });
      bubbles.dispose();
      crowd?.dispose();
      venue?.dispose();
      post?.dispose();
      environment.dispose();
      disposeTextures();
      resetAmpTextures();
      resetPerformerCaches();
      clearBoxCache();
      clearMaterialCache();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

export type { Performer };
