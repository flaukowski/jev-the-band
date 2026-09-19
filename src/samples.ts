export interface SampleEntry {
  bank: string;
  midi: number;
  articulation: string;
  velocity: number;
  url: string;
}
export class SampleBank {
  private buffers: (SampleEntry & { buffer: AudioBuffer })[] = [];
  private loading?: Promise<void>;
  private takes = new Map<string, number>();
  status = 'Recorded instruments not loaded';
  loaded = 0;
  total = 0;
  load(context: AudioContext): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = this.fetchAll(context);
    return this.loading;
  }
  private async fetchAll(context: AudioContext) {
    try {
      this.status = 'Loading recorded instruments…';
      const response = await fetch('/samples/manifest.json', {
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('Manifest unavailable');
      const manifest: SampleEntry[] = await response.json();
      this.total = manifest.length;
      let cursor = 0;
      await Promise.all(
        Array.from({ length: 6 }, async () => {
          while (cursor < manifest.length) {
            const entry = manifest[cursor++];
            try {
              const r = await fetch(entry.url, { signal: AbortSignal.timeout(15000) });
              if (!r.ok) throw new Error('Sample unavailable');
              const buffer = await context.decodeAudioData(await r.arrayBuffer());
              let peak = 0;
              for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                for (const value of buffer.getChannelData(channel))
                  peak = Math.max(peak, Math.abs(value));
              }
              // Preserve each recording's envelope; normalize only its fixed recording gain.
              if (peak > 0.001)
                for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                  const data = buffer.getChannelData(channel);
                  for (let i = 0; i < data.length; i++) data[i] *= 0.8 / peak;
                }
              this.buffers.push({ ...entry, buffer });
              this.loaded++;
              this.status = `Loading recorded instruments… ${this.loaded}/${this.total}`;
            } catch {
              /* A missing voice uses the explicitly labeled synthesis fallback. */
            }
          }
        }),
      );
      this.status =
        this.loaded === this.total
          ? `${this.loaded} recorded samples ready`
          : `${this.loaded}/${this.total} samples loaded · synthesis fallback for missing voices`;
    } catch {
      this.status = 'Samples unavailable · synthesis fallback';
    }
  }
  select(bank: string, midi: number, velocity: number, articulation: string) {
    let candidates = this.buffers.filter((s) => s.bank === bank);
    if (!candidates.length) return null;
    const matching = candidates.filter((s) => s.articulation === articulation);
    candidates = matching.length
      ? matching
      : candidates.filter((s) => s.articulation === 'natural');
    if (!candidates.length) return null;
    const distance = Math.min(...candidates.map((s) => Math.abs(s.midi - midi)));
    candidates = candidates.filter((s) => Math.abs(s.midi - midi) === distance);
    const dynamic = Math.min(...candidates.map((s) => Math.abs(s.velocity - velocity)));
    candidates = candidates
      .filter((s) => Math.abs(s.velocity - velocity) === dynamic)
      .sort((a, b) => a.url.localeCompare(b.url));
    const key = `${bank}:${candidates[0].midi}:${articulation}:${candidates[0].velocity}`;
    const take = this.takes.get(key) ?? 0;
    this.takes.set(key, take + 1);
    return candidates[take % candidates.length];
  }
}
