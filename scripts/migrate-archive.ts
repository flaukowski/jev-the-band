import 'dotenv/config';
import { Archive } from '../server/archive.js';
import { transferArchive } from '../server/archive-transfer.js';
import { existsSync } from 'node:fs';
const sourcePath = process.argv[2];
if (!sourcePath || !process.env.ARCHIVE_TARGET_DATABASE_URL)
  throw new Error(
    'Usage: set ARCHIVE_TARGET_DATABASE_URL, then npm run archive:migrate -- <sqlite path>',
  );
if (!existsSync(sourcePath)) throw new Error('Source SQLite file does not exist');
const source = new Archive('', sourcePath);
const target = new Archive(process.env.ARCHIVE_TARGET_DATABASE_URL);
try {
  await source.init();
  await target.init();
  const result = await transferArchive(source, target);
  console.log(`Verified ${result.sets} sets and ${result.records} records. Source retained.`);
} finally {
  await source.close();
  await target.close();
}
