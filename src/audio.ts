import { clamp, musicians, type Frame, type Musician, type Note, type Part } from '../shared/music';
import { channelGain, defaultMix, effectiveEffects, type Mix } from '../shared/mixer';
import { guitarSamples } from './guitar';
import { SampleBank } from './samples';

interface Bus {
  input: GainNode;
  distortion: AudioWorkletNode;
  filter: BiquadFilterNode;
  wah: GainNode;
  delay: DelayNode;
  echo: GainNode;
  reverb: ConvolverNode;
  wet: GainNode;
  level: GainNode;
  pan: StereoPannerNode;
  fader: GainNode;
  tone: BiquadFilterNode;
  meter: AnalyserNode;
  meterData: Float32Array<ArrayBuffer>;
  chorus: GainNode;
  tremolo: GainNode;
}
export class BandAudio {
  context?: AudioContext;
  private master?: GainNode;
  private initializing?: Promise<void>;
  private buses = new Map<Musician, Bus>();
  private frames: Frame[] = [];
  private seen = new Set<string>();
  private sources = new Set<AudioScheduledSourceNode>();
  private timer?: number;
  private offset = 0;
  private noise?: AudioBuffer;
  private roomId = '';
  private enabled = false;
  volume = 0.6;
  scheduledNotes = 0;
  private mix: Mix = defaultMix();
  readonly samples = new SampleBank();
  setMix(mix: Mix) {
    this.mix = mix;
    if (!this.context) return;
    const at = this.context.currentTime;
    for (const role of musicians) {
      const bus = this.buses.get(role);
      if (!bus) continue;
      bus.fader.gain.setTargetAtTime(channelGain(mix, role), at, 0.015);
      bus.pan.pan.setTargetAtTime(mix[role].pan, at, 0.025);
      bus.tone.frequency.setTargetAtTime(
        (role === 'guitar' ? 1700 : 2200) * 2 ** (mix[role].tone * (role === 'guitar' ? 1.8 : 2.7)),
        at,
        0.035,
      );
    }
    const frame = this.frames.filter((f) => f.at <= Date.now() + this.offset).at(-1);
    if (frame)
      for (const part of frame.parts)
        this.fx(
          part,
          at,
          frame.bpm,
          frame.parts.some((p) => p.solo),
        );
  }
  levels(): Record<Musician, number> {
    return Object.fromEntries(
      musicians.map((role) => {
        const bus = this.buses.get(role);
        if (!bus || !this.enabled) return [role, 0];
        bus.meter.getFloatTimeDomainData(bus.meterData);
        let peak = 0;
        for (const sample of bus.meterData) peak = Math.max(peak, Math.abs(sample));
        return [role, peak];
      }),
    ) as Record<Musician, number>;
  }
  async enable() {
    if (!this.context) this.initializing = this.init();
    await this.initializing;
    await this.context!.resume();
    await this.samples.load(this.context!);
    this.enabled = true;
    this.master!.gain.setTargetAtTime(this.volume * 0.65, this.context!.currentTime, 0.05);
    if (!this.timer) this.timer = window.setInterval(() => this.tick(), 25);
    this.tick();
  }
  setVolume(value: number) {
    this.volume = clamp(value, 0, 1);
    if (this.context && this.enabled)
      this.master!.gain.setTargetAtTime(this.volume * 0.65, this.context.currentTime, 0.03);
  }
  mute() {
    this.enabled = false;
    if (this.context) this.master!.gain.setTargetAtTime(0, this.context.currentTime, 0.03);
  }
  sync(serverOffset: number) {
    this.offset = serverOffset;
  }
  update(roomId: string, frames: Frame[]) {
    if (roomId !== this.roomId) {
      this.stop();
      this.roomId = roomId;
      this.seen.clear();
      this.scheduledNotes = 0;
      if (this.enabled && this.context)
        this.master!.gain.setTargetAtTime(this.volume * 0.65, this.context.currentTime, 0.03);
    }
    this.frames = frames;
    const earliest = frames[0]?.id ?? 0;
    for (const key of this.seen) if (Number(key.split(':')[0]) < earliest) this.seen.delete(key);
  }
  stop() {
    this.frames = [];
    this.seen.clear();
    if (this.context) this.master!.gain.setTargetAtTime(0, this.context.currentTime, 0.01);
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
    }
    this.sources.clear();
  }
  dispose() {
    this.stop();
    window.clearInterval(this.timer);
    void this.context?.close();
  }
  private async init() {
    const c = (this.context = new AudioContext({ latencyHint: 'interactive' }));
    await c.audioWorklet.addModule(new URL('./drive-processor.js', import.meta.url));
    const master = (this.master = c.createGain());
    master.gain.value = 0;
    const compressor = c.createDynamicsCompressor();
    compressor.threshold.value = -10;
    compressor.knee.value = 12;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;
    master.connect(compressor).connect(c.destination);
    this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const samples = this.noise.getChannelData(0);
    let seed = 43;
    for (let i = 0; i < samples.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      samples[i] = (seed >>> 0) / 2147483648 - 1;
    }
    const impulse = c.createBuffer(2, c.sampleRate * 2, c.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < data.length; i++)
        data[i] =
          samples[(i + channel * 983) % samples.length] * Math.pow(1 - i / data.length, 3) * 0.3;
    }
    musicians.forEach((role, index) => {
      const input = c.createGain();
      const distortion = new AudioWorkletNode(c, 'level-drive');
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 12000;
      filter.Q.value = 1.2;
      const wah = c.createGain();
      const lfo = c.createOscillator();
      lfo.frequency.value = 1.8;
      lfo.connect(wah).connect(filter.frequency);
      wah.gain.value = 0;
      lfo.start();
      const delay = c.createDelay(2);
      delay.delayTime.value = 0.32;
      const feedback = c.createGain();
      feedback.gain.value = 0.3;
      delay.connect(feedback).connect(delay);
      const echo = c.createGain();
      echo.gain.value = 0;
      const wet = c.createGain();
      wet.gain.value = 0.14;
      const reverb = c.createConvolver();
      reverb.buffer = impulse;
      const level = c.createGain();
      level.gain.value = role === 'keys' ? 0.47 : role === 'drums' ? 0.7 : 0.7;
      const pan = c.createStereoPanner();
      pan.pan.value = [-0.4, 0.08, 0.4, 0][index];
      input.connect(distortion).connect(filter);
      const body = c.createBiquadFilter();
      body.type = 'peaking';
      body.frequency.value = 280;
      body.Q.value = 0.75;
      body.gain.value = role === 'guitar' ? 4.5 : 0;
      const tone = c.createBiquadFilter();
      tone.type = 'lowpass';
      tone.Q.value = 0.7;
      const fader = c.createGain();
      const meter = c.createAnalyser();
      meter.fftSize = 1024;
      const chorusDelay = c.createDelay(0.1);
      chorusDelay.delayTime.value = 0.018;
      const chorusLfo = c.createOscillator();
      chorusLfo.frequency.value = 0.8 + index * 0.13;
      const chorusDepth = c.createGain();
      chorusDepth.gain.value = 0.003;
      chorusLfo.connect(chorusDepth).connect(chorusDelay.delayTime);
      chorusLfo.start();
      const chorus = c.createGain();
      chorus.gain.value = 0;
      const tremolo = c.createGain();
      tremolo.gain.value = 0;
      const tremoloLfo = c.createOscillator();
      tremoloLfo.frequency.value = 4.5 + index * 0.2;
      tremoloLfo.connect(tremolo).connect(level.gain);
      tremoloLfo.start();
      filter.connect(body).connect(tone).connect(level);
      tone.connect(delay).connect(echo).connect(level);
      tone.connect(reverb).connect(wet).connect(level);
      tone.connect(chorusDelay).connect(chorus).connect(level);
      const channelCompressor = c.createDynamicsCompressor();
      channelCompressor.threshold.value = -16;
      channelCompressor.knee.value = 10;
      channelCompressor.ratio.value = 3;
      channelCompressor.attack.value = 0.006;
      channelCompressor.release.value = 0.12;
      level.connect(channelCompressor).connect(fader).connect(pan).connect(meter).connect(master);
      this.buses.set(role, {
        input,
        distortion,
        filter,
        wah,
        delay,
        echo,
        reverb,
        wet,
        level,
        pan,
        fader,
        tone,
        meter,
        meterData: new Float32Array(1024),
        chorus,
        tremolo,
      });
    });
    this.setMix(this.mix);
  }
  private tick() {
    const c = this.context;
    if (!c || !this.enabled || c.state !== 'running') return;
    const now = Date.now() + this.offset;
    for (const frame of this.frames) {
      if (frame.at + frame.durationMs < now || frame.at > now + 180) continue;
      for (const part of frame.parts) {
        const busKey = `${frame.id}:${part.role}:fx`;
        if (!this.seen.has(busKey)) {
          this.fx(
            part,
            Math.max(c.currentTime, c.currentTime + (frame.at - now) / 1000),
            frame.bpm,
            frame.parts.some((p) => p.solo),
          );
          this.seen.add(busKey);
        }
        part.notes.forEach((note, index) => {
          const time = frame.at + (note.beat * 60000) / frame.bpm;
          const id = `${frame.id}:${part.role}:${index}`;
          if (this.seen.has(id) || time > now + 180) return;
          this.seen.add(id);
          // Late-joining or background-throttled viewers rejoin the clock, never burst old notes.
          if (time < now - 65) return;
          const at = Math.max(c.currentTime + 0.006, c.currentTime + (time - now) / 1000);
          this.note(part, note, at, (note.duration * 60) / frame.bpm);
          this.scheduledNotes++;
        });
      }
    }
  }
  private fx(part: Part, at: number, bpm: number, hasSolo: boolean) {
    const bus = this.buses.get(part.role)!;
    const e = effectiveEffects(this.mix[part.role], part.decision.effects);
    const focus = part.solo
      ? 1.18
      : hasSolo
        ? part.role === 'guitar' || part.role === 'keys'
          ? 0.6
          : 0.87
        : 1;
    bus.level.gain.setTargetAtTime((part.role === 'keys' ? 0.47 : 0.7) * focus, at, 0.15);
    bus.distortion.parameters.get('enabled')!.setTargetAtTime(e.drive ? 1 : 0, at, 0.03);
    bus.distortion.parameters.get('amount')!.setTargetAtTime(this.mix[part.role].drive, at, 0.03);
    bus.filter.frequency.setTargetAtTime(e.wah ? 1700 : 12000, at, 0.08);
    bus.wah.gain.setTargetAtTime(e.wah ? 1300 : 0, at, 0.08);
    bus.echo.gain.setTargetAtTime(e.delay ? 0.24 : 0, at, 0.06);
    bus.delay.delayTime.setTargetAtTime(45 / bpm, at, 0.08);
    bus.wet.gain.setTargetAtTime(e.reverb ? 0.2 : 0, at, 0.06);
    bus.chorus.gain.setTargetAtTime(e.chorus ? 0.28 : 0, at, 0.06);
    bus.tremolo.gain.setTargetAtTime(e.tremolo ? 0.08 : 0, at, 0.06);
  }
  private track(source: AudioScheduledSourceNode, end: number, nodes: AudioNode[]) {
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
      nodes.forEach((n) => n.disconnect());
    };
    source.stop(end);
  }
  private note(part: Part, note: Note, at: number, duration: number) {
    const role = part.role;
    const c = this.context!;
    let target: AudioNode = this.buses.get(role)!.input;
    const effects = effectiveEffects(this.mix[role], part.decision.effects);
    const extraNodes: AudioNode[] = [];
    if (effects.envelope) {
      // Each performed attack opens its own filter; chords never cancel each other's envelopes.
      const envelope = c.createBiquadFilter();
      envelope.type = 'lowpass';
      envelope.Q.value = 3.5;
      envelope.frequency.setValueAtTime(role === 'bass' ? 160 : 350, at);
      envelope.frequency.exponentialRampToValueAtTime(
        500 + note.velocity * (role === 'bass' ? 1700 : 4200),
        at + 0.018,
      );
      envelope.frequency.exponentialRampToValueAtTime(
        role === 'bass' ? 180 : 500,
        at + Math.max(0.08, Math.min(duration, 0.38)),
      );
      envelope.connect(target);
      target = envelope;
      extraNodes.push(envelope);
    }
    const frequency = 440 * 2 ** ((note.midi - 69) / 12);
    const bank = role === 'keys' ? (note.patch === 'piano' ? 'piano' : '') : role;
    const sample = this.samples.select(
      bank,
      note.midi,
      note.velocity,
      note.articulation ?? 'natural',
    );
    if (sample && (role !== 'drums' || sample.midi === note.midi)) {
      const source = c.createBufferSource();
      source.buffer = sample.buffer;
      source.playbackRate.value = role === 'drums' ? 1 : 2 ** ((note.midi - sample.midi) / 12);
      const gain = c.createGain();
      const level =
        note.velocity *
        (role === 'keys' ? 0.3 : role === 'bass' ? 0.62 : role === 'drums' ? 0.6 : 0.5);
      const sustain = Math.min(duration, sample.buffer.duration / source.playbackRate.value - 0.06);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(level, at + 0.003);
      gain.gain.setValueAtTime(level, at + Math.max(0.004, sustain));
      gain.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(0.01, sustain) + 0.12);
      this.expression(source, note, at, duration, role);
      source.connect(gain).connect(target);
      source.start(at);
      this.track(source, at + Math.max(0.01, sustain) + 0.14, [gain, ...extraNodes]);
      return;
    }
    if (role === 'drums') {
      const gain = c.createGain();
      gain.connect(target);
      if (note.midi === 36 || [45, 47, 50].includes(note.midi)) {
        const osc = c.createOscillator();
        const kick = note.midi === 36;
        const f = kick ? 125 : 110 + (note.midi - 45) * 25;
        osc.frequency.setValueAtTime(f, at);
        osc.frequency.exponentialRampToValueAtTime(kick ? 42 : f * 0.6, at + 0.15);
        gain.gain.setValueAtTime(note.velocity * (kick ? 0.65 : 0.3), at);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
        osc.connect(gain);
        osc.start(at);
        this.track(osc, at + 0.32, [gain, ...extraNodes]);
      } else {
        const source = c.createBufferSource();
        source.buffer = this.noise!;
        const filter = c.createBiquadFilter();
        filter.type = note.midi === 38 ? 'bandpass' : 'highpass';
        filter.frequency.value = note.midi === 38 ? 1800 : 6800;
        const decay = note.midi === 38 ? 0.16 : note.midi === 42 ? 0.045 : 0.65;
        gain.gain.setValueAtTime(note.velocity * (note.midi === 38 ? 0.48 : 0.17), at);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
        source.connect(filter).connect(gain);
        source.start(at);
        this.track(source, at + decay + 0.01, [filter, gain, ...extraNodes]);
      }
      return;
    }
    if (role === 'guitar') {
      const samples = guitarSamples(c.sampleRate, frequency, (duration + 0.35) * 1.2);
      const buffer = c.createBuffer(1, samples.length, c.sampleRate);
      buffer.copyToChannel(samples, 0);
      const source = c.createBufferSource();
      source.buffer = buffer;
      const gain = c.createGain();
      gain.gain.setValueAtTime(note.velocity * 0.85, at);
      gain.gain.setValueAtTime(note.velocity * 0.85, at + duration);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration + 0.12);
      const nodes: AudioNode[] = [gain, ...extraNodes];
      if (note.articulation === 'slide') {
        source.detune.setValueAtTime(-180, at);
        source.detune.linearRampToValueAtTime(0, at + Math.min(0.12, duration / 2));
      }
      if (note.bend) {
        source.detune.setValueAtTime(0, at);
        source.detune.linearRampToValueAtTime(note.bend * 100, at + Math.min(0.2, duration * 0.5));
        source.detune.linearRampToValueAtTime(0, at + duration);
      }
      if (duration > 0.35) {
        const vibrato = c.createOscillator();
        const depth = c.createGain();
        vibrato.frequency.value = 5.1;
        depth.gain.setValueAtTime(0, at);
        depth.gain.linearRampToValueAtTime(9, at + Math.min(duration, 0.45));
        vibrato.connect(depth).connect(source.detune);
        vibrato.start(at);
        this.track(vibrato, at + duration + 0.13, [depth]);
      }
      source.connect(gain).connect(target);
      source.start(at);
      this.track(source, at + duration + 0.13, nodes);
      return;
    }
    const patch = note.patch || 'rhodes';
    const harmonics =
      role === 'bass'
        ? [
            [1, 1],
            [2, 0.28],
          ]
        : patch === 'organ'
          ? [
              [0.5, 0.3],
              [1, 0.65],
              [2, 0.26],
              [3, 0.12],
              [4, 0.09],
            ]
          : patch === 'piano'
            ? [
                [1, 0.65],
                [2, 0.24],
                [3, 0.09],
                [4, 0.03],
              ]
            : patch === 'bell'
              ? [
                  [1, 0.6],
                  [2.76, 0.15],
                  [5.4, 0.06],
                ]
              : [
                  [1, 0.7],
                  [2, 0.17],
                ];
    let voice = 0;
    for (const [multiple, amplitude] of harmonics) {
      const osc = c.createOscillator();
      osc.type =
        patch === 'analog' && role === 'keys' ? 'sawtooth' : patch === 'pad' ? 'triangle' : 'sine';
      osc.frequency.value = frequency * multiple;
      const gain = c.createGain();
      const attack = patch === 'pad' ? 0.12 : 0.009;
      const level = note.velocity * amplitude * (role === 'bass' ? 0.4 : 0.24);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(level, at + Math.min(attack, duration / 2));
      gain.gain.exponentialRampToValueAtTime(
        level * (patch === 'organ' || patch === 'pad' ? 0.85 : 0.23),
        at + duration,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration + 0.05);
      osc.connect(gain).connect(target);
      osc.start(at);
      this.track(osc, at + duration + 0.055, [
        gain,
        ...(voice++ === harmonics.length - 1 ? extraNodes : []),
      ]);
    }
  }
  private expression(
    source: AudioBufferSourceNode,
    note: Note,
    at: number,
    duration: number,
    role: Musician,
  ) {
    if (note.articulation === 'slide') {
      source.detune.setValueAtTime(-150, at);
      source.detune.linearRampToValueAtTime(0, at + Math.min(0.1, duration / 2));
    }
    if (note.bend && role === 'guitar') {
      source.detune.setValueAtTime(0, at);
      source.detune.linearRampToValueAtTime(note.bend * 100, at + Math.min(0.2, duration / 2));
      source.detune.linearRampToValueAtTime(0, at + duration);
    }
    if (role === 'guitar' && duration > 0.4) {
      const osc = this.context!.createOscillator();
      const depth = this.context!.createGain();
      osc.frequency.value = 5.2;
      depth.gain.setValueAtTime(0, at);
      depth.gain.linearRampToValueAtTime(8, at + 0.35);
      osc.connect(depth).connect(source.detune);
      osc.start(at);
      this.track(osc, at + duration + 0.14, [depth]);
    }
  }
}
