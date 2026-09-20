import * as THREE from 'three';
import { random } from '../../shared/music';

/** Every surface on stage is painted here at load. No image downloads, no licences to track. */
const made: THREE.Texture[] = [];
type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function paint(w: number, h: number, draw: Draw, srgb = true, repeat?: [number, number]) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d')!, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...repeat);
  }
  made.push(texture);
  return texture;
}
export function disposeTextures() {
  made.splice(0).forEach((t) => t.dispose());
}
const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;
const shade = (hex: number, k: number) => {
  const c = new THREE.Color(hex).multiplyScalar(k);
  return `rgb(${Math.round(Math.min(1, c.r) * 255)},${Math.round(Math.min(1, c.g) * 255)},${Math.round(Math.min(1, c.b) * 255)})`;
};

/** Worn stage deck: long boards, grain, scuffs and gaffer-tape marks. */
export function stageDeck() {
  const draw =
    (bump: boolean): Draw =>
    (ctx, w, h) => {
      const rng = random(90210);
      const boards = 16;
      for (let i = 0; i < boards; i++) {
        const x = (i / boards) * w;
        const tone = 0.75 + rng() * 0.4;
        ctx.fillStyle = bump ? `rgb(${150 + rng() * 40},0,0)` : shade(0x2a2119, tone);
        ctx.fillRect(x, 0, w / boards, h);
        for (let g = 0; g < 70; g++) {
          const gx = x + rng() * (w / boards);
          ctx.strokeStyle = bump
            ? `rgba(${rng() > 0.5 ? 255 : 0},0,0,0.12)`
            : `rgba(${rng() > 0.6 ? '90,70,50' : '0,0,0'},${0.05 + rng() * 0.12})`;
          ctx.lineWidth = 0.6 + rng() * 1.4;
          ctx.beginPath();
          ctx.moveTo(gx, 0);
          ctx.bezierCurveTo(
            gx + rng() * 8 - 4,
            h * 0.3,
            gx + rng() * 8 - 4,
            h * 0.7,
            gx + rng() * 6 - 3,
            h,
          );
          ctx.stroke();
        }
        ctx.fillStyle = bump ? 'rgb(0,0,0)' : 'rgba(0,0,0,0.75)';
        ctx.fillRect(x, 0, 2, h);
        for (let j = 0; j < 3; j++) ctx.fillRect(x, rng() * h, w / boards, 2);
      }
      if (!bump) {
        for (let i = 0; i < 260; i++) {
          ctx.fillStyle = `rgba(255,240,220,${rng() * 0.035})`;
          ctx.beginPath();
          ctx.ellipse(rng() * w, rng() * h, 4 + rng() * 40, 1 + rng() * 5, rng() * 3, 0, 7);
          ctx.fill();
        }
        // Spike marks: someone taped these positions at soundcheck.
        for (const [x, y, c] of [
          [0.23, 0.55, '#d8ff66'],
          [0.41, 0.6, '#ff7ab8'],
          [0.75, 0.5, '#7cdedc'],
        ] as const) {
          ctx.fillStyle = c;
          ctx.globalAlpha = 0.55;
          ctx.fillRect(x * w - 14, y * h - 2, 28, 4);
          ctx.fillRect(x * w - 2, y * h - 14, 4, 28);
          ctx.globalAlpha = 1;
        }
      }
    };
  return { map: paint(1024, 1024, draw(false)), bump: paint(1024, 1024, draw(true), false) };
}

/** Salt-and-pepper amp grille cloth, or tighter black PA mesh. */
export function grille(base: number, fleck: number, scale = 6) {
  return paint(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = css(base);
      ctx.fillRect(0, 0, w, h);
      const rng = random(base);
      for (let y = 0; y < h; y += scale)
        for (let x = 0; x < w; x += scale) {
          ctx.fillStyle =
            (x / scale + y / scale) % 2
              ? shade(fleck, 0.7 + rng() * 0.5)
              : shade(base, 0.6 + rng() * 0.5);
          ctx.fillRect(x, y, scale - 1, scale - 1);
        }
    },
    true,
    [3, 3],
  );
}

