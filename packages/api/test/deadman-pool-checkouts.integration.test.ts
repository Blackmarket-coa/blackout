/**
 * The connections the dead-man release code checks out of the shared pool,
 * under the rule for a dropped connection (`config/postgres.ts`,
 * `db/pooledClient.ts`): a checked-out connection has an 'error' listener for
 * as long as it is held, and one whose statement failed is given back with
 * that error, so the pool destroys it instead of handing it to the next
 * checkout.
 *
 * Why it matters here: when the server ends a backend under a statement (a
 * restart, a failover, `pg_terminate_backend`), the statement gets the
 * server's FATAL and the connection is marked unusable only when its socket
 * closes, a moment later. A plain `release()` in between puts the dead
 * connection back in the pool, and the pool hands out the connection given
 * back last. So the read back of a switch whose statement just failed, the
 * next try of a carry, or the deletion's next statement would be sent on the
 * connection that had just been lost, and fail with it.
 *
 * The shared pool is a real pg Pool, as the server builds it; only its
 * connections are stand-ins (pg-pool builds them from `pool.Client`). Each
 * stand-in runs its statements on one in-process PostgreSQL (PGlite) with
 * every migration applied, and fails the way pg's client does: a FATAL goes
 * to the statement in flight, statements sent after it wait, and when the
 * socket closes they fail and the client reports the drop, unless the pool
 * has ended it by then. `pg-pool-client-errors.integration.test.ts` has the
 * same drops for the store's other connections.
 */
import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.DATABASE_URL = `postgres://checkout_user:${randomBytes(12).toString(
    'hex'
)}@checkout-test-host.invalid:5432/checkout_db`;

const { clearSharedPgPool, getSharedPgPool } = await import('../src/config/postgres');
const { PGlite } = await import('@electric-sql/pglite');
const { MIGRATIONS_DIR, migrateUp } = await import('../src/db/migrate');
const { PostgresBackedDb } = await import('../src/db/store');
const { log } = await import('../src/telemetry/logger');
type Store = InstanceType<typeof PostgresBackedDb>;

