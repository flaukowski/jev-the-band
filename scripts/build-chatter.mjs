#!/usr/bin/env node
// Builds public/chatter.json (crowd speech-bubble one-liners) from the editable
// batches in content/chatter/batch-*.json. Usage: node scripts/build-chatter.mjs
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(root, 'content', 'chatter');
const outFile = join(root, 'public', 'chatter.json');
const MAX_LEN = 110;
const verbose = process.argv.includes('--verbose');

const files = readdirSync(sourceDir)
  .filter((name) => /^batch-.*\.json$/.test(name))
  .sort();
if (files.length === 0) {
  console.error(`No batch-*.json files found in ${sourceDir}`);
  process.exit(1);
}

const seenExact = new Set();
const seenLoose = new Set();
const out = [];
const stats = { read: 0, empty: 0, tooLong: 0, duplicate: 0 };
const problems = [];

for (const file of files) {
  const parsed = JSON.parse(readFileSync(join(sourceDir, file), 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`${file}: expected a JSON array of strings`);
  parsed.forEach((raw, index) => {
    stats.read += 1;
    if (typeof raw !== 'string') throw new Error(`${file}[${index}]: not a string`);
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line) {
      stats.empty += 1;
      return;
    }
    if (!/^[\x20-\x7E]+$/.test(line)) {
      problems.push(
        `${file}[${index}]: non-ASCII or non-printable character: ${JSON.stringify(line)}`,
      );
      return;
    }
    if (line.length > MAX_LEN) {
      stats.tooLong += 1;
      if (verbose) console.warn(`too long (${line.length}) ${file}[${index}]: ${line}`);
      return;
    }
    const exact = line.toLowerCase();
    const loose = exact.replace(/[^a-z0-9]+/g, '');
    if (seenExact.has(exact) || seenLoose.has(loose)) {
      stats.duplicate += 1;
      if (verbose) console.warn(`duplicate ${file}[${index}]: ${line}`);
      return;
    }
    seenExact.add(exact);
    seenLoose.add(loose);
    out.push(line);
  });
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} line(s) failed the printable-ASCII assertion.`);
  process.exit(1);
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `[\n${out.map((line) => JSON.stringify(line)).join(',\n')}\n]\n`);

console.log(
  `chatter: ${files.length} batches, ${stats.read} read, ${stats.empty} empty, ` +
    `${stats.tooLong} too long, ${stats.duplicate} duplicate -> ${out.length} lines`,
);
console.log(`wrote ${outFile}`);
