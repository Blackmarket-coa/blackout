// Several PostgresBackedDb "processes" on one database, each with its own pool
// and change transport, as the API replicas and the worker run in production.
//
// The database is an in-process PGlite by default. Set BLACKOUT_TEST_PG_URL to
// a PostgreSQL server (a role that may create databases) to run the same tests
// there: each test then gets its own database, copied from a migrated template.
//
// PGlite is one session, so the harness pool leases it exclusively: a client
// holds the lease from its first statement until release(), as a real pooled
// connection holds its session, and a BEGIN..COMMIT on one process can never
// interleave with another's statements. Each process's pool also logs its
// statements and can delay, gate or fail chosen ones, or hold a statement's
// reply after the server has answered it (on PGlite the session is free
// meanwhile, so hold only a statement outside a transaction). A process's
// transport can be made deaf ("has not heard yet"); the world records every
// notification.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

process.env.BLACKOUT_DB_MODE = 'memory';

const { PostgresBackedDb } = await import('../src/db/store');
const { MIGRATIONS_DIR, migrateUp } = await import('../src/db/migrate');
const { MUTATOR_SPECS, TABLE_DESCRIPTORS, USER_CASCADE_CHILDREN, USER_CASCADE_LEFT_IN_MIRRORS } =
    await import('../src/db/pgDescriptors');
const { registry } = await import('../src/telemetry/metrics');
const {
    InMemoryStoreChangeHub,
    InMemoryStoreChangeTransport,
    PgNotifyTransport,
    MAX_KEY_PAYLOAD_BYTES,
    keyChangePayloads,
} = await import('../src/db/pgNotify');

type Payload = import('../src/db/pgNotify').StoreChangePayload;
type Row = Record<string, any>;
interface RawClient {
    query(sql: string, params?: unknown[]): Promise<{ rows: Row[] }>;
    release(): void;
    on?(event: string, cb: (arg: unknown) => void): void;
    /** PGlite only: give up the session lease until this client's next statement. */
    pause?(): void;
}
interface RawPool {
    connect(): Promise<RawClient>;
    end(): Promise<void>;
}

const PG_URL = process.env.BLACKOUT_TEST_PG_URL?.trim() || undefined;
const CHANNEL = 'blackout_store_change';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ backends

interface Database {
    /** A new pool on this test's database (each process gets its own). */
    pool(): RawPool;
    sql(text: string, params?: unknown[]): Promise<Row[]>;
    close(): Promise<void>;
}

class Lease {
    private tail: Promise<void> = Promise.resolve();
    acquire(): Promise<() => void> {
        let free!: () => void;
        const mine = new Promise<void>((r) => (free = r));
        const prev = this.tail;
        this.tail = prev.then(() => mine);
        return prev.then(() => free);
    }
}

let pgliteTemplate: Promise<Blob> | null = null;