type AnyPg = {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
    exec: (sql: string) => Promise<Array<{ rows?: unknown[] }>>;
};
const pg = new PGlite() as unknown as AnyPg;
// PGlite's query() rejects multi-statement SQL; parameterless SQL goes to exec().
const run = async (sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> => {
    if (!Array.isArray(params) || params.length === 0) {
        const results = await pg.exec(sql);
        return { rows: results.at(-1)?.rows ?? [] };
    }
    return pg.query(sql, params);
};
await migrateUp({
    pool: {
        connect: async () => ({ query: run, release: () => {} }),
        end: async () => {},
    } as never,
    migrationsDir: MIGRATIONS_DIR,
});

const terminated = (): Error =>
    Object.assign(new Error('terminating connection due to administrator command'), {
        code: '57P01',
        severity: 'FATAL',
    });

type Fault = {
    /** The next statement matching this, on whichever connection sends it. */
    sql: RegExp;
    /**
     * `fatal`: the server ends the backend under the statement. `lost`: the
     * statement fails as on a lost connection, and the connection stays as
     * it was (the store's own code must still give it back with the error).
     * `hold`: the statement waits for `gate`, then runs.
     */
    how: 'fatal' | 'lost' | 'hold';
    gate?: Promise<void>;
    /** With `fatal`: the server carried the statement out before it ended the backend. */
    afterRunning?: boolean;
};

/** A pg Client as pg-pool drives one, its statements run on the PGlite above. */
class PgliteConnection extends EventEmitter {
    static made: PgliteConnection[] = [];
    /** Every statement that reached the server, with its connection's 'error' listeners then. */
    static ran: Array<{ connection: PgliteConnection; sql: string; errorListeners: number }> = [];
    /** Faults not yet used, each by the first statement that matches it. */
    static faults: Fault[] = [];
    /** How long after a FATAL the socket closes. Long, so a checkout in between is certain. */
    static socketClosesAfterMs = 400;
    /** The connections the server ended a backend of, in order. */
    static endedByServer: PgliteConnection[] = [];
    /** The connections whose statement a `hold` fault is holding, or held. */
    static holding: PgliteConnection[] = [];
    _queryable = true;
    _ending = false;
    ended = false;
    /** The server ended this backend; the socket has not closed yet. */
    dead = false;
    /** Statements sent on this connection after the server ended its backend. */
    sentAfterFatal: string[] = [];
    private queued: Array<(err: Error) => void> = [];

    constructor(_options: unknown) {
        super();
        PgliteConnection.made.push(this);
    }

    connect(callback: (err?: Error) => void): void {
        setImmediate(() => callback());
    }

    async query(sql = '', params?: unknown[]): Promise<{ rows: unknown[] }> {
        if (!this._queryable) {
            throw new Error('Client has encountered a connection error and is not queryable');
        }
        if (this.dead) {
            this.sentAfterFatal.push(sql);
            return new Promise((_resolve, reject) => this.queued.push(reject));
        }
        const at = PgliteConnection.faults.findIndex((fault) => fault.sql.test(sql));
        const fault = at === -1 ? undefined : PgliteConnection.faults.splice(at, 1)[0];
        if (fault?.how === 'lost') {
            throw new Error('Connection terminated unexpectedly (test: the statement was not run)');
        }
        if (fault?.how === 'hold') {
            PgliteConnection.holding.push(this);
            await fault.gate;
            // The connection failed or was ended meanwhile: the statement
            // never reaches the server.
            if (this.ended || !this._queryable) throw new Error('Connection terminated');
        }
        if (fault?.how === 'fatal' && !fault.afterRunning) return this.endBackend();
        PgliteConnection.ran.push({
            connection: this,
            sql,
            errorListeners: this.listenerCount('error'),
        });
        const answer = await run(sql, params);
        if (fault?.how === 'fatal') return this.endBackend();
        return answer;
    }

    /** The server's FATAL to the statement in flight; the socket closes later. */
    private endBackend(): never {
        this.dead = true;
        PgliteConnection.endedByServer.push(this);
        const timer = setTimeout(() => this.socketClosed(), PgliteConnection.socketClosesAfterMs);
        timer.unref?.();
        throw terminated();
    }

    end(callback?: () => void): void {
        this._ending = true;
        this.ended = true;
        const err = new Error('Connection terminated');
        for (const reject of this.queued.splice(0)) reject(err);
        if (callback) setImmediate(callback);
    }

    /** pg fails every statement still waiting, then reports the drop unless the client was ended. */
    private socketClosed(): void {
        const err = new Error('Connection terminated unexpectedly');
        for (const reject of this.queued.splice(0)) reject(err);
        if (this._ending) return;
        this._queryable = false;
        this.emit('error', err);
    }
}

interface SharedPool {
    connect(): Promise<{ query(sql: string, params?: unknown[]): Promise<unknown> }>;
    end(): Promise<void>;
    Client: unknown;
}
let openPool: SharedPool | null = null;
const stores: Store[] = [];

/** A store on a fresh shared pool of stand-ins, as a server process has one. */
const process_ = async (): Promise<Store> => {
    clearSharedPgPool();
    PgliteConnection.made = [];
    PgliteConnection.ran = [];
    PgliteConnection.faults = [];
    PgliteConnection.endedByServer = [];
    PgliteConnection.holding = [];
    const pool = (await getSharedPgPool()) as unknown as SharedPool;
    pool.Client = PgliteConnection;
    openPool = pool;
    const db = new PostgresBackedDb();
    await db.init(pool as never);
    db.carryRetryMs = 60;
    stores.push(db);
    return db;
};

afterEach(async () => {
    for (const db of stores.splice(0)) await db.shutdown();
    if (openPool) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([openPool.end(), new Promise((r) => (timer = setTimeout(r, 3_000)))]);
        clearTimeout(timer);
    }
    openPool = null;
    clearSharedPgPool();
});
after(() => {
    delete process.env.DATABASE_URL;
});

const until = async (ok: () => boolean, what: string, ms = 5_000): Promise<void> => {
    const started = Date.now();
    while (!ok()) {
        if (Date.now() - started > ms) throw new Error(`timed out waiting for ${what}`);
        await new Promise((r) => setTimeout(r, 10));
    }
};

