import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'dotenv';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const walk = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      )
    : [];
const key = existsSync('.env') ? parse(readFileSync('.env')).OPENROUTER_API_KEY : undefined;
const scanned = [...files, ...walk('dist')];
const suspicious = scanned.filter((path) => {
  const content = readFileSync(path, 'utf8');
  return (key && content.includes(key)) || /sk-or-v1-[a-f0-9]{32,}/i.test(content);
});
if (files.some((path) => /^\.env($|\.)/.test(path) && path !== '.env.example'))
  suspicious.push('tracked environment file');
if (suspicious.length) {
  console.error(JSON.stringify({ failed: true, paths: suspicious }));
  process.exitCode = 1;
} else
  console.log(
    JSON.stringify({
      passed: true,
      trackedFiles: files.length,
      bundleFiles: scanned.length - files.length,
      actualLocalKeyChecked: !!key,
    }),
  );
