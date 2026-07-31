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
        query: (sql: string, params?: unknown[]) =>
            pg.query(sql, params) as Promise<{ rows: never[] }>,
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

    const count = (await (client as unknown as AnyPg).query('SELECT count(*)::int AS c FROM users'))
        .rows[0] as {
        c: number;
    };
    assert.equal(count.c, 1, 'user row should not be duplicated on re-import');
});

test('skips unknown tables and empty arrays without failing', async () => {
    const { client } = await freshDb();
    const summary = await importJsonStoreState(
        client as never,
        {
            users: [],
            notARealMap: [{ id: 'x' }],
        } as never
    );
    assert.equal(summary.totalImported, 0);
    assert.equal(summary.totalFailed, 0);
});

// Legacy file stores record emailless accounts (Matrix exchange /
// account-number signups) as email: ''. Postgres UNIQUE does not exempt '',
// so only the first such row used to insert; the rest failed users_email_key
// and dragged their refresh_tokens / aid_pools down via FK. '' must import as
// NULL — which UNIQUE does exempt — so they all coexist.
test('emailless users: many empty-string emails import as NULL and coexist', async () => {
    const { pg, client, pool } = await freshDb();

    const emailless = Array.from({ length: 5 }, (_, i) => ({
        id: randomUUID(),
        username: `mx-import-${i}`,
        email: '',
        passwordHash: '',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: `pk-${i}`,
        createdAt: '2026-05-01T00:00:00.000Z',
    }));
    const withEmail = {
        id: randomUUID(),
        username: 'has-email',
        email: 'real@example.test',
        passwordHash: 'hash',
        reputationScore: 1,
        reputationTier: 'member',
        pubkeyEd25519: 'pk-real',
        createdAt: '2026-05-01T00:00:00.000Z',
    };
    // Dependents of emailless users — these are the rows that previously
    // cascade-failed on refresh_tokens_user_id_fkey / aid_pools FKs.
    const refreshTokens = emailless.slice(0, 2).map((u, i) => ({
        id: randomUUID(),
        userId: u.id,
        familyId: randomUUID(),
        tokenHash: `${'a'.repeat(63)}${i}`,
        expiresAt: '2027-01-01T00:00:00.000Z',
        createdAt: '2026-05-01T00:00:00.000Z',
    }));
    const aidPools = [
        {
            id: randomUUID(),
            organizerUserId: emailless[0].id,
            title: 'Generator fund',
            description: null,
            goalCents: 5000,
            currency: 'USD',
            status: 'open',
            createdAt: '2026-05-01T00:00:00.000Z',
            fulfilledAt: null,
            closedAt: null,
        },
    ];
    const snap = { users: [...emailless, withEmail], refreshTokens, aidPools };

    const summary = await importJsonStoreState(client as never, snap as never);
    assert.equal(summary.totalFailed, 0, 'no rows may fail');
    assert.equal(summary.imported.users, 6);
    assert.equal(summary.imported.refreshTokens, 2, 'FK dependents of emailless users import');
    assert.equal(summary.imported.aidPools, 1);

    const q = (sql: string) => (pg as AnyPg).query(sql);
    assert.equal(((await q('SELECT count(*)::int AS c FROM users')).rows[0] as { c: number }).c, 6);
    assert.equal(
        (
            (await q('SELECT count(*)::int AS c FROM users WHERE email IS NULL')).rows[0] as {
                c: number;
            }
        ).c,
        5,
        'every emailless user stores NULL'
    );
    assert.equal(
        (
            (await q("SELECT count(*)::int AS c FROM users WHERE email = ''")).rows[0] as {
                c: number;
            }
        ).c,
        0,
        "'' must never reach the users table"
    );
    // The '' → NULL rule only applies to nullable columns: NOT NULL columns
    // keep '' as a real value.
    const hashRow = (
        await (pg as AnyPg).query('SELECT password_hash FROM users WHERE id = $1', [
            emailless[0].id,
        ])
    ).rows[0] as { password_hash: string };
    assert.equal(hashRow.password_hash, '');

    // Re-running stays idempotent — same counts, no failures, no duplicates.
    const second = await importJsonStoreState(client as never, snap as never);
    assert.equal(second.totalFailed, 0);
    assert.equal(second.imported.users, 6);
    assert.equal(((await q('SELECT count(*)::int AS c FROM users')).rows[0] as { c: number }).c, 6);

    // A fresh store hydrates them as email-less records, unreachable by email.
    const store = new PostgresBackedDb();
    await store.init(pool);
    const hydrated = store.getUserById(emailless[0].id);
    assert.ok(hydrated, 'emailless user hydrates');
    assert.equal(hydrated?.email, undefined, 'NULL email hydrates as an absent field');
    assert.equal(store.findUserByEmail(''), undefined, 'empty email must never resolve a user');
    assert.equal(store.findUserByEmail('real@example.test')?.id, withEmail.id);
});

test('a real (non-empty) email still enforces uniqueness on import', async () => {
    const { pg, client } = await freshDb();
    const mkUser = (username: string) => ({
        id: randomUUID(),
        username,
        email: 'dup@example.test',
        passwordHash: 'hash',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: 'pk',
        createdAt: '2026-05-01T00:00:00.000Z',
    });

    const summary = await importJsonStoreState(
        client as never,
        {
            users: [mkUser('dup-a'), mkUser('dup-b')],
        } as never
    );
    assert.equal(summary.imported.users, 1, 'first claim on the address wins');
    assert.equal(summary.failed.users, 1, 'second distinct user with the same email is rejected');

    const count = (await (pg as AnyPg).query('SELECT count(*)::int AS c FROM users')).rows[0] as {
        c: number;
    };
    assert.equal(count.c, 1);
});