/** Pebbled tolex / road-case texture as a bump map. */
export function pebble() {
  return paint(
    256,
    256,
    (ctx, w, h) => {
      const rng = random(4417);
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 5000; i++) {
        const v = Math.round(rng() * 255);
        ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
        ctx.beginPath();
        ctx.arc(rng() * w, rng() * h, 0.8 + rng() * 2.2, 0, 7);
        ctx.fill();
      }
    },
    false,
    [4, 4],
  );
}

/** Woven cloth bump shared by shirts, curtains and the banner. */
export function weave() {
  return paint(
    128,
    128,
    (ctx, w, h) => {
      for (let y = 0; y < h; y += 4)
        for (let x = 0; x < w; x += 4) {
          const v = (x / 4 + y / 4) % 2 ? 165 : 95;
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.fillRect(x, y, 4, 4);
        }
    },
    false,
    [10, 10],
  );
}

/** Hand-dyed spiral. Each player's shirt is cut from their own persona colour. */
export function tieDye(colors: number[], seed: number, arms = 5) {
  return paint(256, 256, (ctx, w, h) => {
    const rng = random(seed);
    const image = ctx.createImageData(w, h);
    const cols = colors.map((c) => new THREE.Color(c));
    const cx = w * (0.42 + rng() * 0.16);
    const cy = h * (0.4 + rng() * 0.16);
    const wobble = 0.5 + rng();
    const tmp = new THREE.Color();
    const undyed = new THREE.Color(0xfff6e0);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const dx = (x - cx) / w;
        const dy = (y - cy) / h;
        const r = Math.hypot(dx, dy);
        const a = Math.atan2(dy, dx);
        let v = (a / (Math.PI * 2)) * arms + r * 7 + Math.sin(r * 38 + a * 3) * 0.09 * wobble;
        v += Math.sin(x * 0.14) * Math.sin(y * 0.18) * 0.12;
        v = ((v % 1) + 1) % 1;
        const f = v * cols.length;
        const i = Math.floor(f);
        const t = f - i;
        // Dye bleeds softly into the next band, with a pale resist line between them.
        const k = t * t * (3 - 2 * t);
        tmp.copy(cols[i % cols.length]).lerp(cols[(i + 1) % cols.length], k);
        const resist = Math.exp(-Math.pow(t * 9, 2)) * 0.35;
        tmp.lerp(undyed, resist * (0.5 + 0.5 * Math.sin(a * 17 + r * 60)));
        const o = (y * w + x) * 4;
        image.data[o] = tmp.r * 255;
        image.data[o + 1] = tmp.g * 255;
        image.data[o + 2] = tmp.b * 255;
        image.data[o + 3] = 255;
      }
    ctx.putImageData(image, 0, 0);
  });
}

export function denim(base = 0x27344d) {
  return paint(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = css(base);
      ctx.fillRect(0, 0, w, h);
      const rng = random(51);
      for (let i = -h; i < w; i += 3) {
        ctx.strokeStyle = `rgba(190,205,235,${0.05 + rng() * 0.1})`;
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + h, h);
        ctx.stroke();
      }
    },
    true,
    [3, 5],
  );
}

/** The drum riser rug. Every jam band has one and it is always a little crooked. */
export function rug() {
  return paint(512, 768, (ctx, w, h) => {
    const rng = random(1977);
    ctx.fillStyle = '#5a1420';
    ctx.fillRect(0, 0, w, h);
    const ring = (inset: number, color: string, width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
    };
    ring(10, '#d9b36a', 10);
    ring(30, '#142a4a', 22);
    ring(52, '#d9b36a', 4);
    for (let i = 0; i < 40; i++) {
      const t = i / 40;
      ctx.fillStyle = i % 2 ? '#e8d5a0' : '#b8482e';
      for (const [x, y] of [
        [30 + t * (w - 60), 30],
        [30 + t * (w - 60), h - 30],
        [30, 30 + t * (h - 60)],
        [w - 30, 30 + t * (h - 60)],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, 7);
        ctx.fill();
      }
    }
    // Medallion with eightfold symmetry.
    ctx.save();
    ctx.translate(w / 2, h / 2);
    for (let layer = 0; layer < 5; layer++) {
      const radius = 210 - layer * 38;
      ctx.fillStyle = ['#142a4a', '#d9b36a', '#7a1c2c', '#1f5a57', '#e8d5a0'][layer];
      ctx.beginPath();
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        const r = radius * (1 + 0.16 * Math.cos(a * 8)) * (1 + 0.04 * Math.cos(a * 16));
        ctx.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 1.25);
      }
      ctx.fill();
    }
    ctx.restore();
    for (let i = 0; i < 1600; i++) {
      ctx.fillStyle = `rgba(${rng() > 0.5 ? '255,235,200' : '0,0,0'},${rng() * 0.09})`;
      ctx.fillRect(rng() * w, rng() * h, 2, 2 + rng() * 5);
    }
    ctx.fillStyle = '#e8d5a0';
    for (let x = 6; x < w; x += 7) {
      ctx.fillRect(x, 0, 2, 9);
      ctx.fillRect(x, h - 9, 2, 9);
    }
  });
}

