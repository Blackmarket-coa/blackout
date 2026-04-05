import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const migrationDir = 'packages/api/src/db/migrations';
const files = readdirSync(migrationDir).filter((file) => file.endsWith('.sql')).sort();

if (!files.length) {
  console.error('No SQL migrations found.');
  process.exit(1);
}

const latest = files.at(-1);
const latestPath = join(migrationDir, latest);
const latestStat = statSync(latestPath);

if (latestStat.size === 0) {
  console.error(`Latest migration is empty: ${latest}`);
  process.exit(1);
}

console.log(`Migration verification passed. Latest migration: ${latest}`);
