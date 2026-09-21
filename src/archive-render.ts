import { BandAudio } from './audio';
import type { Snapshot } from '../shared/music';
// Internal worker entry, with no app, live subscription or provider access.
declare global {
  interface Window {
    renderArchive: (snapshot: Snapshot) => Promise<{ samples: number; peak: number }>;
    archivePCM: (base64: string) => Promise<void>;
  }
}
window.renderArchive = async (snapshot) => {
  const from = snapshot.frames[0].at;
  const to = snapshot.endedAt!;
  if (!(to > from) || to - from > 660000) throw new Error('Invalid recording duration');
  const audio = new BandAudio();
  audio.volume = 1;
  const buffer = await audio.renderOffline(snapshot.frames, from, to);
  const left = buffer.getChannelData(0),
    right = buffer.getChannelData(1);
  let peak = 0;
  for (let offset = 0; offset < buffer.length; offset += 16384) {
    const count = Math.min(16384, buffer.length - offset);
    const bytes = new Uint8Array(count * 4);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < count; i++) {
      const l = left[offset + i],
        r = right[offset + i];
      if (!Number.isFinite(l) || !Number.isFinite(r)) throw new Error('Non-finite audio');
      peak = Math.max(peak, Math.abs(l), Math.abs(r));
      view.setInt16(i * 4, Math.round(Math.max(-1, Math.min(1, l)) * 32767), true);
      view.setInt16(i * 4 + 2, Math.round(Math.max(-1, Math.min(1, r)) * 32767), true);
    }
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    await window.archivePCM(btoa(binary));
  }
  return { samples: buffer.length, peak };
};