const displayFont = "'Barlow Condensed', Impact, 'Arial Narrow', sans-serif";

function wavyText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  size: number,
  spread: number,
  fill: string | CanvasGradient,
  stroke: string,
  lift = 0.16,
) {
  ctx.font = `900 ${size}px ${displayFont}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const chars = [...text];
  chars.forEach((ch, i) => {
    const u = chars.length > 1 ? i / (chars.length - 1) - 0.5 : 0;
    ctx.save();
    // Poster lettering swells in the middle and bows like a fillmore handbill.
    ctx.translate(cx + u * spread, cy + Math.cos(u * Math.PI) * -size * lift + size * lift * 0.5);
    ctx.rotate(u * 0.22);
    ctx.scale(1, 1 + Math.cos(u * Math.PI) * 0.22);
    ctx.lineWidth = size * 0.11;
    ctx.strokeStyle = stroke;
    ctx.strokeText(ch, 0, 0);
    ctx.fillStyle = fill;
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
}

/** The banner. Fluorescent inks: `glow` is what stays lit under blacklight. */
export function banner() {
  const art =
    (glow: boolean): Draw =>
    (ctx, w, h) => {
      const rng = random(1969);
      if (glow) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
      } else {
        // The dye is soft, so paint it at quarter size and let the canvas scale it up.
        const small = document.createElement('canvas');
        const sw = (small.width = w / 4);
        const sh = (small.height = h / 4);
        const sctx = small.getContext('2d')!;
        const image = sctx.createImageData(sw, sh);
        const cols = [0x1a0b3a, 0x5b1fa8, 0xd1267a, 0xff8a2a, 0xffe25a, 0x2ec4a6, 0x163a8c].map(
          (c) => new THREE.Color(c),
        );
        const tmp = new THREE.Color();
        for (let y = 0; y < sh; y++)
          for (let x = 0; x < sw; x++) {
            const dx = (x - sw / 2) / sh;
            const dy = (y - sh * 0.52) / sh;
            const r = Math.hypot(dx, dy);
            const a = Math.atan2(dy, dx);
            let v = (a / (Math.PI * 2)) * 7 + r * 3.2 + Math.sin(r * 22 - a * 4) * 0.07;
            v = ((v % 1) + 1) % 1;
            const f = v * cols.length;
            const i = Math.floor(f);
            const t = f - i;
            tmp.copy(cols[i % cols.length]).lerp(cols[(i + 1) % cols.length], t * t * (3 - 2 * t));
            tmp.multiplyScalar(0.55 + 0.45 * Math.min(1, r * 1.4 + 0.35));
            const o = (y * sw + x) * 4;
            image.data[o] = tmp.r * 255;
            image.data[o + 1] = tmp.g * 255;
            image.data[o + 2] = tmp.b * 255;
            image.data[o + 3] = 255;
          }
        sctx.putImageData(image, 0, 0);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(small, 0, 0, w, h);
      }
      // Radiating eye-of-the-jam rays behind the lettering.
      ctx.save();
      ctx.translate(w / 2, h * 0.52);
      for (let i = 0; i < 48; i++) {
        ctx.rotate((Math.PI * 2) / 48);
        ctx.fillStyle = glow
          ? i % 2
            ? 'rgba(255,60,200,0.35)'
            : 'rgba(0,0,0,0)'
          : i % 2
            ? 'rgba(255,240,180,0.10)'
            : 'rgba(10,0,30,0.12)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(w, -w * 0.03);
        ctx.lineTo(w, w * 0.03);
        ctx.fill();
      }
      ctx.restore();
      const gradient = ctx.createLinearGradient(0, h * 0.1, 0, h * 0.75);
      if (glow) {
        gradient.addColorStop(0, '#caff4a');
        gradient.addColorStop(1, '#4affd0');
      } else {
        gradient.addColorStop(0, '#fff7c2');
        gradient.addColorStop(0.5, '#d8ff66');
        gradient.addColorStop(1, '#ff9ad1');
      }
      wavyText(
        ctx,
        'JEV',
        w / 2,
        h * 0.42,
        h * 0.66,
        w * 0.34,
        gradient,
        glow ? '#000' : '#160a2e',
      );
      wavyText(
        ctx,
        'THE BAND',
        w / 2,
        h * 0.83,
        h * 0.2,
        w * 0.46,
        glow ? '#ff5ad2' : '#fff1d6',
        glow ? '#000' : '#160a2e',
        0.05,
      );
      // Stars and sparks in the margins.
      for (let i = 0; i < 40; i++) {
        const x = rng() * w;
        const y = rng() * h;
        if (Math.abs(x - w / 2) < w * 0.3 && Math.abs(y - h / 2) < h * 0.42) continue;
        const r = 4 + rng() * 14;
        ctx.fillStyle = glow ? '#fff36a' : 'rgba(255,246,200,0.9)';
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const rr = k % 2 ? r * 0.3 : r;
          ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.fill();
      }
      if (!glow) {
        ctx.strokeStyle = '#fff1d6';
        ctx.lineWidth = 10;
        ctx.strokeRect(16, 16, w - 32, h - 32);
        ctx.strokeStyle = '#160a2e';
        ctx.lineWidth = 3;
        ctx.strokeRect(30, 30, w - 60, h - 60);
      }
    };
  return { map: paint(2048, 640, art(false)), glow: paint(1024, 320, art(true)) };
}

/** Front kick head: the band's mark, with a mic port. */
export function kickHead(accent: number) {
  return paint(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#b9b3a2';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2, 0, 7);
    ctx.fill();
    ctx.save();
    ctx.translate(w / 2, h / 2);
    for (let i = 0; i < 24; i++) {
      ctx.rotate((Math.PI * 2) / 24);
      ctx.fillStyle = i % 2 ? css(accent) : '#1a1030';
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, w * 0.47, -0.131, 0.131);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#efe9d6';
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.3, 0, 7);
    ctx.fill();
    ctx.restore();
    wavyText(ctx, 'JEV', w / 2, h * 0.47, h * 0.3, w * 0.3, '#1a1030', '#efe9d6', 0.08);
    ctx.font = `700 ${h * 0.055}px ${displayFont}`;
    ctx.fillStyle = '#1a1030';
    ctx.fillText('T H E   B A N D', w / 2, h * 0.64);
    ctx.fillStyle = '#050505';
    ctx.beginPath();
    ctx.arc(w * 0.74, h * 0.72, w * 0.085, 0, 7);
    ctx.fill();
  });
}

/** Fine vertical streaks so a hair surface reads as thousands of strands. */
export function hairStreaks(base: number) {
  return paint(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = css(base);
      ctx.fillRect(0, 0, w, h);
      const rng = random(base + 7);
      for (let i = 0; i < 420; i++) {
        const x = rng() * w;
        ctx.strokeStyle = rng() > 0.45 ? shade(base, 1.5 + rng() * 1.6) : 'rgba(0,0,0,0.5)';
        ctx.globalAlpha = 0.18 + rng() * 0.3;
        ctx.lineWidth = 0.6 + rng() * 1.2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(
          x + rng() * 6 - 3,
          h * 0.35,
          x + rng() * 6 - 3,
          h * 0.7,
          x + rng() * 8 - 4,
          h,
        );
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    true,
    [3, 1],
  );
}

/** Soft round sprite for particles, lens glows and haze. */
export function softDot() {
  return paint(
    128,
    128,
    (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    false,
  );
}

/** Small engraved control-panel label. */
export function label(text: string, fg = '#e8e0c8', bg = '#15171a') {
  return paint(256, 64, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg;
    ctx.font = `700 40px ${displayFont}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 2);
  });
}
