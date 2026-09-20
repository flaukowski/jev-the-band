import * as THREE from 'three';
import type { Signals } from './signals';

const LIP_Z = 2.96;
const REACH = 8.2;

/**
 * Le Chaton Fat: a very large orange cat who patrols the downstage lip and does not care about
 * the band. Click it and it tells you so.
 */
export class Cat {
  readonly group = new THREE.Group();
  private readonly rig = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly tail = new THREE.Group();
  private readonly tailTip = new THREE.Group();
  private readonly legs: THREE.Mesh[] = [];
  private readonly jaw: THREE.Mesh;
  private heading = 1;
  private stride = 0;
  /** Seconds until it next sits down like a loaf, or gets up again. */
  private clock = 14;
  private sitting = false;
  private settle = 0;
  private meowing = 0;
  private readonly look = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {
    const fur = new THREE.MeshStandardMaterial({ color: 0xe0812a, roughness: 0.95 });
    const cream = new THREE.MeshStandardMaterial({ color: 0xf6e3c2, roughness: 0.95 });
    const stripe = new THREE.MeshStandardMaterial({ color: 0xa8521a, roughness: 0.95 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a0d08, roughness: 0.6 });
    const eye = new THREE.MeshBasicMaterial({ color: 0xb6ff5a });
    const part = (
      parent: THREE.Object3D,
      geo: THREE.BufferGeometry,
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
      sx = 1,
      sy = 1,
      sz = 1,
    ) => {
      const m = new THREE.Mesh(geo, material);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    const ball = new THREE.SphereGeometry(1, 20, 14);
    // The cat walks along local +z.
    part(this.rig, ball, fur, 0, 0.3, 0, 0.27, 0.25, 0.42);
    part(this.rig, ball, cream, 0, 0.2, 0.02, 0.23, 0.17, 0.36);
    for (const z of [-0.2, -0.05, 0.1])
      part(this.rig, new THREE.TorusGeometry(0.262, 0.018, 6, 20, Math.PI), stripe, 0, 0.32, z);
    for (const [x, z] of [
      [-0.14, 0.24],
      [0.14, 0.24],
      [-0.15, -0.22],
      [0.15, -0.22],
    ]) {
      const geo = new THREE.CylinderGeometry(0.06, 0.055, 0.2, 10);
      geo.translate(0, -0.1, 0);
      const leg = part(this.rig, geo, fur, x, 0.2, z);
      part(leg, ball, cream, 0, -0.19, 0.02, 0.065, 0.035, 0.085);
      this.legs.push(leg);
    }
    this.head.position.set(0, 0.47, 0.4);
    this.rig.add(this.head);
    part(this.head, ball, fur, 0, 0, 0, 0.19, 0.165, 0.17);
    part(this.head, ball, fur, -0.12, -0.05, 0.04, 0.09, 0.08, 0.09);
    part(this.head, ball, fur, 0.12, -0.05, 0.04, 0.09, 0.08, 0.09);
    part(this.head, ball, cream, 0, -0.05, 0.13, 0.085, 0.06, 0.06);
    part(this.head, ball, dark, 0, -0.02, 0.185, 0.02, 0.014, 0.012);
    this.jaw = part(this.head, ball, dark, 0, -0.085, 0.16, 0.035, 0.004, 0.02);
    for (const s of [-1, 1]) {
      const ear = part(this.head, new THREE.ConeGeometry(0.06, 0.11, 4), fur, s * 0.11, 0.17, 0);
      ear.rotation.set(0, Math.PI / 4, -s * 0.3);
      const pupil = part(this.head, ball, eye, s * 0.075, 0.03, 0.148, 0.032, 0.026, 0.012);
      part(pupil, ball, dark, 0, 0, 0.6, 0.22, 0.8, 0.5);
    }
    // Tail in two segments so it can question-mark.
    this.tail.position.set(0, 0.42, -0.38);
    this.rig.add(this.tail);
    const seg = new THREE.CapsuleGeometry(0.04, 0.26, 3, 8);
    seg.translate(0, 0.15, 0);
    part(this.tail, seg, fur, 0, 0, 0);
    this.tailTip.position.y = 0.3;
    this.tail.add(this.tailTip);
    part(this.tailTip, seg, stripe, 0, 0, 0);

    this.group.add(this.rig);
    this.group.scale.setScalar(1.35);
    this.group.position.set(-REACH + 1, 0, LIP_Z);
    this.group.userData.cat = true;
    scene.add(this.group);
  }

  anchor(out: THREE.Vector3) {
    return this.head.getWorldPosition(out).setY(out.y + 0.42);
  }

  meow() {
    this.meowing = 2.6;
  }

  update(sig: Signals, dt: number) {
    const t = sig.time;
    const g = this.group;
    this.meowing = Math.max(0, this.meowing - dt);
    const stopped = this.meowing > 0;
    if (!stopped && !sig.reduced) {
      this.clock -= dt;
      if (this.clock <= 0) {
        this.sitting = !this.sitting;
        this.clock = this.sitting ? 6 : 14 + Math.random() * 16;
      }
    }
    const sitting = this.sitting && !stopped;
    this.settle += ((sitting ? 1 : 0) - this.settle) * Math.min(1, dt * 3);
    const walking = !stopped && !sig.reduced && this.settle < 0.1;
    if (walking) {
      g.position.x += this.heading * 0.42 * dt;
      if (Math.abs(g.position.x) > REACH) {
        this.heading = -Math.sign(g.position.x);
        g.position.x = Math.sign(g.position.x) * REACH;
      }
      this.stride += dt * 5.2;
    }
    // Turn to walk, or to face whoever poked it.
    let want = (this.heading * Math.PI) / 2;
    if (stopped) {
      this.look.copy(this.camera.position).sub(g.position);
      want = Math.atan2(this.look.x, this.look.z);
    } else if (this.settle > 0.1) want = this.heading * 0.5;
    let turn = want - g.rotation.y;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    g.rotation.y += turn * Math.min(1, dt * 4);

    const swing = walking ? 1 : 0;
    this.legs.forEach((leg, i) => {
      const phase = this.stride + (i === 0 || i === 3 ? 0 : Math.PI);
      leg.rotation.x = Math.sin(phase) * 0.55 * swing;
      leg.scale.y = 1 - this.settle * 0.6;
    });
    // The belly swings opposite the shoulders. This is a lot of cat.
    this.rig.position.y = -this.settle * 0.1 + Math.abs(Math.sin(this.stride)) * 0.012 * swing;
    this.rig.rotation.z = Math.sin(this.stride) * 0.05 * swing;
    const hop = stopped
      ? Math.max(0, Math.sin((2.6 - this.meowing) * 9)) * 0.12 * (this.meowing / 2.6)
      : 0;
    g.position.y = hop;
    this.head.rotation.set(
      stopped ? -0.25 : Math.sin(t * 0.6) * 0.06,
      stopped ? 0 : Math.sin(t * 0.43) * 0.35,
      0,
    );
    this.jaw.scale.y = stopped && this.meowing > 1.6 ? 0.03 : 0.004;
    this.tail.rotation.set(-0.5 - this.settle * 0.6, 0, Math.sin(t * 1.7) * 0.3);
    this.tailTip.rotation.set(0.9 + Math.sin(t * 2.3) * 0.35, 0, Math.sin(t * 1.9 + 1) * 0.4);
  }
}
