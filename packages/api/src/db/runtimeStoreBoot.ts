import { getSharedPgPool } from '../config/postgres';
import { log } from '../telemetry/logger';
import {
    formatChecksumVerificationFailure,
    migrateUp,
    MIGRATIONS_DIR,
    verifyMigrationChecksums,
    type PgPool,
} from './migrate';
import { initRuntimeStore } from './store';

export interface PostgresRuntimeStoreBootOptions {
    /**
     * Throw when the applied migrations do not match the files on disk, instead
     * of logging a warning. True for a real production boot.
     */
    failOnChecksumDrift: boolean;
}

/**
 * Load the Postgres runtime store before anything reads it: run pending
 * migrations, audit the applied ones against the files on disk, then hydrate
 * the in-memory mirror and subscribe to peer changes.
 *
 * Every process that serves or works on the store boots through here: the API
 * (src/index.ts) and the background worker (src/backgroundWorker.ts). The
 * worker once started its loops without it, so in deploy/docker/production
 * every loop ran against an empty store and did nothing; one shared boot means
 * the two cannot drift apart again.
 */
export async function bootPostgresRuntimeStore(
    options: PostgresRuntimeStoreBootOptions
): Promise<PgPool> {
    const pool = await getSharedPgPool();
    if (process.env.BLACKOUT_DB_MIGRATE_ON_START !== '0') {
        const applied = await migrateUp({ pool, migrationsDir: MIGRATIONS_DIR });
        log.info('db_migrations_applied_on_start', { count: applied.length });
    }
    // Boot-time migration checksum audit (M12): re-hash every APPLIED
    // migration against the files on disk. This runs even when migrateUp just
    // ran (BLACKOUT_DB_MIGRATE_ON_START=1): migrateUp's own drift assert does
    // not flag applied-but-missing-on-disk migrations, and with
    // BLACKOUT_DB_MIGRATE_ON_START=0 nothing else checks drift at all.
    // Severity mirrors assertEnvAtBoot (config/env.ts): the caller fails the
    // boot in a real production start and logs a loud warning everywhere else.
    if (process.env.BLACKOUT_DB_VERIFY_CHECKSUMS !== '0') {
        const verification = await verifyMigrationChecksums(pool, MIGRATIONS_DIR);
        if (!verification.ok) {
            const detail = formatChecksumVerificationFailure(verification);
            if (options.failOnChecksumDrift) throw new Error(detail);
            log.warn('db_migration_checksum_drift', {
                mismatches: verification.mismatches.map((m) => m.id),
                missingOnDisk: verification.missingOnDisk,
                detail,
            });
        } else {
            log.info('db_migration_checksums_verified');
        }
    }
    await initRuntimeStore(pool);
    log.info('postgres_store_hydrated');
    return pool;
}