/** Log lines by message, until the test ends. */
const captureLogs = (t: { after(fn: () => void): void }): Map<string, number> => {
    const seen = new Map<string, number>();
    const original = { warn: log.warn, error: log.error, info: log.info };
    for (const level of ['warn', 'error', 'info'] as const) {
        log[level] = (msg: string, fields?: Record<string, unknown>) => {
            seen.set(msg, (seen.get(msg) ?? 0) + 1);
            original[level](msg, fields as never);
        };
    }
    t.after(() => {
        Object.assign(log, original);
    });
    return seen;
};

/** A release switch with its owner's copy and one person's, armed through the store. */
const armed = async (db: Store, intervalSeconds = 3_600) => {
    const id = randomUUID();
    const ownerId = randomUUID();
    const recipientId = randomUUID();
    const now = Date.now();
    const outcome = await db.armDeadmanSwitch(
        {
            id,
            ownerId,
            status: 'armed',
            checkInIntervalSeconds: intervalSeconds,
            gracePeriodSeconds: 0,
            lastCheckInAt: new Date(now).toISOString(),
            triggerAt: new Date(now + intervalSeconds * 1_000).toISOString(),
            releaseAt: new Date(now + intervalSeconds * 1_000).toISOString(),
            recipients: [recipientId],
            encryptedPayload: 'synthetic-envelope-header',
            releaseFormat: 'release-v1',
        },
        [ownerId, recipientId].map((recipientAccountId) => ({
            switchId: id,
            recipientAccountId,
            recipientFingerprint: 'f'.repeat(64),
            sealedKey: 'c2VhbGVk',
            signature: 'c2lnbmVk',
        }))
    );
    assert.equal(outcome.kind, 'armed');
    return { id, ownerId, recipientId };
};

const checkInPatch = (at = new Date()) => ({
    status: 'armed' as const,
    lastCheckInAt: at.toISOString(),
    triggerAt: new Date(at.getTime() + 3_600_000).toISOString(),
    releaseAt: new Date(at.getTime() + 3_600_000).toISOString(),
    backlogGraceStartedAt: undefined,
    ownerAttemptRefusedAt: undefined,
});

