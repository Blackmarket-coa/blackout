// CLI: verify a file-mode store.json snapshot against a Postgres database
// *before* trusting the file→postgres user migration in front of billing. Run it
// after db:import-json and before switching a single-server instance to
// BLACKOUT_DB_MODE=postgres:
//
//   DATABASE_URL=... pnpm --filter @blackout/api db:verify-import [path/to/store.json]
//
// The path defaults to $BLACKOUT_DB_FILE, then /var/lib/blackout/store.json.
// Read-only: it never writes. It confirms two things —
//   1. every store table in Postgres covers the rows the snapshot expected
//      (equal, or MORE for post-import writes like new signups), and no snapshot
//      user id is missing from the users table; and
//   2. the applied migration history still matches the migration files on disk
//      (a clean import over a drifting schema is still unsafe).
//
// Exit codes: 0 = verified, 1 = mismatch/drift, 2 = usage error.

import { readFileSync } from 'node:fs';
import {
    MIGRATIONS_DIR,
    verifyMigrationChecksums,
    type ChecksumVerificationResult,
    type PgClient,
    type PgPool,
} from '../db/migrate';
import type { PersistedSnapshot } from '../db/importJsonStore';
import { TABLE_DESCRIPTORS } from '../db/pgDescriptors';
import { introspectColumns } from '../db/pgWriter';

export type TableVerifyStatus = 'ok' | 'ok-extra' | 'missing-rows' | 'missing-table';

export interface TableVerifyResult {
    table: string;
    mapName: string;
    snapshotCount: number;
    dbCount: number;
    status: TableVerifyStatus;
}

export interface VerifyReport {
    ok: boolean;
    tables: TableVerifyResult[];
    usersDiff?: { missingInDb: string[]; shownCount: number };
    /** Folded-in migration-checksum audit; failure here also fails the report. */
    checksums?: ChecksumVerificationResult;
}

/** Cap the number of missing user ids echoed to the operator (all are still counted). */
const USERS_DIFF_CAP = 20;

/**
 * Pure-ish core: diff a store snapshot against the live Postgres tables.
 *
 * For each descriptor: introspect the table (no columns => it does not exist),
 * count its rows, and compare to the snapshot's row count for that map. dbCount
 * < snapshotCount is a real gap (rows never landed); dbCount > snapshotCount is
 * fine (legitimate writes since the import). The users table additionally gets
 * an id-level diff so a partial user migration is named, not just counted.
 */
export async function compareSnapshotToDatabase(
    client: PgClient,
    snapshot: PersistedSnapshot
): Promise<VerifyReport> {
    const tables: TableVerifyResult[] = [];
    let ok = true;
    let usersDiff: VerifyReport['usersDiff'];

    for (const descriptor of TABLE_DESCRIPTORS) {
        const snapshotRows = snapshot[descriptor.mapName];
        const snapshotCount = Array.isArray(snapshotRows) ? snapshotRows.length : 0;

        const columns = await introspectColumns(client, descriptor.tableName);
        if (columns.length === 0) {
            // Table absent. Only a problem if the snapshot expected to fill it;
            // an empty map for an absent table is a no-op, not a failure.
            if (snapshotCount > 0) {
                ok = false;
                tables.push({
                    table: descriptor.tableName,
                    mapName: descriptor.mapName,
                    snapshotCount,
                    dbCount: 0,
                    status: 'missing-table',
                });
            }
            continue;
        }

        // tableName is descriptor-resolved (code-owned), never user input — the
        // same trust boundary importJsonStore/pgWriter interpolate table names under.
        const countRes = await client.query<{ count: number }>(
            `SELECT count(*)::int AS count FROM ${descriptor.tableName}`
        );
        const dbCount = Number(countRes.rows[0]?.count ?? 0);

        let status: TableVerifyStatus;
        if (dbCount === snapshotCount) {
            status = 'ok';
        } else if (dbCount > snapshotCount) {
            status = 'ok-extra';
        } else {
            status = 'missing-rows';
            ok = false;
        }
        tables.push({
            table: descriptor.tableName,
            mapName: descriptor.mapName,
            snapshotCount,
            dbCount,
            status,
        });

        if (descriptor.mapName === 'users') {
            const snapIds = (Array.isArray(snapshotRows) ? snapshotRows : []).map((r) =>
                descriptor.keyOf(r)
            );
            const dbIdRes = await client.query<{ id: string }>(
                `SELECT id FROM ${descriptor.tableName}`
            );
            const dbIds = new Set(dbIdRes.rows.map((r) => String(r.id)));
            const missingInDb = snapIds.filter((id) => !dbIds.has(id));
            usersDiff = {
                missingInDb: missingInDb.slice(0, USERS_DIFF_CAP),
                shownCount: missingInDb.length,
            };
            if (missingInDb.length > 0) ok = false;
        }
    }

    // Fold in the migration-checksum audit: a snapshot can import cleanly yet the
    // live schema still be drifting from the migration files on disk.
    // verifyMigrationChecksums wants a Pool, so wrap the live client (release is a
    // no-op — we keep using the same connection afterwards / the caller owns it).
    const checksumPool: PgPool = {
        connect: async (): Promise<PgClient> => ({
            query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) =>
                client.query<T>(sql, params),
            release: () => {},
        }),
        end: async () => {},
    };
    const checksums = await verifyMigrationChecksums(checksumPool, MIGRATIONS_DIR);
    if (!checksums.ok) ok = false;

    return { ok, tables, usersDiff, checksums };
}

