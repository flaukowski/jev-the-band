import { clamp, musicians, type Frame, type Musician, type Note, type Part } from '../shared/music';

interface Bus {
  input: GainNode;
  dry: GainNode;
  distortion: WaveShaperNode;
  drive: GainNode;
  filter: BiquadFilterNode;
  wah: GainNode;
  delay: DelayNode;
  echo: GainNode;
  reverb: ConvolverNode;
  wet: GainNode;
  level: GainNode;
  pan: StereoPannerNode;
}
export class BandAudio {
  context?: AudioContext;
  private master?: GainNode;
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
  async enable() {
    if (!this.context) this.init();
    await this.context!.resume();
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
  private init() {
    const c = (this.context = new AudioContext({ latencyHint: 'interactive' }));
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
      const dry = c.createGain();
      const drive = c.createGain();
      const distortion = c.createWaveShaper();
      const curve = new Float32Array(2048);
      for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i / 1024 - 1) * 3) * 0.6;
      distortion.curve = curve;
      distortion.oversample = '2x';
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
      input.connect(dry).connect(filter);
      input.connect(distortion).connect(drive).connect(filter);
      dry.gain.value = 1;
      drive.gain.value = 0;
      filter.connect(level);
      filter.connect(delay).connect(echo).connect(level);
      filter.connect(reverb).connect(wet).connect(level);
      level.connect(pan).connect(master);
      this.buses.set(role, {
        input,
        dry,
        distortion,
        drive,
        filter,
        wah,
        delay,
        echo,
        reverb,
        wet,
        level,
        pan,
      });
    });
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
          this.note(part.role, note, at, (note.duration * 60) / frame.bpm);
          this.scheduledNotes++;
        });
      }
    }
  }
  private fx(part: Part, at: number, bpm: number) {
    const bus = this.buses.get(part.role)!;
    const e = part.decision.effects;
    bus.dry.gain.setTargetAtTime(e.drive ? 0.45 : 1, at, 0.06);
    bus.drive.gain.setTargetAtTime(e.drive ? 0.6 : 0, at, 0.06);
    bus.filter.frequency.setTargetAtTime(e.wah ? 1700 : 12000, at, 0.08);
    bus.wah.gain.setTargetAtTime(e.wah ? 1300 : 0, at, 0.08);
    bus.echo.gain.setTargetAtTime(e.delay ? 0.24 : 0, at, 0.06);
    bus.delay.delayTime.setTargetAtTime(45 / bpm, at, 0.08);
    bus.wet.gain.setTargetAtTime(e.reverb ? 0.2 : 0, at, 0.06);
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
  private note(role: Musician, note: Note, at: number, duration: number) {
    const c = this.context!;
    const target = this.buses.get(role)!.input;
    const frequency = 440 * 2 ** ((note.midi - 69) / 12);
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
        this.track(osc, at + 0.32, [gain]);
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
        this.track(source, at + decay + 0.01, [filter, gain]);
      }
      return;
    }
    if (role === 'guitar') {
      // Karplus–Strong string: excited noise recirculates through a gentle lowpass.
      const length = Math.round(c.sampleRate / frequency);
      const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * (duration + 0.18)), c.sampleRate);
      const data = buffer.getChannelData(0);
      const noise = this.noise!.getChannelData(0);
      for (let i = 0; i < data.length; i++)
        data[i] =
          i < length
            ? noise[(i + note.midi * 127) % noise.length] * 0.7
            : (data[i - length] + data[Math.max(0, i - length - 1)]) * 0.498;
      const source = c.createBufferSource();
      source.buffer = buffer;
      const gain = c.createGain();
      gain.gain.setValueAtTime(note.velocity * 0.8, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration + 0.16);
      source.connect(gain).connect(target);
      source.start(at);
      this.track(source, at + duration + 0.18, [gain]);
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
      this.track(osc, at + duration + 0.055, [gain]);
    }
  }
}
