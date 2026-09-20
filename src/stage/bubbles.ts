import * as THREE from 'three';

interface Bubble {
  el: HTMLDivElement;
  anchor: (out: THREE.Vector3) => THREE.Vector3;
  life: number;
  key: string;
}

/**
 * Speech bubbles pinned to things in the scene. They are DOM, not geometry, so the words stay
 * crisp and stay out of the bloom and feedback passes.
 */
export class Bubbles {
  private readonly layer = document.createElement('div');
  private readonly live: Bubble[] = [];
  private readonly p = new THREE.Vector3();

  constructor(
    private readonly container: HTMLElement,
    private readonly camera: THREE.Camera,
  ) {
    this.layer.className = 'stage-bubbles';
    this.layer.setAttribute('aria-hidden', 'true');
    container.appendChild(this.layer);
  }

  has(key: string) {
    return this.live.some((b) => b.key === key);
  }

  count(prefix: string) {
    return this.live.filter((b) => b.key.startsWith(prefix)).length;
  }

  /** Is this point comfortably on screen and close enough to read as a person? */
  visible(world: THREE.Vector3, reach: number) {
    if (this.camera.position.distanceTo(world) > reach) return false;
    const p = this.p.copy(world).project(this.camera);
    return p.z < 1 && Math.abs(p.x) < 0.82 && p.y > -0.85 && p.y < 0.6;
  }

  say(
    key: string,
    text: string,
    anchor: (out: THREE.Vector3) => THREE.Vector3,
    seconds = 3 + text.length * 0.055,
    tone = '',
  ) {
    const old = this.live.findIndex((b) => b.key === key);
    if (old >= 0) this.live.splice(old, 1)[0].el.remove();
    const el = document.createElement('div');
    el.className = `stage-bubble ${tone}`.trim();
    el.textContent = text;
    this.layer.appendChild(el);
    this.live.push({ el, anchor, life: seconds, key });
  }

  update(dt: number) {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const b = this.live[i];
      b.life -= dt;
      if (b.life <= 0) {
        b.el.remove();
        this.live.splice(i, 1);
        continue;
      }
      const world = b.anchor(this.p);
      const distance = this.camera.position.distanceTo(world);
      const p = world.project(this.camera);
      const shown = p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05;
      b.el.style.opacity = shown ? (b.life < 0.4 ? String(b.life / 0.4) : '1') : '0';
      if (!shown) continue;
      const scale = Math.min(1.1, Math.max(0.62, 11 / distance));
      b.el.style.transform =
        `translate(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h}px) ` +
        `translate(-50%, -100%) scale(${scale.toFixed(3)})`;
    }
  }

  dispose() {
    this.layer.remove();
    this.live.length = 0;
  }
}
