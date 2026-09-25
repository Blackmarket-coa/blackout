// CLI: remove the coalition demo seed rows (demo-canopy feed items, @oak/@vine
// mutual-aid posts, aidp_seed_*, task_seed_*, sloc_seed_*, spatial-*-1 pins)
// that earlier boots wrote into a real deployment's store.
//
//   pnpm --filter @blackout/api db:clean-demo-seed            # dry run (default)
//   pnpm --filter @blackout/api db:clean-demo-seed --apply    # actually delete
//   pnpm --filter @blackout/api db:clean-demo-seed --file path/to/store.json
//
// Backends: with DATABASE_URL set it cleans the Postgres tables; with a store
// file present ($BLACKOUT_DB_FILE, else .blackout/data/store.json, or --file)
// it cleans that snapshot. Both run when both are available.
//
// Only rows whose id is one of the COALITION_SEED_IDS constants are touched —
// nothing is matched by pattern, so user-created rows are never deleted. It is
// idempotent: a second run finds nothing. Rows that reference a seed row (feed
// likes/comments on a seeded feed item) are left alone.
//
// Stop the API (or restart it right after) when applying: a running server holds
// the seed rows in memory and its next file persist / Postgres resync would
// write them back. Boot it with demo seeding off (the production default, see
// shouldSeedCoalitionDemoData) so they are not re-seeded.
//
// Exit codes: 0 = ok, 2 = usage error / nothing to clean against.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COALITION_SEED_IDS, type CoalitionSeedMapName } from '../db/coalitionSeed';
import type { PgClient, PgPool } from '../db/migrate';
import { TABLE_DESCRIPTORS } from '../db/pgDescriptors';
import { introspectColumns } from '../db/pgWriter';

export interface SeedCleanupEntry {
    /** Store map name (file store key). */
    mapName: CoalitionSeedMapName;
    /** Postgres table name (for the pg backend). */
    table: string;
    /** Seed ids actually present in this backend, i.e. what is/would be deleted. */
    matchedIds: string[];
    /** Table missing (pg) or map absent (file) — nothing to do. */
    skipped?: boolean;
}

export interface SeedCleanupReport {
    backend: 'postgres' | 'file';
    applied: boolean;
    entries: SeedCleanupEntry[];
    total: number;
}

const SEED_MAP_NAMES = Object.keys(COALITION_SEED_IDS) as CoalitionSeedMapName[];

function tableFor(mapName: CoalitionSeedMapName): string {
    const descriptor = TABLE_DESCRIPTORS.find((d) => d.mapName === mapName);
    if (!descriptor) throw new Error(`No Postgres descriptor for store map ${mapName}`);
    // Seed rows are addressed by id; refuse to guess for a composite-keyed table.
    if (descriptor.conflictColumns.length !== 1 || descriptor.conflictColumns[0] !== 'id') {
        throw new Error(`Table ${descriptor.tableName} is not keyed by id`);
    }
    return descriptor.tableName;
}

function finish(
    backend: SeedCleanupReport['backend'],
    applied: boolean,
    entries: SeedCleanupEntry[]
): SeedCleanupReport {
    const total = entries.reduce((n, e) => n + e.matchedIds.length, 0);
    return { backend, applied, entries, total };
}

/**
 * Find (and with `apply`, delete) the seed rows in Postgres. Deletes run in one
 * transaction so a partial failure leaves the tables untouched.
 */
