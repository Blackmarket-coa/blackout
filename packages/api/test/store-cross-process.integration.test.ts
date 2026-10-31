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
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

process.env.BLACKOUT_DB_MODE = 'memory';

const { PostgresBackedDb } = await import('../src/db/store');
const { MIGRATIONS_DIR, migrateUp } = await import('../src/db/migrate');
const { MUTATOR_SPECS } = await import('../src/db/pgDescriptors');
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
