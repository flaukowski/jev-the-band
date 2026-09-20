import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { audienceBankSchema, type AudienceBank, type AudienceMood } from '../shared/audience.js';

const descriptors: Record<Exclude<AudienceMood, 'quiet'>, string> = {
  listening:
    'A small attentive concert audience, soft diffuse room murmur and tiny distant movements, very restrained and calm',
  grooving:
    'An intimate club audience listening happily to a jam band, low relaxed crowd murmur and gentle crowd movement, understated excitement',
  applause:
    'A small concert audience giving brief warm hand applause, dispersed natural hand claps in a room, gentle rise then decay, appreciative and restrained',
  cheering:
    'A small concert audience warmly celebrating the end of a solo, soft applause and a few distant soft wordless cheers, gentle rise and decay, relaxed and friendly',
};
export function audienceGenerationPlan(count = 3) {
  if (!Number.isInteger(count) || count < 1 || count > 100)
    throw new Error('Count must be an integer from 1 to 100');
  const rotation = ['listening', 'grooving', 'applause', 'listening', 'cheering'] as const;
  const spaces = [
    'small wooden music club',
    'cozy theatre with soft room reflections',
    'open-air garden venue',
    'intimate brick-walled concert room',
    'small seated listening room',
  ];
  return Array.from({ length: count }, (_, i) => {
    const mood = rotation[i % rotation.length];
    const kind =
      mood === 'applause' || mood === 'cheering' ? ('reaction' as const) : ('bed' as const);
    return {
      mood,
      kind,
      durationSeconds: kind === 'bed' ? 12 : 6,
      loop: kind === 'bed',
      prompt: `${descriptors[mood]}. In a ${spaces[Math.floor(i / rotation.length) % spaces.length]}, from a high balcony, the audience sounds distant, wide stereo. Audience only, absolutely no music or instruments, no intelligible words, no screams, no whistles, no foreground voice, no abrupt loud transients. ${kind === 'bed' ? 'Steady seamless ambience without a dramatic event.' : 'One subtle human response, no stadium roar.'} Variation ${i + 1}.`,
    };
  });
}

async function main() {
  const args = process.argv.slice(2);
  const value = (key: string) => {
    const at = args.indexOf(key);
    return at < 0 ? undefined : args[at + 1];
  };
  const count = Number(value('--count') ?? 3);
  const plan = audienceGenerationPlan(count);
  const estimatedCredits = plan.reduce((sum, clip) => sum + clip.durationSeconds * 40, 0);
  const execute = args.includes('--execute');
  console.log(
    JSON.stringify(
      {
        mode: execute ? 'execute' : 'dry-run',
        provider: 'ElevenLabs',
        model: 'eleven_text_to_sound_v2',
        clips: count,
        estimatedCredits,
        costBasis:
          'Conservative 40 credits per requested second from provider API overview; actual billing can differ by plan. No dollar conversion assumed.',
        requestLimit: count,
        plan,
      },
      null,
      2,
    ),
  );
  if (!execute) return;
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key)
    throw new Error(
      'Set ELEVENLABS_API_KEY server-side to generate audio. No generation was attempted.',
    );
  const maxCredits = Number(value('--max-credits'));
  if (!Number.isFinite(maxCredits) || maxCredits < estimatedCredits)
    throw new Error(
      `Explicit --max-credits of at least ${estimatedCredits} is required. No generation was attempted.`,
    );
  const license = value('--license');
  if (!license || license.length < 12 || license.length > 1200)
    throw new Error(
      'Provide --license with the actual account/output-use grant. Paid commercial use is required for public use; raw asset redistribution also needs review.',
    );
  // Generation is private. Public assets are copied only by promote-audience after review.
  const directory = resolve('artifacts/audience-bank');
  const manifestPath = resolve(directory, 'manifest.json');
  let bank: AudienceBank;
  try {
    bank = audienceBankSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    bank = {
      version: 1,
      source: 'generated',
      provider: 'ElevenLabs',
      model: 'eleven_text_to_sound_v2',
      createdAt: new Date().toISOString(),
      license,
      samples: [],
    };
  }
  if (bank.samples.length + count > 100)
    throw new Error('This bank would exceed 100 samples. Nothing generated.');
  if (
    bank.license !== license ||
    bank.provider !== 'ElevenLabs' ||
    bank.model !== 'eleven_text_to_sound_v2'
  )
    throw new Error(
      'Existing bank provenance differs. Use a separate bank instead of mixing license grants.',
    );
  await mkdir(directory, { recursive: true });
  let completed = 0;
  let accountedCredits = 0;
  // Sequential, no automatic retry: a lost response may still have consumed provider credits.
  for (const clip of plan) {
    if (accountedCredits + clip.durationSeconds * 40 > maxCredits)
      throw new Error(
        'The next request would exceed the estimated credit cap; generation stopped.',
      );
    const response = await fetch(
      'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128',
      {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(90000),
        body: JSON.stringify({
          text: clip.prompt,
          duration_seconds: clip.durationSeconds,
          prompt_influence: 0.4,
          loop: clip.loop,
          model_id: 'eleven_text_to_sound_v2',
        }),
      },
    );
    if (!response.ok)
      throw new Error(
        `Generation stopped at clip ${completed + 1}, HTTP ${response.status}. No retry was made; earlier clips remain recorded.`,
      );
    const bytes = Buffer.from(await response.arrayBuffer());
    if (
      bytes.length < 1000 ||
      bytes.length > 6_000_000 ||
      !response.headers.get('content-type')?.includes('audio')
    )
      throw new Error('Provider returned an invalid audio payload; generation stopped.');
    const id = `${clip.mood}-${randomUUID().slice(0, 8)}`;
    const rawCost = response.headers.get('character-cost');
    const cost = rawCost === null ? NaN : Number(rawCost);
    const billedCredits = Number.isFinite(cost) && cost >= 0 ? cost : undefined;
    accountedCredits += billedCredits ?? clip.durationSeconds * 40;
    await writeFile(resolve(directory, `${id}.mp3`), bytes, { flag: 'wx' });
    bank.samples.push({
      id,
      path: `/audience/${id}.mp3`,
      mood: clip.mood,
      kind: clip.kind,
      durationSeconds: clip.durationSeconds,
      prompt: clip.prompt,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      approved: false,
      ...(billedCredits === undefined ? {} : { billedCredits }),
    });
    await writeFile(
      `${manifestPath}.tmp`,
      JSON.stringify(audienceBankSchema.parse(bank), null, 2) + '\n',
    );
    await rename(`${manifestPath}.tmp`, manifestPath);
    completed++;
    console.log(
      JSON.stringify({
        completed,
        id,
        bytes: bytes.length,
        approved: false,
        estimatedCredits: clip.durationSeconds * 40,
        billedCredits: billedCredits ?? null,
        accountedCredits,
      }),
    );
  }
  console.log(
    'Generation finished in private artifacts/audience-bank. Audition the files, verify redistribution rights, mark approved clips in its manifest, then run promote:audience with a public license statement.',
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    // Never expose provider request headers or secret-bearing exception payloads.
    console.error(
      'Audience generation stopped. Check the configured credential, explicit credit cap, license and local manifest. No automatic retries were made.',
    );
    process.exitCode = 1;
  });
}
