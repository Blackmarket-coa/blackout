/**
 * Boots an in-memory PGlite database, applies every migration in order, and
 * round-trips the reversible (>= NON_REVERSIBLE_FLOOR) ones via their
 * .down.sql + re-applied .up.sql so we know down scripts are not silently
 * broken.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const NON_REVERSIBLE_FLOOR = 7;
const MIGRATIONS_DIR = 'packages/api/src/db/migrations';
const NUMERIC_PREFIX_RE = /^(\d{3,})_/;

const allFiles = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));

const upMap = new Map();
const downMap = new Map();
for (const file of allFiles) {
  const base = file.replace(/\.sql$/, '');
  if (base.endsWith('.down')) downMap.set(base.slice(0, -'.down'.length), file);
  else if (base.endsWith('.up')) upMap.set(base.slice(0, -'.up'.length), file);
  else upMap.set(base, file);
}

const migrations = [...upMap.entries()]
  .map(([id, file]) => ({
    id,
    ordinal: Number.parseInt(NUMERIC_PREFIX_RE.exec(id)[1], 10),
    upPath: join(MIGRATIONS_DIR, file),
    downPath: downMap.has(id) ? join(MIGRATIONS_DIR, downMap.get(id)) : null,
  }))
  .sort((a, b) => a.ordinal - b.ordinal);

if (!migrations.length) {
  console.error('No migrations found.');
  process.exit(1);
}

const db = new PGlite();

const tableCount = async () => {
  const result = await db.query(
    `SELECT count(*)::int AS c FROM information_schema.tables WHERE table_schema = 'public'`,
  );
  return Number(result.rows[0]?.c ?? 0);
};

try {
  for (const m of migrations) {
    const sql = readFileSync(m.upPath, 'utf8');
    await db.exec(sql);
  }

  const tablesAfterUp = await tableCount();
  if (tablesAfterUp <= 0) {
    console.error('Migration verification failed: no tables created in ephemeral DB.');
    process.exit(1);
  }

  // Round-trip the reversible tail: down then up again.
  const reversibles = migrations.filter((m) => m.ordinal >= NON_REVERSIBLE_FLOOR);
  const reversed = [...reversibles].sort((a, b) => b.ordinal - a.ordinal);
  for (const m of reversed) {
    if (!m.downPath) {
      console.error(`Migration ${m.id} has no .down.sql but is at or above the reversible floor.`);
      process.exit(1);
    }
    const sql = readFileSync(m.downPath, 'utf8');
    await db.exec(sql);
  }

  for (const m of reversibles) {
    const sql = readFileSync(m.upPath, 'utf8');
    await db.exec(sql);
  }

  const tablesAfterRoundTrip = await tableCount();
  if (tablesAfterRoundTrip !== tablesAfterUp) {
    console.error(
      `Migration round-trip changed table count: before=${tablesAfterUp} after=${tablesAfterRoundTrip}.`,
    );
    process.exit(1);
  }

  console.log(
    `Ephemeral migration verification passed. tables=${tablesAfterUp} reversible=${reversibles.length}`,
  );
} finally {
  await db.close();
}
