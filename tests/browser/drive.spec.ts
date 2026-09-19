import { test, expect } from '@playwright/test';

test('the real drive processor preserves RMS level across drive amounts, notes and transients', async ({
  page,
}) => {
  await page.goto('/');
  const results = await page.evaluate(async () => {
    const manifest = await (await fetch('/samples/manifest.json')).json();
    const sampleUrl = manifest.find(
      (s: { bank: string; midi: number }) => s.bank === 'guitar' && s.midi >= 55,
    ).url;
    const bytes = await (await fetch(sampleUrl)).arrayBuffer();
    const metrics = [];
    for (const voice of ['tone', 'guitar'])
      for (const amplitude of [0.08, 0.3, 0.75])
        for (const amount of [0, 0.5, 1]) {
          const render = async (enabled: number) => {
            const context = new OfflineAudioContext(1, 44100 * 2, 44100);
            await context.audioWorklet.addModule('/src/drive-processor.js');
            const source = context.createBufferSource();
            if (voice === 'guitar') source.buffer = await context.decodeAudioData(bytes.slice(0));
            else {
              source.buffer = context.createBuffer(1, 44100 * 2, 44100);
              const data = source.buffer.getChannelData(0);
              for (let i = 0; i < data.length; i++)
                data[i] = Math.sin((i / 44100) * 2 * Math.PI * 220) * (i < 22050 ? 1 : 0.3);
            }
            const input = context.createGain();
            input.gain.value = amplitude;
            const drive = new AudioWorkletNode(context, 'level-drive', {
              parameterData: { enabled, amount },
            });
            source.connect(input).connect(drive).connect(context.destination);
            source.start();
            const data = (await context.startRendering()).getChannelData(0);
            let power = 0,
              peak = 0;
            for (const value of data) {
              power += value * value;
              peak = Math.max(peak, Math.abs(value));
            }
            return { rms: Math.sqrt(power / data.length), peak };
          };
          const clean = await render(0),
            dirty = await render(1);
          metrics.push({
            voice,
            amplitude,
            amount,
            changeDb: 20 * Math.log10(dirty.rms / clean.rms),
            peak: dirty.peak,
          });
        }
    return metrics;
  });
  console.log(JSON.stringify({ driveMeasurements: results }));
  for (const result of results) {
    expect(result.changeDb).toBeLessThan(1.5);
    expect(result.changeDb).toBeGreaterThan(-3);
    expect(result.peak).toBeLessThan(1);
  }
});