/** The carry of a refused attempt into its switch's row (decision 31). */
const isCarry = /^UPDATE deadman_switches SET owner_attempt_refused_at = \$2::timestamptz/;
/** A conditional write of a switch: the owner's check-in or cancel, the sweep's move. */
const isSwitchUpdate = /^UPDATE deadman_switches SET .* WHERE id = \$\d+ AND status = \$\d+ /;
const isSwitchRead = /^SELECT \* FROM deadman_switches WHERE id = \$1/;
const isColumnRead = /^SELECT owner_attempt_refused_at FROM deadman_switches/;
const isArm = /^WITH armed AS \(INSERT INTO deadman_switches/;

/** The connection the server ended last, the `nth` it ended in this test. */
const theDeadOne = (nth = 1): PgliteConnection => {
    assert.equal(PgliteConnection.endedByServer.length, nth, 'connections the server ended');
    return PgliteConnection.endedByServer[nth - 1];
};
/**
 * What every test here asserts of the connection the server ended: the pool
 * has destroyed it, nothing more was sent on it, and every statement any
 * connection ran was sent with an 'error' listener on that connection.
 */
const assertDestroyedAndUnused = (dead: PgliteConnection): void => {
    assert.equal(dead.ended, true, 'the pool destroyed the connection the server ended');
    assert.deepEqual(dead.sentAfterFatal, [], 'nothing more was sent on it');
    assert.deepEqual(
        PgliteConnection.ran.filter((statement) => statement.errorListeners === 0),
        [],
        "every statement ran on a connection that had an 'error' listener"
    );
};
/** The connections that ran a statement matching `sql`, from the `from`th statement of the test on. */
const ranOn = (sql: RegExp, from = 0): PgliteConnection[] =>
    PgliteConnection.ran
        .slice(from)
        .filter((s) => sql.test(s.sql))
        .map((s) => s.connection);

test("a switch statement whose backend the server ends: its connection is destroyed, and the switch's read back runs on another", async (t) => {
    // The lane call every switch statement is (`enqueueCall`): the owner's
    // check-in here. Its failure is an unknown outcome, so the switch is read
    // back at once, in the same lane: the very next checkout.
    const logs = captureLogs(t);
    const db = await process_();
    const sw = await armed(db);
    const read = db.getDeadmanSwitch(sw.id)!;
    PgliteConnection.faults.push({ sql: isSwitchUpdate, how: 'fatal' });
    const from = PgliteConnection.ran.length;

    const outcome = await db.updateDeadmanSwitchIf(sw.id, read, checkInPatch());

    assert.equal(outcome.kind, 'unanswered', 'the statement was not carried out');
    const dead = theDeadOne();
    assertDestroyedAndUnused(dead);
    assert.equal(
        logs.get('deadman_switch_settle_read_failed'),
        undefined,
        'the read back answered'
    );
    const readBack = ranOn(isSwitchRead, from);
    assert.ok(readBack.length >= 1, 'the switch was read back');
    assert.ok(!readBack.includes(dead), 'on another connection');
    await until(() => db.ownerWriteUnansweredAt(sw.id) === undefined, 'the carry of the refusal');
    assertDestroyedAndUnused(dead);
});

test('an arm whose backend the server ends after carrying it out: its connection is destroyed, and the switch is found on another and answered armed', async () => {
    const db = await process_();
    PgliteConnection.faults.push({ sql: isArm, how: 'fatal', afterRunning: true });
    const id = randomUUID();
    const ownerId = randomUUID();
    const now = Date.now();

    const outcome = await db.armDeadmanSwitch(
        {
            id,
            ownerId,
            status: 'armed',
            checkInIntervalSeconds: 3_600,
            gracePeriodSeconds: 0,
            lastCheckInAt: new Date(now).toISOString(),
            triggerAt: new Date(now + 3_600_000).toISOString(),
            releaseAt: new Date(now + 3_600_000).toISOString(),
            recipients: [],
            encryptedPayload: 'synthetic-envelope-header',
            releaseFormat: 'release-v1',
        },
        [
            {
                switchId: id,
                recipientAccountId: ownerId,
                recipientFingerprint: 'f'.repeat(64),
                sealedKey: 'c2VhbGVk',
                signature: 'c2lnbmVk',
            },
        ]
    );

    assert.equal(outcome.kind, 'armed', 'the insert had committed, and the read back found it');
    assertDestroyedAndUnused(theDeadOne());
    assert.equal(db.getDeadmanSwitch(id)?.status, 'armed');
});

test('the carry of a refused attempt whose backend the server ends: its connection is destroyed, and the next try lands on another', async (t) => {
    const logs = captureLogs(t);
    const db = await process_();
    const sw = await armed(db);
    const read = db.getDeadmanSwitch(sw.id)!;
    // The check-in is lost before the database runs it; the carry of the
    // refusal is the statement the server ends the backend under.
    PgliteConnection.faults.push(
        { sql: isSwitchUpdate, how: 'lost' },
        { sql: isCarry, how: 'fatal' }
    );

    const outcome = await db.updateDeadmanSwitchIf(sw.id, read, checkInPatch());
    assert.equal(outcome.kind, 'unanswered');
    await until(
        () => (logs.get('deadman_owner_attempt_carry_failed') ?? 0) >= 1,
        'the carry to fail'
    );
    const dead = theDeadOne();
    assert.equal(dead.ended, true, 'given back with the error: destroyed');
    await until(() => db.ownerWriteUnansweredAt(sw.id) === undefined, 'the next try');

    assertDestroyedAndUnused(dead);
    assert.equal(
        logs.get('deadman_owner_attempt_carry_failed'),
        1,
        'one try failed, the next landed'
    );
    assert.equal(logs.get('deadman_owner_attempt_carried'), 1);
    assert.ok(db.getDeadmanSwitch(sw.id)?.ownerAttemptRefusedAt, 'the refusal is on the switch');
    assert.ok(!ranOn(isCarry).includes(dead), 'the carry that landed ran on another connection');
});

test('the read again of a switch whose read back failed, the server ending its backend: its connection is destroyed, and the next read answers on another', async (t) => {
    const logs = captureLogs(t);
    const db = await process_();
    const sw = await armed(db);
    const read = db.getDeadmanSwitch(sw.id)!;
    // The check-in is lost, the lane's read back is lost too, and the read
    // again, on a connection of its own, is the one the server ends.
    PgliteConnection.faults.push(
        { sql: isSwitchUpdate, how: 'lost' },
        { sql: isSwitchRead, how: 'lost' },
        { sql: isSwitchRead, how: 'fatal' }
    );
    const held = () =>
        (db as unknown as { stalledSwitchStatements: Set<unknown> }).stalledSwitchStatements.size >
        0;

    const outcome = await db.updateDeadmanSwitchIf(sw.id, read, checkInPatch());
    assert.equal(outcome.kind, 'unanswered');
    await until(() => !held(), 'a read again to answer');

    const dead = theDeadOne();
    assertDestroyedAndUnused(dead);
    assert.equal(
        logs.get('deadman_switch_settle_read_failed'),
        2,
        'the lane read, then one read again'
    );
    assert.equal(logs.get('deadman_switch_read_back_after_failure'), 1, 'the next answered');
    await until(() => db.ownerWriteUnansweredAt(sw.id) === undefined, 'the carry of the refusal');
});

test('the read of a carried column whose backend the server ends: its connection is destroyed, and the next read takes the column on another', async (t) => {
    const logs = captureLogs(t);
    const db = await process_();
    db.switchStatementTimeoutMs = 250;
    const sw = await armed(db);
    const read = db.getDeadmanSwitch(sw.id)!;
    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
        open = resolve;
    });
    // The check-in is lost; its read back in the lane is held, so the carry
    // of the refusal answers while the switch is being settled and its
    // column is read back on a connection of its own: the statement the
    // server ends the backend under.
    PgliteConnection.faults.push(
        { sql: isSwitchUpdate, how: 'lost' },
        { sql: isSwitchRead, how: 'hold', gate },
        { sql: isColumnRead, how: 'fatal' }
    );
    try {
        const outcome = await db.updateDeadmanSwitchIf(sw.id, read, checkInPatch());
        assert.equal(outcome.kind, 'unanswered');
        await until(
            () => (logs.get('deadman_owner_attempt_column_read_failed') ?? 0) >= 1,
            'the column read to fail'
        );
        const dead = theDeadOne();
        assert.equal(dead.ended, true, 'given back with the error: destroyed');
        await until(
            () => db.getDeadmanSwitch(sw.id)?.ownerAttemptRefusedAt !== undefined,
            'the next read to take the column'
        );
        assertDestroyedAndUnused(dead);
        assert.equal(logs.get('deadman_owner_attempt_column_read_failed'), 1);
        assert.ok(!ranOn(isColumnRead).includes(dead), 'the read that answered ran on another');
    } finally {
        open();
    }
});

