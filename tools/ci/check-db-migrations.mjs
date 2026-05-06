/**
 * Migration filename + reversibility guard.
 *
 * Rules:
 *   - Each `.sql` file under packages/api/src/db/migrations/ is non-empty.
 *   - Filenames start with a 3+ digit ordinal followed by an underscore.
 *   - Ordinals are unique across the directory.
 *   - From ordinal 007 onwards, every `NNN_name.up.sql` has a matching
 *     `NNN_name.down.sql`. Pre-007 migrations are grandfathered as
 *     forward-only (NON_REVERSIBLE_FLOOR=7).
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const NON_REVERSIBLE_FLOOR = 7;
const MIGRATIONS_DIR = 'packages/api/src/db/migrations';
const NUMERIC_PREFIX_RE = /^(\d{3,})_/;

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
if (!files.length) {
  console.error('No SQL migrations found.');
  process.exit(1);
}

const errors = [];
const ordinals = new Map();
const upIds = new Map();
const downIds = new Set();

for (const file of files) {
  const stat = statSync(join(MIGRATIONS_DIR, file));
  if (stat.size === 0) {
    errors.push(`empty migration file: ${file}`);
  }

  const base = file.replace(/\.sql$/, '');
  const isDown = base.endsWith('.down');
  const isUp = base.endsWith('.up');
  const id = isDown ? base.slice(0, -'.down'.length) : isUp ? base.slice(0, -'.up'.length) : base;

  const match = NUMERIC_PREFIX_RE.exec(id);
  if (!match) {
    errors.push(`migration filename does not start with a numeric ordinal: ${file}`);
    continue;
  }
  const ordinal = Number.parseInt(match[1], 10);

  if (isDown) {
    downIds.add(id);
  } else {
    if (upIds.has(id)) {
      errors.push(`duplicate up migration for id "${id}": ${upIds.get(id)} and ${file}`);
    }
    upIds.set(id, file);
    if (ordinals.has(ordinal) && ordinals.get(ordinal) !== id) {
      errors.push(
        `duplicate ordinal ${String(ordinal).padStart(3, '0')}: ${ordinals.get(ordinal)} and ${id}`,
      );
    }
    ordinals.set(ordinal, id);
  }
}

for (const [id, file] of upIds) {
  const ordinal = Number.parseInt(NUMERIC_PREFIX_RE.exec(id)[1], 10);
  if (ordinal >= NON_REVERSIBLE_FLOOR && !downIds.has(id)) {
    errors.push(
      `migration ${file} (ordinal ${ordinal}) lacks a matching .down.sql; new migrations must be reversible.`,
    );
  }
}

if (errors.length > 0) {
  console.error('check-db-migrations: FAIL');
  for (const err of errors) console.error(`  ${err}`);
  process.exit(1);
}

const sorted = [...ordinals.entries()].sort((a, b) => a[0] - b[0]);
const latest = sorted.at(-1);
console.log(
  `check-db-migrations: OK (${sorted.length} migration(s); latest ${String(latest[0]).padStart(3, '0')}_${latest[1].slice(4)})`,
);
