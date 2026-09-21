import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { audienceBankSchema, type AudienceBank, type AudienceMood } from '../shared/audience.js';

const descriptors: Record<Exclude<AudienceMood, 'quiet'>, string> = {
  listening:
    'An outdoor festival audience waiting for the band, soft overlapping indistinct conversations and relaxed human murmuring, spacious and calm',
  grooving:
    'An outdoor festival crowd, happy indistinct conversational babble, scattered chuckles and gentle movement, warm low-key anticipation',
  applause:
    'A festival audience giving warm hand applause, many dispersed natural hand claps, appreciative swell then natural decay',
  cheering:
    'An outdoor concert audience welcoming the band onto the stage, warm applause and joyful wordless human whoops and cheers, swell then natural decay',
};
export function audienceGenerationPlan(count = 3) {
  if (!Number.isInteger(count) || count < 1 || count > 100)
    throw new Error('Count must be an integer from 1 to 100');
  const rotation = ['cheering', 'listening', 'applause', 'grooving'] as const;
  const spaces = [
    'grassy festival field with a few hundred people, middle distance',
    'open-air garden venue with a small friendly audience, nearby but diffuse',
    'large outdoor amphitheatre, heard from the sound desk behind the audience',
    'park concert at dusk, a loosely scattered crowd across the lawn',
    'tree-lined outdoor stage, a lively audience without reverberation',
    'intimate open-air courtyard, mellow listeners at a summer concert',
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
      prompt: `${descriptors[mood]}. ${spaces[Math.floor(i / rotation.length) % spaces.length]}. Stereo crowd ONLY: no music, instruments, singing, intelligible words, announcer, whistles or shrieks. ${kind === 'bed' ? 'Seamless murmur; no applause or wind hiss.' : 'Natural swell and fade.'} Take ${i + 1}.`,
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
  if (plan.some((clip) => clip.prompt.length > 450))
    throw new Error('Sound-effects prompts must be 450 characters or fewer.');
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
        ...(execute ? {} : { plan }),
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
      'Provide --license with the actual output-use terms. Free-plan publication requires attribution and noncommercial use; the code license does not cover these recordings.',
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
  // Reserve each request BEFORE sending it. A timeout can still be billed, and restarting
  // this script must not silently reset the user's lifetime budget for this bank.
  const ledgerPath = resolve(directory, 'credit-ledger.json');
  let ledger: { reservedCredits: number; requests: number };
  try {
    ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    ledger = {
      reservedCredits: bank.samples.reduce(
        (sum, s) => sum + Math.max(s.billedCredits ?? 0, s.durationSeconds * 40),
        0,
      ),
      requests: bank.samples.length,
    };
  }
  if (
    !Number.isFinite(ledger.reservedCredits) ||
    ledger.reservedCredits < 0 ||
    !Number.isInteger(ledger.requests)
  )
    throw new Error('Invalid credit ledger');
  if (ledger.reservedCredits + estimatedCredits > maxCredits)
    throw new Error('This batch exceeds the remaining lifetime credit cap for this bank.');
  let completed = 0;
  let accountedCredits = ledger.reservedCredits;
  // Sequential, no automatic retry: a lost response may still have consumed provider credits.
  for (const clip of plan) {
    if (accountedCredits + clip.durationSeconds * 40 > maxCredits)
      throw new Error(
        'The next request would exceed the estimated credit cap; generation stopped.',
      );
    ledger.reservedCredits += clip.durationSeconds * 40;
    ledger.requests++;
    await writeFile(`${ledgerPath}.tmp`, JSON.stringify(ledger, null, 2) + '\n');
    await rename(`${ledgerPath}.tmp`, ledgerPath);
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
    if (!response.ok) {
      const detail = (await response.json().catch(() => ({}))) as { detail?: { status?: unknown } };
      const status =
        typeof detail.detail?.status === 'string' &&
        /^[a-z0-9_-]{1,80}$/i.test(detail.detail.status)
          ? detail.detail.status
          : 'unknown';
      console.error(JSON.stringify({ http: response.status, providerStatus: status, completed }));
      throw new Error(
        `Generation stopped at clip ${completed + 1}, HTTP ${response.status}. No retry was made; earlier clips remain recorded.`,
      );
    }
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
    accountedCredits = ledger.reservedCredits;
    if ((billedCredits ?? 0) > clip.durationSeconds * 40) {
      ledger.reservedCredits += billedCredits! - clip.durationSeconds * 40;
      accountedCredits = ledger.reservedCredits;
      await writeFile(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
    }
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
