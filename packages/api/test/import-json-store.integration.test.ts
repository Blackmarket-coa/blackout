import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

process.env.BLACKOUT_DB_MODE = 'memory';

const { importJsonStoreState } = await import('../src/db/importJsonStore');
const { PostgresBackedDb } = await import('../src/db/store');
const { MIGRATIONS_DIR } = await import('../src/db/migrate');
const { PGlite } = await import('@electric-sql/pglite');

type AnyPg = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  exec: (sql: string) => Promise<unknown>;
};

function makePool(pg: AnyPg) {
  const client = {
    query: (sql: string, params?: unknown[]) => pg.query(sql, params) as Promise<{ rows: never[] }>,
    release: () => {},
  };
  return { client, pool: { connect: async () => client, end: async () => {} } as never };
}

async function freshDb() {
  const pg = new PGlite() as unknown as AnyPg;
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
  for (const f of files) await pg.exec(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
  return { pg, ...makePool(pg) };
}

const userId = randomUUID();
const snapshot = {
  users: [
    {
      id: userId,
      username: 'importme',
      email: 'importme@example.test',
      passwordHash: 'hash',
      reputationScore: 3,
      reputationTier: 'member',
      pubkeyEd25519: 'pk',
      createdAt: '2026-05-01T00:00:00.000Z',
    },
  ],
  streams: [
    {
      id: 'stream-import-1',
      creatorId: 'creator-x',
      state: 'offline',
      title: 'Imported stream',
      tags: ['a', 'b'],
      visibility: 'public',
      allowedSubscriberIds: [],
      latencyProfile: 'normal',
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    },
  ],
  linkedAccounts: [
    {
      id: randomUUID(),
      blackoutUserId: userId,
      provider: 'twitch',
      providerUserId: 'tw-1',
      accessTokenCiphertext: 'cipher',
      scopes: ['chat:read'],
      encryptionKeyId: 'key-1',
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    },
  ],
  coalitionAidPosts: [
    {
      id: 'aidp-import-1',
      customerId: '@imp:server',
      type: 'offer',
      category: 'tools',
      title: 'Lending a generator',
      description: 'Available this weekend.',
      location: { latitude: 41.0, longitude: -73.0, address: '5 Hill Rd' },
      displayRadiusMeters: 500,
      urgency: 'low',
      status: 'open',
      createdAt: '2026-05-01T00:00:00.000Z',
    },
  ],
};

test('imports a store.json snapshot into Postgres and is queryable after hydrate', async () => {
  const { pg, client, pool } = await freshDb();

  const summary = await importJsonStoreState(client as never, snapshot as never);
  assert.equal(summary.totalFailed, 0, 'no rows should fail to import');
  assert.equal(summary.imported.users, 1);
  assert.equal(summary.imported.streams, 1);
  assert.equal(summary.imported.linkedAccounts, 1);
  assert.equal(summary.imported.coalitionAidPosts, 1);

  // A fresh store hydrating from the same DB sees the imported data.
  const store = new PostgresBackedDb();
  await store.init(pool);
  assert.equal(store.getUserById(userId)?.username, 'importme');
  assert.deepEqual(store.getStream('stream-import-1')?.tags, ['a', 'b']);
  assert.ok(store.getLinkedAccount(userId, 'twitch'));
  const aid = store.listCoalitionAidPosts().find((p) => p.id === 'aidp-import-1');
  assert.equal(aid?.location.address, '5 Hill Rd');

  await pg.query('SELECT 1');
});

test('import is idempotent — re-running does not duplicate or fail', async () => {
  const { client } = await freshDb();
  await importJsonStoreState(client as never, snapshot as never);
  const second = await importJsonStoreState(client as never, snapshot as never);
  assert.equal(second.totalFailed, 0);
  assert.equal(second.imported.users, 1);

  const count = (await (client as unknown as AnyPg).query('SELECT count(*)::int AS c FROM users')).rows[0] as {
    c: number;
  };
  assert.equal(count.c, 1, 'user row should not be duplicated on re-import');
});

test('skips unknown tables and empty arrays without failing', async () => {
  const { client } = await freshDb();
  const summary = await importJsonStoreState(client as never, {
    users: [],
    notARealMap: [{ id: 'x' }],
  } as never);
  assert.equal(summary.totalImported, 0);
  assert.equal(summary.totalFailed, 0);
});