test("the notifier's claim and its release, the server ending the backend under each: the connection is destroyed, and the next call answers on another", async () => {
    const db = await process_();
    const person = randomUUID();
    PgliteConnection.faults.push({ sql: /^INSERT INTO deadman_notice_claims/, how: 'fatal' });
    await assert.rejects(db.claimDeadmanNoticeRecipient(person, 'holder-a', 60_000), /terminating/);
    const first = theDeadOne();
    assertDestroyedAndUnused(first);
    assert.equal(await db.claimDeadmanNoticeRecipient(person, 'holder-a', 60_000), true);
    assertDestroyedAndUnused(first);

    PgliteConnection.faults.push({ sql: /^DELETE FROM deadman_notice_claims/, how: 'fatal' });
    await assert.rejects(db.releaseDeadmanNoticeRecipient(person, 'holder-a'), /terminating/);
    const second = theDeadOne(2);
    assert.notEqual(second, first);
    assertDestroyedAndUnused(second);
    await db.releaseDeadmanNoticeRecipient(person, 'holder-a');
    assert.equal(await db.claimDeadmanNoticeRecipient(person, 'holder-b', 60_000), true);
    assertDestroyedAndUnused(second);
});

test("the deletion's statements, the server ending the backend under each: the connection is destroyed, and the statement sent again answers on another", async () => {
    const db = await process_();
    const sw = await armed(db);

    // The erase of one switch: a lane call. Not answered, it is queued again
    // in the lane, the very next checkout.
    PgliteConnection.faults.push({
        sql: /^UPDATE deadman_switches SET headline = NULL/,
        how: 'fatal',
    });
    const erased = await db.eraseDeadmanSwitchUnlessFired(sw.id);
    assert.equal(erased.kind, 'queued');
    await db.drain();
    const first = theDeadOne();
    assertDestroyedAndUnused(first);
    assert.equal(db.getDeadmanSwitch(sw.id)?.status, 'cancelled', 'the queued erase landed');

    // The statement over every switch of the owner's.
    PgliteConnection.faults.push({
        sql: /^SELECT \* FROM deadman_switches WHERE owner_id/,
        how: 'fatal',
    });
    await assert.rejects(db.eraseDeadmanSwitchesOfDeletedOwner(sw.ownerId), /terminating/);
    const second = theDeadOne(2);
    assertDestroyedAndUnused(second);
    assert.equal(await db.eraseDeadmanSwitchesOfDeletedOwner(sw.ownerId), 1);
    assertDestroyedAndUnused(second);

    // The end of the notices to a deleted account.
    PgliteConnection.faults.push({
        sql: /^UPDATE deadman_release_notices SET room_id = NULL/,
        how: 'fatal',
    });
    await assert.rejects(
        db.endDeadmanReleaseNoticesOfDeletedAccount(sw.recipientId, new Date().toISOString()),
        /terminating/
    );
    const third = theDeadOne(3);
    assertDestroyedAndUnused(third);
    assert.equal(
        await db.endDeadmanReleaseNoticesOfDeletedAccount(sw.recipientId, new Date().toISOString()),
        0
    );
    assertDestroyedAndUnused(third);
});