export async function cleanDemoSeedPostgres(
    client: PgClient,
    options: { apply: boolean }
): Promise<SeedCleanupReport> {
    const entries: SeedCleanupEntry[] = [];
    for (const mapName of SEED_MAP_NAMES) {
        const table = tableFor(mapName);
        const columns = await introspectColumns(client, table);
        if (columns.length === 0) {
            entries.push({ mapName, table, matchedIds: [], skipped: true });
            continue;
        }
        const res = await client.query<{ id: string }>(
            `SELECT id FROM ${table} WHERE id = ANY($1::text[]) ORDER BY id`,
            [[...COALITION_SEED_IDS[mapName]]]
        );
        entries.push({ mapName, table, matchedIds: res.rows.map((r) => String(r.id)) });
    }

    const toDelete = entries.filter((e) => e.matchedIds.length > 0);
    if (options.apply && toDelete.length > 0) {
        await client.query('BEGIN');
        try {
            for (const entry of toDelete) {
                await client.query(`DELETE FROM ${entry.table} WHERE id = ANY($1::text[])`, [
                    entry.matchedIds,
                ]);
            }
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
    }
    return finish('postgres', options.apply, entries);
}

type Snapshot = Record<string, unknown>;

/**
 * Find (and with `apply`, drop) the seed rows in a parsed file-store snapshot.
 * Returns the report and the cleaned snapshot; the input is not mutated.
 */
export function cleanDemoSeedSnapshot(
    snapshot: Snapshot,
    options: { apply: boolean }
): { report: SeedCleanupReport; snapshot: Snapshot } {
    const entries: SeedCleanupEntry[] = [];
    const next: Snapshot = { ...snapshot };
    for (const mapName of SEED_MAP_NAMES) {
        const table = tableFor(mapName);
        const rows = snapshot[mapName];
        if (!Array.isArray(rows)) {
            entries.push({ mapName, table, matchedIds: [], skipped: true });
            continue;
        }
        const seedIds = new Set<string>(COALITION_SEED_IDS[mapName]);
        const isSeed = (row: unknown) =>
            !!row && typeof row === 'object' && seedIds.has(String((row as { id?: unknown }).id));
        entries.push({
            mapName,
            table,
            matchedIds: rows
                .filter(isSeed)
                .map((row) => String((row as { id: unknown }).id))
                .sort(),
        });
        if (options.apply) next[mapName] = rows.filter((row) => !isSeed(row));
    }
    const report = finish('file', options.apply, entries);
    return { report, snapshot: options.apply ? next : snapshot };
}

/** Clean a store.json on disk; writes (atomically) only when applying and something matched. */
export function cleanDemoSeedFile(
    filePath: string,
    options: { apply: boolean }
): SeedCleanupReport {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Snapshot;
    const { report, snapshot } = cleanDemoSeedSnapshot(parsed, options);
    if (options.apply && report.total > 0) {
        const tmpPath = `${filePath}.tmp-${process.pid}`;
        writeFileSync(tmpPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
        renameSync(tmpPath, filePath);
    }
    return report;
}

export function formatSeedCleanupReport(report: SeedCleanupReport, target: string): string[] {
    const verb = report.applied ? 'deleted' : 'would delete';
    const lines = [`[${report.backend}] ${target}`];
    for (const entry of report.entries) {
        const where = report.backend === 'postgres' ? entry.table : entry.mapName;
        if (entry.skipped) {
            lines.push(`  ${where}: not present, skipped`);
            continue;
        }
        const ids = entry.matchedIds.length > 0 ? ` (${entry.matchedIds.join(', ')})` : '';
        lines.push(`  ${where}: ${verb} ${entry.matchedIds.length}${ids}`);
    }
    lines.push(`  total: ${verb} ${report.total}`);
    return lines;
}

function parseArgs(argv: string[]): { apply: boolean; file?: string } {
    const out: { apply: boolean; file?: string } = { apply: false };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--') continue;
        else if (arg === '--apply') out.apply = true;
        else if (arg === '--dry-run') out.apply = false;
        else if (arg === '--file') out.file = argv[++i];
        else if (arg.startsWith('--file=')) out.file = arg.slice('--file='.length);
        else throw new Error(`Unknown argument: ${arg}`);
    }
    return out;
}

const run = async (): Promise<void> => {
    let args: { apply: boolean; file?: string };
    try {
        args = parseArgs(process.argv.slice(2));
    } catch (err) {
        console.error((err as Error).message);
        console.error('Usage: db:clean-demo-seed [--apply] [--file path/to/store.json]');
        process.exit(2);
    }

    const filePath = resolve(
        process.cwd(),
        args.file ?? process.env.BLACKOUT_DB_FILE ?? '.blackout/data/store.json'
    );
    const databaseUrl = process.env.DATABASE_URL;
    const hasFile = existsSync(filePath);
    if (args.file && !hasFile) {
        console.error(`Store file not found: ${filePath}`);
        process.exit(2);
    }
    if (!databaseUrl && !hasFile) {
        console.error(`Nothing to clean: DATABASE_URL is unset and no store file at ${filePath}.`);
        process.exit(2);
    }

    console.log(
        args.apply ? 'Mode: APPLY (deleting seed rows)' : 'Mode: dry run (pass --apply to delete)'
    );

    if (databaseUrl) {
        const { default: pg } = (await import('pg')) as {
            default: { Pool: new (cfg: { connectionString: string }) => PgPool };
        };
        const pool = new pg.Pool({ connectionString: databaseUrl });
        const client = await pool.connect();
        const report = await cleanDemoSeedPostgres(client, args).finally(async () => {
            client.release?.();
            await pool.end();
        });
        for (const line of formatSeedCleanupReport(report, 'DATABASE_URL')) console.log(line);
    }

    if (hasFile) {
        const report = cleanDemoSeedFile(filePath, args);
        for (const line of formatSeedCleanupReport(report, filePath)) console.log(line);
    }
    process.exit(0);
};

// Only run the CLI when executed directly, not when imported by tests.
const isMain = (() => {
    try {
        return (
            import.meta.url === `file://${process.argv[1]}` ||
            process.argv[1]?.endsWith('cleanCoalitionDemoSeed.ts') === true
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
