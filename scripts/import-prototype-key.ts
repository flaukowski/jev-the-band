/** Explicit, local-only import. Never runs at application startup. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parse } from 'dotenv';
const source = process.argv[2];
if (!source) throw new Error('Pass the explicitly authorized source .env path.');
if (existsSync('.env')) throw new Error('A local .env already exists; refusing to overwrite it.');
const key = parse(readFileSync(source)).OPENROUTER_API_KEY;
if (!key || /[\r\n]/.test(key))
  throw new Error('No valid OpenRouter key in the authorized source.');
writeFileSync('.env', `OPENROUTER_API_KEY=${key}\nHOST=127.0.0.1\nPORT=4310\n`, { mode: 0o600 });
console.log('Prototype key imported into ignored server-only .env. No secret printed.');
