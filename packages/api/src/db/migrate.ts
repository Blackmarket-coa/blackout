/**
 * Postgres migration runner for the Blackout API.
 *
 * Conventions:
 *   - Forward migrations live in src/db/migrations/.
 *     - Pre-007 use `NNN_name.sql` (legacy, forward-only).
 *     - 007+ use the explicit `NNN_name.up.sql` + `NNN_name.down.sql` pair.
 *   - Each forward migration runs once, inside a single transaction, under a
 *     pg_advisory_lock so two replicas cannot race on startup.
 *   - Applied migrations are tracked in `schema_migrations`.
 *
 * Commands:
 *   pnpm --filter @blackout/api migrate:up [--target NNN]
 *   pnpm --filter @blackout/api migrate:down --target NNN
 *   pnpm --filter @blackout/api migrate:status
 */

import { readFileSync, readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { createHash } from 'node:crypto';

const ADVISORY_LOCK_KEY = 0x424c_4f43; // 'BLOC' (Blackout migration lock)
const NON_REVERSIBLE_FLOOR = 7; // Migrations < 007 do not ship .down.sql.

export type MigrationDirection = 'up' | 'down';

export interface MigrationFile {
    /** e.g. "007_auth_lifecycle". */
    id: string;
    /** Numeric prefix as integer for ordering. */
    ordinal: number;
    upPath: string;
    downPath: string | null;
}

export interface AppliedMigration {
    id: string;
    ordinal: number;
    checksum: string;
    appliedAt: Date;
}

export interface ChecksumMismatch {
    id: string;
    /** Checksum recorded when the migration was first applied. */
    recorded: string;
    /** Checksum of the migration file as it exists on disk now. */
    actual: string;
}

export interface PgClient {
    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
    release?(): void;
}

export interface PgPool {
    connect(): Promise<PgClient>;
    end(): Promise<void>;
}

export interface MigrateOptions {
    pool: PgPool;
    migrationsDir: string;
    /** Stop after this ordinal (inclusive for up, exclusive for down). */
    targetOrdinal?: number;
}

/** Filesystem path to the bundled migration SQL files. */
export const MIGRATIONS_DIR = new URL('./migrations/', import.meta.url).pathname;

const SCHEMA_MIGRATIONS_DDL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(128) PRIMARY KEY,
    ordinal INT NOT NULL,
    checksum CHAR(64) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_schema_migrations_ordinal
    ON schema_migrations (ordinal);
`;

const sha256 = (input: string): string => createHash('sha256').update(input).digest('hex');

const NUMERIC_PREFIX_RE = /^(\d{3,})_/;

export const discoverMigrations = (dir: string): MigrationFile[] => {
    const files = readdirSync(dir);
    const upFiles = new Map<string, string>();
    const downFiles = new Map<string, string>();

    for (const file of files) {
        if (extname(file) !== '.sql') continue;
        const base = basename(file, '.sql');
        if (base.endsWith('.down')) {
            downFiles.set(base.slice(0, -'.down'.length), file);
        } else if (base.endsWith('.up')) {
            upFiles.set(base.slice(0, -'.up'.length), file);
        } else {
            // Legacy: `NNN_name.sql` is treated as forward-only.
            upFiles.set(base, file);
        }
    }

    const migrations: MigrationFile[] = [];
    for (const [id, file] of upFiles) {
        const match = NUMERIC_PREFIX_RE.exec(id);
        if (!match) continue;
        const ordinal = Number.parseInt(match[1], 10);
        migrations.push({
            id,
            ordinal,
            upPath: join(dir, file),
            downPath: downFiles.has(id) ? join(dir, downFiles.get(id)!) : null,
        });
    }

    migrations.sort((a, b) => a.ordinal - b.ordinal);

    // Ensure ordinals are unique.
    const seen = new Set<number>();
    for (const m of migrations) {
        if (seen.has(m.ordinal)) {
            throw new Error(
                `Duplicate migration ordinal ${m.ordinal} (id=${m.id}); fix the filename.`
            );
        }
        seen.add(m.ordinal);
    }

    return migrations;
};

const withAdvisoryLock = async <T>(client: PgClient, fn: () => Promise<T>): Promise<T> => {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    try {
        return await fn();
    } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    }
};

const ensureSchemaMigrations = async (client: PgClient): Promise<void> => {
    await client.query(SCHEMA_MIGRATIONS_DDL);
};

export const fetchApplied = async (client: PgClient): Promise<AppliedMigration[]> => {
    const { rows } = await client.query<{
        id: string;
        ordinal: number;
        checksum: string;
        applied_at: Date;
    }>('SELECT id, ordinal, checksum, applied_at FROM schema_migrations ORDER BY ordinal ASC');
    return rows.map((row) => ({
        id: row.id,
        ordinal: row.ordinal,
        checksum: row.checksum,
        appliedAt: new Date(row.applied_at),
    }));
};

/**
 * Detect applied migrations whose on-disk `.up.sql` no longer matches the
 * checksum recorded when they were first applied. Editing an already-applied
 * migration file is a silent schema-drift hazard: the file's DDL changes but
 * the live database was built from the old version, so a fresh environment
 * (or a teammate) ends up with a *different* schema from the same migration
 * history. The fix is always a NEW migration, never an edit to an applied one.
 *
 * Only migrations with a discoverable on-disk up file are checked; a
 * recorded-but-missing file is handled separately by the down-migration path.
 */
export const detectChecksumDrift = (
    applied: AppliedMigration[],
    all: MigrationFile[]
): ChecksumMismatch[] => {
    const byId = new Map(all.map((m) => [m.id, m]));
    const drift: ChecksumMismatch[] = [];
    for (const entry of applied) {
        const file = byId.get(entry.id);
        if (!file) continue;
        const actual = sha256(readFileSync(file.upPath, 'utf8'));
        if (actual !== entry.checksum) {
            drift.push({ id: entry.id, recorded: entry.checksum, actual });
        }
    }
    return drift;
};

export interface ChecksumVerificationResult {
    ok: boolean;
    /** Applied migrations whose on-disk `.up.sql` hash differs from the recorded checksum. */
    mismatches: ChecksumMismatch[];
    /** Applied migration ids recorded in schema_migrations with no `.up.sql` on disk at all. */
    missingOnDisk: string[];
}

/** Human-readable multi-line detail for a failed checksum verification. */
export const formatChecksumVerificationFailure = (result: ChecksumVerificationResult): string => {
    const lines: string[] = [];
    for (const d of result.mismatches) {
        lines.push(
            `  edited since apply: ${d.id} (recorded ${d.recorded.slice(
                0,
                12
            )}… on-disk ${d.actual.slice(0, 12)}…)`
        );
    }
    for (const id of result.missingOnDisk) {
        lines.push(`  applied but missing on disk: ${id}`);
    }
    return (
        'Migration checksum verification failed — the applied migration history does not match ' +
        'the migration files on disk:\n' +
        `${lines.join('\n')}\n` +
        'An edited or deleted applied migration causes silent schema drift across environments. ' +
        'Restore the original file(s) and ship schema changes as a NEW migration instead.'
    );
};

/**
 * Boot-time checksum audit (M12): compare every APPLIED migration against the
 * on-disk migration files without applying anything. Catches the two
 * silent-drift hazards a boot that skips migrateUp
 * (BLACKOUT_DB_MIGRATE_ON_START=0) would otherwise never see:
 *   - an applied migration file edited after it was applied, and
 *   - an applied migration whose file is missing from disk entirely
 *     (detectChecksumDrift alone silently skips those).
 * Read-only apart from ensuring schema_migrations exists.
 */
export const verifyMigrationChecksums = async (
    pool: PgPool,
    migrationsDir: string = MIGRATIONS_DIR
): Promise<ChecksumVerificationResult> => {
    const all = discoverMigrations(migrationsDir);
    const onDisk = new Set(all.map((m) => m.id));
    const client = await pool.connect();
    try {
        await ensureSchemaMigrations(client);
        const applied = await fetchApplied(client);
        const mismatches = detectChecksumDrift(applied, all);
        const missingOnDisk = applied.filter((a) => !onDisk.has(a.id)).map((a) => a.id);
        return {
            ok: mismatches.length === 0 && missingOnDisk.length === 0,
            mismatches,
            missingOnDisk,
        };
    } finally {
        client.release?.();
    }
};

/**
 * Assert-style wrapper over verifyMigrationChecksums: throws one aggregated
 * error listing every mismatch and missing file when verification fails.
 */
export const assertMigrationChecksums = async (
    pool: PgPool,
    migrationsDir: string = MIGRATIONS_DIR
): Promise<ChecksumVerificationResult> => {
    const result = await verifyMigrationChecksums(pool, migrationsDir);
    if (!result.ok) throw new Error(formatChecksumVerificationFailure(result));
    return result;
};

const assertNoChecksumDrift = (applied: AppliedMigration[], all: MigrationFile[]): void => {
    const drift = detectChecksumDrift(applied, all);
    if (drift.length === 0) return;
    const detail = drift
        .map(
            (d) =>
                `  ${d.id}: recorded ${d.recorded.slice(0, 12)}… on-disk ${d.actual.slice(0, 12)}…`
        )
        .join('\n');
    throw new Error(
        'Migration checksum drift detected — an already-applied migration file has been edited ' +
            'since it was applied:\n' +
            `${detail}\n` +
            'Editing applied migrations causes silent schema drift across environments. Revert the ' +
            'edit and add a NEW migration for the change instead.'
    );
};

export const migrateUp = async (options: MigrateOptions): Promise<MigrationFile[]> => {
    const all = discoverMigrations(options.migrationsDir);
    const ceiling = options.targetOrdinal ?? Number.MAX_SAFE_INTEGER;
    const applied: MigrationFile[] = [];

    const client = await options.pool.connect();
    try {
        await ensureSchemaMigrations(client);
        await withAdvisoryLock(client, async () => {
            const appliedRows = await fetchApplied(client);
            // Fail fast if any already-applied migration file has been edited since
            // it was applied (silent schema-drift guard). Fresh environments apply
            // and record in one pass, so this only fires on genuine post-apply edits.
            assertNoChecksumDrift(appliedRows, all);
            const already = new Set(appliedRows.map((m) => m.id));
            for (const migration of all) {
                if (migration.ordinal > ceiling) break;
                if (already.has(migration.id)) continue;

                const sql = readFileSync(migration.upPath, 'utf8');
                await client.query('BEGIN');
                try {
                    await client.query(sql);
                    await client.query(
                        'INSERT INTO schema_migrations (id, ordinal, checksum) VALUES ($1, $2, $3)',
                        [migration.id, migration.ordinal, sha256(sql)]
                    );
                    await client.query('COMMIT');
                } catch (err) {
                    await client.query('ROLLBACK');
                    throw new Error(`Migration ${migration.id} failed: ${(err as Error).message}`);
                }
                applied.push(migration);
            }
        });
    } finally {
        client.release?.();
    }
    return applied;
};

export const migrateDown = async (options: MigrateOptions): Promise<MigrationFile[]> => {
    const target = options.targetOrdinal;
    if (typeof target !== 'number') {
        throw new Error('migrateDown requires targetOrdinal (the ordinal to stop *after*).');
    }
    if (target < NON_REVERSIBLE_FLOOR - 1) {
        throw new Error(
            `Cannot migrate below ordinal ${NON_REVERSIBLE_FLOOR} — earlier migrations are forward-only and not reversible. Restore from backup instead.`
        );
    }

    const all = discoverMigrations(options.migrationsDir);
    const reverted: MigrationFile[] = [];

    const client = await options.pool.connect();
    try {
        await ensureSchemaMigrations(client);
        await withAdvisoryLock(client, async () => {
            const applied = await fetchApplied(client);
            const toRevert = applied
                .filter((m) => m.ordinal > target)
                .sort((a, b) => b.ordinal - a.ordinal);

            for (const entry of toRevert) {
                const file = all.find((m) => m.id === entry.id);
                if (!file) {
                    throw new Error(
                        `Applied migration ${entry.id} has no matching .up.sql on disk; refusing to revert blindly.`
                    );
                }
                if (!file.downPath) {
                    throw new Error(
                        `Migration ${entry.id} has no .down.sql; cannot revert. Restore from backup or write a down migration first.`
                    );
                }
                const sql = readFileSync(file.downPath, 'utf8');
                await client.query('BEGIN');
                try {
                    await client.query(sql);
                    await client.query('DELETE FROM schema_migrations WHERE id = $1', [entry.id]);
                    await client.query('COMMIT');
                } catch (err) {
                    await client.query('ROLLBACK');
                    throw new Error(`Down migration ${entry.id} failed: ${(err as Error).message}`);
                }
                reverted.push(file);
            }
        });
    } finally {
        client.release?.();
    }
    return reverted;
};

export const status = async (
    options: Omit<MigrateOptions, 'targetOrdinal'>
): Promise<{
    pending: MigrationFile[];
    applied: AppliedMigration[];
    drift: ChecksumMismatch[];
}> => {
    const all = discoverMigrations(options.migrationsDir);
    const client = await options.pool.connect();
    try {
        await ensureSchemaMigrations(client);
        const applied = await fetchApplied(client);
        const appliedIds = new Set(applied.map((m) => m.id));
        return {
            pending: all.filter((m) => !appliedIds.has(m.id)),
            applied,
            drift: detectChecksumDrift(applied, all),
        };
    } finally {
        client.release?.();
    }
};

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

const isMain = (() => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return (
            import.meta.url === `file://${process.argv[1]}` ||
            process.argv[1]?.endsWith('migrate.ts')
        );
    } catch {
        return false;
    }
})();

