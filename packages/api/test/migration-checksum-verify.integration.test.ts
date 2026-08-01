// Boot-time migration checksum audit (verifyMigrationChecksums / assertMigrationChecksums).
// Runs the REAL migrateUp against an in-process PGlite so schema_migrations is
// genuinely populated, then exercises the two silent-drift hazards the audit
// exists to catch: (1) an applied migration file edited after it was applied
// (recorded checksum no longer matches on-disk bytes) and (2) an applied
// migration whose file is gone from disk entirely.

import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.BLACKOUT_DB_MODE = 'memory';

const {
    migrateUp,
    verifyMigrationChecksums,
    assertMigrationChecksums,
    discoverMigrations,
    MIGRATIONS_DIR,
} = await import('../src/db/migrate');
const { PGlite } = await import('@electric-sql/pglite');

type AnyPg = {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
    exec: (sql: string) => Promise<Array<{ rows?: unknown[] }>>;
    close: () => Promise<void>;
};

// Parameterless SQL (migration batches, BEGIN/COMMIT, the schema_migrations DDL,
// SELECTs) goes to exec(); parameterized SQL goes to query().
function wrap(pg: AnyPg) {
    const client = {
        async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
            const hasParams = Array.isArray(params) && params.length > 0;
            if (!hasParams) {
                const results = await pg.exec(sql);
                const last = results.at(-1);
                return { rows: (last?.rows ?? []) as T[] };
            }
            const result = await pg.query(sql, params);
            return { rows: result.rows as T[] };
        },
        release: () => {},
    };
    return { client, pool: { connect: async () => client, end: async () => {} } };
}

async function migratedDb() {
    const pg = new PGlite() as unknown as AnyPg;
    const { client, pool } = wrap(pg);
    await migrateUp({ pool: pool as never, migrationsDir: MIGRATIONS_DIR });
    return { pg, client, pool };
}

const ZEROS = '0'.repeat(64);

test('verifyMigrationChecksums is ok when the applied history matches the files on disk', async () => {
    const { pool } = await migratedDb();
    const result = await verifyMigrationChecksums(pool as never, MIGRATIONS_DIR);
    assert.equal(result.ok, true);
    assert.deepEqual(result.mismatches, []);
    assert.deepEqual(result.missingOnDisk, []);
    // The assert-style wrapper does not throw on a clean history.
    await assert.doesNotReject(assertMigrationChecksums(pool as never, MIGRATIONS_DIR));
});

test('an edited applied migration is reported as a mismatch and assert throws', async () => {
    const { client, pool } = await migratedDb();

    // Rewrite the recorded checksum of ordinal 1 (001_phase1_schema) so it no
    // longer matches the on-disk file hash — the exact shape of an in-place edit
    // to an already-applied migration.
    await client.query('UPDATE schema_migrations SET checksum = $1 WHERE ordinal = $2', [ZEROS, 1]);

    const result = await verifyMigrationChecksums(pool as never, MIGRATIONS_DIR);
    assert.equal(result.ok, false);
    assert.equal(result.missingOnDisk.length, 0, 'the file still exists — this is a mismatch');
    assert.equal(result.mismatches.length, 1);
    const firstId = discoverMigrations(MIGRATIONS_DIR).find((m) => m.ordinal === 1)?.id;
    assert.equal(result.mismatches[0].id, firstId);
    assert.equal(result.mismatches[0].recorded, ZEROS);
    assert.notEqual(result.mismatches[0].actual, ZEROS, 'on-disk hash is the real file hash');

    // assertMigrationChecksums aggregates the failure into a throw.
    await assert.rejects(
        assertMigrationChecksums(pool as never, MIGRATIONS_DIR),
        /checksum verification failed/i
    );
});

test('an applied migration missing from disk is reported in missingOnDisk', async () => {
    const { pool } = await migratedDb();

    // Copy the whole migrations dir, then delete one APPLIED up file. Pointing
    // the audit at this copy makes that migration "applied but missing on disk".
    const tempDir = mkdtempSync(join(tmpdir(), 'ckv-missing-'));
    for (const file of readdirSync(MIGRATIONS_DIR)) {
        copyFileSync(join(MIGRATIONS_DIR, file), join(tempDir, file));
    }
    const deletedId = '078_canopy_subscriptions';
    rmSync(join(tempDir, `${deletedId}.up.sql`));

    const result = await verifyMigrationChecksums(pool as never, tempDir);
    assert.equal(result.ok, false);
    assert.ok(
        result.missingOnDisk.includes(deletedId),
        `${deletedId} should be reported as applied-but-missing-on-disk`
    );
    // The surviving migrations are byte-identical copies, so nothing is a mismatch.
    assert.deepEqual(result.mismatches, []);

    await assert.rejects(assertMigrationChecksums(pool as never, tempDir), /missing on disk/i);

    rmSync(tempDir, { recursive: true, force: true });
});