/** Render a human-readable operator summary of a report (one line per element). */
export function formatReport(report: VerifyReport): string[] {
    const lines: string[] = [];

    // Only surface tables that carried snapshot rows or diverged — a fully
    // migrated DB has ~130 tables and most are an uninteresting 0 == 0.
    const notable = report.tables.filter((t) => t.snapshotCount > 0 || t.status !== 'ok');
    lines.push('Table parity (snapshot vs postgres):');
    if (notable.length === 0) {
        lines.push('  (snapshot empty or every populated table matches)');
    }
    for (const t of notable) {
        lines.push(`  [${t.status}] ${t.table}: snapshot=${t.snapshotCount} db=${t.dbCount}`);
    }
    const covered = report.tables.filter(
        (t) => t.status === 'ok' || t.status === 'ok-extra'
    ).length;
    lines.push(`  ${covered}/${report.tables.length} table(s) cover their snapshot rows.`);

    if (report.usersDiff) {
        if (report.usersDiff.shownCount === 0) {
            lines.push('Users: every snapshot user id is present in postgres.');
        } else {
            lines.push(
                `Users: ${report.usersDiff.shownCount} snapshot id(s) MISSING in postgres ` +
                    `(showing ${report.usersDiff.missingInDb.length}):`
            );
            for (const id of report.usersDiff.missingInDb) lines.push(`  - ${id}`);
        }
    }

    if (report.checksums) {
        if (report.checksums.ok) {
            lines.push('Migration checksums: OK (applied history matches files on disk).');
        } else {
            lines.push('Migration checksums: DRIFT detected —');
            for (const m of report.checksums.mismatches) {
                lines.push(`  edited since apply: ${m.id}`);
            }
            for (const id of report.checksums.missingOnDisk) {
                lines.push(`  applied but missing on disk: ${id}`);
            }
        }
    }

    return lines;
}

const run = async (): Promise<void> => {
    const filePath =
        process.argv[2] ?? process.env.BLACKOUT_DB_FILE ?? '/var/lib/blackout/store.json';
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        console.error('DATABASE_URL is required to verify the Postgres import.');
        process.exit(2);
    }

    let snapshot: PersistedSnapshot;
    try {
        snapshot = JSON.parse(readFileSync(filePath, 'utf8')) as PersistedSnapshot;
    } catch (err) {
        console.error(`Could not read store snapshot at ${filePath}: ${(err as Error).message}`);
        process.exit(2);
    }

    const { default: pg } = (await import('pg')) as {
        default: { Pool: new (cfg: { connectionString: string }) => PgPool };
    };
    const pool = new pg.Pool({ connectionString: databaseUrl });

    const client = await pool.connect();
    const report = await compareSnapshotToDatabase(client, snapshot).finally(async () => {
        client.release?.();
        await pool.end();
    });

    console.log(`Verifying ${filePath} against Postgres:`);
    for (const line of formatReport(report)) console.log(line);
    console.log(report.ok ? 'RESULT: PASS' : 'RESULT: FAIL');
    process.exit(report.ok ? 0 : 1);
};

// Only run the CLI when executed directly (tsx src/scripts/verifyJsonStoreImport.ts),
// not when imported for its exported core (compareSnapshotToDatabase) by tests.
const isMain = (() => {
    try {
        return (
            import.meta.url === `file://${process.argv[1]}` ||
            process.argv[1]?.endsWith('verifyJsonStoreImport.ts') === true
        );
    } catch {
        return false;
    }
})();

if (isMain) {
    run().catch((err) => {
        console.error(err instanceof Error ? err.message : err);
        process.exit(1);
    });
}
