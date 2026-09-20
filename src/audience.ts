import {
  audienceBankSchema,
  audienceGain,
  defaultAudienceControls,
  defaultAudienceDirection,
  readAudienceControls,
  readAudienceDirection,
  type AudienceBank,
  type AudienceControls,
  type AudienceDirection,
  type AudienceMood,
  type AudienceSample,
} from '../shared/audience';

export interface AudienceStatus {
  source: 'procedural' | 'generated' | 'mixed';
  label: string;
  readySamples: number;
  approvedSamples: number;
  active: boolean;
  error?: string;
}
interface Voice {
  source: AudioBufferSourceNode;
  envelope: GainNode;
  end: number;
}
type Clip = { id: string; buffer: AudioBuffer; kind: 'bed' | 'reaction'; generated: boolean };
function randomGenerator(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let v = state;
    v = Math.imul(v ^ (v >>> 15), v | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(text: string) {
  let n = 2166136261;
  for (const c of text) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}

/** A deliberately modest synthesized room / handclap texture, NOT generated human voices. */
export function proceduralAudience(
  kind: 'bed' | 'reaction',
  seed: number,
  sampleRate = 22050,
  seconds = kind === 'bed' ? 12 : 5,
) {
  const count = Math.floor(sampleRate * Math.min(30, Math.max(2, seconds)));
  const channels = [new Float32Array(count), new Float32Array(count)];
  const random = randomGenerator(seed);
  for (const channel of channels) {
    let low = 0,
      slow = 0;
    for (let i = 0; i < count; i++) {
      const noise = random() * 2 - 1;
      low += 0.095 * (noise - low);
      slow += 0.009 * (low - slow);
      const t = i / sampleRate;
      channel[i] = (low - slow) * (0.24 + 0.08 * Math.sin(t * 1.17) + 0.04 * Math.sin(t * 2.79));
    }
    if (kind === 'reaction') {
      // Many small scattered filtered-noise claps, with a gentle group envelope.
      for (let j = 0; j < seconds * 15; j++) {
        const onset = Math.floor((0.2 + random() * (seconds - 0.5)) * sampleRate);
        const strength = 0.12 + random() * 0.14;
        let body = 0;
        for (let k = 0; k < sampleRate * 0.12 && onset + k < count; k++) {
          body += 0.35 * (random() * 2 - 1 - body);
          channel[onset + k] += body * strength * Math.exp(-k / (sampleRate * 0.025));
        }
      }
    }
  }
  calibrateAudience(channels);
  return channels;
}

/** Equal loudness target with an independent peak ceiling; never amplify silent/bad input. */
export function calibrateAudience(channels: Float32Array[]) {
  let power = 0,
    peak = 0,
    count = 0;
  for (const data of channels)
    for (let i = 0; i < data.length; i++) {
      const value = Number.isFinite(data[i]) ? data[i] : 0;
      data[i] = value;
      power += value * value;
      peak = Math.max(peak, Math.abs(value));
      count++;
    }
  const rms = Math.sqrt(power / Math.max(1, count));
  const scale = rms > 0.0001 ? Math.min(0.1 / rms, 0.5 / Math.max(peak, 0.0001), 10) : 0;
  for (const data of channels) for (let i = 0; i < data.length; i++) data[i] *= scale;
  return { rms: rms * scale, peak: peak * scale };
}

/** One listener's player. No model calls, no microphone, no ownership of the shared AudioContext.
 * The host calls tick() from its existing audio scheduler (25–250 ms).
 */
export class AudiencePlayer {
  readonly output: GainNode;
  private readonly meter: AnalyserNode;
  private readonly meterData = new Float32Array(2048);
  private readonly input: GainNode;
  private controls = defaultAudienceControls();
  private direction = defaultAudienceDirection();
  private pending: { at: number; direction: AudienceDirection }[] = [];
  private voices = new Set<Voice>();
  private bank: AudienceBank | null = null;
  private cache = new Map<string, Clip>();
  private loading = new Set<string>();
  private failed = new Set<string>();
  private fallback = new Map<string, Clip>();
  private abort = new AbortController();
  private random = randomGenerator(1);
  private playing = false;
  private disposed = false;
  private nextBed = 0;
  private nextReaction = Infinity;
  private lastBed = '';
  private lastReaction = '';
  private error: string | undefined;

  constructor(
    private context: BaseAudioContext,
    destination: AudioNode = context.destination,
  ) {
    this.input = context.createGain();
    this.output = context.createGain();
    this.output.gain.value = 0;
    this.meter = context.createAnalyser();
    this.meter.fftSize = 2048;
    this.input.connect(this.output);
    this.output.connect(this.meter);
    this.meter.connect(destination);
  }

  get status(): AudienceStatus {
    const approved = this.bank?.samples.filter((s) => s.approved) ?? [];
    const ready = [...this.cache.values()];
    const hasBeds = ready.some((s) => s.kind === 'bed'),
      hasReactions = ready.some((s) => s.kind === 'reaction');
    const source = hasBeds && hasReactions ? 'generated' : ready.length ? 'mixed' : 'procedural';
    return {
      source,
      label:
        source === 'generated'
          ? 'Generated audience samples'
          : source === 'mixed'
            ? 'Generated samples + procedural fallback'
            : 'Procedural room + applause · no generated voices',
      readySamples: ready.length,
      approvedSamples: approved.length,
      active: this.playing && this.controls.enabled && this.direction.mood !== 'quiet',
      ...(this.error ? { error: this.error } : {}),
    };
  }

  /** Missing/rejected banks leave the honest procedural fallback usable. Assets must be same-origin. */
  async loadBank(url = '/audience/manifest.json'): Promise<AudienceStatus> {
    if (this.disposed) return this.status;
    if (url !== '/audience/manifest.json')
      throw new Error('Audience manifest must use the local /audience/manifest.json path');
    try {
      const response = await fetch(url, { signal: this.abort.signal });
      if (response.status === 404) return this.status;
      if (!response.ok) throw new Error('Audience manifest unavailable');
      const raw = await response.text();
      if (raw.length > 500_000) throw new Error('Audience manifest too large');
      const bank = audienceBankSchema.parse(JSON.parse(raw));
      if (this.disposed) return this.status;
      this.bank = bank;
      // A short warm cache: at most 12 decoded clips, two concurrent downloads.
      const approved = bank.samples.filter((s) => s.approved);
      const warm = [
        ...approved.filter((s) => s.kind === 'bed').slice(0, 3),
        ...approved.filter((s) => s.kind === 'reaction').slice(0, 2),
      ];
      for (let i = 0; i < warm.length; i += 2)
        await Promise.all(warm.slice(i, i + 2).map((s) => this.loadClip(s)));
    } catch {
      if (!this.disposed)
        this.error = 'Audience sample bank unavailable; using procedural ambience.';
    }
    return this.status;
  }

  private async loadClip(sample: AudienceSample) {
    if (
      this.disposed ||
      this.cache.has(sample.id) ||
      this.loading.has(sample.id) ||
      this.failed.has(sample.id) ||
      this.loading.size >= 2
    )
      return;
    this.loading.add(sample.id);
    try {
      const response = await fetch(sample.path, { signal: this.abort.signal });
      if (!response.ok || Number(response.headers.get('Content-Length') || 0) > 6_000_000)
        throw new Error('Invalid audience clip');
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 6_000_000) throw new Error('Audience clip too large');
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      if ([...digest].map((n) => n.toString(16).padStart(2, '0')).join('') !== sample.sha256)
        throw new Error('Audience clip hash mismatch');
      const buffer = await this.context.decodeAudioData(bytes);
      if (
        buffer.duration < 2 ||
        buffer.duration > 30.2 ||
        buffer.numberOfChannels > 2 ||
        buffer.length * buffer.numberOfChannels > 3_000_000
      )
        throw new Error('Invalid decoded audience clip');
      if (this.disposed) return;
      calibrateAudience(
        Array.from({ length: buffer.numberOfChannels }, (_, n) => buffer.getChannelData(n)),
      );
      while (this.cache.size >= 12) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(sample.id, { id: sample.id, buffer, kind: sample.kind, generated: true });
    } catch {
      if (!this.disposed) {
        this.failed.add(sample.id);
        this.error =
          'Some audience samples were unavailable; procedural fallback remains available.';
      }
    } finally {
      this.loading.delete(sample.id);
    }
  }

  start(seed: string | number = 1) {
    if (this.disposed || this.playing) return;
    this.random = randomGenerator(typeof seed === 'string' ? hash(seed) : seed);
    this.playing = true;
    this.nextBed = this.context.currentTime + 0.03;
    this.nextReaction = this.context.currentTime + 12 + this.random() * 15;
    this.applyGain(this.context.currentTime);
    this.tick();
  }

  setControls(value: AudienceControls) {
    this.controls = readAudienceControls(value);
    if (!this.disposed) this.applyGain(this.context.currentTime);
  }
  setDirection(value: AudienceDirection, at = this.context.currentTime) {
    if (this.disposed) return;
    const direction = readAudienceDirection(value);
    if (!Number.isFinite(at) || at <= this.context.currentTime) {
      // An immediate manual choice supersedes Jev cues already in the lookahead.
      // Otherwise the next scheduler tick could silently undo the listener's choice.
      this.pending = [];
      this.direction = direction;
      this.applyGain(this.context.currentTime);
    } else {
      this.pending.push({ at, direction });
      this.pending.sort((a, b) => a.at - b.at);
      this.pending = this.pending.slice(-32);
    }
  }
  private applyGain(at: number) {
    this.output.gain.cancelScheduledValues(at);
    this.output.gain.setTargetAtTime(
      this.playing ? audienceGain(this.direction, this.controls) : 0,
      at,
      0.3,
    );
  }

  tick(now = this.context.currentTime) {
    if (this.disposed || !this.playing) return;
    while (this.pending[0]?.at <= now + 0.001) {
      this.direction = this.pending.shift()!.direction;
      this.applyGain(now);
    }
    if (!this.controls.enabled || this.direction.mood === 'quiet') {
      this.nextBed = now + 0.05;
      this.nextReaction = Math.max(this.nextReaction, now + 3);
      return;
    }
    if (this.nextBed <= now + 0.3) {
      const at = Math.max(now + 0.02, this.nextBed);
      const clip = this.choose('bed', this.direction.mood, this.lastBed);
      this.lastBed = clip.id;
      this.play(
        clip,
        at,
        Math.min(2.5, clip.buffer.duration / 3),
        this.direction.mood === 'grooving' ? 1 : 0.8,
      );
      this.nextBed = at + clip.buffer.duration - Math.min(2.5, clip.buffer.duration / 3);
    }
    if (
      this.controls.reactions &&
      ['applause', 'cheering'].includes(this.direction.mood) &&
      this.nextReaction <= now + 0.3
    ) {
      const clip = this.choose('reaction', this.direction.mood, this.lastReaction);
      this.lastReaction = clip.id;
      this.play(clip, now + 0.03, Math.min(0.9, clip.buffer.duration / 3), 0.7);
      // Persistent applause classifications cannot create a never-ending roar.
      this.nextReaction = now + 22 + this.random() * 24;
    }
  }

  private choose(kind: 'bed' | 'reaction', mood: AudienceMood, previous: string): Clip {
    const approved = this.bank?.samples.filter((s) => s.approved && s.kind === kind) ?? [];
    const matching = approved.filter((s) => s.mood === mood);
    const pool = matching.length ? matching : approved;
    const candidates = pool.filter((s) => s.id !== previous);
    const sample = (candidates.length ? candidates : pool)[
      Math.floor(this.random() * Math.max(1, candidates.length || pool.length))
    ];
    if (sample) {
      const ready = this.cache.get(sample.id);
      if (ready) {
        this.cache.delete(sample.id);
        this.cache.set(sample.id, ready);
        return ready;
      }
      void this.loadClip(sample);
    }
    const ready = [...this.cache.values()].filter((s) => s.kind === kind && s.id !== previous);
    if (ready.length) return ready[Math.floor(this.random() * ready.length)];
    const variant = Math.floor(this.random() * 3);
    const id = `procedural-${kind}-${variant}`;
    let clip = this.fallback.get(id);
    if (!clip) {
      const channels = proceduralAudience(kind, hash(id));
      const buffer = this.context.createBuffer(2, channels[0].length, 22050);
      channels.forEach((c, n) => buffer.copyToChannel(c as Float32Array<ArrayBuffer>, n));
      clip = { id, buffer, kind, generated: false };
      this.fallback.set(id, clip);
    }
    return clip;
  }

  private play(clip: Clip, at: number, fade: number, level: number) {
    // The scheduler cannot accumulate an unbounded number of sources after tab suspension.
    if (this.voices.size >= 5) return;
    const source = this.context.createBufferSource(),
      envelope = this.context.createGain();
    source.buffer = clip.buffer;
    const end = at + clip.buffer.duration;
    const up = Float32Array.from(
      { length: 65 },
      (_, i) => Math.sin(((i / 64) * Math.PI) / 2) * level,
    );
    const down = Float32Array.from(up).reverse();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.setValueCurveAtTime(up, at, fade);
    envelope.gain.setValueAtTime(level, end - fade);
    envelope.gain.setValueCurveAtTime(down, end - fade, fade);
    source.connect(envelope);
    envelope.connect(this.input);
    const voice = { source, envelope, end };
    this.voices.add(voice);
    source.onended = () => {
      source.disconnect();
      envelope.disconnect();
      this.voices.delete(voice);
    };
    source.start(at);
    source.stop(end + 0.02);
  }

  referenceLevel() {
    this.meter.getFloatTimeDomainData(this.meterData);
    let power = 0,
      peak = 0;
    for (const n of this.meterData) {
      power += n * n;
      peak = Math.max(peak, Math.abs(n));
    }
    return {
      rmsDb: Math.max(
        -100,
        20 * Math.log10(Math.max(0.00001, Math.sqrt(power / this.meterData.length))),
      ),
      peakDb: Math.max(-100, 20 * Math.log10(Math.max(0.00001, peak))),
    };
  }

  stop() {
    if (this.disposed) return;
    this.playing = false;
    this.pending = [];
    this.applyGain(this.context.currentTime);
    for (const voice of this.voices) {
      try {
        voice.source.stop(this.context.currentTime + 1.2);
      } catch {
        /* Already ended. */
      }
    }
  }
  dispose() {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.abort.abort();
    // Do not close the band's shared AudioContext.
    for (const voice of this.voices) {
      try {
        voice.source.stop();
      } catch {
        /* Already ended. */
      }
      voice.source.disconnect();
      voice.envelope.disconnect();
    }
    this.voices.clear();
    this.cache.clear();
    this.fallback.clear();
    this.input.disconnect();
    this.output.disconnect();
    this.meter.disconnect();
  }
}
