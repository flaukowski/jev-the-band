import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  defaultLighting,
  hash,
  musicians,
  personas,
  random,
  type Frame,
  type Role,
} from '../shared/music';

const washColors: Record<string, number> = {
  'amber dusk': 0xffb052,
  'violet ocean': 0xb578f0,
  'acid sunrise': 0xd4ff65,
  'deep blue': 0x546fff,
  'rose garden': 0xff689d,
  'forest floor': 0x69c87c,
  'moon white': 0xd7e8ff,
  'ember red': 0xf95d3a,
  'teal lagoon': 0x46ddc9,
  ultraviolet: 0xa371ff,
  'peach haze': 0xffb69b,
  blackout: 0x182122,
};
export function Stage({
  frame,
  playing,
  reduced,
  onSelect,
  serverOffset,
  loadingAudio,
}: {
  frame: Frame | null;
  playing: boolean;
  reduced: boolean;
  onSelect: (role: Role) => void;
  serverOffset: number;
  loadingAudio: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [view, setView] = useState('wide');
  const [follow, setFollow] = useState(false);
  const controlsApi = useRef<{
    view: (name: string) => void;
    zoom: (factor: number) => void;
  } | null>(null);
  const live = useRef({ frame, playing, reduced, onSelect, serverOffset, follow, loadingAudio });
  live.current = { frame, playing, reduced, onSelect, serverOffset, follow, loadingAudio };
  useEffect(() => {
    const container = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'low-power',
      });
    } catch {
      container.dataset.unavailable = 'true';
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.4));
    renderer.setClearColor(0x101311);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const gl = renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const softwareRenderer =
      debug &&
      /swiftshader|llvmpipe|software/i.test(String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)));
    if (softwareRenderer) renderer.setPixelRatio(0.85);
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x101311, 0.022);
    const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 100);
    camera.position.set(15, 13.5, 23);
    camera.lookAt(0, 1, 0);
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(0, 1, 0);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.075;
    orbit.minDistance = 3;
    orbit.maxDistance = 48;
    orbit.maxPolarAngle = Math.PI * 0.48;
    const cameraGoal = camera.position.clone();
    const targetGoal = orbit.target.clone();
    let movingCamera = false;
    orbit.addEventListener('start', () => {
      movingCamera = false;
      setFollow(false);
      setView('free');
    });
    scene.add(new THREE.AmbientLight(0x8ea594, 1.35));
    const key = new THREE.DirectionalLight(0xffe4b6, 2.8);
    key.position.set(3, 12, 8);
    scene.add(key);
    const mat = (color: THREE.ColorRepresentation, roughness = 0.8) =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.15 });
    const dark = mat(0x1c2420),
      metal = mat(0x4a514b, 0.4),
      wood = mat(0x343c2c),
      skin = mat(0xddb08b);
    const box = (
      parent: THREE.Object3D,
      w: number,
      h: number,
      d: number,
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
    ) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    const cylinder = (
      parent: THREE.Object3D,
      radius: number,
      h: number,
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
    ) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, h, 16), material);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    box(scene, 17, 0.65, 9, wood, 0, -0.35, -1.7);
    box(scene, 80, 0.1, 65, mat(0x141a16), 0, -0.78, 10);
    for (let x = -8; x < 8; x += 0.5) box(scene, 0.018, 0.012, 9, mat(0x4a5039), x, -0.012, -1.7);
    box(scene, 17.5, 0.14, 0.15, mat(0xcde77c), 0, -0.15, 2.82);
    for (const x of [-8.3, 8.3]) {
      box(scene, 0.17, 7, 0.17, metal, x, 3.1, -5.6);
      for (let y = 0; y < 6.8; y += 0.6) {
        const brace = box(scene, 0.07, 0.7, 0.07, metal, x + 0.17, y, -5.6);
        brace.rotation.z = 0.6;
      }
    }
    box(scene, 16.8, 0.2, 0.3, metal, 0, 6.55, -5.6);
    // Banner is an actual stage object, not a floating UI label.
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 600;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#cce991';
    ctx.fillRect(0, 0, 1600, 600);
    ctx.fillStyle = '#172319';
    ctx.textAlign = 'center';
    ctx.font = '900 340px Impact, sans-serif';
    ctx.fillText('JEV', 800, 345);
    ctx.font = '700 94px monospace';
    ctx.fillText('T H E   B A N D', 800, 495);
    const bannerTexture = new THREE.CanvasTexture(canvas);
    bannerTexture.colorSpace = THREE.SRGBColorSpace;
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(10.5, 3.94),
      new THREE.MeshBasicMaterial({ map: bannerTexture, side: THREE.DoubleSide }),
    );
    banner.position.set(0, 3.78, -5.48);
    scene.add(banner);
    for (const x of [-7.2, 7.2]) {
      for (let n = 0; n < 3; n++) {
        box(scene, 1.1, 1.2, 1, dark, x, 0.65 + n * 1.24, -4.1);
        const speaker = cylinder(scene, 0.36, 0.05, mat(0x0c100d), x, 0.65 + n * 1.24, -3.57);
        speaker.rotation.x = Math.PI / 2;
      }
    }
    const performers: Record<string, THREE.Group> = {};
    const arms: THREE.Group[] = [];
    const rightArms: THREE.Mesh[] = [];
    const cymbals: THREE.Mesh[] = [];
    const keyboardKeys: { mesh: THREE.Mesh; y: number; index: number; hand: string }[] = [];
    const hitTargets: THREE.Object3D[] = [];
    const positions = {
      guitar: [-4.6, 0.3],
      bass: [-1.6, 0.7],
      keys: [4.3, -0.2],
      drums: [1.1, -3.2],
    };
    function cameraView(name: string) {
      const musician = positions[name as keyof typeof positions];
      if (musician) {
        cameraGoal.set(musician[0] + 3.3, 3.4, musician[1] + 6);
        targetGoal.set(musician[0], 1.2, musician[1]);
      } else {
        const small = container.clientWidth < 650;
        cameraGoal.set(
          ...((name === 'front'
            ? [0, 4.5, 19]
            : name === 'overhead'
              ? [0, 27, 2]
              : small
                ? [18, 17, 29]
                : [15, 13.5, 23]) as [number, number, number]),
        );
        targetGoal.set(0, 1, 0);
      }
      movingCamera = true;
      container.dataset.camera = name;
    }
    controlsApi.current = {
      view: cameraView,
      zoom: (factor) => {
        movingCamera = false;
        const offset = camera.position.clone().sub(orbit.target).multiplyScalar(factor);
        offset.setLength(Math.max(orbit.minDistance, Math.min(orbit.maxDistance, offset.length())));
        camera.position.copy(orbit.target).add(offset);
        orbit.update();
      },
    };
    cameraView('wide');
    for (const role of musicians) {
      const [x, z] = positions[role];
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      group.userData.role = role;
      performers[role] = group;
      scene.add(group);
      const shirt = mat(personas[role].color);
      box(group, 0.62, 0.82, 0.35, shirt, 0, 1.33, 0);
      for (const leg of [-0.18, 0.18]) {
        box(group, 0.19, 0.84, 0.22, dark, leg, 0.5, 0);
        box(group, 0.23, 0.16, 0.4, mat(0xe6dfc5), leg, 0.12, 0.07);
      }
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), skin);
      head.position.y = 2.01;
      group.add(head);
      cylinder(group, 0.28, 0.16, dark, 0, 2.2, 0);
      const arm = new THREE.Group();
      arm.position.set(-0.35, 1.6, 0);
      group.add(arm);
      const forearm = box(arm, 0.15, 0.63, 0.18, shirt, 0, -0.2, 0.14);
      forearm.rotation.x = -0.6;
      arms.push(arm);
      const rightArm = box(group, 0.15, 0.6, 0.18, shirt, 0.36, 1.28, 0.2);
      rightArm.rotation.x = -0.6;
      rightArms.push(rightArm);
      if (role === 'drums') {
        box(arm, 0.025, 0.65, 0.025, wood, 0, -0.45, 0.32).rotation.x = -0.8;
        box(rightArm, 0.025, 0.65, 0.025, wood, 0, -0.35, 0.18).rotation.x = -0.8;
      }
      if (role === 'guitar' || role === 'bass') {
        const instrument = new THREE.Group();
        instrument.position.set(0.04, 1.03, 0.37);
        instrument.rotation.z = -0.5;
        group.add(instrument);
        const body = new THREE.Mesh(
          new THREE.SphereGeometry(0.34, 16, 12),
          mat(role === 'guitar' ? 0xe48d4e : 0xb4bd76),
        );
        body.scale.set(0.78, 1, 0.3);
        instrument.add(body);
        box(instrument, 0.12, role === 'bass' ? 1.15 : 0.95, 0.07, wood, 0, 0.6, 0);
        box(instrument, 0.19, 0.22, 0.1, wood, 0, 1.15, 0);
        for (let s = 0; s < 4; s++)
          box(instrument, 0.008, 1.25, 0.01, metal, -0.035 + s * 0.022, 0.4, 0.08);
        box(scene, 1, 0.65, 0.6, dark, x, 0.34, z - 1);
        box(scene, 0.75, 0.07, 0.36, mat(0x394642), x, 0.035, z + 0.65);
      }
      if (role === 'keys') {
        for (const y of [1.15, 1.5]) {
          box(scene, 2.2, 0.15, 0.72, dark, x, y, z + 0.65);
          for (let k = 0; k < 22; k++) {
            const key = box(
              scene,
              0.085,
              0.02,
              0.32,
              mat(k % 7 === 1 || k % 7 === 3 ? 0x202020 : 0xede9d7),
              x - 1.02 + k * 0.097,
              y + 0.09,
              z + 0.83,
            );
            keyboardKeys.push({
              mesh: key,
              y: y + 0.09,
              index: k,
              hand: y < 1.3 ? 'left' : 'right',
            });
          }
        }
        for (const dx of [-0.75, 0.75]) box(scene, 0.06, 1.15, 0.07, metal, x + dx, 0.57, z + 0.65);
      }
      if (role === 'drums') {
        const kick = cylinder(scene, 0.65, 0.6, mat(0xc5c8a5), x, 0.68, z + 0.85);
        kick.rotation.x = Math.PI / 2;
        for (const [dx, dz] of [
          [-0.8, 0.5],
          [0.5, 0.3],
          [-0.4, 1],
        ])
          cylinder(scene, 0.32, 0.35, mat(0x9ba89b), x + dx, 1, z + dz);
        for (const [dx, dz] of [
          [-1.2, 0.2],
          [1, 0.7],
          [0.4, -0.4],
        ]) {
          cylinder(scene, 0.025, 1.7, metal, x + dx, 0.85, z + dz);
          cymbals.push(cylinder(scene, 0.52, 0.025, mat(0xcfad60, 0.3), x + dx, 1.7, z + dz));
        }
      }
      group.traverse((obj) => {
        obj.userData.role = role;
        if (obj instanceof THREE.Mesh) hitTargets.push(obj);
      });
      const monitor = box(scene, 0.85, 0.38, 0.7, dark, x, 0.2, 2.1);
      monitor.rotation.x = -0.2;
    }
    // A fifth member works the lighting desk beside the crowd.
    box(scene, 1.8, 1.0, 0.8, dark, -6, -0.2, 7);
    box(scene, 1.65, 0.08, 0.7, mat(0x586657), -6, 0.35, 7);
    for (let i = 0; i < 12; i++)
      box(scene, 0.065, 0.03, 0.13, mat(i % 2 ? 0xc7f378 : 0x77cfce), -6.6 + i * 0.11, 0.41, 7);
    const lux = new THREE.Group();
    lux.position.set(-6, -0.72, 7.8);
    lux.rotation.y = Math.PI;
    scene.add(lux);
    box(lux, 0.57, 0.74, 0.3, mat(personas.lights.color), 0, 1.15, 0);
    for (const x of [-0.16, 0.16]) box(lux, 0.17, 0.7, 0.2, dark, x, 0.44, 0);
    cylinder(lux, 0.23, 0.4, skin, 0, 1.73, 0);
    for (const x of [-0.35, 0.35]) {
      const arm = box(lux, 0.14, 0.6, 0.16, mat(personas.lights.color), x, 1.11, 0.2);
      arm.rotation.x = -0.7;
    }
    lux.traverse((obj) => {
      obj.userData.role = 'lights';
      if (obj instanceof THREE.Mesh) hitTargets.push(obj);
    });
    const crowd: THREE.Group[] = [];
    const rng = random(771);
    const crowdColors = [0x354339, 0x646b48, 0x4c5444, 0x68664f, 0x3f5150, 0x625347];
    for (let row = 0; row < 8; row++)
      for (let col = 0; col < 22; col++) {
        const person = new THREE.Group();
        person.position.set((col - 10.5) * 0.82 + rng() * 0.3, -0.7, 5 + row * 1.05 + rng() * 0.3);
        const height = 0.65 + rng() * 0.45;
        cylinder(
          person,
          0.19,
          height,
          mat(crowdColors[Math.floor(rng() * crowdColors.length)]),
          0,
          height / 2,
          0,
        );
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.16, 7, 6),
          mat(rng() > 0.5 ? 0xb18c6c : 0x635242),
        );
        head.position.y = height + 0.13;
        person.add(head);
        person.userData.phase = rng() * 6.28;
        if (rng() > 0.7) {
          const hand = box(person, 0.08, 0.65, 0.1, mat(0x8f846a), 0.24, height + 0.08, 0);
          hand.rotation.z = -0.3;
        }
        scene.add(person);
        crowd.push(person);
      }
    const beams: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>[] = [];
    const lamps: THREE.PointLight[] = [];
    for (let i = 0; i < 8; i++) {
      const x = -7 + i * 2;
      box(scene, 0.35, 0.35, 0.4, dark, x, 6.15, -5.2);
      const geometry = new THREE.ConeGeometry(2.0, 8.0, 24, 1, true);
      geometry.translate(0, -4, 0);
      const beam = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color: 0xd7ed8c,
          transparent: true,
          opacity: 0.055,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      beam.position.set(x, 6.1, -5.0);
      beam.rotation.x = -0.45;
      scene.add(beam);
      beams.push(beam);
      if (i % 2 === 0) {
        const light = new THREE.PointLight(0xe6b976, 12, 13, 1.5);
        light.position.set(x, 4, -1);
        scene.add(light);
        lamps.push(light);
      }
    }
    const lasers = new THREE.Group();
    scene.add(lasers);
    for (let i = 0; i < 25; i++) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 4.8, -5),
          new THREE.Vector3((i - 12) * 1.1, 1.5 + Math.abs(i - 12) * 0.09, 12),
        ]),
        new THREE.LineBasicMaterial({
          color: 0x82fbd2,
          transparent: true,
          opacity: 0.2,
          blending: THREE.AdditiveBlending,
        }),
      );
      lasers.add(line);
    }
    const resize = new ResizeObserver(() => {
      const w = container.clientWidth,
        h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resize.observe(container);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0,
      downY = 0;
    const pressed = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    const clicked = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(hitTargets)[0];
      if (hit) live.current.onSelect(hit.object.userData.role);
    };
    renderer.domElement.addEventListener('pointerup', clicked);
    renderer.domElement.addEventListener('pointerdown', pressed);
    let raf = 0;
    const start = performance.now();
    let followed = '';
    let lastDraw = 0;
    function draw(now: number) {
      raf = requestAnimationFrame(draw);
      // Leave CPU time for audio decoding/scheduling, including software WebGL renderers.
      const interval = live.current.loadingAudio ? 1000 : 1000 / (softwareRenderer ? 10 : 30);
      if (document.hidden || now - lastDraw < interval) return;
      lastDraw = now;
      const { frame, playing, reduced, serverOffset, follow } = live.current;
      const lighting = frame?.lighting ?? defaultLighting;
      const t = reduced ? 0 : (now - start) / 1000;
      const musicalBeat = frame
        ? Math.max(0, ((Date.now() + serverOffset - frame.at) * frame.bpm) / 60000)
        : t * 1.6;
      const beat = (reduced ? 0 : musicalBeat) * Math.PI * 2;
      const soloist = frame?.parts.find((p) => p.solo)?.role ?? 'wide';
      if (follow && followed !== soloist) {
        cameraView(soloist);
        setView(soloist);
        followed = soloist;
      }
      if (!follow) followed = '';
      if (movingCamera) {
        camera.position.lerp(cameraGoal, reduced ? 1 : 0.055);
        orbit.target.lerp(targetGoal, reduced ? 1 : 0.055);
        if (camera.position.distanceTo(cameraGoal) < 0.01) movingCamera = false;
      }
      orbit.update();
      const color = new THREE.Color(washColors[lighting.wash] ?? 0xc4df8d);
      const recipe = hash(lighting.beam) % 11;
      musicians.forEach((role, i) => {
        const p = frame?.parts.find((p) => p.role === role);
        const complexity = p ? Math.min(1, p.notes.length / 40) : 0;
        const energy =
          playing && p?.notes.length ? (p.solo ? 0.06 : 0.018 + complexity * 0.015) : 0.006;
        const recent =
          p?.notes.filter((n) => musicalBeat >= n.beat && musicalBeat - n.beat < 0.65) ?? [];
        const impulse =
          playing && !reduced
            ? recent.reduce(
                (v, n) => Math.max(v, n.velocity * Math.exp(-(musicalBeat - n.beat) * 9)),
                0,
              )
            : 0;
        performers[role].rotation.z = reduced ? 0 : Math.sin(beat / 2 + i) * energy;
        performers[role].position.y = reduced ? 0 : impulse * (role === 'drums' ? 0.016 : 0.03);
        arms[i].rotation.x =
          role === 'drums' ? -impulse * 0.9 : role === 'keys' ? -impulse * 0.3 : -impulse * 0.15;
        rightArms[i].rotation.x = -0.6 - impulse * (role === 'drums' ? 1.1 : 0.55);
        if (role === 'guitar' || role === 'bass') {
          const pitch = recent.at(-1)?.midi ?? 60;
          arms[i].rotation.z = playing && !reduced ? (pitch - 60) * 0.008 : 0;
        }
        if (role === 'drums')
          cymbals.forEach((c, k) => {
            c.rotation.z = reduced ? 0 : impulse * Math.sin(t * 22 + k) * 0.09;
          });
      });
      const keysPart = frame?.parts.find((p) => p.role === 'keys');
      keyboardKeys.forEach((k) => {
        const pressed =
          playing &&
          !reduced &&
          keysPart?.notes.some(
            (n) =>
              n.hand === k.hand &&
              n.midi % 22 === k.index &&
              musicalBeat >= n.beat &&
              musicalBeat < n.beat + n.duration,
          );
        k.mesh.position.y = k.y - (pressed ? 0.025 : 0);
        (k.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(pressed ? 0x684ca1 : 0);
      });
      crowd.forEach((person) => {
        person.rotation.z = reduced
          ? 0
          : Math.sin(beat / 2 + person.userData.phase) * (playing ? 0.04 : 0.01);
      });
      beams.forEach((beam, i) => {
        beam.material.color.lerp(color, 0.04);
        beam.material.opacity =
          lighting.beam === 'off' || lighting.wash === 'blackout'
            ? 0
            : 0.025 + lighting.intensity * 0.055;
        beam.rotation.z =
          Math.sin(t * lighting.motion * 0.45 + i * (recipe + 1) * 0.21) * (0.15 + recipe * 0.035);
        beam.rotation.x = -0.25 - (recipe % 4) * 0.09 + Math.sin(t * 0.12 + i) * 0.07;
      });
      lamps.forEach((lamp) => {
        lamp.color.lerp(color, 0.04);
        lamp.intensity = lighting.wash === 'blackout' ? 0 : 5 + lighting.intensity * 12;
      });
      lasers.visible = lighting.laser !== 'off';
      lasers.rotation.z = Math.sin(t * 0.12) * 0.07;
      const laserHue = (hash(lighting.laser) % 360) / 360;
      lasers.children.forEach((line, i) => {
        (line as THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>).material.color.setHSL(
          laserHue,
          0.9,
          0.65,
        );
        line.rotation.z = Math.sin(t * 0.14 + i * 0.2) * 0.07;
      });
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      orbit.dispose();
      controlsApi.current = null;
      renderer.domElement.removeEventListener('pointerdown', pressed);
      renderer.domElement.removeEventListener('pointerup', clicked);
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.filter(Boolean).forEach((m) => m.dispose());
      });
      bannerTexture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <div ref={host} className="stage-canvas" aria-label="Interactive concert stage">
      <div className="camera-desk" aria-label="Camera controls">
        <select
          aria-label="Camera view"
          value={view}
          onChange={(e) => {
            setView(e.target.value);
            setFollow(false);
            controlsApi.current?.view(e.target.value);
          }}
        >
          <option value="wide">Balcony</option>
          <option value="front">Front row</option>
          <option value="overhead">Overhead</option>
          {musicians.map((r) => (
            <option key={r} value={r}>
              {personas[r].name} cam
            </option>
          ))}
          {view === 'free' && <option value="free">Free camera</option>}
        </select>
        <button aria-label="Zoom in" onClick={() => controlsApi.current?.zoom(0.85)}>
          +
        </button>
        <button aria-label="Zoom out" onClick={() => controlsApi.current?.zoom(1.18)}>
          −
        </button>
        <button
          aria-label="Reset camera"
          onClick={() => {
            setView('wide');
            setFollow(false);
            controlsApi.current?.view('wide');
          }}
        >
          ↺
        </button>
        <button aria-pressed={follow} onClick={() => setFollow(!follow)}>
          Follow solo
        </button>
        <span>Drag to orbit · scroll to zoom</span>
      </div>
      <div className="stage-fallback">
        The stage needs WebGL. The music and decision console still work.
      </div>
    </div>
  );
}
