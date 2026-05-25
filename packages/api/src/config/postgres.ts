// Runtime Postgres connection config + a lazily-created shared pool, reused by
// the PostgresBackedDb store and the migrate-on-start step. Mirrors the shape of
// config/redis.ts. Only relevant when BLACKOUT_DB_MODE=postgres.

import type { PgPool } from '../db/migrate';

let cachedPool: PgPool | null = null;

export function readDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL?.trim();
  return url && url.length > 0 ? url : null;
}

/** Create (once) and return the shared pg pool. Throws if DATABASE_URL is unset. */
export async function getSharedPgPool(): Promise<PgPool> {
  if (cachedPool) return cachedPool;
  const url = readDatabaseUrl();
  if (!url) {
    throw new Error('DATABASE_URL is required when BLACKOUT_DB_MODE=postgres.');
  }
  const { default: pg } = (await import('pg')) as {
    default: { Pool: new (cfg: { connectionString: string }) => PgPool };
  };
  cachedPool = new pg.Pool({ connectionString: url });
  return cachedPool;
}

export function getExistingPgPool(): PgPool | null {
  return cachedPool;
}

/** For tests / shutdown: drop the cached pool so a fresh one is created next time. */
export function clearSharedPgPool(): void {
  cachedPool = null;
}
