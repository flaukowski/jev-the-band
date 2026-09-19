// Reproducible, deliberately small browser edition. Requires ffmpeg on PATH.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const root = new URL('../public/samples/', import.meta.url);
const cache = new URL('../artifacts/sample-source/', import.meta.url);
await mkdir(root, { recursive: true });
await mkdir(cache, { recursive: true });
const sources = {
  guitar: [
    'sfzinstruments/karoryfer.black-and-green-guitars',
    'b3b3249d37dc977a1a297bd2dc053e6d9b6b805c',
    'CC0-1.0',
  ],
  bass: [
    'sfzinstruments/karoryfer.black-and-blue-basses',
    '6e7d674cdb41be7a54dbccb15472401ad01099b9',
    'CC0-1.0',
  ],
  piano: ['nbrosowsky/tonejs-instruments', '622c2f1c32c8cfce4158ddc3eb26e518ddef37e5', 'CC-BY-3.0'],
  drums: ['sgossner/VCSL', 'c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e', 'CC0-1.0'],
};
const urlFor = (bank, path) =>
  `https://raw.githubusercontent.com/${sources[bank][0]}/${sources[bank][1]}/${path.split('/').map(encodeURIComponent).join('/')}`;
async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Sample source HTTP ${r.status}: ${url}`);
  return Buffer.from(await r.arrayBuffer());
}
const entries = [];
async function mapping(bank, path, articulation, velocity, pattern) {
  const text = (await get(urlFor(bank, path))).toString();
  for (const region of text.split('<region>').slice(1)) {
    const sample = region
      .match(/sample=([^\r\n]+)/)?.[1]
      ?.trim()
      .replaceAll('\\', '/')
      .replace(/^\.\.\//, '');
    const midi = Number(region.match(/pitch_keycenter=(\d+)/)?.[1]);
    if (!sample || !Number.isFinite(midi) || !pattern.test(sample)) continue;
    if (
      bank === 'guitar'
        ? midi < 40 || midi > 85 || (midi - 40) % 3 !== 0
        : midi < 35 || midi > 68 || (midi - 35) % 3 !== 0
    )
      continue;
    if (entries.some((e) => e.bank === bank && e.path === sample)) continue;
    entries.push({ bank, path: sample, midi, articulation, velocity });
  }
}
await mapping('guitar', 'Programs/modules/maps_green/ord.sfz', 'natural', 0.55, /_mf_rr[12]\.wav$/);
await mapping('guitar', 'Programs/modules/maps_green/ord.sfz', 'natural', 0.85, /_f_rr[12]\.wav$/);
await mapping('guitar', 'Programs/modules/maps_green/stac.sfz', 'staccato', 0.7, /rr1\.wav$/);
await mapping('guitar', 'Programs/modules/maps_green/hammer.sfz', 'legato', 0.7, /rr1\.wav$/);
await mapping('bass', 'Programs/maps/darkblack_reg_mf_map.sfz', 'natural', 0.55, /rr[12]\.wav$/);
await mapping('bass', 'Programs/maps/darkblack_reg_f_map.sfz', 'natural', 0.85, /rr[12]\.wav$/);
for (let octave = 3; octave <= 6; octave++)
  for (const [note, offset] of [
    ['C', 0],
    ['Fs', 6],
  ]) {
    entries.push({
      bank: 'piano',
      path: `samples/piano/${note}${octave}.mp3`,
      midi: 12 * (octave + 1) + offset,
      articulation: 'natural',
      velocity: 0.7,
    });
  }
for (let rr = 1; rr <= 2; rr++) {
  const drumSamples = [
    [
      38,
      `Membranophones/Struck Membranophones/Snare Drum, Modern 1/Snare2_HitSN_v3_rr${rr}_Mid.wav`,
    ],
    [42, `Idiophones/Struck Idiophones/Hi-Hat Cymbal/HiHat_HitC_v3_rr${rr}_Mid.wav`],
    [45, `Membranophones/Struck Membranophones/Tom 2/Stick/TomL_HitS_v3_rr${rr}_Mid.wav`],
    [50, `Membranophones/Struck Membranophones/Tom 1/Stick/TomH_HitS_v3_rr${rr}_Mid.wav`],
  ];
  for (const [midi, path] of drumSamples)
    entries.push({ bank: 'drums', path, midi, articulation: 'natural', velocity: 0.7 });
}
for (const [midi, path] of [
  [49, 'Idiophones/Struck Idiophones/Suspended Cymbal 1/susCymb1_hit_stick_f1.wav'],
  [51, 'Idiophones/Struck Idiophones/Suspended Cymbal 1/susCymb1_hit_bell_mf1.wav'],
])
  entries.push({ bank: 'drums', path, midi, articulation: 'natural', velocity: 0.7 });
const manifest = [];
let cursor = 0;
async function worker() {
  while (cursor < entries.length) {
    const e = entries[cursor++];
    const id = `${e.bank}-${e.path
      .split('/')
      .at(-1)
      .replace(/\.(wav|mp3)$/, '')}`;
    const source = urlFor(e.bank, e.path);
    const input = new URL(`${id}${e.path.endsWith('.wav') ? '.wav' : '.mp3'}`, cache);
    let bytes;
    try {
      bytes = await readFile(input);
    } catch {
      bytes = await get(source);
      await writeFile(input, bytes);
    }
    const output = new URL(`${id}.mp3`, root);
    const result = spawnSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        input.pathname.replace(/^\/([A-Z]:)/, '$1'),
        '-t',
        '6',
        '-ac',
        '1',
        '-ar',
        '44100',
        '-codec:a',
        'libmp3lame',
        '-b:a',
        '128k',
        output.pathname.replace(/^\/([A-Z]:)/, '$1'),
      ],
      { windowsHide: true },
    );
    if (result.status !== 0) throw new Error(result.stderr.toString());
    const file = await readFile(output);
    manifest.push({
      ...e,
      url: `/samples/${id}.mp3`,
      source,
      license: sources[e.bank][2],
      sha256: createHash('sha256').update(file).digest('hex'),
      sourceSha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: file.length,
    });
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
manifest.sort((a, b) => a.url.localeCompare(b.url));
await writeFile(new URL('manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(new URL('CC0-1.0.txt', root), await get(urlFor('guitar', 'LICENSE')));
console.log(
  JSON.stringify({
    samples: manifest.length,
    bytes: manifest.reduce((n, e) => n + e.bytes, 0),
    banks: [...new Set(manifest.map((e) => e.bank))],
  }),
);
