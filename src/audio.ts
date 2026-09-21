import { clamp, musicians, type Frame, type Musician, type Note, type Part } from '../shared/music';
import { channelGain, defaultMix, effectiveEffects, type Mix } from '../shared/mixer';
import { guitarSamples } from './guitar';
import { SampleBank } from './samples';
import { drumSampleLifetime, effectsAtBeat, volumes } from '../shared/performance';
import { rigProfiles, instrumentEffects } from '../shared/rigs';
import { AudiencePlayer } from './audience';
import {
  defaultAudienceControls,
  defaultAudienceDirection,
  type AudienceControls,
} from '../shared/audience';
import {
  defaultEngineerMix,
  defaultMasterControls,
  effectiveMaster,
  type EngineerMix,
  type MasterControls,
  type ChannelLevels,
} from '../shared/engineer';

interface Bus {
  input: GainNode;
  distortion: AudioWorkletNode;
  filter: BiquadFilterNode;
  wah: GainNode;
  delay: DelayNode;
  echo: GainNode;
  feedback: GainNode;
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
  balance: GainNode;
  reference: AnalyserNode;
  referenceData: Float32Array<ArrayBuffer>;
}
export class BandAudio {
  context?: AudioContext;
  private master?: GainNode;
  private scopeNode?: AnalyserNode;
  private readonly scopeBins = new Uint8Array(1024);
  private masterRig?: { wet: GainNode; glue: DynamicsCompressorNode };
  private masterControls = defaultMasterControls();
  private audience?: AudiencePlayer;
  private audienceControls = defaultAudienceControls();
  private prelude = false;
  get audienceStatus() {
    return this.audience?.status;
  }
  setAudienceControls(controls: AudienceControls) {
    this.audienceControls = controls;
    this.audience?.setControls(controls);
  }
  triggerAudience(mood: 'applause' | 'cheering') {
    return this.enabled && !!this.audience?.triggerReaction(mood);
  }
  cancelPrelude() {
    if (this.prelude) this.stop();
  }
  private referencePower = new Map<Musician, { power: number; peak: number; count: number }>();
  private initializing?: Promise<void>;
  private openHat?: { gain: GainNode; source: AudioBufferSourceNode };
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
  setMasterControls(controls: MasterControls) {
    this.masterControls = controls;
    if (!this.context) return;
    const frame = this.frames.filter((f) => f.at <= Date.now() + this.offset).at(-1);
    this.applyMaster(frame?.engineerMix ?? defaultEngineerMix(), this.context.currentTime);
  }
  referenceLevels(): ChannelLevels | undefined {
    if (!this.enabled || this.context?.state !== 'running') return;
    const db = (v: number) => Math.max(-100, Math.min(12, 20 * Math.log10(Math.max(v, 0.00001))));
    const levels = Object.fromEntries(
      musicians.map((role) => {
        const v = this.referencePower.get(role);
        return [
          role,
          { rmsDb: db(v?.count ? Math.sqrt(v.power / v.count) : 0), peakDb: db(v?.peak ?? 0) },
        ];
      }),
    ) as ChannelLevels;
    this.referencePower.clear();
    return levels;
  }
  private applyMaster(mix: EngineerMix, at: number) {
    const effective = effectiveMaster(mix, this.masterControls);
    const ramp = (parameter: AudioParam | undefined, value: number) => {
      // A manual change must also replace any Jev cue in the audio lookahead window.
      parameter?.cancelScheduledValues(at);
      parameter?.setTargetAtTime(value, at, 0.4);
    };
    for (const role of musicians)
      ramp(this.buses.get(role)?.balance.gain, 10 ** (effective.trimDb[role] / 20));
    ramp(this.masterRig?.wet.gain, effective.reverb);
    ramp(this.masterRig?.glue.threshold, effective.threshold);
    ramp(this.masterRig?.glue.ratio, effective.ratio);
    this.audience?.setDirection(effective.audience ?? defaultAudienceDirection(), at);
  }
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
          effectsAtBeat(part, ((Date.now() + this.offset - frame.at) * frame.bpm) / 60000),
        );
  }
  /** What this listener is actually hearing, as 1024 spectrum bins. Null while sound is off. */
  spectrum(): Uint8Array | null {
    if (!this.scopeNode || !this.enabled) return null;
    this.scopeNode.getByteFrequencyData(this.scopeBins);
    return this.scopeBins;
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
  async enable(welcome = false) {
    if (!this.context) this.initializing = this.init();
    await this.initializing;
    await this.context!.resume();
    this.enabled = true;
    if (welcome) {
      this.prelude = true;
      this.audience?.start(`welcome-${Date.now()}`, true);
    } else if (this.frames.length) this.audience?.start(this.roomId);
    this.master!.gain.setTargetAtTime(this.volume * 0.65, this.context!.currentTime, 0.05);
    if (!this.timer) this.timer = window.setInterval(() => this.tick(), 25);
    // Crowd recordings load independently and can play during instrument loading / Jev startup.
    await this.samples.load(this.context!);
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
      this.stop(this.prelude);
      this.roomId = roomId;
      this.seen.clear();
      this.scheduledNotes = 0;
      if (this.enabled && this.context)
        this.master!.gain.setTargetAtTime(this.volume * 0.65, this.context.currentTime, 0.03);
    }
    this.frames = frames;
    if (frames.length) this.prelude = false;
    if (frames.length && this.enabled) this.audience?.start(roomId);
    const earliest = frames[0]?.id ?? 0;
    for (const key of this.seen) if (Number(key.split(':')[0]) < earliest) this.seen.delete(key);
  }
  stop(preserveAudience = false) {
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
    this.openHat = undefined;
    if (!preserveAudience) {
      this.prelude = false;
      this.audience?.stop();
    }
    this.referencePower.clear();
  }
  dispose() {
    this.stop();
    this.audience?.dispose();
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
    // A listen-only tap for the projection wall's spectrum pictures. It feeds nothing.
    const scope = (this.scopeNode = c.createAnalyser());
    scope.fftSize = 2048;
    scope.smoothingTimeConstant = 0.72;
    compressor.connect(scope);
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
    const mixInput = c.createGain();
    this.audience = new AudiencePlayer(c, mixInput);
    this.audience.setControls(this.audienceControls);
    void this.audience.loadBank();
    const glue = c.createDynamicsCompressor();
    glue.threshold.value = -14;
    glue.ratio.value = 2;
    glue.knee.value = 12;
    glue.attack.value = 0.025;
    glue.release.value = 0.25;
    const roomReverb = c.createConvolver();
    roomReverb.buffer = impulse;
    const roomWet = c.createGain();
    roomWet.gain.value = 0.04;
    mixInput.connect(glue).connect(master);
    mixInput.connect(roomReverb).connect(roomWet).connect(glue);
    this.masterRig = { wet: roomWet, glue };
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
      const balance = c.createGain();
      const reference = c.createAnalyser();
      reference.fftSize = 2048;
      level
        .connect(channelCompressor)
        .connect(reference)
        .connect(balance)
        .connect(fader)
        .connect(pan)
        .connect(meter)
        .connect(mixInput);
      this.buses.set(role, {
        input,
        distortion,
        filter,
        wah,
        delay,
        echo,
        feedback,
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
        balance,
        reference,
        referenceData: new Float32Array(2048),
      });
    });
    this.setMix(this.mix);
    this.setMasterControls(this.masterControls);
  }
  private tick() {
    const c = this.context;
    if (!c || !this.enabled || c.state !== 'running') return;
    this.audience?.tick();
    for (const role of musicians) {
      const bus = this.buses.get(role)!;
      bus.reference.getFloatTimeDomainData(bus.referenceData);
      const value = this.referencePower.get(role) ?? { power: 0, peak: 0, count: 0 };
      for (const sample of bus.referenceData) {
        value.power += sample * sample;
        value.peak = Math.max(value.peak, Math.abs(sample));
        value.count++;
      }
      this.referencePower.set(role, value);
    }
    const now = Date.now() + this.offset;
    for (const frame of this.frames) {
      if (frame.at + frame.durationMs < now || frame.at > now + 180) continue;
      const mixKey = `${frame.id}:master`;
      if (!this.seen.has(mixKey)) {
        this.applyMaster(
          frame.engineerMix ?? defaultEngineerMix(),
          Math.max(c.currentTime, c.currentTime + (frame.at - now) / 1000),
        );
        this.seen.add(mixKey);
      }
      for (const part of frame.parts) {
        const cues: NonNullable<Part['effectsTimeline']> = part.effectsTimeline ?? [
          { beat: 0, effects: part.decision.effects, traceId: '' },
        ];
        for (const [index, cue] of cues.entries()) {
          const time = frame.at + (cue.beat * 60000) / frame.bpm;
          const busKey = `${frame.id}:${part.role}:fx:${cue.beat}`;
          if (this.seen.has(busKey) || time > now + 180) continue;
          this.seen.add(busKey);
          // A late listener starts with the current bar's rig, never an unplayed future cue.
          const next = cues[index + 1];
          if (next && frame.at + (next.beat * 60000) / frame.bpm <= now) continue;
          this.fx(
            part,
            Math.max(c.currentTime, c.currentTime + (time - now) / 1000),
            frame.bpm,
            frame.parts.some((p) => p.solo),
            cue.effects,
            cue.driveLevel,
          );
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
  private fx(
    part: Part,
    at: number,
    bpm: number,
    hasSolo: boolean,
    effects = part.decision.effects,
    driveLevel?: 'overdrive' | 'lead',
  ) {
    const bus = this.buses.get(part.role)!;
    const e = instrumentEffects(part.role, effectiveEffects(this.mix[part.role], effects));
    const profile = rigProfiles[part.role];
    const focus = part.solo
      ? 1.18
      : hasSolo
        ? part.role === 'guitar' || part.role === 'keys'
          ? 0.6
          : 0.87
        : 1;
    // Band dynamics: a whisper really is quieter. Eased over a beat so swells feel played.
    const dynamics = volumes[part.performance?.volume ?? 'bold'].gain;
    bus.level.gain.setTargetAtTime((part.role === 'keys' ? 0.47 : 0.7) * focus * dynamics, at, 0.3);
    bus.distortion.parameters.get('enabled')!.setTargetAtTime(e.drive ? 1 : 0, at, 0.03);
    bus.distortion.parameters
      .get('amount')!
      .setTargetAtTime(
        this.mix[part.role].drive * profile.drive * (driveLevel === 'overdrive' ? 0.32 : 1),
        at,
        0.03,
      );
    bus.filter.frequency.setTargetAtTime(e.wah ? profile.wahHz : 12000, at, 0.08);
    bus.wah.gain.setTargetAtTime(e.wah ? profile.wahDepth : 0, at, 0.08);
    bus.echo.gain.setTargetAtTime(e.delay ? profile.echo : 0, at, 0.06);
    bus.feedback.gain.setTargetAtTime(profile.feedback, at, 0.06);
    bus.delay.delayTime.setTargetAtTime(45 / bpm, at, 0.08);
    bus.wet.gain.setTargetAtTime(e.reverb ? profile.room : 0, at, 0.06);
    bus.chorus.gain.setTargetAtTime(e.chorus ? profile.chorus : 0, at, 0.06);
    bus.tremolo.gain.setTargetAtTime(e.tremolo ? profile.tremolo : 0, at, 0.06);
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
    const effects = instrumentEffects(
      role,
      effectiveEffects(this.mix[role], effectsAtBeat(part, note.beat)),
    );
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
      // Quiet playing reaches for softer recorded layers; Jev's chosen velocity is unchanged.
      Math.min(1, note.velocity * volumes[part.performance?.volume ?? 'bold'].velocity),
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
      const sustain = drumSampleLifetime(
        role,
        duration,
        sample.buffer.duration / source.playbackRate.value,
      );
      // Hammer-ons and pull-offs are sounded by the fretting hand: no new pick attack.
      const slurred = note.articulation === 'hammer' || note.articulation === 'pull';
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(
        level * (slurred ? 0.82 : 1),
        at + (slurred ? 0.014 : 0.003),
      );
      gain.gain.setValueAtTime(level * (slurred ? 0.82 : 1), at + Math.max(0.016, sustain));
      gain.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(0.01, sustain) + 0.12);
      this.expression(source, note, at, duration, role);
      source.connect(gain).connect(target);
      if (role === 'drums' && [42, 46].includes(note.midi)) {
        if (this.openHat) {
          this.openHat.gain.gain.cancelScheduledValues(at);
          this.openHat.gain.gain.setTargetAtTime(0.0001, at, 0.008);
          try {
            this.openHat.source.stop(at + 0.04);
          } catch {
            /* already finished */
          }
        }
        this.openHat = note.midi === 46 ? { source, gain } : undefined;
      }
      source.start(at, slurred ? Math.min(0.035, sample.buffer.duration / 4) : 0);
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
      this.expression(source, note, at, duration, role);
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
    const bendTime = Math.min(0.2, duration / 2);
    if (note.articulation === 'slide') {
      // Slide from the previous fret when known, otherwise a short scoop.
      source.detune.setValueAtTime((note.slideFrom ?? -1.5) * 100, at);
      source.detune.linearRampToValueAtTime(0, at + Math.min(0.14, duration / 2));
    }
    if (note.bend && role === 'guitar') {
      if (note.bendShape === 'pre') {
        source.detune.setValueAtTime(note.bend * 100, at);
        source.detune.setValueAtTime(note.bend * 100, at + duration * 0.35);
        source.detune.linearRampToValueAtTime(0, at + duration * 0.35 + bendTime);
      } else {
        source.detune.setValueAtTime(0, at);
        source.detune.linearRampToValueAtTime(note.bend * 100, at + bendTime);
        // A held bend stays at the target pitch; the default bend falls back by the note's end.
        if (note.bendShape !== 'hold') source.detune.linearRampToValueAtTime(0, at + duration);
      }
    }
    if (role === 'guitar' && (duration > 0.4 || note.vibrato)) {
      const osc = this.context!.createOscillator();
      const depth = this.context!.createGain();
      osc.frequency.value = 5.2;
      const onset = note.bend ? bendTime : 0;
      depth.gain.setValueAtTime(0, at + onset);
      depth.gain.linearRampToValueAtTime(8 + 30 * (note.vibrato ?? 0), at + onset + 0.35);
      osc.connect(depth).connect(source.detune);
      osc.start(at);
      this.track(osc, at + duration + 0.14, [depth]);
    }
  }
}
