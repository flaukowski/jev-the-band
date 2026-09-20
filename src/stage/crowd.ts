import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { random } from '../../shared/music';
import type { Signals } from './signals';
import { STATION_SCALE } from './performers';

interface Fan {
  x: number;
  z: number;
  height: number;
  phase: number;
  /** How easily this person gets their hands up. */
  spark: number;
  sway: number;
  arms: number;
  stick: number;
}

const GROUND = -0.74;

/**
 * The audience: a few hundred instanced dancers. Everyone moves on the band's beat, but each
 * has their own phase, their own threshold for putting their hands up, and their own dance.
 */
export class Crowd {
  private readonly fans: Fan[] = [];
  private readonly body: THREE.InstancedMesh;
  private readonly head: THREE.InstancedMesh;
  private readonly hair: THREE.InstancedMesh;
  private readonly armL: THREE.InstancedMesh;
  private readonly armR: THREE.InstancedMesh;
  private readonly sticks: THREE.InstancedMesh;
  private readonly stickOwners: number[] = [];
  private readonly balloons: { mesh: THREE.Mesh; v: THREE.Vector3 }[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly arm = new THREE.Object3D();
  private readonly tip = new THREE.Object3D();
  private readonly rng = random(771);
  private readonly color = new THREE.Color();

  constructor(scene: THREE.Scene, lowPower: boolean) {
    const rng = this.rng;
    const rows = lowPower ? 9 : 20;
    for (let row = 0; row < rows; row++) {
      const z = 5.6 + row * 0.92 + (row > 8 ? (row - 8) * 0.25 : 0);
      const half = 11.5 + row * 0.8;
      const step = 0.78 + row * 0.035;
      for (let x = -half; x <= half; x += step) {
        const px = x + (rng() - 0.5) * 0.45;
        const pz = z + (rng() - 0.5) * 0.5;
        // Leave room around the lighting desk.
        if (Math.hypot(px + 6.2, pz - 8.4) < 1.9) continue;
        // The crowd thins toward the back and the edges, like a real field.
        if (rng() < row * 0.02 + Math.max(0, Math.abs(px) - 9) * 0.035) continue;
        this.fans.push({
          x: px,
          z: pz,
          height: 0.88 + rng() * 0.22,
          phase: rng() * Math.PI * 2,
          spark: rng(),
          sway: rng() > 0.5 ? 1 : -1,
          arms: 0,
          stick: rng() < 0.16 ? 1 : 0,
        });
      }
    }
    const n = this.fans.length;
    const cloth = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const torso = new THREE.CapsuleGeometry(0.17, 0.42, 3, 10);
    torso.translate(0, 1.18, 0);
    torso.scale(1, 1, 0.68);
    const legs = [-0.085, 0.085].map((x) => {
      const g = new THREE.CylinderGeometry(0.075, 0.06, 0.86, 8);
      g.translate(x, 0.43, 0);
      return g;
    });
    this.body = new THREE.InstancedMesh(mergeGeometries([torso, ...legs]), cloth, n);
    this.head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.115, 10, 8), cloth, n);
    this.hair = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.123, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
      cloth,
      n,
    );
    const armGeo = new THREE.CapsuleGeometry(0.04, 0.5, 2, 6);
    armGeo.translate(0, -0.27, 0);
    this.armL = new THREE.InstancedMesh(armGeo, cloth, n);
    this.armR = new THREE.InstancedMesh(armGeo, cloth, n);
    this.fans.forEach((f, i) => f.stick && this.stickOwners.push(i));
    this.sticks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.014, 0.014, 0.3, 5),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      Math.max(1, this.stickOwners.length),
    );
    const shirts = [
      0x8a3b2e, 0x2f5d50, 0xd9a441, 0x3b4a7a, 0x7a3b6b, 0xcfc6ae, 0x1f2a2e, 0xb4552d, 0x4f7a3b,
      0x8f8f98, 0xe07a9a, 0x2a2a30,
    ];
    const skins = [0xf0c6a4, 0xd9a47e, 0xb07a55, 0x8a5a3c, 0x5e3d28];
    const hairs = [0x17100d, 0x3b2415, 0x6b4a2a, 0xc39a52, 0x8a2a1c, 0xd9d2c2, 0x2a5a8a];
    this.fans.forEach((_, i) => {
      // Tie-dye is over-represented in this demographic.
      const shirt =
        rng() < 0.3
          ? this.color.setHSL(rng(), 0.75, 0.5)
          : this.color.setHex(shirts[Math.floor(rng() * shirts.length)]);
      this.body.setColorAt(i, shirt);
      const skin = skins[Math.floor(rng() * skins.length)];
      const sleeve = rng() > 0.5;
      const armColor = sleeve ? shirt.clone() : new THREE.Color(skin);
      this.armL.setColorAt(i, armColor);
      this.armR.setColorAt(i, armColor);
      this.head.setColorAt(i, this.color.setHex(skin));
      this.hair.setColorAt(i, this.color.setHex(hairs[Math.floor(rng() * hairs.length)]));
    });
    this.stickOwners.forEach((_, k) =>
      this.sticks.setColorAt(k, this.color.setHSL(rng(), 1, 0.6).multiplyScalar(2.2)),
    );
    for (const m of [this.body, this.head, this.hair, this.armL, this.armR, this.sticks]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      scene.add(m);
    }
    // Balloons kept aloft by whoever is underneath.
    const count = lowPower ? 3 : 7;
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(i / count, 0.9, 0.55),
        roughness: 0.15,
        metalness: 0.1,
        transparent: true,
        opacity: 0.92,
      });
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 12), mat);
      b.scale.y = 1.12;
      b.position.set((rng() - 0.5) * 16, 3 + rng() * 3, 7 + rng() * 8);
      scene.add(b);
      this.balloons.push({
        mesh: b,
        v: new THREE.Vector3((rng() - 0.5) * 0.6, 0, (rng() - 0.5) * 0.6),
      });
    }
  }

  update(sig: Signals, dt: number) {
    const live = sig.playing && !sig.reduced;
    const energy = sig.energy;
    const solo = sig.soloists.length > 0 ? 0.25 : 0;
    const beat = sig.beat;
    const t = sig.time;
    const { dummy, arm, tip } = this;
    const S = STATION_SCALE * 0.98;
    let stickIndex = 0;
    this.fans.forEach((f, i) => {
      const excitement = live ? energy + solo + sig.crash * 0.4 : 0;
      // Front rows go harder.
      const fervour = excitement * (1.25 - Math.min(1, (f.z - 5) / 16) * 0.55);
      const bounce = live
        ? Math.pow(Math.abs(Math.sin((beat + f.phase * 0.06) * Math.PI)), 1.5) *
          (0.03 + fervour * 0.16)
        : 0;
      const sway =
        Math.sin(beat * Math.PI * 0.5 * f.sway + f.phase) * (0.03 + fervour * 0.09) +
        Math.sin(t * 0.4 + f.phase) * 0.015;
      const h = f.height * S;
      dummy.position.set(f.x + sway * 0.5, GROUND + bounce, f.z);
      const yaw = Math.atan2(-f.x * 0.25, -(f.z + 2)) + sway * 0.5;
      dummy.rotation.set(-fervour * 0.06, yaw, sway, 'YXZ');
      dummy.scale.set(S, h, S);
      dummy.updateMatrix();
      this.body.setMatrixAt(i, dummy.matrix);
      // Head nods a touch behind the body.
      const nod = live
        ? Math.sin((beat - 0.08) * Math.PI * 2 + f.phase * 0.1) * 0.05 * (0.4 + fervour)
        : 0;
      dummy.position.set(
        f.x + sway * 0.5 - sway * 1.5 * h,
        GROUND + bounce + 1.62 * h + nod * 0.3,
        f.z - fervour * 0.03,
      );
      dummy.scale.setScalar(S);
      dummy.updateMatrix();
      this.head.setMatrixAt(i, dummy.matrix);
      this.hair.setMatrixAt(i, dummy.matrix);
      // Hands go up when the room is hotter than this person's threshold.
      const want = live && fervour > 0.25 + f.spark * 0.55 ? 1 : 0;
      f.arms += (want - f.arms) * Math.min(1, dt * (want ? 2.5 : 1.2));
      for (const side of [1, -1]) {
        const wave =
          Math.sin(beat * Math.PI * (f.spark > 0.5 ? 1 : 2) + f.phase + side) * 0.25 * f.arms;
        const raise =
          f.arms * (2.75 + wave) +
          (1 - f.arms) *
            (0.12 + Math.sin(beat * Math.PI + f.phase + side * 1.5) * 0.12 * (0.3 + fervour));
        arm.position.set(
          f.x + sway * 0.5 + side * 0.2 * S - sway * 1.3 * h,
          GROUND + bounce + 1.43 * h,
          f.z,
        );
        arm.rotation.set(-raise, yaw, side * (0.15 + f.arms * 0.2), 'YXZ');
        arm.scale.setScalar(S);
        arm.updateMatrix();
        (side === 1 ? this.armL : this.armR).setMatrixAt(i, arm.matrix);
        if (side === -1 && f.stick) {
          tip.position.set(0, -0.62, 0).applyMatrix4(arm.matrix);
          tip.quaternion.copy(arm.quaternion);
          tip.scale.setScalar(S);
          tip.updateMatrix();
          this.sticks.setMatrixAt(stickIndex++, tip.matrix);
        }
      }
    });
    for (const m of [this.body, this.head, this.hair, this.armL, this.armR, this.sticks])
      m.instanceMatrix.needsUpdate = true;

    for (const b of this.balloons) {
      const p = b.mesh.position;
      if (!sig.reduced) {
        b.v.y -= 1.1 * dt;
        b.v.multiplyScalar(1 - dt * 0.35);
        p.addScaledVector(b.v, dt);
        if (p.y < 1.9) {
          // Someone punches it back up, harder when the band is cooking.
          p.y = 1.9;
          b.v.y = 1.6 + this.rng() * 1.2 + energy * 1.6;
          b.v.x = (this.rng() - 0.5) * 2.2 - p.x * 0.06;
          b.v.z = (this.rng() - 0.5) * 2.2 - (p.z - 10) * 0.08;
        }
        b.mesh.rotation.z += b.v.x * dt * 0.5;
      }
    }
  }
}
