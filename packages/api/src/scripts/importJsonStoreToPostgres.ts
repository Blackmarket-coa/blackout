// CLI: migrate the Postgres schema, then import an existing file-mode
// store.json into it. Use this once before switching a single-server instance
// from file mode to BLACKOUT_DB_MODE=postgres so its data carries over.
//
//   DATABASE_URL=... pnpm --filter @blackout/api db:import-json [path/to/store.json]
//
// The path defaults to $BLACKOUT_DB_FILE, then /var/lib/blackout/store.json.
// Safe to re-run: every record is upserted on its natural key.

import { readFileSync } from 'node:fs';
import { migrateUp, MIGRATIONS_DIR, type PgPool } from '../db/migrate';
import { importJsonStoreState, type PersistedSnapshot } from '../db/importJsonStore';

const run = async (): Promise<void> => {
  const filePath =
    process.argv[2] ?? process.env.BLACKOUT_DB_FILE ?? '/var/lib/blackout/store.json';
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required to import into Postgres.');
    process.exit(2);
  }

  let state: PersistedSnapshot;
  try {
    state = JSON.parse(readFileSync(filePath, 'utf8')) as PersistedSnapshot;
  } catch (err) {
    console.error(`Could not read store snapshot at ${filePath}: ${(err as Error).message}`);
    process.exit(2);
  }

  const { default: pg } = (await import('pg')) as {
    default: { Pool: new (cfg: { connectionString: string }) => PgPool };
  };
  const pool = new pg.Pool({ connectionString: databaseUrl });

  try {
    const applied = await migrateUp({ pool, migrationsDir: MIGRATIONS_DIR });
    console.log(`Applied ${applied.length} pending migration(s).`);

    const client = await pool.connect();
    try {
      const summary = await importJsonStoreState(client, state);
      console.log(`Imported ${summary.totalImported} record(s) from ${filePath}:`);
      for (const [table, count] of Object.entries(summary.imported)) {
        console.log(`  ${table}: ${count}`);
      }
      if (summary.totalFailed > 0) {
        console.warn(`${summary.totalFailed} record(s) skipped (see warnings above):`);
        for (const [table, count] of Object.entries(summary.failed)) {
          console.warn(`  ${table}: ${count} failed`);
        }
      }
    } finally {
      client.release?.();
    }
  } finally {
    await pool.end();
  }
};

run().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
