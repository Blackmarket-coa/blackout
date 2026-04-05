import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const migrationDir = 'packages/api/src/db/migrations';
const migrations = readdirSync(migrationDir).filter((file) => file.endsWith('.sql')).sort();

if (!migrations.length) {
  console.error('No migrations found.');
  process.exit(1);
}

const db = new PGlite();

try {
  for (const migration of migrations) {
    const sql = readFileSync(join(migrationDir, migration), 'utf8');
    await db.exec(sql);
  }

  const result = await db.query(
    `select count(*)::int as table_count from information_schema.tables where table_schema = 'public'`,
  );

  const tableCount = Number(result.rows[0]?.table_count ?? 0);
  if (tableCount <= 0) {
    console.error('Migration verification failed: no tables created in ephemeral DB.');
    process.exit(1);
  }

  console.log(`Ephemeral migration verification passed. tables=${tableCount}`);
} finally {
  await db.close();
}
