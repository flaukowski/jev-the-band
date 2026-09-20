// Per-channel RMS-matched saturation. No cross-instrument sidechain or automatic makeup gain.
class LevelDrive extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'enabled', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'amount', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.cleanPower = 1e-8;
    this.dirtyPower = 1e-7;
    this.gain = 0.2;
    this.window = 1 - Math.exp(-1 / (sampleRate * 0.025));
    this.attack = 1 - Math.exp(-1 / (sampleRate * 0.004));
    this.release = 1 - Math.exp(-1 / (sampleRate * 0.08));
  }
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input?.length) return true;
    const blend = parameters.enabled[0];
    const preamp = 2 + parameters.amount[0] * 20;
    for (let i = 0; i < output[0].length; i++) {
      let cleanPower = 0,
        dirtyPower = 0;
      for (let ch = 0; ch < output.length; ch++) {
        const clean = (input[ch] ?? input[0])[i] ?? 0;
        const dirty = 0.15 * clean + 0.85 * Math.tanh(clean * preamp);
        output[ch][i] = dirty;
        cleanPower += clean * clean;
        dirtyPower += dirty * dirty;
      }
      this.cleanPower += this.window * (cleanPower / output.length - this.cleanPower);
      this.dirtyPower += this.window * (dirtyPower / output.length - this.dirtyPower);
      // Slightly below unity RMS; never boost silence or low input. Instantaneous ratio
      // limits the first transient before the RMS envelope has caught up.
      const rmsGain = 0.94 * Math.sqrt(this.cleanPower / Math.max(1e-12, this.dirtyPower));
      const peakGain = Math.sqrt(cleanPower / Math.max(1e-12, dirtyPower));
      const target = Math.min(1, rmsGain);
      this.gain += (target < this.gain ? this.attack : this.release) * (target - this.gain);
      const gain = Math.min(this.gain, Math.max(peakGain, rmsGain));
      for (let ch = 0; ch < output.length; ch++) {
        const clean = (input[ch] ?? input[0])[i] ?? 0;
        output[ch][i] = clean * (1 - blend) + output[ch][i] * gain * blend;
      }
    }
    return true;
  }
}
registerProcessor('level-drive', LevelDrive);
