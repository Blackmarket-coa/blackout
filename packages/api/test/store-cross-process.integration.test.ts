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
// statements and can delay or fail chosen ones. A process's transport can be
// made deaf ("has not heard yet"); the world records every notification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

process.env.BLACKOUT_DB_MODE = 'memory';

const { PostgresBackedDb } = await import('../src/db/store');
const { MIGRATIONS_DIR, migrateUp } = await import('../src/db/migrate');
const { InMemoryStoreChangeHub, InMemoryStoreChangeTransport, PgNotifyTransport } = await import(
    '../src/db/pgNotify'
);

type Payload = import('../src/db/pgNotify').StoreChangePayload;
type Row = Record<string, any>;
interface RawClient {
    query(sql: string, params?: unknown[]): Promise<{ rows: Row[] }>;
    release(): void;
    on?(event: string, cb: (arg: unknown) => void): void;
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
            await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
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

const newCtl = (): Ctl => ({ log: [], delay: () => 0, fault: () => undefined });

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

const vaultRow = async (w: World, id: string) =>
    (await w.sql('SELECT label, ciphertext FROM vault_items WHERE id = $1', [id]))[0];

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