async function pgliteDatabase(): Promise<Database> {
    const { PGlite } = await import('@electric-sql/pglite');
    pgliteTemplate ??= (async () => {
        const pg = new PGlite();
        const files = readdirSync(MIGRATIONS_DIR)
            .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
            .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
        for (const f of files) await pg.exec(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
        const dump = await pg.dumpDataDir('none');
        await pg.close();
        return dump;
    })();
    const pg = new PGlite({ loadDataDir: await pgliteTemplate });
    const lease = new Lease();
    const run = async (sql: string, params?: unknown[]) => ({
        rows: (await pg.query(sql, params ?? [])).rows as Row[],
    });
    const pool = (): RawPool => ({
        async connect() {
            let held: (() => void) | null = null;
            const listeners: Array<(arg: unknown) => void> = [];
            const unlisten = new Map<string, () => Promise<void>>();
            return {
                async query(sql, params) {
                    const [head, channel] = sql.trim().split(/\s+/);
                    const verb = head.toUpperCase();
                    if (verb === 'LISTEN' || verb === 'UNLISTEN') {
                        // A listening session is not a leased one, but LISTEN must
                        // not land inside another process's open transaction.
                        const free = held ? null : await lease.acquire();
                        try {
                            if (verb === 'LISTEN') {
                                unlisten.set(
                                    channel,
                                    await pg.listen(channel, (payload) => {
                                        for (const cb of listeners) cb({ channel, payload });
                                    })
                                );
                            } else {
                                await unlisten.get(channel)?.();
                                unlisten.delete(channel);
                            }
                        } finally {
                            free?.();
                        }
                        return { rows: [] };
                    }
                    if (!held) held = await lease.acquire();
                    return run(sql, params);
                },
                release() {
                    const free = held;
                    held = null;
                    free?.();
                },
                pause() {
                    const free = held;
                    held = null;
                    free?.();
                },
                on(event, cb) {
                    if (event === 'notification') listeners.push(cb);
                },
            };
        },
        async end() {},
    });
    return {
        pool,
        async sql(text, params) {
            const free = await lease.acquire();
            try {
                return (await run(text, params)).rows;
            } finally {
                free();
            }
        },
        async close() {
            await pg.close();
        },
    };
}

let postgresTemplate: Promise<string> | null = null;
let postgresCount = 0;

after(async () => {
    if (!postgresTemplate) return;
    const tpl = await postgresTemplate;
    const { default: pg } = (await import('pg')) as unknown as {
        default: { Client: new (cfg: { connectionString: string }) => any };
    };
    const admin = new pg.Client({ connectionString: PG_URL! });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${tpl}`);
    await admin.end();
});

async function postgresDatabase(): Promise<Database> {
    const { default: pg } = (await import('pg')) as unknown as {
        default: {
            Pool: new (cfg: { connectionString: string; max?: number }) => RawPool & {
                query(sql: string, p?: unknown[]): Promise<{ rows: Row[] }>;
            };
        };
    };
    const urlFor = (name: string) => {
        const u = new URL(PG_URL!);
        u.pathname = `/${name}`;
        return u.toString();
    };
    const admin = new pg.Pool({ connectionString: PG_URL!, max: 1 });
    postgresTemplate ??= (async () => {
        const tpl = `blackout_xproc_tpl_${process.pid}`;
        await admin.query(`DROP DATABASE IF EXISTS ${tpl}`);
        await admin.query(`CREATE DATABASE ${tpl}`);
        const tplPool = new pg.Pool({ connectionString: urlFor(tpl), max: 2 });
        await migrateUp({ pool: tplPool as never, migrationsDir: MIGRATIONS_DIR });
        await tplPool.end();
        return tpl;
    })();
    const tpl = await postgresTemplate;
    const name = `blackout_xproc_${process.pid}_${++postgresCount}`;
    await admin.query(`DROP DATABASE IF EXISTS ${name}`);
    await admin.query(`CREATE DATABASE ${name} TEMPLATE ${tpl}`);
    const pools: RawPool[] = [];
    const direct = new pg.Pool({ connectionString: urlFor(name), max: 2 });
    return {
        pool() {
            const p = new pg.Pool({ connectionString: urlFor(name), max: 4 });
            pools.push(p);
            return p;
        },
        async sql(text, params) {
            return (await direct.query(text, params)).rows;
        },
        async close() {
            for (const p of pools) await p.end();
            await direct.end();
            // Pool.end() resolves while its sockets are still closing; a drop
            // that terminated them would raise an error event nobody listens
            // for. Wait for the sessions to go, then drop.
            for (let i = 0; i < 200; i++) {
                const live = await admin.query(
                    'SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = $1',
                    [name]
                );
                if (live.rows[0].n === 0) break;
                await sleep(10);
            }
            await admin.query(`DROP DATABASE IF EXISTS ${name}`);
            await admin.end();
        },
    };
}

// ------------------------------------------------------------------ processes

interface Ctl {
    /** Every statement this process ran, whitespace-collapsed, in completion order ('!' = it failed). */
    log: string[];
    /** Milliseconds to wait before sending a statement (the connection holds no lease meanwhile). */
    delay: (sql: string) => number;
    /** Fail a statement before it is sent, or after it has run (its effect stands). */
    fault: (sql: string) => 'before' | 'after' | undefined;
    /** Wait for this promise before sending a statement (no lease is held meanwhile). */
    gate: (sql: string) => Promise<void> | undefined;
    /** Deliver this statement's reply only once the promise settles; the server has already run it. */
    hold: (sql: string) => Promise<void> | undefined;
}

function instrument(base: RawPool, ctl: Ctl): RawPool {
    return {
        async connect() {
            const c = await base.connect();
            return {
                async query(sql, params) {
                    const text = sql.replace(/\s+/g, ' ').trim();
                    const d = ctl.delay(text);
                    if (d > 0) await sleep(d);
                    const g = ctl.gate(text);
                    if (g) await g;
                    const f = ctl.fault(text);
                    if (f === 'before') {
                        ctl.log.push(`!${text}`);
                        throw new Error(`injected fault before: ${text.slice(0, 60)}`);
                    }
                    let res: { rows: Row[] };
                    try {
                        res = await c.query(sql, params);
                    } catch (err) {
                        ctl.log.push(`!${text}`);
                        throw err;
                    }
                    ctl.log.push(text);
                    if (f === 'after') {
                        throw new Error(`injected fault after: ${text.slice(0, 60)}`);
                    }
                    const h = ctl.hold(text);
                    if (h) {
                        c.pause?.();
                        await h;
                    }
                    return res;
                },
                release: () => c.release(),
                on: (event, cb) => c.on?.(event, cb),
            };
        },
        end: () => base.end(),
    };
}

type Mode = 'pg' | 'hub';

/** A process's transport: the real one ('pg': LISTEN/NOTIFY through the database) or the in-process hub. */
class Tap {
    deaf = false;
    /** Payloads this process published. */
    readonly sent: Payload[] = [];
    publishWithin?: (client: unknown, payload: Payload) => Promise<void>;
    reconnect: (() => void) | null = null;
    private readonly inner: any;
    constructor(mode: Mode, pool: RawPool, hub: InstanceType<typeof InMemoryStoreChangeHub>) {
        this.inner =
            mode === 'pg'
                ? new PgNotifyTransport(pool as never)
                : new InMemoryStoreChangeTransport(hub);
        if (typeof this.inner.publishWithin === 'function') {
            this.publishWithin = async (client, payload) => {
                await this.inner.publishWithin(client, payload);
                this.sent.push(payload);
            };
        }
    }
    publish(payload: Payload): void {
        this.sent.push(payload);
        this.inner.publish(payload);
    }
    async subscribe(handler: (p: Payload) => void): Promise<void> {
        await this.inner.subscribe((p: Payload) => {
            if (!this.deaf) handler(p);
        });
    }
    onReconnect(handler: () => void): void {
        this.reconnect = handler;
        this.inner.onReconnect(handler);
    }
    async close(): Promise<void> {
        await this.inner.close();
    }
}

interface Proc {
    db: any;
    tap: Tap;
    ctl: Ctl;
}

interface World {
    procs: Proc[];
    /** Every notification any process could have received, in delivery order. */
    heard: Payload[];
    sql(text: string, params?: unknown[]): Promise<Row[]>;
    /** Deliver a change as if another process had made it. */
    emit(payload: Payload): Promise<void>;
    /** A process booted now, with no transport. */
    boot(): Promise<any>;
    close(): Promise<void>;
}

const newCtl = (): Ctl => ({
    log: [],
    delay: () => 0,
    fault: () => undefined,
    gate: () => undefined,
    hold: () => undefined,
});

async function world(n: number, mode: Mode): Promise<World> {
    const database = PG_URL ? await postgresDatabase() : await pgliteDatabase();
    const hub = new InMemoryStoreChangeHub();
    const heard: Payload[] = [];
    const recorder = new Tap(mode, database.pool(), hub);
    await recorder.subscribe((p) => heard.push(p));
    const procs: Proc[] = [];
    const closers: Array<() => Promise<void>> = [() => recorder.close()];
    for (let i = 0; i < n; i++) {
        const ctl = newCtl();
        const pool = instrument(database.pool(), ctl);
        const tap = new Tap(mode, pool, hub);
        const db: any = new PostgresBackedDb();
        db.users.delete('demo-user');
        await db.init(pool, tap);
        procs.push({ db, tap, ctl });
        closers.push(() => db.shutdown());
    }
    return {
        procs,
        heard,
        sql: (text, params) => database.sql(text, params),
        async emit(payload) {
            if (mode === 'hub') hub.emit(payload);
            else await database.sql('SELECT pg_notify($1, $2)', [CHANNEL, JSON.stringify(payload)]);
        },
        async boot() {
            const db: any = new PostgresBackedDb();
            db.users.delete('demo-user');
            await db.init(database.pool());
            return db;
        },
        async close() {
            for (const c of closers) await c();
            await database.close();
        },
    };
}

async function withWorld(n: number, mode: Mode, fn: (w: World) => Promise<void>): Promise<void> {
    const w = await world(n, mode);
    try {
        await fn(w);
    } finally {
        await w.close();
    }
}

/** Every process has flushed its writes and applied every change it has heard. */
async function quiesce(w: World): Promise<void> {
    for (let i = 0; i < 3; i++) {
        for (const p of w.procs) await p.db.drain();
        await sleep(PG_URL ? 60 : 15);
    }
}

const mkUser = (db: any): string => {
    const id = randomUUID();
    db.createUser({
        id,
        username: `u${id.slice(0, 8)}`,
        email: `${id.slice(0, 8)}@e.x`,
        passwordHash: 'h0',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: 'pk',
    });
    return id;
};

const mkVault = (db: any, owner: string, fields: Record<string, string> = {}): string =>
    db.createVaultItem({
        id: randomUUID(),
        ownerUserId: owner,
        label: 'l',
        ciphertext: 'c0',
        iv: 'i0',
        algo: 'AES-GCM',
        ...fields,
    }).id;

/** A counter's value for the labels given (0 before it was first incremented). */
function metric(name: string, labels: Record<string, string>): number {
    for (const line of registry.expose().split('\n')) {
        if (!line.startsWith(`${name}{`)) continue;
        const got = Object.fromEntries(
            [...line.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]])
        );
        if (Object.entries(labels).every(([k, v]) => got[k] === v)) {
            return Number(line.slice(line.lastIndexOf(' ') + 1));
        }
    }
    return 0;
}

/** Run `fn` with MUTATOR_SPECS[method] replaced; processes built inside see the replacement. */
async function withSpec(
    method: string,
    spec: typeof MUTATOR_SPECS[string] | undefined,
    fn: () => Promise<void>
): Promise<void> {
    const specs = MUTATOR_SPECS as Record<string, typeof MUTATOR_SPECS[string]>;
    const had = Object.prototype.hasOwnProperty.call(specs, method);
    const saved = specs[method];
    if (spec) specs[method] = spec;
    else delete specs[method];
    try {
        await fn();
    } finally {
        if (had) specs[method] = saved;
        else delete specs[method];
    }
}

const vaultCount = async (w: World, id: string): Promise<number> =>
    (await w.sql('SELECT count(*)::int AS n FROM vault_items WHERE id = $1', [id]))[0].n;

const vaultRow = async (w: World, id: string) =>
    (await w.sql('SELECT label, ciphertext FROM vault_items WHERE id = $1', [id]))[0];

const hex = () => randomBytes(32).toString('hex');
const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
const iso = (v: unknown) => (v == null ? v : new Date(v as string).toISOString());

const mkRefresh = (db: any, userId: string, familyId: string) =>
    db.createRefreshToken({
        id: randomUUID(),
        userId,
        familyId,
        tokenHash: hex(),
        expiresAt: inHours(24),
    });

const mkLinked = (db: any, userId: string, provider = 'twitch') =>
    db.upsertLinkedAccount({
        id: randomUUID(),
        blackoutUserId: userId,
        provider,
        providerUserId: `p-${randomUUID().slice(0, 8)}`,
        accessTokenCiphertext: 'ct',
        scopes: [],
        encryptionKeyId: 'k1',
    });

const mkReset = (db: any, userId: string, expiresAt = inHours(1)) =>
    db.createPasswordResetToken({ id: randomUUID(), userId, tokenHash: hex(), expiresAt });

const mkVerify = (db: any, userId: string, expiresAt = inHours(1)) =>
    db.createEmailVerificationToken({
        id: randomUUID(),
        userId,
        email: 'v@e.x',
        tokenHash: hex(),
        expiresAt,
    });

const mkDeletion = (db: any, userId: string) =>
    db.createAccountDeletionToken({
        id: randomUUID(),
        userId,
        tokenHash: hex(),
        expiresAt: inHours(1),
    });

const mkOAuthLink = (db: any, userId: string) =>
    db.createPendingOAuthLink({
        stateHash: hex(),
        blackoutUserId: userId,
        provider: 'twitch',
        codeVerifierCiphertext: 'cv',
        redirectUri: 'https://x.example/cb',
        scopes: [],
        encryptionKeyId: 'k1',
        expiresAt: inHours(1),
    });

const mkOidcLogin = (db: any) =>
    db.createPendingOidcLogin({
        stateHash: hex(),
        codeVerifierCiphertext: 'cv',
        nonceHash: hex(),
        redirectUri: 'https://x.example/cb',
        encryptionKeyId: 'k1',
        expiresAt: inHours(1),
    });

const revoke = (db: any, userId: string, expiresAt = inHours(1)) =>
    db.revokeSession({ jti: `j-${randomUUID()}`, userId, reason: 'logout', expiresAt }).jti;

const count = async (w: World, table: string, where: string, params: unknown[]) =>
    (await w.sql(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`, params))[0].n;

/** Make this process hear nothing more from its peers (it still publishes). */
async function deafen(w: World, p: Proc): Promise<void> {
    await quiesce(w);
    p.tap.deaf = true;
}

// ------------------------------------------------------------------ receiver

for (const mode of ['hub', 'pg'] as const) {
    test(`X14 (${mode}): a peer drops a key whose row is gone, on 'k' and on 'u', and sets one that changed`, async () => {
        await withWorld(2, mode, async (w) => {
            const [A, B] = w.procs;
            const u = mkUser(A.db);
            const [v1, v2, v3] = [mkVault(A.db, u), mkVault(A.db, u), mkVault(A.db, u)];
            const f = `f-${randomUUID()}`;
            A.db.addCircleEdge({ id: randomUUID(), followerId: f, followeeId: 'g' });
            await quiesce(w);
            assert.ok(B.db.getVaultItem(v1) && B.db.getVaultItem(v2) && B.db.getVaultItem(v3));
            assert.ok(B.db.getCircleEdge(f, 'g'));

            // Another process deletes two items and the edge and edits the third.
            await w.sql('DELETE FROM vault_items WHERE id = ANY($1)', [[v1, v2]]);
            await w.sql('DELETE FROM circle_edges WHERE follower_id = $1', [f]);
            await w.sql(`UPDATE vault_items SET label = 'edited' WHERE id = $1`, [v3]);
            await w.emit({ src: 'elsewhere', m: 'vaultItems', op: 'k', kvs: [[v1], [v3]] });
            await w.emit({ src: 'elsewhere', m: 'vaultItems', op: 'u', kv: [v2] });
            await w.emit({ src: 'elsewhere', m: 'circleEdges', op: 'k', kvs: [[f, 'g']] });
            await quiesce(w);

            for (const p of [A, B]) {
                assert.equal(p.db.getVaultItem(v1), undefined, "'k' removes a key with no row");
                assert.equal(p.db.getVaultItem(v2), undefined, "'u' removes a key with no row");
                assert.equal(p.db.getVaultItem(v3)?.label, 'edited', "'k' puts a changed row");
                assert.equal(
                    p.db.getCircleEdge(f, 'g'),
                    undefined,
                    'a composite key reaches the mirror key'
                );
            }
        });
    });
}

test('X16 (fence): a peer refresh does not take back a write this process still has queued', async () => {
    await withWorld(2, 'hub', async (w) => {
        const [A, B] = w.procs;
        const u = mkUser(A.db);
        const v = mkVault(A.db, u);
        await quiesce(w);
        assert.equal(B.db.getVaultItem(v)?.label, 'l');

        // B's write waits before it reaches Postgres; A's lands first and is announced.
        B.ctl.delay = (sql) => (/^INSERT INTO vault_items/.test(sql) ? 300 : 0);
        B.db.updateVaultItem(v, { label: 'B' });
        A.db.updateVaultItem(v, { ciphertext: 'cA' });
        await A.db.drain();
        await B.db.applyTail;
        assert.equal(B.db.queue.depth, 1, "B's write is still queued");
        assert.deepEqual(
            [B.db.getVaultItem(v)?.label, B.db.getVaultItem(v)?.ciphertext],
            ['B', 'c0'],
            "B reads its own write, not A's row, while that write is queued"
        );

        await quiesce(w);
        const row = await vaultRow(w, v);
        for (const p of [A, B]) {
            assert.deepEqual(
                [p.db.getVaultItem(v)?.label, p.db.getVaultItem(v)?.ciphertext],
                [row.label, row.ciphertext],
                'each mirror ends at what Postgres holds'
            );
        }
        const insert = B.ctl.log.findIndex((q) => /^INSERT INTO vault_items/.test(q));
        assert.ok(
            B.ctl.log.slice(insert + 1).some((q) => /^SELECT x\.\* FROM vault_items/.test(q)),
            'B re-read the key it skipped once its write had landed'
        );
    });
});

test("X16b (fence): a table reload ('r') and a full rehydrate keep a queued key, and still refresh the rest", async () => {
    await withWorld(2, 'hub', async (w) => {
        const [A, B] = w.procs;
        const u = mkUser(A.db);
        const [v, other] = [mkVault(A.db, u), mkVault(A.db, u)];
        await quiesce(w);

        for (const reload of ['r', 'rehydrate'] as const) {
            B.ctl.delay = (sql) => (/^INSERT INTO vault_items/.test(sql) ? 250 : 0);
            B.db.updateVaultItem(v, { label: `B-${reload}` });
            await w.sql(`UPDATE vault_items SET label = 'stale' WHERE id = $1`, [v]);
            await w.sql(`UPDATE vault_items SET label = $2 WHERE id = $1`, [other, `x-${reload}`]);
            if (reload === 'r') await w.emit({ src: 'elsewhere', m: 'vaultItems', op: 'r' });
            else B.tap.reconnect!();
            await B.db.applyTail;
            assert.equal(B.db.queue.depth, 1, `${reload}: B's write is still queued`);
            assert.equal(
                B.db.getVaultItem(v)?.label,
                `B-${reload}`,
                `${reload}: the queued key keeps B's value`
            );
            assert.equal(
                B.db.getVaultItem(other)?.label,
                `x-${reload}`,
                `${reload}: other keys are reloaded`
            );
            B.ctl.delay = () => 0;
            await quiesce(w);
            assert.equal((await vaultRow(w, v)).label, `B-${reload}`);
            assert.equal(B.db.getVaultItem(v)?.label, `B-${reload}`);
        }
    });
});

const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    return { promise, resolve };
};

/**
 * Order one refresh around one write on process `p`: the first statement
 * matching `write` is sent only after the server has answered the first
 * statement matching `select`, and that answer reaches the store only on
 * release(). So the SELECT's snapshot predates the write, the write lands
 * (its fence comes down) while the reply is in flight, and the reply is
 * applied after it.
 */
function replyAfterWrite(p: Proc, write: RegExp, select: RegExp) {
    const answered = deferred();
    const reply = deferred();
    let gated = false;
    let held = false;
    p.ctl.gate = (sql) =>
        !gated && write.test(sql) ? ((gated = true), answered.promise) : undefined;
    p.ctl.hold = (sql) =>
        !held && select.test(sql) ? ((held = true), answered.resolve(), reply.promise) : undefined;
    return {
        held: () => held,
        release() {
            p.ctl.gate = () => undefined;
            p.ctl.hold = () => undefined;
            reply.resolve();
        },
    };
}

test("X16d (fence): a refresh whose SELECT ran before this process's queued write committed does not take the write back", async () => {
    await withWorld(1, 'hub', async (w) => {
        const [A] = w.procs;
        const u = mkUser(A.db);
        const cutoffJti = `user-token-cutoff:${u}`;
        // An older logout-everywhere cutoff, an hour back, in Postgres and A's mirror.
        A.db.revokeUserTokensBefore(u, 'reuse_detected');
        await quiesce(w);
        await w.sql(
            `UPDATE revoked_sessions SET revoked_at = revoked_at - interval '1 hour' WHERE jti = $1`,
            [cutoffJti]
        );
        await w.emit({ src: 'elsewhere', m: 'revokedSessions', op: 'k', kvs: [[cutoffJti]] });
        await quiesce(w);
        const t0 = A.db.getUserTokenRevocationCutoff(u);
        assert.ok(t0 > 0 && t0 < Date.now() / 1000 - 3000, 'A holds the older cutoff');
        // Every case runs; the ones that took a write back are listed at the end.
        const taken: string[] = [];
        const expect = (ok: boolean, what: string) => {
            if (!ok) taken.push(what);
        };

        const run = async (
            what: string,
            write: RegExp,
            select: RegExp,
            act: () => void,
            refresh: () => Promise<void> | void
        ) => {
            const order = replyAfterWrite(A, write, select);
            act();
            assert.equal(A.db.queue.depth, 1, `${what}: the write is queued`);
            await refresh();
            await A.db.queue.drain();
            assert.ok(order.held(), `${what}: the refresh's SELECT ran before the write`);
            assert.equal(A.db.queue.depth, 0, `${what}: the write has landed`);
            order.release();
            await quiesce(w);
        };

        // A peer's 'u' naming the cutoff row while A's logout-everywhere is queued.
        let t2 = 0;
        await run(
            "'u'",
            /^INSERT INTO revoked_sessions/,
            /^SELECT x\.\* FROM revoked_sessions/,
            () => {
                A.db.revokeUserTokensBefore(u, 'logout_everywhere');
                t2 = A.db.getUserTokenRevocationCutoff(u);
            },
            () => w.emit({ src: 'elsewhere', m: 'revokedSessions', op: 'u', kv: [cutoffJti] })
        );
        const pgCutoff = (
            await w.sql('SELECT reason FROM revoked_sessions WHERE jti = $1', [cutoffJti])
        )[0];
        assert.equal(pgCutoff.reason, 'logout_everywhere');
        assert.ok(t2 > t0);
        expect(
            A.db.getUserTokenRevocationCutoff(u) === t2 &&
                A.db.revokedSessions.get(cutoffJti)?.reason === 'logout_everywhere',
            "'u': A's own logout-everywhere cutoff moved back"
        );

        // A peer's 'k' naming a refresh token while A's logout (a family revoke) is queued.
        const famK = randomUUID();
        const tk = mkRefresh(A.db, u, famK);
        await quiesce(w);
        await run(
            "'k'",
            /^BEGIN$/,
            /^SELECT x\.\* FROM refresh_tokens/,
            () => A.db.revokeRefreshTokenFamily(famK, 'logout'),
            () => w.emit({ src: 'elsewhere', m: 'refreshTokens', op: 'k', kvs: [[tk.id]] })
        );
        expect(
            Boolean(A.db.findRefreshTokenByHash(tk.tokenHash)?.revokedAt),
            "'k': a refresh token A logged out is live again in A"
        );

        // A table reload ('r', from a process on the previous release) while a logout is queued.
        const jti = `j-${randomUUID()}`;
        await run(
            "'r'",
            /^INSERT INTO revoked_sessions/,
            /^SELECT \* FROM revoked_sessions/,
            () => A.db.revokeSession({ jti, userId: u, reason: 'logout', expiresAt: inHours(1) }),
            () => w.emit({ src: 'elsewhere', m: 'revokedSessions', op: 'r' })
        );
        assert.equal(await count(w, 'revoked_sessions', 'jti = $1', [jti]), 1);
        expect(A.db.isSessionRevoked(jti), "'r': A accepts a session it logged out");

        // The full rehydrate after a LISTEN reconnect, while a family revoke is queued.
        const famR = randomUUID();
        const tr = mkRefresh(A.db, u, famR);
        await quiesce(w);
        await run(
            'rehydrate',
            /^BEGIN$/,
            /^SELECT \* FROM refresh_tokens/,
            () => A.db.revokeRefreshTokenFamily(famR, 'logout'),
            () => A.tap.reconnect!()
        );
        assert.equal(
            await count(w, 'refresh_tokens', 'family_id = $1 AND revoked_at IS NULL', [famR]),
            0
        );
        expect(
            Boolean(A.db.findRefreshTokenByHash(tr.tokenHash)?.revokedAt),
            'rehydrate: a refresh token A logged out is live again in A'
        );
        assert.deepEqual(taken, [], 'no refresh took back a write A had made');
    });
});

test('drainWrites waits for the queued writes only, not for a peer refresh still on the apply chain', async () => {
    await withWorld(1, 'hub', async (w) => {
        const [A] = w.procs;
        const u = mkUser(A.db);
        const v = mkVault(A.db, u);
        await quiesce(w);
        const answered = deferred();
        const reply = deferred();
        A.ctl.hold = (sql) =>
            /^SELECT x\.\* FROM vault_items/.test(sql)
                ? (answered.resolve(), reply.promise)
                : undefined;
        await w.emit({ src: 'elsewhere', m: 'vaultItems', op: 'k', kvs: [[v]] });
        await answered.promise;

        try {
            const jti = revoke(A.db, u);
            const race = (p: Promise<void>, ms: number) =>
                Promise.race([p.then(() => 'done'), sleep(ms).then(() => 'waiting')]);
            assert.equal(
                await race(A.db.drainWrites(), 3000),
                'done',
                'the durability wait does not wait for the held refresh'
            );
            assert.equal(await count(w, 'revoked_sessions', 'jti = $1', [jti]), 1);
            assert.equal(await race(A.db.drain(), 100), 'waiting', 'drain() still waits for it');
        } finally {
            A.ctl.hold = () => undefined;
            reply.resolve();
        }
        await A.db.drain();
    });
});

// ------------------------------------------------------------------ writer

test('X6: removing a circle edge deletes that one row by key, and keeps an edge the remover has not heard of', async () => {
    await withWorld(2, 'pg', async (w) => {
        const [A, B] = w.procs;
        const [x, y, z] = [randomUUID(), randomUUID(), randomUUID()];
        const edge = (db: any, f: string, t: string) =>
            db.addCircleEdge({ id: randomUUID(), followerId: f, followeeId: t });
        edge(A.db, x, y);
        edge(A.db, y, z);
        await quiesce(w);
        A.tap.deaf = true;
        edge(B.db, z, x);
        await quiesce(w);
        assert.equal(A.db.getCircleEdge(z, x), undefined, 'A has not heard of z -> x');

        A.ctl.log.length = 0;
        A.db.removeCircleEdge(y, z);
        await A.db.drain();
        const onTable = A.ctl.log.filter((q) => /circle_edges/.test(q));
        assert.deepEqual(
            onTable,
            [
                'DELETE FROM circle_edges WHERE follower_id = $1 AND followee_id = $2 RETURNING follower_id, followee_id',
            ],
            'one DELETE of that row, and no re-read: the key Postgres returned is the key the mirror removed'
        );
        const left = await w.sql(
            'SELECT follower_id, followee_id FROM circle_edges WHERE follower_id = ANY($1)',
            [[x, y, z]]
        );
        assert.deepEqual(
            left.map((r) => `${r.follower_id}>${r.followee_id}`).sort(),
            [`${x}>${y}`, `${z}>${x}`].sort()
        );
        await quiesce(w);
        assert.equal(B.db.getCircleEdge(y, z), undefined, 'the peer dropped the removed edge');
        assert.ok(B.db.getCircleEdge(z, x));

        // A removal the mirror does not hold changes nothing, so nothing is queued.
        A.ctl.log.length = 0;
        assert.equal(A.db.removeCircleEdge(z, x), false);
        await A.db.drain();
        assert.deepEqual(A.ctl.log, []);
        assert.equal(
            (
                await w.sql('SELECT count(*)::int AS n FROM circle_edges WHERE follower_id = $1', [
                    z,
                ])
            )[0].n,
            1
        );
    });
});

test('X15: an op whose transaction fails publishes nothing and leaves Postgres as it was', async () => {
    await withWorld(2, 'pg', async (w) => {
        const [A, B] = w.procs;
        const u = mkUser(A.db);
        const v = mkVault(A.db, u);
        await quiesce(w);
        assert.ok(B.db.getVaultItem(v));
        const failures = metric('db_write_behind_failures_total', {
            map: 'vaultItems',
            kind: 'targeted',
        });
        const heard = w.heard.length;

        // The in-transaction NOTIFY fails on both attempts.
        A.ctl.log.length = 0;
        A.ctl.fault = (sql) => (/^SELECT pg_notify/.test(sql) ? 'before' : undefined);
        A.db.deleteVaultItem(v);
        await quiesce(w);
        assert.equal(await vaultCount(w, v), 1, 'the DELETE was rolled back with its notification');
        assert.deepEqual(w.heard.slice(heard), [], 'nothing was announced');
        assert.ok(B.db.getVaultItem(v), 'the peer holds what Postgres holds');
        assert.equal(A.ctl.log.filter((q) => q === 'BEGIN').length, 2, 'it was retried once');
        assert.equal(A.ctl.log.filter((q) => q === 'ROLLBACK').length, 2);
        assert.equal(
            metric('db_write_behind_failures_total', { map: 'vaultItems', kind: 'targeted' }),
            failures + 1,
            'the lost write is counted'
        );
    });
});

test('X15b: a required step that matches nothing rolls the whole op back (no partial delete), announces nothing, and re-reads', async () => {
    await withSpec(
        'deleteVaultItem',
        {
            kind: 'targeted',
            steps: [
                { op: 'deleteKey', map: 'vaultItems', key: (c) => [c.args[0]] },
                {
                    op: 'updateWhere',
                    map: 'vaultItems',
                    set: 'label = label',
                    where: 'id = $1',
                    params: () => [randomUUID()],
                    required: true,
                },
            ],
        },
        () =>
            withWorld(2, 'pg', async (w) => {
                const [A, B] = w.procs;
                const u = mkUser(A.db);
                const v = mkVault(A.db, u);
                await quiesce(w);
                const conflicts = metric('db_targeted_write_conflicts_total', {
                    map: 'vaultItems',
                    method: 'deleteVaultItem',
                });
                const heard = w.heard.length;
                assert.equal(A.db.deleteVaultItem(v), true);
                assert.equal(A.db.getVaultItem(v), undefined, 'the mirror changed at once');
                await quiesce(w);
                assert.equal(await vaultCount(w, v), 1, 'the first statement was rolled back');
                assert.deepEqual(w.heard.slice(heard), []);
                assert.ok(A.db.getVaultItem(v), 'A re-read the key and holds the row again');
                assert.ok(B.db.getVaultItem(v));
                assert.equal(
                    metric('db_targeted_write_conflicts_total', {
                        map: 'vaultItems',
                        method: 'deleteVaultItem',
                    }),
                    conflicts + 1
                );
            })
    );
});

test('self-refresh: rows a set-based step reached that the mirror did not hold are read into it', async () => {
    await withSpec(
        'deleteVaultItem',
        {
            kind: 'targeted',
            steps: [
                { op: 'deleteKey', map: 'vaultItems', key: (c) => [c.args[0]] },
                {
                    op: 'updateWhere',
                    map: 'vaultItems',
                    set: `label = 'swept'`,
                    where: 'owner_user_id = $1',
                    // The owner of the item the call removed, read from the call's changes.
                    params: (c) => {
                        const [gone] = c.changed('vaultItems');
                        assert.equal(gone?.after, undefined);
                        assert.equal(c.before('vaultItems', gone!.key), gone!.before);
                        return [gone!.before!.ownerUserId];
                    },
                },
            ],
        },
        () =>
            withWorld(2, 'pg', async (w) => {
                const [A, B] = w.procs;
                const u = mkUser(A.db);
                const v = mkVault(A.db, u);
                await quiesce(w);
                A.tap.deaf = true;
                const unseen = mkVault(B.db, u);
                await quiesce(w);
                assert.equal(A.db.getVaultItem(unseen), undefined);
                A.db.deleteVaultItem(v);
                await quiesce(w);
                assert.equal((await vaultRow(w, unseen)).label, 'swept');
                assert.equal(
                    A.db.getVaultItem(unseen)?.label,
                    'swept',
                    'A read the unseen row its UPDATE reached'
                );
                assert.equal(B.db.getVaultItem(unseen)?.label, 'swept', 'and the peer was told');
            })
    );
});

for (const mode of ['pg', 'hub'] as const) {
    test(`X18 (${mode}): the first attempt fails after its COMMIT, and the retry ends in the same state`, async () => {
        await withWorld(2, mode, async (w) => {
            const [A, B] = w.procs;
            const u = mkUser(A.db);
            const v = mkVault(A.db, u);
            await quiesce(w);
            assert.ok(B.db.getVaultItem(v));
            const failures = metric('db_write_behind_failures_total', {
                map: 'vaultItems',
                kind: 'targeted',
            });
            let commits = 0;
            A.ctl.log.length = 0;
            A.ctl.fault = (sql) => (sql === 'COMMIT' && ++commits === 1 ? 'after' : undefined);
            A.db.deleteVaultItem(v);
            await quiesce(w);
            assert.equal(A.ctl.log.filter((q) => q === 'BEGIN').length, 2, 'the op was retried');
            assert.equal(await vaultCount(w, v), 0);
            assert.equal(A.db.getVaultItem(v), undefined);
            assert.equal(
                B.db.getVaultItem(v),
                undefined,
                'the peer was told, whichever attempt told it'
            );
            assert.equal(
                metric('db_write_behind_failures_total', { map: 'vaultItems', kind: 'targeted' }),
                failures,
                'the op succeeded on its retry'
            );
        });
    });
}

test('X16c (fence): a peer refresh does not bring back a row this process has a queued delete for', async () => {
    await withWorld(2, 'pg', async (w) => {
        const [A, B] = w.procs;
        const u = mkUser(A.db);
        const v = mkVault(A.db, u);
        await quiesce(w);
        // B's op has not begun when A's update lands (a delay inside B's
        // transaction would hold PGlite's one session and order A after B).
        B.ctl.delay = (sql) => (sql === 'BEGIN' ? 300 : 0);
        B.db.deleteVaultItem(v);
        A.db.updateVaultItem(v, { label: 'A' });
        await A.db.drain();
        await sleep(PG_URL ? 80 : 30);
        await B.db.applyTail;
        assert.equal(B.db.queue.depth, 1, "B's delete is still queued");
        assert.equal(
            B.db.getVaultItem(v),
            undefined,
            "A's update does not bring the row back into B"
        );
        await quiesce(w);
        assert.equal(await vaultCount(w, v), 0);
        for (const p of [A, B]) assert.equal(p.db.getVaultItem(v), undefined);
    });
});

test('U4: a targeted spec naming a column the schema lacks makes init reject', async () => {
    await withWorld(0, 'hub', async (w) => {
        await withSpec(
            'deleteVaultItem',
            {
                kind: 'targeted',
                steps: [
                    {
                        op: 'deleteWhere',
                        map: 'vaultItems',
                        where: 'ownr_user_id = $1',
                        params: (c) => [c.args[0]],
                    },
                ],
            },
            async () => {
                await assert.rejects(
                    w.boot(),
                    /MUTATOR_SPECS\.deleteVaultItem step 1 .*ownr_user_id/
                );
            }
        );
        await withSpec(
            'deleteVaultItem',
            {
                kind: 'targeted',
                steps: [
                    {
                        op: 'deleteKey',
                        map: 'vaultItems',
                        key: (c) => [c.args[0]],
                        guard: { column: 'edited_at', value: () => null },
                    },
                ],
            },
            async () => {
                await assert.rejects(
                    w.boot(),
                    /MUTATOR_SPECS\.deleteVaultItem step 1 .*edited_at does not exist/
                );
            }
        );
        // The real specs fit the schema.
        const db = await w.boot();
        await db.shutdown();
    });
});

test('U4b: init boots on a schema behind the code, leaving out the steps whose table is not there yet', async () => {
    // As on develop, a store whose migrations are not all applied
    // (BLACKOUT_DB_MIGRATE_ON_START=0 with ./bin/migrate not yet run) boots;
    // what it cannot write is logged. PGlite here, whichever backend the rest uses.
    const { PGlite } = await import('@electric-sql/pglite');
    const latest = Math.max(
        ...readdirSync(MIGRATIONS_DIR)
            .filter((f) => f.endsWith('.up.sql'))
            .map((f) => Number.parseInt(f, 10))
    );
    for (const ordinal of [latest - 1, 99]) {
        const pg = new PGlite();
        const client = {
            async query(sql: string, params?: unknown[]) {
                if (!params || params.length === 0) {
                    return { rows: ((await pg.exec(sql)).at(-1)?.rows ?? []) as Row[] };
                }
                return { rows: (await pg.query(sql, params)).rows as Row[] };
            },
            release() {},
        };
        const pool = { connect: async () => client, end: async () => {} };
        try {
            await migrateUp({
                pool: pool as never,
                migrationsDir: MIGRATIONS_DIR,
                targetOrdinal: ordinal,
            });
            const db: any = new PostgresBackedDb();
            db.users.delete('demo-user');
            await db.init(pool);
            assert.equal(
                db.compiled.has('deleteInvitationAdmissionsForUser'),
                false,
                `${ordinal}: its only table (migration 105) is not there, so it writes the mirror only`
            );
            assert.ok(db.compiled.has('deleteVaultItem'), `${ordinal}: the others are compiled`);
            assert.equal(db.persistsRefreshTokenSessionEnds(), ordinal >= 100);

            const u = mkUser(db);
            const v = mkVault(db, u);
            mkRefresh(db, u, randomUUID());
            await db.drain();
            db.deleteInvitationAdmissionsForUser(u, null);
            assert.equal(db.deleteVaultItem(v), true);
            db.deleteUser(u);
            await db.drain();
            const n = async (sql: string, p: unknown[]) =>
                (await client.query(sql, p)).rows[0].n as number;
            assert.equal(
                await n('SELECT count(*)::int AS n FROM vault_items WHERE id = $1', [v]),
                0,
                `${ordinal}: a keyed delete reaches Postgres`
            );
            assert.equal(
                await n('SELECT count(*)::int AS n FROM users WHERE id = $1', [u]),
                0,
                `${ordinal}: so does an account deletion`
            );
            assert.equal(
                await n('SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = $1', [u]),
                0
            );
            await db.shutdown();
        } finally {
            await pg.close();
        }
    }
});

test('U5: a spec naming a method InMemoryDb does not define throws when the store is built', async () => {
    await withSpec(
        'deleteNoSuchRecord',
        {
            kind: 'targeted',
            steps: [{ op: 'deleteKey', map: 'vaultItems', key: (c) => [c.args[0]] }],
        },
        async () => {
            assert.throws(() => new PostgresBackedDb(), /MUTATOR_SPECS names deleteNoSuchRecord/);
        }
    );
    assert.doesNotThrow(() => new PostgresBackedDb());
});

test('chunking: key notifications stay within the NOTIFY limit and carry every key once, in order', () => {
    const src = randomUUID();
    for (const kvs of [
        Array.from({ length: 2000 }, () => [randomUUID()]),
        Array.from({ length: 600 }, (_, i) => [`ключ-${i}-${'ü'.repeat(i % 40)}`, 'twitch']),
    ]) {
        const payloads = keyChangePayloads(src, 'revokedSessions', kvs);
        assert.ok(payloads.length > 1);
        for (const p of payloads) {
            assert.equal(p.op, 'k');
            assert.ok(Buffer.byteLength(JSON.stringify(p)) <= MAX_KEY_PAYLOAD_BYTES);
        }
        assert.deepEqual(
            payloads.flatMap((p) => p.kvs),
            kvs
        );
    }
    assert.ok(MAX_KEY_PAYLOAD_BYTES < 8000, 'below the 8000-byte payload Postgres refuses');
    assert.deepEqual(keyChangePayloads(src, 'm', []), []);
});

test('a targeted step that throws while binding never throws into the mutator, and the lost write is counted', async () => {
    await withSpec(
        'deleteVaultItem',
        {
            kind: 'targeted',
            steps: [
                {
                    op: 'deleteKey',
                    map: 'vaultItems',
                    key: () => {
                        throw new Error('bad key');
                    },
                },
            ],
        },
        () =>
            withWorld(1, 'hub', async (w) => {
                const [A] = w.procs;
                const v = mkVault(A.db, mkUser(A.db));
                await quiesce(w);
                const failures = metric('db_write_behind_failures_total', {
                    map: 'vaultItems',
                    kind: 'targeted',
                });
                assert.equal(A.db.deleteVaultItem(v), true, 'the call returns its own result');
                await quiesce(w);
                assert.equal(
                    metric('db_write_behind_failures_total', {
                        map: 'vaultItems',
                        kind: 'targeted',
                    }),
                    failures + 1
                );
                assert.equal(await vaultCount(w, v), 1);
            })
    );
});

// ------------------------------------------------------------------ auth tables

test("X1: the worker's prune keeps a revocation and a cutoff it has not heard of, and still prunes the expired row", async () => {
    await withWorld(2, 'pg', async (w) => {
        const [app, worker] = w.procs;
        const u = mkUser(app.db);
        const cutoffJti = `user-token-cutoff:${u}`;
        app.db.revokeUserTokensBefore(u, 'admin_revoke');
        const expired = revoke(app.db, u, new Date(Date.now() - 60_000).toISOString());
        await quiesce(w);
        // The earlier cutoff, an hour back, as both mirrors hold it.
        await w.sql(
            `UPDATE revoked_sessions SET revoked_at = now() - interval '1 hour' WHERE jti = $1`,
            [cutoffJti]
        );
        await w.emit({ src: 'elsewhere', m: 'revokedSessions', op: 'k', kvs: [[cutoffJti]] });
        await deafen(w, worker);
        const t1 = worker.db.getUserTokenRevocationCutoff(u);
        assert.ok(t1 > 0 && t1 < Date.now() / 1000 - 3000, 'the worker holds the older cutoff');

        // The app revokes a session and moves the cutoff on; the worker hears neither.
        const live = revoke(app.db, u);
        app.db.revokeUserTokensBefore(u, 'password_change');
        const t2 = app.db.getUserTokenRevocationCutoff(u);
        await quiesce(w);
        assert.equal(worker.db.isSessionRevoked(live), false, 'the worker has not heard');

        assert.equal(worker.db.pruneExpiredRevokedSessions(new Date()), 1);
        await quiesce(w);

        assert.equal(await count(w, 'revoked_sessions', 'jti = $1', [live]), 1, 'kept in Postgres');
        assert.equal(await count(w, 'revoked_sessions', 'jti = $1', [expired]), 0, 'pruned');
        const [cut] = await w.sql('SELECT revoked_at FROM revoked_sessions WHERE jti = $1', [
            cutoffJti,
        ]);
        assert.equal(
            Math.floor(new Date(cut.revoked_at).getTime() / 1000),
            t2,
            'cutoff not moved back'
        );
        const booted = await w.boot();
        try {
            for (const [name, db] of [
                ['the app', app.db],
                ['a process booted now', booted],
            ] as const) {
                assert.equal(db.isSessionRevoked(live), true, `${name} still refuses the token`);
                assert.equal(
                    db.getUserTokenRevocationCutoff(u),
                    t2,
                    `${name} keeps the later cutoff`
                );
                assert.equal(db.revokedSessions.has(expired), false);
            }
        } finally {
            await booted.shutdown();
        }
    });
});

test('X2: deleting one account keeps an account the deleting process has not heard of', async () => {
    await withWorld(2, 'pg', async (w) => {
        const [A, B] = w.procs;
        const leaving = mkUser(A.db);
        await deafen(w, B);
        const fresh = mkUser(A.db);
        await quiesce(w);
        assert.equal(B.db.getUserById(fresh), undefined, 'B has not heard of the new account');
        assert.equal(B.db.deleteUser(leaving), true);
        await quiesce(w);
        assert.equal(await count(w, 'users', 'id = $1', [leaving]), 0);
        assert.equal(await count(w, 'users', 'id = $1', [fresh]), 1, 'the unseen account is kept');
        assert.equal(A.db.getUserById(leaving), undefined, 'the peer dropped the deleted account');
        assert.ok(A.db.getUserById(fresh), 'and still holds the other');
    });
});

test('X3: a family revoke reaches the successor a peer minted, and keeps the rotated parent as Postgres has it', async () => {
    await withWorld(2, 'pg', async (w) => {
        const [A, B] = w.procs;
        const u = mkUser(A.db);
        const family = randomUUID();
        const t1 = mkRefresh(A.db, u, family);
        await deafen(w, B);
        // A rotates t1 into t2; B has heard of neither.
        const t2 = mkRefresh(A.db, u, family);
        A.db.consumeRefreshTokenForRotation(t1.id, t2.id);
        await quiesce(w);
        assert.equal(B.db.refreshTokens.get(t1.id)?.revokedAt, undefined, 'B: t1 still live');

        assert.equal(B.db.revokeRefreshTokenFamily(family, 'reuse_detected'), 1);
        await quiesce(w);
        const rows = await w.sql(
            'SELECT id, replaced_by, revoked_at, revoked_reason FROM refresh_tokens WHERE family_id = $1',
            [family]
        );
        const row = (id: string) => rows.find((r) => r.id === id)!;
        assert.equal(
            row(t2.id).revoked_reason,
            'reuse_detected',
            'the unseen successor is revoked'
        );
        assert.equal(row(t1.id).replaced_by, t2.id, 'the parent keeps its successor link');
        assert.equal(row(t1.id).revoked_reason, 'rotated', 'and its first revocation');
        for (const p of [A, B]) {
            assert.equal(p.db.refreshTokens.get(t2.id)?.revokedReason, 'reuse_detected');
            assert.equal(p.db.refreshTokens.get(t1.id)?.replacedBy, t2.id);
        }
        assert.equal(
            iso(B.db.refreshTokens.get(t2.id)?.revokedAt),
            iso(row(t2.id).revoked_at),
            "B read in Postgres's row"
        );
    });
});

test('X4: revoke-all reaches a refresh token a peer minted', async () => {
    await withWorld(2, 'pg', async (w) => {
        const [A, B] = w.procs;
        const u = mkUser(A.db);
        await deafen(w, B);
        const t = mkRefresh(A.db, u, randomUUID());
        const own = mkRefresh(B.db, u, randomUUID());
        await quiesce(w);
        assert.equal(B.db.refreshTokens.get(t.id), undefined);
        assert.equal(B.db.revokeRefreshTokensForUser(u, 'password_change'), 1);
        await quiesce(w);
        const [row] = await w.sql('SELECT revoked_reason FROM refresh_tokens WHERE id = $1', [
            t.id,
        ]);
        assert.equal(row?.revoked_reason, 'password_change');
        for (const p of [A, B]) {
            assert.equal(p.db.refreshTokens.get(t.id)?.revokedReason, 'password_change');
        }
        // The token B held carries, in Postgres, the time B's mirror stamped.
        const [mine] = await w.sql('SELECT revoked_at FROM refresh_tokens WHERE id = $1', [own.id]);
        assert.equal(iso(mine.revoked_at), B.db.refreshTokens.get(own.id)?.revokedAt);
    });
});

test('X5: a single-use row consumed on two processes keeps the first consumption, and the stale mirror re-reads it', async () => {
    await withWorld(2, 'pg', async (w) => {
        const [A, B] = w.procs;
        const u = mkUser(A.db);
        const kinds = [
            [
                'password_reset_tokens',
                'id',
                mkReset(A.db, u).id,
                'consumePasswordResetToken',
                'passwordResetTokens',
            ],
            [
                'email_verification_tokens',
                'id',
                mkVerify(A.db, u).id,
                'consumeEmailVerificationToken',
                'emailVerificationTokens',
            ],
            [
                'account_deletion_tokens',
                'id',
                mkDeletion(A.db, u).id,
                'consumeAccountDeletionToken',
                'accountDeletionTokens',
            ],
            [
                'pending_oauth_links',
                'state_hash',
                mkOAuthLink(A.db, u).stateHash,
                'consumePendingOAuthLink',
                'pendingOAuthLinks',
            ],
            [
                'pending_oidc_logins',
                'state_hash',
                mkOidcLogin(A.db).stateHash,
                'consumePendingOidcLogin',
                'pendingOidcLogins',
            ],
        ] as const;
        await deafen(w, B);
        const first = new Map<string, string>();
        for (const [, , key, method] of kinds) first.set(key, A.db[method](key).consumedAt);
        await quiesce(w);
        await sleep(5);
        for (const [, , key, method] of kinds) {
            const stale = B.db[method](key);
            assert.ok(
                stale.consumedAt > first.get(key)!,
                `${method}: B's mirror accepted it again`
            );
        }
        await quiesce(w);
        for (const [table, col, key, method, map] of kinds) {
            const [row] = await w.sql(`SELECT consumed_at FROM ${table} WHERE ${col} = $1`, [key]);
            assert.equal(iso(row.consumed_at), first.get(key), `${method}: Postgres keeps A's`);
            assert.equal(B.db[map].get(key).consumedAt, first.get(key), `${method}: B re-read it`);
        }
    });
});

test("X7: purge removes the account's auth rows written anywhere, linked accounts included, and nothing else", async () => {
    await withWorld(2, 'pg', async (w) => {
        const [A, B] = w.procs;
        const [u, v] = [mkUser(A.db), mkUser(A.db)];
        await deafen(w, A);
        // Written on B, unheard by A: the account's rows, another account's, and a revocation.
        const mine = {
            reset: mkReset(B.db, u).id,
            verify: mkVerify(B.db, u).id,
            deletion: mkDeletion(B.db, u).id,
            refresh: mkRefresh(B.db, u, randomUUID()).id,
            oauth: mkOAuthLink(B.db, u).stateHash,
        };
        mkLinked(B.db, u);
        const theirs = { reset: mkReset(B.db, v).id, refresh: mkRefresh(B.db, v, randomUUID()).id };
        mkLinked(B.db, v);
        const jti = revoke(B.db, u);
        await quiesce(w);

        A.db.purgeUserAuthArtifacts(u);
        await quiesce(w);
        for (const [table, col] of [
            ['password_reset_tokens', 'user_id'],
            ['email_verification_tokens', 'user_id'],
            ['account_deletion_tokens', 'user_id'],
            ['refresh_tokens', 'user_id'],
            ['linked_accounts', 'blackout_user_id'],
            ['pending_oauth_links', 'blackout_user_id'],
        ]) {
            assert.equal(
                await count(w, table, `${col} = $1`, [u]),
                0,
                `${table}: the account's rows go`
            );
        }
        assert.equal(await count(w, 'revoked_sessions', 'jti = $1', [jti]), 1, 'revocations stay');
        assert.equal(await count(w, 'password_reset_tokens', 'id = $1', [theirs.reset]), 1);
        assert.equal(await count(w, 'refresh_tokens', 'id = $1', [theirs.refresh]), 1);
        assert.equal(await count(w, 'linked_accounts', 'blackout_user_id = $1', [v]), 1);
        // The peer's mirror follows.
        assert.equal(B.db.passwordResetTokens.has(mine.reset), false);
        assert.equal(B.db.emailVerificationTokens.has(mine.verify), false);
        assert.equal(B.db.accountDeletionTokens.has(mine.deletion), false);
        assert.equal(B.db.refreshTokens.has(mine.refresh), false);
        assert.equal(B.db.pendingOAuthLinks.has(mine.oauth), false);
        assert.equal(B.db.getLinkedAccount(u, 'twitch'), undefined);
        assert.ok(B.db.getLinkedAccount(v, 'twitch'));
        assert.equal(B.db.isSessionRevoked(jti), true);
    });
});

test('X1b: the OAuth and OIDC state prunes keep an unexpired row the pruning process has not heard of', async () => {
    await withWorld(2, 'pg', async (w) => {
        const [app, worker] = w.procs;
        const u = mkUser(app.db);
        await deafen(w, worker);
        const live = {
            oauth: mkOAuthLink(app.db, u).stateHash,
            oidc: mkOidcLogin(app.db).stateHash,
        };
        const past = new Date(Date.now() - 60_000).toISOString();
        const gone = {
            oauth: app.db.createPendingOAuthLink({
                ...app.db.pendingOAuthLinks.get(live.oauth),
                stateHash: hex(),
                expiresAt: past,
            }).stateHash,
            oidc: app.db.createPendingOidcLogin({
                ...app.db.pendingOidcLogins.get(live.oidc),
                stateHash: hex(),
                expiresAt: past,
            }).stateHash,
        };
        await quiesce(w);
        assert.equal(worker.db.prunePendingOAuthLinks(new Date()), 0);
        assert.equal(worker.db.prunePendingOidcLogins(new Date()), 0);
        await quiesce(w);
        assert.equal(await count(w, 'pending_oauth_links', 'state_hash = $1', [live.oauth]), 1);
        assert.equal(await count(w, 'pending_oidc_logins', 'state_hash = $1', [live.oidc]), 1);
        assert.equal(await count(w, 'pending_oauth_links', 'state_hash = $1', [gone.oauth]), 0);
        assert.equal(await count(w, 'pending_oidc_logins', 'state_hash = $1', [gone.oidc]), 0);
        assert.ok(
            app.db.pendingOAuthLinks.has(live.oauth) && app.db.pendingOidcLogins.has(live.oidc)
        );
        assert.equal(app.db.pendingOAuthLinks.has(gone.oauth), false, 'the app heard of the prune');
        assert.equal(app.db.pendingOidcLogins.has(gone.oidc), false);
    });
});

test("X7b: deleting an account's invitation admissions reaches one written elsewhere and keeps another account's", async () => {
    await withWorld(2, 'pg', async (w) => {
        const [A, B] = w.procs;
        const admit = (db: any, rec: Record<string, unknown>) =>
            db.createInvitationAdmission({
                id: randomUUID(),
                invitationTokenId: randomUUID(),
                ...rec,
            }).id as string;
        await deafen(w, A);
        const claimed = admit(B.db, {
            matrixUserId: '@other:x',
            claimedByUserId: 'acct-x7b',
            claimedAt: new Date().toISOString(),
        });
        const unclaimed = admit(B.db, { matrixUserId: '@x7b:x' });
        const theirs = admit(B.db, { matrixUserId: '@someone:x' });
        await quiesce(w);
        assert.equal(A.db.deleteInvitationAdmissionsForUser('acct-x7b', '@x7b:x'), 0);
        await quiesce(w);
        assert.equal(
            await count(w, 'invitation_admissions', 'id = ANY($1)', [[claimed, unclaimed]]),
            0
        );
        assert.equal(await count(w, 'invitation_admissions', 'id = $1', [theirs]), 1);
        assert.equal(B.db.invitationAdmissions.has(claimed), false);
        assert.equal(B.db.invitationAdmissions.has(unclaimed), false);
        assert.ok(B.db.invitationAdmissions.has(theirs));
    });
});

test('X13: a superseded verification token and its sent time reach Postgres, including a token a peer issued', async () => {
    await withWorld(2, 'pg', async (w) => {
        const [A, B] = w.procs;
        const u = mkUser(A.db);
        await deafen(w, A);
        const unseen = mkVerify(B.db, u).id;
        await quiesce(w);
        const t1 = mkVerify(A.db, u).id;
        const sent = A.db.markEmailVerificationTokenSent(t1).sentAt;
        assert.equal(A.db.revokeEmailVerificationTokensForUser(u, 'superseded'), 1);
        const t2 = mkVerify(A.db, u).id;
        await quiesce(w);
        const booted = await w.boot();
        try {
            const get = (id: string) => booted.emailVerificationTokens.get(id);
            assert.equal(get(t1)?.sentAt, sent, 'the sent time survives a restart');
            assert.equal(get(t1)?.revokedReason, 'superseded');
            assert.equal(
                get(unseen)?.revokedReason,
                'superseded',
                "the peer's token is superseded too"
            );
            assert.equal(get(t2)?.revokedReason, undefined, 'the new token is live');
        } finally {
            await booted.shutdown();
        }
        assert.equal(B.db.emailVerificationTokens.get(unseen)?.revokedReason, 'superseded');
        assert.equal(B.db.emailVerificationTokens.get(t1)?.sentAt, sent);
    });
});

test("X13b: the expired-token sweeps judge Postgres's rows: unexpired and consumed ones stay, unseen expired ones go", async () => {
    await withWorld(2, 'pg', async (w) => {
        const [A, B] = w.procs;
        const u = mkUser(A.db);
        const past = new Date(Date.now() - 60_000).toISOString();
        const consumed = mkVerify(A.db, u, past).id;
        A.db.consumeEmailVerificationToken(consumed);
        await deafen(w, A);
        const resets = { live: mkReset(B.db, u).id, gone: mkReset(B.db, u, past).id };
        const verifies = { live: mkVerify(B.db, u).id, gone: mkVerify(B.db, u, past).id };
        await quiesce(w);
        assert.equal(A.db.deleteExpiredPasswordResetTokens(new Date()), 0);
        assert.equal(A.db.deleteExpiredEmailVerificationTokens(new Date()), 0);
        await quiesce(w);
        assert.equal(await count(w, 'password_reset_tokens', 'id = $1', [resets.live]), 1);
        assert.equal(await count(w, 'password_reset_tokens', 'id = $1', [resets.gone]), 0);
        assert.equal(await count(w, 'email_verification_tokens', 'id = $1', [verifies.live]), 1);
        assert.equal(await count(w, 'email_verification_tokens', 'id = $1', [verifies.gone]), 0);
        assert.equal(await count(w, 'email_verification_tokens', 'id = $1', [consumed]), 1);
        assert.equal(B.db.passwordResetTokens.has(resets.gone), false);
        assert.equal(B.db.emailVerificationTokens.has(verifies.gone), false);
        assert.ok(
            B.db.passwordResetTokens.has(resets.live) && B.db.emailVerificationTokens.has(consumed)
        );
    });
});

test("X17: after an account is deleted, the peer's mirror holds none of its vault items, links or webhooks", async () => {
    await withWorld(2, 'pg', async (w) => {
        const [A, B] = w.procs;
        const u = mkUser(A.db);
        const vault = mkVault(A.db, u);
        mkLinked(A.db, u);
        const hook = A.db.createOutboundEventWebhook({
            id: randomUUID(),
            blackoutUserId: u,
            name: 'n',
            targetUrl: 'https://x.example/h',
            signingSecretCiphertext: 'sc',
            encryptionKeyId: 'k1',
            eventTypes: [],
            isActive: true,
            consecutiveFailures: 0,
            deliveryCount: 0,
        }).id;
        const compat = A.db.createDiscordCompatWebhook({
            id: randomUUID(),
            blackoutUserId: u,
            matrixRoomId: '!r:x',
            name: 'n',
            tokenHash: hex(),
            isActive: true,
            deliveryCount: 0,
        }).id;
        const jti = revoke(A.db, u);
        await deafen(w, A);
        const unseen = mkVault(B.db, u);
        await quiesce(w);
        assert.ok(B.db.getVaultItem(vault) && B.db.getLinkedAccount(u, 'twitch'));
        assert.equal(A.db.getVaultItem(unseen), undefined);

        A.db.deleteUser(u);
        await quiesce(w);
        assert.equal(await count(w, 'users', 'id = $1', [u]), 0);
        for (const p of [A, B]) {
            assert.equal(p.db.getUserById(u), undefined);
            assert.equal(p.db.getVaultItem(vault), undefined);
            assert.equal(p.db.getVaultItem(unseen), undefined);
            assert.equal(p.db.getLinkedAccount(u, 'twitch'), undefined);
            assert.equal(p.db.outboundEventWebhooks.has(hook), false);
            assert.equal(p.db.discordCompatWebhooks.has(compat), false);
        }
        // Postgres's cascade removed the revocation; the mirrors keep refusing the token.
        assert.equal(await count(w, 'revoked_sessions', 'jti = $1', [jti]), 0);
        assert.equal(B.db.isSessionRevoked(jti), true);
    });
});

test('X19: a 2,000-row prune announces every key in payloads under the NOTIFY limit, and the peer converges', async () => {
    await withWorld(2, 'pg', async (w) => {
        const [A, B] = w.procs;
        const u = mkUser(A.db);
        await quiesce(w);
        await w.sql(
            `INSERT INTO revoked_sessions (jti, user_id, revoked_at, expires_at, reason)
             SELECT 'x19-' || g || '-' || md5(g::text), $1, now() - interval '2 days', now() - interval '1 day', 'logout'
             FROM generate_series(1, 2000) g`,
            [u]
        );
        const jtis = (await w.sql(`SELECT jti FROM revoked_sessions WHERE jti LIKE 'x19-%'`)).map(
            (r) => r.jti as string
        );
        for (const p of keyChangePayloads(
            'elsewhere',
            'revokedSessions',
            jtis.map((j) => [j])
        )) {
            await w.emit(p);
        }
        const live = revoke(A.db, u);
        await quiesce(w);
        assert.equal(B.db.revokedSessions.size, 2001, 'B holds every row');
        const heard = w.heard.length;

        assert.equal(A.db.pruneExpiredRevokedSessions(new Date()), 2000);
        await quiesce(w);
        const sent = w.heard.slice(heard).filter((p) => p.m === 'revokedSessions');
        assert.ok(sent.length > 1, 'split across several notifications');
        for (const p of sent) assert.ok(Buffer.byteLength(JSON.stringify(p)) < 8000);
        assert.deepEqual(
            sent.flatMap((p) => p.kvs!.map((kv) => kv[0])).sort(),
            [...jtis].sort(),
            'every pruned key announced once'
        );
        assert.equal(await count(w, 'revoked_sessions', 'true', []), 1);
        assert.deepEqual([...B.db.revokedSessions.keys()], [live], 'the peer converged');
    });
});

test('U7: USER_CASCADE_CHILDREN, with the rows left in mirrors, is every cascading foreign key to users', async () => {
    await withWorld(0, 'hub', async (w) => {
        const rows = await w.sql(
            `SELECT c.conrelid::regclass::text AS child, a.attname AS col
             FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
             WHERE c.contype = 'f' AND c.confrelid = 'users'::regclass AND c.confdeltype = 'c'`
        );
        const tableOf = new Map(TABLE_DESCRIPTORS.map((d) => [d.mapName, d.tableName]));
        const mapped = new Set(TABLE_DESCRIPTORS.map((d) => d.tableName));
        const catalogue = rows
            .filter((r) => mapped.has(r.child))
            .map((r) => `${r.child}.${r.col}`)
            .sort();
        const listed = [...USER_CASCADE_CHILDREN, ...USER_CASCADE_LEFT_IN_MIRRORS]
            .map((c) => `${tableOf.get(c.map)}.${c.column}`)
            .sort();
        assert.ok(catalogue.length >= 21);
        assert.deepEqual(listed, catalogue);
        // deleteUser deletes each listed child explicitly, before the account.
        const steps = (MUTATOR_SPECS.deleteUser as { steps: any[] }).steps;
        assert.deepEqual(
            steps.map((s) => (s.op === 'deleteWhere' ? `${s.map}:${s.where}` : `${s.map}:${s.op}`)),
            [...USER_CASCADE_CHILDREN.map((c) => `${c.map}:${c.column} = $1`), 'users:deleteKey']
        );
    });
});

// ------------------------------------------------------------------ the rest

const mkBounty = (db: any) =>
    db.createBounty({
        id: randomUUID(),
        category: 'design',
        title: 't',
        description: 'd',
        creatorId: randomUUID(),
        rewardType: 'cash',
        rewardSummary: 'r',
    }).id as string;

const apply = (db: any, bountyId: string) => {
    const applicantId = randomUUID();
    const app = db.createBountyApplication({ id: randomUUID(), bountyId, applicantId });
    assert.equal(typeof app, 'object', `application refused: ${String(app)}`);
    return { id: app.id as string, applicantId };
};

const bountyState = async (w: World, bountyId: string) => {
    const [b] = await w.sql('SELECT status, claimed_by FROM bounties WHERE id = $1', [bountyId]);
    const apps = await w.sql('SELECT id, status FROM bounty_applications WHERE bounty_id = $1', [
        bountyId,
    ]);
    return {
        bounty: `${b.status}:${b.claimed_by ?? ''}`,
        apps: Object.fromEntries(apps.map((a) => [a.id, a.status])),
    };
};

const mirrorBountyState = (db: any, bountyId: string, appIds: string[]) => {
    const b = db.bounties.get(bountyId);
    return {
        bounty: `${b.status}:${b.claimedBy ?? ''}`,
        apps: Object.fromEntries(appIds.map((id) => [id, db.bountyApplications.get(id)?.status])),
    };
};

test('X8: accepting an applicant declines a sibling application the accepting process has not heard of', async () => {
    await withWorld(2, 'pg', async (w) => {
        const [A, B] = w.procs;
        const bounty = mkBounty(A.db);
        const chosen = apply(A.db, bounty);
        await deafen(w, A);
        const unseen = apply(B.db, bounty);
        await quiesce(w);
        assert.equal(A.db.bountyApplications.get(unseen.id), undefined);
        assert.ok(A.db.acceptBountyApplication(bounty, chosen.applicantId));
        await quiesce(w);
        const want = {
            bounty: `claimed:${chosen.applicantId}`,
            apps: { [chosen.id]: 'accepted', [unseen.id]: 'declined' },
        };
        assert.deepEqual(await bountyState(w, bounty), want);
        assert.deepEqual(
            mirrorBountyState(A.db, bounty, [chosen.id, unseen.id]),
            want,
            'A read the sibling in'
        );
        assert.deepEqual(mirrorBountyState(B.db, bounty, [chosen.id, unseen.id]), want);
    });
});

test('X8b: a stale accept on a process that has not heard of the first is rolled back by its gate, and both mirrors converge', async () => {
    await withWorld(2, 'pg', async (w) => {
        const [A, B] = w.procs;
        const bounty = mkBounty(A.db);
        const [first, second] = [apply(A.db, bounty), apply(A.db, bounty)];
        await deafen(w, B);
        const conflicts = metric('db_targeted_write_conflicts_total', {
            map: 'bounties',
            method: 'acceptBountyApplication',
        });
        assert.ok(A.db.acceptBountyApplication(bounty, first.applicantId));
        await quiesce(w);
        const want = await bountyState(w, bounty);
        assert.deepEqual(want, {
            bounty: `claimed:${first.applicantId}`,
            apps: { [first.id]: 'accepted', [second.id]: 'declined' },
        });
        // B still sees the bounty open, so its mirror accepts the other applicant.
        assert.ok(B.db.acceptBountyApplication(bounty, second.applicantId));
        await quiesce(w);
        assert.deepEqual(await bountyState(w, bounty), want, "Postgres keeps A's accept");
        assert.equal(
            metric('db_targeted_write_conflicts_total', {
                map: 'bounties',
                method: 'acceptBountyApplication',
            }),
            conflicts + 1
        );
        for (const p of [A, B]) {
            assert.deepEqual(mirrorBountyState(p.db, bounty, [first.id, second.id]), want);
        }
    });
});

test('X8d: an accept whose first COMMIT reply was lost is not counted as a conflict on its retry, and converges', async () => {
    await withWorld(2, 'pg', async (w) => {
        const [A, B] = w.procs;
        const bounty = mkBounty(A.db);
        const [chosen, other] = [apply(A.db, bounty), apply(A.db, bounty)];
        await quiesce(w);
        const conflicts = metric('db_targeted_write_conflicts_total', {
            map: 'bounties',
            method: 'acceptBountyApplication',
        });
        // The server commits the accept; the reply to COMMIT is lost. The
        // retry's first gate (status = 'open') then misses on that commit.
        let commits = 0;
        A.ctl.log.length = 0;
        A.ctl.fault = (sql) => (sql === 'COMMIT' && ++commits === 1 ? 'after' : undefined);
        assert.ok(A.db.acceptBountyApplication(bounty, chosen.applicantId));
        await quiesce(w);
        assert.equal(A.ctl.log.filter((q) => q === 'BEGIN').length, 2, 'the op was retried');
        assert.ok(A.ctl.log.includes('ROLLBACK'), "the retry's gate missed and rolled back");
        const want = {
            bounty: `claimed:${chosen.applicantId}`,
            apps: { [chosen.id]: 'accepted', [other.id]: 'declined' },
        };
        assert.deepEqual(await bountyState(w, bounty), want);
        assert.equal(
            metric('db_targeted_write_conflicts_total', {
                map: 'bounties',
                method: 'acceptBountyApplication',
            }),
            conflicts,
            'no other process was involved'
        );
        for (const p of [A, B]) {
            assert.deepEqual(mirrorBountyState(p.db, bounty, [chosen.id, other.id]), want);
        }
    });
});

test('X8c: a stale accept of a bounty another process claimed directly changes no application', async () => {
    await withWorld(2, 'pg', async (w) => {
        const [A, B] = w.procs;
        const bounty = mkBounty(A.db);
        const [one, two] = [apply(A.db, bounty), apply(A.db, bounty)];
        await deafen(w, B);
        const claimer = randomUUID();
        assert.ok(A.db.claimBounty(bounty, claimer));
        await quiesce(w);
        const want = await bountyState(w, bounty);
        assert.deepEqual(want, {
            bounty: `claimed:${claimer}`,
            apps: { [one.id]: 'pending', [two.id]: 'pending' },
        });
        // B still sees the bounty open: its mirror accepts one applicant and declines the other.
        assert.ok(B.db.acceptBountyApplication(bounty, two.applicantId));
        await quiesce(w);
        assert.deepEqual(
            await bountyState(w, bounty),
            want,
            'no application was accepted or declined'
        );
        assert.deepEqual(mirrorBountyState(B.db, bounty, [one.id, two.id]), want, 'B converged');
    });
});

const mkEnvelope = (id = randomUUID(), seenBy = ['n0'], ttlMs = 3600_000) => ({
    id,
    sender: 's',
    recipient: 'r',
    payload: 'p',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    hopCount: 0,
    maxHops: 5,
    seenBy,
});

test('X9: a mesh gossip merge writes what it changed and keeps an envelope this process has not heard of', async () => {
    await withWorld(2, 'pg', async (w) => {
        const [A, B] = w.procs;
        const shared = A.db.enqueueMeshEnvelope(mkEnvelope(undefined, ['n0']));
        const dying = A.db.enqueueMeshEnvelope(mkEnvelope(undefined, ['n0'], 200));
        await deafen(w, A);
        const unseen = B.db.enqueueMeshEnvelope(mkEnvelope());
        // B also records another node on the shared envelope; A has not heard.
        B.db.replaceMeshEnvelopes([
            ...B.db.listMeshEnvelopes().filter((e: any) => e.id !== shared.id),
            { ...shared, seenBy: ['n0', 'nB'] },
        ]);
        await quiesce(w);
        await sleep(250);
        // A's merge: the expired envelope is dropped, the shared one gains a node, one arrives.
        const arrived = mkEnvelope(undefined, ['peer']);
        A.db.replaceMeshEnvelopes([{ ...shared, seenBy: ['n0', 'nA'] }, arrived]);
        await quiesce(w);
        const rows = await w.sql('SELECT id, seen_by FROM mesh_envelopes');
        const byId = new Map(rows.map((r) => [r.id, [...r.seen_by]]));
        assert.ok(byId.has(unseen.id), 'the unseen envelope is kept');
        assert.ok(byId.has(arrived.id), 'the arrival is written');
        assert.equal(byId.has(dying.id), false, 'the dropped envelope is deleted');
        assert.deepEqual(
            byId.get(shared.id),
            ['n0', 'nB', 'nA'],
            "seen_by is merged, not replaced, each node once in first-seen order (Postgres's, then A's)"
        );
        assert.deepEqual(
            A.db.listMeshEnvelopes().find((e: any) => e.id === shared.id).seenBy,
            ['n0', 'nB', 'nA'],
            'the writer re-read the merged row, so it does not re-offer the envelope to nB'
        );
        // An enqueue on the same process keeps it too.
        const queued = A.db.enqueueMeshEnvelope(mkEnvelope());
        await quiesce(w);
        assert.equal(await count(w, 'mesh_envelopes', 'id = ANY($1)', [[unseen.id, queued.id]]), 2);
        assert.ok(B.db.listMeshEnvelopes().some((e: any) => e.id === arrived.id));
        assert.deepEqual(
            B.db.listMeshEnvelopes().find((e: any) => e.id === shared.id).seenBy,
            ['n0', 'nB', 'nA'],
            "the peer re-read Postgres's row"
        );
    });
});

test('X10: a coliseum score recompute writes the arguments it changed and keeps one it has not heard of', async () => {
    await withWorld(2, 'pg', async (w) => {
        const [A, B] = w.procs;
        const arg = (id = randomUUID(), voteScore = 0) => ({
            id,
            topicId: 't',
            authorId: 'a',
            stance: 'for',
            stanceWeight: 1,
            body: 'b',
            citations: [],
            createdAt: new Date().toISOString(),
            voteScore,
            nuanceScore: 0,
        });
        const mine = A.db.upsertColiseumArgument(arg());
        await deafen(w, A);
        const unseen = B.db.upsertColiseumArgument(arg());
        await quiesce(w);
        A.db.upsertColiseumArguments([{ ...mine, voteScore: 7 }]);
        await quiesce(w);
        const rows = await w.sql('SELECT id, vote_score FROM coliseum_arguments');
        const score = new Map(rows.map((r) => [r.id, Number(r.vote_score)]));
        assert.equal(score.get(mine.id), 7);
        assert.ok(score.has(unseen.id), 'the unseen argument is kept');
        assert.equal(B.db.coliseumArguments.get(mine.id)?.voteScore, 7);
    });
});

const mkReply = (db: any, receivedAt = new Date(Date.now() - 400 * 86400_000).toISOString()) =>
    db.upsertCoalitionExternalActivity({
        id: randomUUID(),
        campaignPostId: 'cp',
        campaignId: 'c',
        coalitionId: 'co',
        sourcePlatform: 'bluesky',
        externalAuthor: 'someone',
        content: 'words',
        moderationStatus: 'pending',
        receivedAt,
    }).id as string;

test('X11: the retention sweep deletes a reply it judged unchanged, and keeps one a peer changed since', async () => {
    await withWorld(2, 'pg', async (w) => {
        const [A, B] = w.procs;
        const [changed, unchanged] = [mkReply(A.db), mkReply(A.db)];
        await deafen(w, B);
        await sleep(5);
        // A steward on A approves one; B has not heard.
        A.db.upsertCoalitionExternalActivity({
            ...A.db.coalitionExternalActivity.get(changed),
            moderationStatus: 'approved',
            reviewedAt: new Date().toISOString(),
            receivedAt: new Date().toISOString(),
        });
        await quiesce(w);
        assert.deepEqual(
            B.db.deleteCoalitionExternalActivities([changed, unchanged]).sort(),
            [changed, unchanged].sort()
        );
        await quiesce(w);
        assert.equal(await count(w, 'coalition_external_activity', 'id = $1', [unchanged]), 0);
        assert.equal(
            await count(w, 'coalition_external_activity', 'id = $1', [changed]),
            1,
            'kept'
        );
        assert.equal(
            B.db.coalitionExternalActivity.get(changed)?.moderationStatus,
            'approved',
            'B re-read it'
        );
        assert.equal(A.db.coalitionExternalActivity.has(unchanged), false);
        assert.ok(A.db.coalitionExternalActivity.has(changed));
    });
});

/** Insert a row whose updated_at carries microseconds (as DEFAULT NOW() does on PostgreSQL), and let every mirror read it. */
async function microsecondRow(
    w: World,
    table: string,
    map: string,
    insert: string,
    params: unknown[]
) {
    const [row] = await w.sql(insert, params);
    await w.emit({ src: 'elsewhere', m: map, op: 'k', kvs: [[row.id]] });
    await quiesce(w);
    return row.id as string;
}

test('X11b: a reply whose updated_at carries microseconds is still deleted by the sweep (millisecond guard)', async () => {
    await withWorld(2, 'pg', async (w) => {
        const [A] = w.procs;
        const id = await microsecondRow(
            w,
            'coalition_external_activity',
            'coalitionExternalActivity',
            `INSERT INTO coalition_external_activity (id, campaign_post_id, campaign_id, coalition_id, source_platform,
               external_author, content, moderation_status, received_at, created_at, updated_at)
             VALUES ($1, 'cp', 'c', 'co', 'bluesky', 'x', 'w', 'pending', now() - interval '400 days', now(),
               '2026-10-31 10:00:00.123456+00') RETURNING id`,
            [randomUUID()]
        );
        assert.ok(A.db.coalitionExternalActivity.has(id));
        assert.deepEqual(A.db.deleteCoalitionExternalActivities([id]), [id]);
        await quiesce(w);
        assert.equal(await count(w, 'coalition_external_activity', 'id = $1', [id]), 0);
        assert.equal(A.db.coalitionExternalActivity.has(id), false);
    });
});

const mkPin = (db: any, id = randomUUID(), title = 'sale') =>
    db.upsertCoalitionSpatialItem({
        id,
        layer: 'vendors',
        title,
        latitude: 1,
        longitude: 2,
        visibility: 'public',
        eventType: 'flash_sale',
        startsAt: new Date().toISOString(),
        status: 'live',
        meta: { ephemeral: true, purgeAt: new Date(Date.now() - 1000).toISOString() },
    }).id as string;

test('X12: the pin sweeper deletes a pin it judged unchanged, keeps one a peer rewrote, and deletes a pin stamped by DEFAULT NOW()', async () => {
    await withWorld(2, 'pg', async (w) => {
        const [A, B] = w.procs;
        const [rewritten, unchanged] = [mkPin(A.db), mkPin(A.db)];
        const micro = await microsecondRow(
            w,
            'coalition_spatial_items',
            'coalitionSpatialItems',
            `INSERT INTO coalition_spatial_items (id, layer, title, latitude, longitude, visibility, event_type,
               starts_at, meta, updated_at)
             VALUES ($1, 'vendors', 't', 1, 2, 'public', 'flash_sale', now(), '{}', '2026-10-31 10:00:00.654321+00')
             RETURNING id`,
            [randomUUID()]
        );
        const defaulted = await microsecondRow(
            w,
            'coalition_spatial_items',
            'coalitionSpatialItems',
            `INSERT INTO coalition_spatial_items (id, layer, title, latitude, longitude, visibility, event_type,
               starts_at, meta) VALUES ($1, 'vendors', 't', 1, 2, 'public', 'flash_sale', now(), '{}') RETURNING id`,
            [randomUUID()]
        );
        await deafen(w, B);
        await sleep(5);
        mkPin(A.db, rewritten, 'restarted');
        await quiesce(w);
        for (const id of [rewritten, unchanged, micro, defaulted]) {
            assert.equal(B.db.deleteCoalitionSpatialItem(id), true);
        }
        await quiesce(w);
        assert.equal(await count(w, 'coalition_spatial_items', 'id = $1', [rewritten]), 1, 'kept');
        for (const id of [unchanged, micro, defaulted]) {
            assert.equal(await count(w, 'coalition_spatial_items', 'id = $1', [id]), 0);
            assert.equal(A.db.coalitionSpatialItems.has(id), false);
        }
        assert.equal(B.db.coalitionSpatialItems.get(rewritten)?.title, 'restarted', 'B re-read it');
    });
});
