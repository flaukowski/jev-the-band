/** A pickup-weighted modal string, with strong low partials and a short pick transient. */
export function guitarSamples(
  sampleRate: number,
  frequency: number,
  seconds: number,
): Float32Array<ArrayBuffer> {
  const data = new Float32Array(Math.ceil(sampleRate * seconds));
  for (let harmonic = 1; harmonic <= 10; harmonic++) {
    const f = frequency * harmonic;
    if (f > sampleRate * 0.44) break;
    const amplitude = 0.56 / harmonic ** 1.65;
    const decay = 0.7 + harmonic * 0.32;
    const step = (Math.PI * 2 * f) / sampleRate;
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      data[i] += amplitude * Math.sin(i * step) * Math.exp(-t * decay) * Math.min(1, t / 0.004);
    }
  }
  return data;
}