const parseArgs = (argv: string[]): { command: string; targetOrdinal?: number } => {
    const command = argv[0] ?? 'status';
    let targetOrdinal: number | undefined;
    for (let i = 1; i < argv.length; i += 1) {
        if (argv[i] === '--target' && argv[i + 1]) {
            const parsed = Number.parseInt(argv[i + 1], 10);
            if (!Number.isFinite(parsed))
                throw new Error(`--target expects an integer, got "${argv[i + 1]}"`);
            targetOrdinal = parsed;
            i += 1;
        }
    }
    return { command, targetOrdinal };
};

const runCli = async () => {
    const { command, targetOrdinal } = parseArgs(process.argv.slice(2));
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        console.error('DATABASE_URL is required for the migration runner.');
        process.exit(2);
    }

    // Lazy import so unit tests / dev environments without `pg` installed can
    // still import this module for type-checking and helper reuse.
    const { default: pg } = (await import('pg')) as {
        default: { Pool: new (cfg: { connectionString: string }) => PgPool };
    };
    const pool = new pg.Pool({ connectionString: databaseUrl });
    const migrationsDir = MIGRATIONS_DIR;

    try {
        switch (command) {
            case 'up': {
                const applied = await migrateUp({ pool, migrationsDir, targetOrdinal });
                console.log(`migrate:up applied ${applied.length} migration(s):`);
                for (const m of applied) console.log(`  ${m.id}`);
                break;
            }
            case 'down': {
                const reverted = await migrateDown({ pool, migrationsDir, targetOrdinal });
                console.log(`migrate:down reverted ${reverted.length} migration(s):`);
                for (const m of reverted) console.log(`  ${m.id}`);
                break;
            }
            case 'status': {
                const { pending, applied, drift } = await status({ pool, migrationsDir });
                console.log(`Applied: ${applied.length}, Pending: ${pending.length}`);
                for (const m of applied)
                    console.log(`  [x] ${m.id} (${m.appliedAt.toISOString()})`);
                for (const m of pending) console.log(`  [ ] ${m.id}`);
                if (drift.length > 0) {
                    console.error(
                        `\nCHECKSUM DRIFT — ${drift.length} applied migration(s) edited since apply:`
                    );
                    for (const d of drift) {
                        console.error(
                            `  ! ${d.id}: recorded ${d.recorded.slice(
                                0,
                                12
                            )}… on-disk ${d.actual.slice(0, 12)}…`
                        );
                    }
                    process.exit(3);
                }
                break;
            }
            default:
                console.error(`Unknown command "${command}". Expected: up | down | status`);
                process.exit(2);
        }
    } finally {
        await pool.end();
    }
};

if (isMain) {
    runCli().catch((err) => {
        console.error(err.message ?? err);
        process.exit(1);
    });
}
