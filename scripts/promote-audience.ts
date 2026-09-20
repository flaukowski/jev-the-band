import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { audienceBankSchema } from '../shared/audience.js';

/** The private manifest is the approval record; no provider account details are published. */
export async function promoteAudience(
  privateDirectory: string,
  publicDirectory: string,
  publicLicense: string,
) {
  if (publicLicense.trim().length < 12 || publicLicense.length > 1200)
    throw new Error(
      'Provide a reviewed public license statement, without account or billing details.',
    );
  const bank = audienceBankSchema.parse(
    JSON.parse(await readFile(resolve(privateDirectory, 'manifest.json'), 'utf8')),
  );
  const approved = bank.samples.filter((sample) => sample.approved);
  // An explicitly promoted empty subset revokes every previously public clip.
  const files = new Map<string, Buffer>();
  for (const sample of approved) {
    const filename = basename(sample.path);
    if (files.has(filename)) throw new Error('Duplicate public filename.');
    const source = resolve(privateDirectory, filename);
    if (!(await lstat(source)).isFile())
      throw new Error('Only regular audio files can be published.');
    const bytes = await readFile(source);
    if (createHash('sha256').update(bytes).digest('hex') !== sample.sha256)
      throw new Error('Approved audio changed after review; public assets were not changed.');
    files.set(filename, bytes);
  }
  const publicBank = audienceBankSchema.parse({
    version: bank.version,
    source: bank.source,
    provider: bank.provider,
    model: bank.model,
    createdAt: bank.createdAt,
    license: publicLicense.trim(),
    samples: approved.map(({ billedCredits: _cost, prompt: _prompt, ...sample }) => ({
      ...sample,
      prompt: '[Generation prompt withheld; retained in the private approval record.]',
    })),
  });
  // Prepare everything privately before replacing the public bank. Previous assets move
  // back into private staging, so revoked/unapproved files cannot remain downloadable.
  const staging = resolve(privateDirectory, `publish-${randomUUID()}`);
  await mkdir(staging);
  for (const [filename, bytes] of files)
    await writeFile(resolve(staging, filename), bytes, { flag: 'wx' });
  await writeFile(resolve(staging, 'manifest.json'), JSON.stringify(publicBank, null, 2) + '\n');
  await mkdir(dirname(publicDirectory), { recursive: true });
  let backup: string | undefined;
  try {
    const info = await lstat(publicDirectory);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error('Public bank must be a regular directory.');
    backup = resolve(privateDirectory, `previous-public-${randomUUID()}`);
    await rename(publicDirectory, backup);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  try {
    await rename(staging, publicDirectory);
  } catch (error) {
    if (backup) await rename(backup, publicDirectory);
    throw error;
  }
  return { published: approved.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--public-license');
  promoteAudience(
    resolve('artifacts/audience-bank'),
    resolve('public/audience'),
    at < 0 ? '' : (args[at + 1] ?? ''),
  )
    .then((result) => console.log(JSON.stringify(result)))
    .catch(() => {
      console.error(
        'Promotion stopped. Check approved clips, hashes, paths and the explicit public license statement. Private metadata was not printed.',
      );
      process.exitCode = 1;
    });
}