test("the notifier's read of a copy and its notice, the server ending the backend under it: the connection is destroyed, and the next read answers on another", async () => {
    const db = await process_();
    const sw = await armed(db);
    PgliteConnection.faults.push({
        sql: /^SELECT \* FROM deadman_release_wraps WHERE switch_id = \$1 AND/,
        how: 'fatal',
    });

    await assert.rejects(db.readDeadmanReleaseCommitted(sw.id, sw.recipientId), /terminating/);
    const dead = theDeadOne();
    assertDestroyedAndUnused(dead);
    const found = await db.readDeadmanReleaseCommitted(sw.id, sw.recipientId);
    assert.equal(found.wrap?.sealedKey, 'c2VhbGVk');
    assertDestroyedAndUnused(dead);
});

test('a connection reset while the carry holds it does not end the process: the drop is reported, the connection destroyed, and the next try lands', async (t) => {
    // Not a FATAL under a statement: the connection itself fails while the
    // carry's statement is out (a network reset). pg tells the connection's
    // 'error' listeners; with none, node throws and the process ends.
    const logs = captureLogs(t);
    const db = await process_();
    db.carryTimeoutMs = 200;
    const sw = await armed(db);
    const read = db.getDeadmanSwitch(sw.id)!;
    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
        open = resolve;
    });
    PgliteConnection.faults.push(
        { sql: isSwitchUpdate, how: 'lost' },
        { sql: isCarry, how: 'hold', gate }
    );

    const outcome = await db.updateDeadmanSwitchIf(sw.id, read, checkInPatch());
    assert.equal(outcome.kind, 'unanswered');
    // The carry's statement is out on its connection. Reset it there.
    await until(() => PgliteConnection.holding.length === 1, 'the carry to be sent');
    const victim = PgliteConnection.holding[0];
    assert.ok(
        victim.listenerCount('error') > 0,
        "the connection the carry holds has an 'error' listener"
    );
    const reset = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    victim._queryable = false;
    assert.doesNotThrow(() => victim.emit('error', reset), 'the drop does not end the process');
    assert.equal(logs.get('pg_pool_client_error'), 1, 'and is reported once');

    // The carry's statement never answers on the reset connection: the try
    // ends at its bound, gives the connection back with the error, and the
    // next try lands on another.
    await until(
        () => (logs.get('deadman_owner_attempt_carry_failed') ?? 0) >= 1,
        'the carry to pass its bound'
    );
    assert.equal(victim.ended, true, 'destroyed');
    open();
    await until(() => db.ownerWriteUnansweredAt(sw.id) === undefined, 'the next try');
    assert.ok(db.getDeadmanSwitch(sw.id)?.ownerAttemptRefusedAt, 'the refusal is on the switch');
});
