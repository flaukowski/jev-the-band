import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promoteAudience } from '../scripts/promote-audience.js';

test('audience promotion publishes only reviewed bytes, strips private metadata and removes revoked public clips', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-audience-'));
  const privateDir = join(root, 'private');
  const publicDir = join(root, 'public', 'audience');
  try {
    await mkdir(privateDir);
    await mkdir(publicDir, { recursive: true });
    await writeFile(join(publicDir, 'revoked.mp3'), 'must no longer be public');
    const samples = [];
    for (const [id, approved] of [
      ['approved', true],
      ['rejected', false],
    ] as const) {
      const bytes = Buffer.from(`audio ${id}`);
      await writeFile(join(privateDir, `${id}.mp3`), bytes);
      samples.push({
        id,
        approved,
        path: `/audience/${id}.mp3`,
        mood: 'listening',
        kind: 'bed',
        durationSeconds: 12,
        prompt: 'PRIVATE PROMPT',
        billedCredits: 480,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
    await writeFile(
      join(privateDir, 'manifest.json'),
      JSON.stringify({
        version: 1,
        source: 'generated',
        provider: 'ElevenLabs',
        model: 'eleven_text_to_sound_v2',
        createdAt: new Date().toISOString(),
        license: 'PRIVATE ACCOUNT GRANT',
        samples,
      }),
    );
    assert.deepEqual(
      await promoteAudience(privateDir, publicDir, 'Reviewed public redistribution grant.'),
      { published: 1 },
    );
    assert.deepEqual((await readdir(publicDir)).sort(), ['approved.mp3', 'manifest.json']);
    const manifest = await readFile(join(publicDir, 'manifest.json'), 'utf8');
    assert.doesNotMatch(manifest, /PRIVATE|billedCredits|rejected/);
    assert.equal(await readFile(join(publicDir, 'approved.mp3'), 'utf8'), 'audio approved');
    await writeFile(join(privateDir, 'approved.mp3'), 'changed since approval');
    await assert.rejects(
      promoteAudience(privateDir, publicDir, 'Reviewed public redistribution grant.'),
      /changed after review/,
    );
    assert.equal(await readFile(join(publicDir, 'manifest.json'), 'utf8'), manifest);
    const privateBank = JSON.parse(await readFile(join(privateDir, 'manifest.json'), 'utf8'));
    for (const sample of privateBank.samples) sample.approved = false;
    await writeFile(join(privateDir, 'manifest.json'), JSON.stringify(privateBank));
    assert.deepEqual(
      await promoteAudience(privateDir, publicDir, 'Reviewed public redistribution grant.'),
      { published: 0 },
    );
    assert.deepEqual(await readdir(publicDir), ['manifest.json']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
