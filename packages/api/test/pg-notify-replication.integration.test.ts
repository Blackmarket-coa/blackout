import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

process.env.BLACKOUT_DB_MODE = 'memory';

const { PostgresBackedDb } = await import('../src/db/store');
const { MIGRATIONS_DIR } = await import('../src/db/migrate');
const { InMemoryStoreChangeHub, InMemoryStoreChangeTransport } = await import('../src/db/pgNotify');
const { PGlite } = await import('@electric-sql/pglite');

type AnyPg = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  exec: (sql: string) => Promise<unknown>;
};

function makePool(pg: AnyPg) {
  // PGlite is a single in-process connection, so two replicas sharing it would
  // interleave queries that real per-replica pooled connections would isolate.
  // Serialize through a promise chain to emulate independent connections.
  let chain: Promise<unknown> = Promise.resolve();
  const query = (sql: string, params?: unknown[]) => {
    const result = chain.then(() => pg.query(sql, params));
    chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result as Promise<{ rows: never[] }>;
  };
  const client = { query, release: () => {} };
  return { connect: async () => client, end: async () => {} } as never;
}

async function freshPool() {
  const pg = new PGlite() as unknown as AnyPg;
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
  for (const f of files) await pg.exec(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
  return makePool(pg);
}

async function waitFor(predicate: () => boolean, timeoutMs = 1500): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for peer to converge');
    await new Promise((r) => setTimeout(r, 10));
  }
}

test('a write on one replica becomes visible on another via change notifications', async () => {
  const pool = await freshPool();
  const hub = new InMemoryStoreChangeHub();

  // Two replicas sharing one database + one notification hub.
  const replicaA = new PostgresBackedDb();
  const replicaB = new PostgresBackedDb();
  await replicaA.init(pool, new InMemoryStoreChangeTransport(hub));
  await replicaB.init(pool, new InMemoryStoreChangeTransport(hub));

  // --- upsert propagation (op 'u') ---
  const userId = randomUUID();
  replicaA.createUser({
    id: userId,
    username: 'replicated',
    email: `${userId.slice(0, 8)}@example.test`,
    passwordHash: 'hash',
    reputationScore: 1,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  assert.ok(replicaA.getUserById(userId), 'writer replica sees its own write immediately');
  assert.equal(replicaB.getUserById(userId), undefined, 'peer has not been notified yet');

  await replicaA.drain();
  await waitFor(() => replicaB.getUserById(userId) !== undefined);
  assert.equal(replicaB.getUserById(userId)?.username, 'replicated');

  // --- array + non-id table upsert propagation ---
  replicaB.upsertStreamModeration({
    streamId: 'stream-9',
    slowModeSeconds: 3,
    bannedUserIds: ['x'],
    keywordFilters: ['k'],
  });
  await replicaB.drain();
  await waitFor(() => replicaA.getStreamModeration('stream-9') !== undefined);
  assert.deepEqual(replicaA.getStreamModeration('stream-9')?.keywordFilters, ['k']);

  // --- resync propagation (op 'r'): a delete on A must remove the row on B ---
  replicaA.upsertLinkedAccount({
    id: randomUUID(),
    blackoutUserId: userId,
    provider: 'twitch',
    providerUserId: 'tw-1',
    accessTokenCiphertext: 'cipher',
    scopes: ['s'],
    encryptionKeyId: 'k1',
  });
  await replicaA.drain();
  await waitFor(() => replicaB.getLinkedAccount(userId, 'twitch') !== undefined);

  replicaA.deleteLinkedAccount(userId, 'twitch'); // spec: resync('linkedAccounts')
  await replicaA.drain();
  await waitFor(() => replicaB.getLinkedAccount(userId, 'twitch') === undefined);
  assert.equal(replicaB.getLinkedAccount(userId, 'twitch'), undefined);

  await replicaA.drain();
  await replicaB.drain();
});

test('a replica ignores its own change notifications', async () => {
  const pool = await freshPool();
  const hub = new InMemoryStoreChangeHub();
  const replica = new PostgresBackedDb();
  await replica.init(pool, new InMemoryStoreChangeTransport(hub));

  const userId = randomUUID();
  const created = replica.createUser({
    id: userId,
    username: 'solo',
    email: `${userId.slice(0, 8)}@example.test`,
    passwordHash: 'hash',
    reputationScore: 1,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  await replica.drain();
  // Self-notification must not corrupt or drop the record.
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(replica.getUserById(userId)?.id, created.id);
});
