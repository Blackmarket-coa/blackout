/**
 * A switch's moves and its owner's check-ins and cancels in Postgres, in the
 * deployed topology (`deploy/docker/production`: the sweep and the notifier
 * run in `worker`, the owner's routes on `app`, each with its own mirror).
 * Every write here is conditional in the database on the switch being as the
 * writer read it (`advanceDeadmanSwitch`, `updateDeadmanSwitchIf`), and
 * reaches the writer's mirror only once Postgres has applied it, so nothing a
 * process serves or sends rests on a write Postgres then refuses (round 10 of
 * part 2's review, `release-envelope-2026-10-26.md`).
 *
 * This process's store singleton plays one process (the worker for the
 * sweep, the app for the routes) on an in-process PGlite with every
 * migration applied; a second PostgresBackedDb on the same database plays the
 * other. Change notifications are delivered by hand.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';
import { createMatrixStub } from './_fixtures/matrixStub';
import type { ReleaseKeySet } from '@blackout/protocol';

process.env.NODE_ENV = 'test';
process.env.BLACKOUT_DB_MODE = 'postgres';
process.env.BLACKOUT_API_SKIP_LISTEN = '1';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api-test';
process.env.JWT_AUDIENCE = 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = '100000';
process.env.MATRIX_HOMESERVER = 'https://matrix.test.local';
process.env.MATRIX_BOT_TOKEN = 'syt_test_admin_token';
process.env.MATRIX_HOMESERVER_DOMAIN = 'test.local';
// Arming through the route (the awaited arm, round 11): on in this process only.
process.env.BLACKOUT_DEADMAN_RELEASES = '1';

const matrix = createMatrixStub({ domain: 'test.local' });
globalThis.fetch = matrix.fetch;

const store = await import('../src/db/store');
const { MIGRATIONS_DIR, migrateUp } = await import('../src/db/migrate');
const { PGlite } = await import('@electric-sql/pglite');
const protocol = await import('@blackout/protocol');
const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { sweepOverdueDeadmanSwitches } = await import('../src/modules/deadman');
const {
    armReleaseSwitch,
    armsInFlightCount,
    heldReleasesNaming,
    recordReleaseTrigger,
    releasedCopiesFor,
    removeExpiredReleases,
} = await import('../src/services/deadmanReleases');
const {
    ACCOUNT_DELETION_ARMS_WAIT_MS,
    confirmAccountDeletion,
    exportUserData,
    finishAccountDeletion,
    requestAccountDeletion,
} = await import('../src/services/accountLifecycle');
const { runDeadmanReleaseNotifier } = await import('../src/services/deadmanReleaseNotifier');
const { applyCheckIn } = await import('../src/services/deadmanScheduler');
const { log } = await import('../src/telemetry/logger');
type StoreChangePayload = import('../src/db/pgNotify').StoreChangePayload;
type DeadmanSwitchRow = import('../src/db/types').DeadmanSwitchRecord;

protocol.setKemProvider(protocol.mlKem768Provider);

type AnyPg = {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
    exec: (sql: string) => Promise<Array<{ rows?: unknown[] }>>;
};

// PGlite's query() rejects multi-statement SQL; route parameterless SQL to exec().
function poolFor(pg: AnyPg) {
    const client = {
        async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
            if (!Array.isArray(params) || params.length === 0) {
                const results = await pg.exec(sql);
                return { rows: (results.at(-1)?.rows ?? []) as T[] };
            }
            const result = await pg.query(sql, params);
            return { rows: result.rows as T[] };
        },
        release: () => {},
    };
    return { connect: async () => client, end: async () => {} };
}

const pg = new PGlite() as unknown as AnyPg;
const pool = poolFor(pg);
await migrateUp({ pool: pool as never, migrationsDir: MIGRATIONS_DIR });
const here = store.db as InstanceType<typeof store.PostgresBackedDb>;
assert.ok(here instanceof store.PostgresBackedDb, 'the singleton is the Postgres store');
await here.init(pool as never); // no transport: peer changes are delivered by hand
const realConnect = pool.connect;
// What this process's conditional writes announce to the other processes
// (the queue's own announcements of plain writes are not recorded: it got no
// transport). Delivered to another store by hand with `applyPeerChange`.
const announced: StoreChangePayload[] = [];
(here as unknown as { transport: { publish(p: StoreChangePayload): void } }).transport = {
    publish: (payload) => {
        announced.push(payload);
    },
};
const announcedFor = (switchId: string) =>
    announced.filter((p) => p.m === 'deadmanSwitches' && p.op === 'u' && p.kv?.[0] === switchId);
const deliver = (other: Store, payload: StoreChangePayload) =>
    (other as unknown as { applyPeerChange(p: StoreChangePayload): void }).applyPeerChange({
        ...payload,
        src: 'elsewhere',
    });
/** Let a statement that settled after its bound be taken into the mirror (its re-read is a queued call). */
const settled = async () => {
    for (let i = 0; i < 3; i += 1) {
        await here.drain();
        await new Promise((r) => setTimeout(r, 25));
    }
};

type Store = InstanceType<typeof store.PostgresBackedDb>;
const otherProcess = async (): Promise<Store> => {
    const other = new store.PostgresBackedDb();
    await other.init(pool as never);
    return other;
};

/**
 * Run `during` once, when this process's first statement matching `match`
 * reaches the database and before it runs; `pool.connect` is restored by the
 * caller (`intercepted`).
 */
const intercept = (
    match: (sql: string) => boolean,
    during: (sql: string) => Promise<void> | void
): { calls: () => number } => {
    let calls = 0;
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (match(sql)) {
                    calls += 1;
                    if (calls === 1) await during(sql);
                }
                return client.query<T>(sql, params);
            },
        };
    };
    return { calls: () => calls };
};
const restore = () => {
    pool.connect = realConnect;
};
const isSwitchUpdate = (sql: string) => sql.startsWith('UPDATE deadman_switches');
/** The carry of a refused owner write into its switch's row (decision 31). */
const isCarry = (sql: string) =>
    sql.startsWith('UPDATE deadman_switches SET owner_attempt_refused_at');
/**
 * As `intercept(isSwitchUpdate, () => gate)` for the first switch statement
 * that is not a carry, and every carry fails until `gate` opens, so a
 * refused owner write made while that statement is held is carried only
 * once it has settled. Since round 16 of part 2's review the carry is not
 * held back by a stall (tests 9, 28 and 40 show it landing while one
 * stands); the tests that use this one are about what the held statement
 * does when it settles, which a carry landing first would change (the
 * trigger is refused over it, decision 31).
 */
const interceptHoldingCarries = (gate: Promise<void>): { calls: () => number } => {
    let opened = false;
    void gate.then(() => {
        opened = true;
    });
    let calls = 0;
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (isCarry(sql) && !opened) {
                    throw new Error('Connection terminated unexpectedly (test: carry held off)');
                }
                if (isSwitchUpdate(sql) && !isCarry(sql)) {
                    calls += 1;
                    if (calls === 1) await gate;
                }
                return client.query<T>(sql, params);
            },
        };
    };
    return { calls: () => calls };
};

const person = async (): Promise<{ id: string; username: string; keySet: ReleaseKeySet }> => {
    const id = randomUUID();
    const username = `sw-${id.slice(0, 8)}`;
    here.createUser({
        id,
        username,
        email: `${username}@example.com`,
        passwordHash: 'unused',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: 'pk',
    });
    const keySet = await protocol.createReleaseKeySet(id);
    here.publishReleaseIdentity({
        id: randomUUID(),
        accountId: id,
        formatVersion: keySet.identity.v,
        signingKey: keySet.identity.signingKey,
        x25519Key: keySet.identity.x25519Key,
        mlkem768Key: keySet.identity.mlkem768Key,
        signature: keySet.identity.signature,
        fingerprint: keySet.fingerprint,
    });
    return { id, username, keySet };
};

/** A release naming a fresh recipient, armed on this process and in Postgres. */
const armed = async (checkInIntervalSeconds = 60, label?: string) => {
    const owner = await person();
    const recipient = await person();
    const envelope = await protocol.buildReleaseEnvelope({
        ownerKeySet: owner.keySet,
        recipients: [recipient.keySet.identity],
        message: 'Synthetic test text.',
    });
    const outcome = await armReleaseSwitch({
        ownerId: owner.id,
        input: {
            checkInIntervalSeconds,
            gracePeriodSeconds: 0,
            envelope,
            ...(label === undefined ? {} : { label }),
        },
    });
    assert.equal(outcome.kind, 'armed');
    await here.drain();
    return { owner, recipient, switchId: envelope.releaseId, envelope };
};
const auth = (user: { id: string; username: string }) => ({
    authorization: `Bearer ${signJwt(user.id, user.username, 600)}`,
    'content-type': 'application/json',
});
const post = (user: { id: string; username: string }, path: string, body?: unknown) =>
    app.request(`/v1/deadman${path}`, {
        method: 'POST',
        headers: auth(user),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
const armBody = (envelope: unknown, checkInIntervalSeconds = 60) => ({
    format: 'release-v1',
    checkInIntervalSeconds,
    gracePeriodSeconds: 0,
    envelope,
});

const stored = async (switchId: string) =>
    (
        await pg.query(
            'SELECT status, released_at, last_check_in_at, encrypted_payload, headline, updated_at, ' +
                'backlog_grace_started_at FROM deadman_switches WHERE id = $1',
            [switchId]
        )
    ).rows[0] as
        | {
              status: string;
              released_at: Date | null;
              last_check_in_at: Date;
              encrypted_payload: string;
              headline: string | null;
              updated_at: Date;
              backlog_grace_started_at: Date | null;
          }
        | undefined;
const storedCopies = async (switchId: string) =>
    (
        await pg.query(
            "SELECT recipient_account_id, (sealed_key <> '') AS held FROM deadman_release_wraps WHERE switch_id = $1",
            [switchId]
        )
    ).rows as Array<{ recipient_account_id: string; held: boolean }>;
const noticeRows = async (switchId: string) =>
    (await pg.query('SELECT status FROM deadman_release_notices WHERE switch_id = $1', [switchId]))
        .rows as Array<{ status: string }>;
const sendsFor = (switchId: string) => matrix.sends.filter((x) => x.txnId.includes(switchId));

/** The check-in route's write on another process, as the route makes it. */
const checkInOn = (other: Store, switchId: string, at: Date) => {
    const existing = other.getDeadmanSwitch(switchId)!;
    const refreshed = applyCheckIn(existing, at);
    other.updateDeadmanSwitch(switchId, {
        status: refreshed.status,
        lastCheckInAt: refreshed.lastCheckInAt,
        triggerAt: refreshed.triggerAt,
        releaseAt: refreshed.releaseAt,
        backlogGraceStartedAt: refreshed.backlogGraceStartedAt,
    });
};

/** Every log line with this message, while `run` runs. */
const logged = async (msg: string, run: () => Promise<void>): Promise<number> => {
    let count = 0;
    const original = { warn: log.warn, error: log.error, info: log.info };
    for (const level of ['warn', 'error', 'info'] as const) {
        log[level] = (m: string, fields?: Record<string, unknown>) => {
            if (m === msg) count += 1;
            original[level](m, fields as never);
        };
    }
    try {
        await run();
    } finally {
        Object.assign(log, original);
    }
    return count;
};

let clock = Date.now() + 600_000;
const nextMoment = () => new Date((clock += 600_000));

/**
 * Whether this process is holding its switch statements back: a statement
 * that passed its bound or failed has not been read back yet (the stall, and
 * the hold a failed statement leaves while its switch is read).
 */
const statementsHeld = (target: InstanceType<typeof store.PostgresBackedDb> = here) =>
    (target as unknown as { stalledSwitchStatements: Set<unknown> }).stalledSwitchStatements.size >
    0;
/**
 * Have a process read again, now and not when its retry timer fires, each
 * switch whose read back failed, and wait until it sends switch statements
 * again. For a test whose own fault made a read back fail, once the fault is
 * gone (round 20 of part 2's review: a failed statement is an unknown
 * outcome, and nothing is sent until its switch has been read).
 */
const readAgainNow = async (target: InstanceType<typeof store.PostgresBackedDb> = here) => {
    (target as unknown as { retrySettleReads(): void }).retrySettleReads();
    const started = Date.now();
    while (statementsHeld(target)) {
        if (Date.now() - started > 5_000) throw new Error('timed out waiting for the read again');
        await new Promise((r) => setTimeout(r, 10));
    }
};

test('the sweep’s move reaches the mirror only once Postgres has applied it: while its statement waits, a notifier tick sends nothing and the person’s read lists nothing, and a trigger Postgres refuses leaves nothing behind', async () => {
    // Round 10 of part 2's review. The mirror took the trigger (status and
    // releasedAt) before Postgres answered; a check-in the API process had
    // committed first then refused it, but in the meantime the notifier in
    // the same worker had written and sent the notice, and the person's read
    // on that process had listed their copy, for a switch that never fired.
    // The real trigger later wrote no new row and sent nothing.
    const { recipient, switchId } = await armed();
    const api = await otherProcess();
    const firesAt = nextMoment();
    checkInOn(api, switchId, new Date(firesAt.getTime() - 1_000));
    await api.drain();
    assert.equal(here.getDeadmanSwitch(switchId)?.status, 'armed', 'not heard of here');

    let during: { status?: string; releasedAt?: string; copies: number } | undefined;
    let tick: ReturnType<typeof runDeadmanReleaseNotifier> | undefined;
    intercept(isSwitchUpdate, async () => {
        const mirrored = here.getDeadmanSwitch(switchId);
        during = {
            status: mirrored?.status,
            releasedAt: mirrored?.releasedAt,
            copies: releasedCopiesFor(recipient.id).length,
        };
        tick = runDeadmanReleaseNotifier({ now: new Date(firesAt.getTime() + 1_000) });
        await new Promise((r) => setTimeout(r, 150));
    });
    let moved: number;
    try {
        moved = await sweepOverdueDeadmanSwitches(firesAt, Number.MAX_SAFE_INTEGER);
    } finally {
        restore();
    }
    const ticked = await tick!;
    await here.drain();
    assert.deepEqual(
        during,
        { status: 'armed', releasedAt: undefined, copies: 0 },
        'nothing of the move in the mirror while its statement waits'
    );
    assert.equal(moved, 0, 'the check-in committed first: no move');
    assert.equal(ticked.sent, 0, 'the tick during the statement sent nothing');
    assert.equal(sendsFor(switchId).length, 0);
    assert.deepEqual(await noticeRows(switchId), [], 'no notice row');
    assert.equal((await stored(switchId))?.status, 'armed');
    assert.equal(here.getDeadmanSwitch(switchId)?.status, 'armed');
    assert.equal(
        here.getDeadmanSwitch(switchId)?.lastCheckInAt,
        api.getDeadmanSwitch(switchId)?.lastCheckInAt,
        'the mirror took the committed check-in'
    );
    assert.equal(releasedCopiesFor(recipient.id).length, 0);

    // The owner really goes dark: the switch fires, and the notice is sent once.
    const realAt = new Date(firesAt.getTime() + 3_600_000);
    assert.equal(await sweepOverdueDeadmanSwitches(realAt, Number.MAX_SAFE_INTEGER), 1);
    await here.drain();
    const real = await runDeadmanReleaseNotifier({ now: new Date(realAt.getTime() + 1_000) });
    await here.drain();
    assert.equal(real.sent, 1, 'the real trigger is notified');
    assert.equal(sendsFor(switchId).length, 1);
    assert.equal(releasedCopiesFor(recipient.id).length, 1);
    await api.drain();
});

test('a statement that fails is left for the next pass, and one that does not answer in time ends the pass: nothing of either is in the mirror, the next pass makes the move in Postgres, and the notice is sent once', async () => {
    // Round 10 of part 2's review. One failure of the conditional statement
    // kept the move in the mirror only: every later pass saw it triggered and
    // never tried again, the notice was sent from the worker, and every other
    // process read the switch armed until the worker restarted. And the
    // statement waited behind the write-behind queue with no limit, so one
    // stalled write held the pass, and the running guard every later one.
    {
        const { recipient, switchId } = await armed();
        const at = nextMoment();
        pool.connect = async () => {
            const client = await realConnect();
            return {
                ...client,
                async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                    if (isSwitchUpdate(sql)) throw new Error('connection reset (test, once)');
                    return client.query<T>(sql, params);
                },
            };
        };
        let moved = -1;
        const failures = await logged('deadman_switch_write_failed', async () => {
            try {
                moved = await sweepOverdueDeadmanSwitches(at, Number.MAX_SAFE_INTEGER);
            } finally {
                restore();
            }
        });
        assert.equal(failures, 1, 'logged');
        assert.equal(moved, 0, 'not counted as moved');
        assert.equal(here.getDeadmanSwitch(switchId)?.status, 'armed', 'not in the mirror');
        assert.equal(releasedCopiesFor(recipient.id).length, 0);
        await runDeadmanReleaseNotifier({ now: at });
        assert.equal(sendsFor(switchId).length, 0);
        const again = new Date(at.getTime() + 30_000);
        assert.equal(await sweepOverdueDeadmanSwitches(again, Number.MAX_SAFE_INTEGER), 1);
        await here.drain();
        const row = await stored(switchId);
        assert.equal(row?.status, 'triggered', 'the next pass made it in Postgres');
        assert.equal(row?.released_at?.toISOString(), again.toISOString());
        const fresh = await otherProcess();
        assert.equal(fresh.getDeadmanSwitch(switchId)?.releasedAt, again.toISOString());
        await runDeadmanReleaseNotifier({ now: again });
        await here.drain();
        assert.equal(sendsFor(switchId).length, 1);
    }

    // Not answered within the bound: the pass ends after the bound, nothing
    // of the move is in the mirror, the owner's check-in answers 503 while it
    // stands, and a pass meanwhile queues nothing. Once it lands, the next
    // pass finds it applied, the mirror takes it from Postgres, the catch-up
    // writes the notice row and the notice is sent once.
    {
        const { owner, recipient, switchId } = await armed();
        const at = nextMoment();
        let open!: () => void;
        const gate = new Promise<void>((resolve) => {
            open = resolve;
        });
        here.switchStatementTimeoutMs = 200;
        const statements = interceptHoldingCarries(gate);
        const announcedBefore = announcedFor(switchId).length; // the arm's own
        try {
            const started = Date.now();
            assert.equal(await sweepOverdueDeadmanSwitches(at, Number.MAX_SAFE_INTEGER), 0);
            assert.ok(Date.now() - started < 2_000, 'the pass ended after the bound');
            assert.equal(here.getDeadmanSwitch(switchId)?.status, 'armed', 'not in the mirror');
            assert.equal(releasedCopiesFor(recipient.id).length, 0);
            // A pass while it stands queues no statement, so none waits out
            // the bound: nothing more is logged.
            let second = -1;
            const waitedOut = await logged('deadman_switch_write_failed', async () => {
                second = await sweepOverdueDeadmanSwitches(
                    new Date(at.getTime() + 30_000),
                    Number.MAX_SAFE_INTEGER
                );
            });
            assert.equal(second, 0);
            assert.equal(waitedOut, 0, 'a pass while it stands queued nothing');
            assert.equal(statements.calls(), 1);
            const checkIn = await app.request(`/v1/deadman/switches/${switchId}/check-in`, {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${signJwt(owner.id, owner.username, 600)}`,
                    'content-type': 'application/json',
                },
            });
            assert.equal(checkIn.status, 503, 'the check-in cannot be confirmed');
            assert.equal(
                ((await checkIn.json()) as { code: string }).code,
                'switch_write_unanswered'
            );
        } finally {
            open();
            restore();
        }
        await settled();
        here.switchStatementTimeoutMs = 30_000;
        assert.equal((await stored(switchId))?.status, 'triggered', 'it landed after all');
        // Round 11: as it settled, the switch was read again, taken into the
        // mirror and announced; until then the mirror said armed until a
        // later pass happened to refresh it, and no process was told.
        assert.equal(
            here.getDeadmanSwitch(switchId)?.status,
            'triggered',
            'taken into the mirror as it settled'
        );
        assert.equal(here.getDeadmanSwitch(switchId)?.releasedAt, at.toISOString());
        assert.equal(releasedCopiesFor(recipient.id).length, 1, 'the person’s copy listed');
        assert.equal(
            announcedFor(switchId).length - announcedBefore,
            1,
            'announced once, as it settled'
        );
        const later = new Date(at.getTime() + 60_000);
        await sweepOverdueDeadmanSwitches(later, Number.MAX_SAFE_INTEGER);
        const sent = await runDeadmanReleaseNotifier({ now: later });
        await here.drain();
        assert.equal(sent.caughtUp, 1, 'the catch-up wrote its notice row');
        assert.equal(sendsFor(switchId).length, 1, 'sent once');
    }

    // A move whose turn in the queue had not come when the bound ran out is
    // not run when it comes: the write ahead of it, a plain write of the same
    // switch (round 11: a statement waits only for this process's earlier
    // writes of its own switch, so a held write of another table is no longer
    // ahead of it; test 6), is held.
    {
        const { switchId } = await armed();
        const at = nextMoment();
        let open!: () => void;
        const gate = new Promise<void>((resolve) => {
            open = resolve;
        });
        here.switchStatementTimeoutMs = 200;
        const ahead = intercept(
            (sql) => sql.startsWith('INSERT INTO deadman_switches'),
            () => gate
        );
        let updates = 0;
        const held = pool.connect;
        pool.connect = async () => {
            const client = await held();
            return {
                ...client,
                async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                    if (isSwitchUpdate(sql)) updates += 1;
                    return client.query<T>(sql, params);
                },
            };
        };
        try {
            here.updateDeadmanSwitch(switchId, { headline: 'held' }); // the write held
            assert.equal(await sweepOverdueDeadmanSwitches(at, Number.MAX_SAFE_INTEGER), 0);
            assert.equal(ahead.calls(), 1);
        } finally {
            open();
        }
        await here.drain();
        await new Promise((r) => setTimeout(r, 50));
        restore();
        here.switchStatementTimeoutMs = 30_000;
        assert.equal(updates, 0, 'the move was not run when its turn came');
        assert.equal((await stored(switchId))?.status, 'armed');
        const later = new Date(at.getTime() + 30_000);
        assert.equal(await sweepOverdueDeadmanSwitches(later, Number.MAX_SAFE_INTEGER), 1);
        await here.drain();
        assert.equal((await stored(switchId))?.status, 'triggered', 'the next pass made it');
    }
});

test('a switch whose row was dropped before round 11 still fires: Postgres has no row, so the move writes the switch whole', async () => {
    // Round 10 of part 2's review. The sweep's conditional move matched no
    // row and the read found none, so a switch whose arming write had failed
    // twice and been dropped stayed armed in the owner's list, never fired,
    // and nothing said so on any pass. Since round 11 the arm awaits its own
    // insert (test 7), so this reaches only rows dropped before that; here
    // the row is removed from Postgres by hand, as nothing in the code does.
    const { recipient, switchId } = await armed();
    await pg.query('DELETE FROM deadman_switches WHERE id = $1', [switchId]);
    assert.equal(await stored(switchId), undefined, 'the row is gone');
    assert.equal(here.getDeadmanSwitch(switchId)?.status, 'armed', 'the mirror has it');
    const at = nextMoment();
    let moved = 0;
    const restored = await logged('deadman_switch_row_restored', async () => {
        moved = await sweepOverdueDeadmanSwitches(at, Number.MAX_SAFE_INTEGER);
    });
    await here.drain();
    assert.equal(moved, 1, 'it fired');
    assert.equal(restored, 1, 'logged');
    const row = await stored(switchId);
    assert.equal(row?.status, 'triggered');
    assert.equal(row?.released_at?.toISOString(), at.toISOString());
    assert.notEqual(row?.encrypted_payload, '', 'written whole');
    assert.equal(releasedCopiesFor(recipient.id).length, 1);
    await runDeadmanReleaseNotifier({ now: at });
    await here.drain();
    assert.equal(sendsFor(switchId).length, 1, 'its notice sent');
});

test('a change notification’s refresh during the statement is not taken for this process’s write: a cancel committed elsewhere stands, and nothing is written', async () => {
    // Round 10 of part 2's review. Anything in the mirror other than the move
    // was taken for a write of this process's: a check-in's notification
    // refreshed the mirror while the statement waited, a cancel committed
    // after it, and the sweep wrote the check-in's status back over the
    // cancel.
    const { switchId } = await armed();
    const api = await otherProcess();
    const firesAt = nextMoment();
    let writesHere = 0;
    intercept(isSwitchUpdate, async () => {
        checkInOn(api, switchId, new Date(firesAt.getTime() - 1_000));
        await api.drain();
        (here as unknown as { applyPeerChange(p: unknown): void }).applyPeerChange({
            src: 'api',
            m: 'deadmanSwitches',
            op: 'u',
            kv: [switchId],
        });
        await new Promise((r) => setTimeout(r, 100));
        api.updateDeadmanSwitch(switchId, { status: 'cancelled', encryptedPayload: '' });
        await api.drain();
    });
    const depthBefore = (here as unknown as { queue: { depth: number } }).queue.depth;
    try {
        assert.equal(await sweepOverdueDeadmanSwitches(firesAt, Number.MAX_SAFE_INTEGER), 0);
        writesHere = (here as unknown as { queue: { depth: number } }).queue.depth - depthBefore;
    } finally {
        restore();
    }
    const cancelled = await stored(switchId);
    await here.drain();
    // Round 11: a refused write that reads the switch cancelled blanks its
    // held copies (the cancel elsewhere was a plain write that left them),
    // and that is all it queues: the switch row is not written.
    assert.equal(writesHere, 2, 'only the two copies’ blanking queued');
    const row = await stored(switchId);
    assert.equal(row?.status, 'cancelled', 'the cancel stands');
    assert.equal(row?.encrypted_payload, '');
    assert.equal(row?.updated_at.toISOString(), cancelled?.updated_at.toISOString(), 'not written');
    assert.equal(here.getDeadmanSwitch(switchId)?.status, 'cancelled', 'the mirror took it');
    assert.deepEqual(
        (await storedCopies(switchId)).map((c) => c.held),
        [false, false],
        'the copies a cancelled switch still held are blanked'
    );
    await api.drain();

    // The refused write alone does that, before any pass: a move refused
    // over a cancel committed elsewhere blanks the copies the cancel left.
    {
        const second = await armed(3600);
        const elsewhere = await otherProcess();
        elsewhere.updateDeadmanSwitch(second.switchId, {
            status: 'cancelled',
            encryptedPayload: '',
        });
        await elsewhere.drain();
        assert.deepEqual(
            (await storedCopies(second.switchId)).map((c) => c.held),
            [true, true]
        );
        const read = here.getDeadmanSwitch(second.switchId)!;
        assert.equal(read.status, 'armed', 'not heard of here');
        const moved = await here.advanceDeadmanSwitch(second.switchId, read, {
            status: 'triggered',
            releasedAt: nextMoment().toISOString(),
        });
        assert.equal(moved, undefined, 'refused');
        await here.drain();
        assert.equal(here.getDeadmanSwitch(second.switchId)?.status, 'cancelled');
        assert.deepEqual(
            (await storedCopies(second.switchId)).map((c) => c.held),
            [false, false],
            'blanked by the refused write itself'
        );
        await elsewhere.drain();
    }
});

test('the owner’s check-in and cancel are conditional in Postgres: on a process whose mirror has not heard of a trigger they answer 409 switch_triggered, the trigger and the release stand, and a check-in over another check-in is made over it', async () => {
    // Round 10 of part 2's review. The routes wrote full rows from their own
    // mirror: a check-in the app accepted after the worker's trigger had
    // committed set the switch back to armed while its releasedAt stayed set,
    // the person's copy stayed readable and their notice was sent, the owner
    // was told the check-in had worked, and later check-ins were accepted.
    for (const route of ['check-in', 'cancel'] as const) {
        const { owner, recipient, switchId } = await armed();
        const worker = await otherProcess();
        const firesAt = nextMoment();
        const fired = await worker.advanceDeadmanSwitch(
            switchId,
            worker.getDeadmanSwitch(switchId)!,
            { status: 'triggered', releasedAt: firesAt.toISOString() }
        );
        assert.ok(fired, route);
        await worker.drain();
        assert.equal(here.getDeadmanSwitch(switchId)?.status, 'armed', `${route}: not heard of`);
        const res = await app.request(`/v1/deadman/switches/${switchId}/${route}`, {
            method: 'POST',
            headers: auth(owner),
        });
        assert.equal(res.status, 409, route);
        assert.equal(((await res.json()) as { code: string }).code, 'switch_triggered', route);
        await here.drain();
        const row = await stored(switchId);
        assert.equal(row?.status, 'triggered', `${route}: the trigger stands`);
        assert.equal(row?.released_at?.toISOString(), firesAt.toISOString(), route);
        assert.notEqual(row?.encrypted_payload, '', `${route}: the content stays`);
        assert.equal(here.getDeadmanSwitch(switchId)?.status, 'triggered', `${route}: refreshed`);
        assert.equal(releasedCopiesFor(recipient.id).length, 1, `${route}: the copy stays`);
        const wrap = here.getDeadmanReleaseWrap(switchId, recipient.id);
        assert.ok(wrap && wrap.sealedKey !== '', `${route}: the copy not blanked`);
        const again = await app.request(`/v1/deadman/switches/${switchId}/check-in`, {
            method: 'POST',
            headers: auth(owner),
        });
        assert.equal(again.status, 409, `${route}: a later check-in is refused too`);
        await worker.drain();
    }

    // Another check-in committed on another process first: this one is made
    // over it, and the switch is armed with this one's time.
    {
        const { owner, switchId } = await armed();
        const elsewhere = await otherProcess();
        const elsewhereAt = new Date(Date.now() - 5_000);
        checkInOn(elsewhere, switchId, elsewhereAt);
        await elsewhere.drain();
        const res = await app.request(`/v1/deadman/switches/${switchId}/check-in`, {
            method: 'POST',
            headers: auth(owner),
        });
        assert.equal(res.status, 200);
        await here.drain();
        const row = await stored(switchId);
        assert.equal(row?.status, 'armed');
        assert.ok(
            row!.last_check_in_at.getTime() > elsewhereAt.getTime(),
            'this check-in’s time, over the other one'
        );
        assert.equal(
            here.getDeadmanSwitch(switchId)?.lastCheckInAt,
            row!.last_check_in_at.toISOString()
        );
        await elsewhere.drain();
    }
});

test('a switch statement waits only for this process’s earlier writes of that switch: a check-in behind a held write to another table answers at once, one behind a held plain write of its own switch waits for it, and a check-in after a plain write of the switch still queued is made over that write', async () => {
    // Round 11 of part 2's review. The statement ran in the queue's single
    // order, behind every write the process had queued to any table (a
    // sign-out's whole-table resync of refresh tokens among them), so an
    // honest owner behind a backlog was answered 503, and the stalled flag
    // then refused every other owner's check-in on the process at once.
    here.switchStatementTimeoutMs = 200;
    try {
        // Behind a held write to another table: answered at once.
        {
            const { owner, switchId } = await armed();
            let open!: () => void;
            const gate = new Promise<void>((resolve) => {
                open = resolve;
            });
            const held = intercept(
                (sql) => sql.startsWith('INSERT INTO users'),
                () => gate
            );
            try {
                await person(); // its row's write is held, ahead in the queue
                const started = Date.now();
                const res = await post(owner, `/switches/${switchId}/check-in`);
                assert.equal(res.status, 200, 'not behind the held write');
                assert.ok(Date.now() - started < 200, 'answered within the bound');
                assert.equal(held.calls(), 1);
            } finally {
                open();
                restore();
            }
            await here.drain();
        }

        // Behind a held plain write of its own switch: waits for it, and
        // past the bound is 503 with its statement not run when its turn
        // comes; the owner's next check-in, once the write landed, is made.
        {
            const { owner, switchId } = await armed();
            let open!: () => void;
            const gate = new Promise<void>((resolve) => {
                open = resolve;
            });
            const held = intercept(
                (sql) => sql.startsWith('INSERT INTO deadman_switches'),
                () => gate
            );
            let updates = 0;
            const holding = pool.connect;
            pool.connect = async () => {
                const client = await holding();
                return {
                    ...client,
                    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                        // The refused check-in is carried into the row once
                        // the database answers (decision 31, round 14): that
                        // statement is not the check-in's.
                        if (isSwitchUpdate(sql) && !isCarry(sql)) updates += 1;
                        return client.query<T>(sql, params);
                    },
                };
            };
            try {
                here.updateDeadmanSwitch(switchId, { headline: 'held' }); // the write held
                const res = await post(owner, `/switches/${switchId}/check-in`);
                assert.equal(res.status, 503, 'behind its own switch’s held write');
                assert.equal(held.calls(), 1);
            } finally {
                open();
            }
            await settled();
            restore();
            assert.equal(updates, 0, 'the check-in’s statement was not run when its turn came');
            assert.equal((await stored(switchId))?.headline, 'held', 'the held write landed');
            assert.ok(
                (await columnOf(switchId)) instanceof Date,
                'the refused check-in was carried into the row (decision 31)'
            );
            const again = await post(owner, `/switches/${switchId}/check-in`);
            assert.equal(again.status, 200, 'made once the write landed');
            await here.drain();
            assert.equal(await columnOf(switchId), null, 'and the landed check-in cleared it');
        }

        // Round 9's order holds: a check-in after a plain write of the switch
        // whose insert is still queued waits for it and is made over the row,
        // not written whole over a row that is not there yet.
        {
            const owner = await person();
            let open!: () => void;
            const gate = new Promise<void>((resolve) => {
                open = resolve;
            });
            const held = intercept(
                (sql) => sql.startsWith('INSERT INTO deadman_switches'),
                () => gate
            );
            here.switchStatementTimeoutMs = 30_000;
            const lastCheckInAt = new Date().toISOString();
            const sw = here.createDeadmanSwitch({
                id: randomUUID(),
                ownerId: owner.id,
                status: 'armed',
                checkInIntervalSeconds: 3600,
                gracePeriodSeconds: 0,
                lastCheckInAt,
                triggerAt: new Date(Date.now() + 3_600_000).toISOString(),
                releaseAt: new Date(Date.now() + 3_600_000).toISOString(),
                recipients: [],
                encryptedPayload: 'legacy',
            });
            let restoredRows = 0;
            const original = log.warn;
            log.warn = (m: string, fields?: Record<string, unknown>) => {
                if (m === 'deadman_switch_row_restored') restoredRows += 1;
                original(m, fields as never);
            };
            try {
                const write = here.updateDeadmanSwitchIf(sw.id, sw, {
                    lastCheckInAt: new Date(Date.now() + 1_000).toISOString(),
                });
                const first = await Promise.race([
                    write,
                    new Promise<'waiting'>((r) => setTimeout(() => r('waiting'), 300)),
                ]);
                assert.equal(first, 'waiting', 'waits for the switch’s queued insert');
                assert.equal(held.calls(), 1);
                open();
                const outcome = await write;
                assert.equal(outcome.kind, 'applied', 'made once the insert landed');
                assert.equal(restoredRows, 0, 'over the row, not written whole in its place');
            } finally {
                log.warn = original;
                restore();
            }
            await here.drain();
            assert.equal((await stored(sw.id))?.status, 'armed');
        }
    } finally {
        here.switchStatementTimeoutMs = 30_000;
        restore();
    }
});

test('arming answers 201 only once Postgres holds the switch: a failed insert is 500 with nothing armed, one not answered in time is 503 with nothing in the mirror until it lands, and a confirmed arm is listed by the worker’s store, which never sees a phantom', async () => {
    // Round 11 of part 2's review. The arm was answered from the mirror
    // before its write-behind upsert ran; a dropped write left a switch only
    // that process listed, which the worker (the sweep, in the deployed
    // layout) never had, so it never fired, while the owner's list said
    // armed. The verifiers' `dropped-arm-split.mts`.
    const arm = async (owner: Awaited<ReturnType<typeof person>>, interval = 60) => {
        const recipient = await person();
        const envelope = await protocol.buildReleaseEnvelope({
            ownerKeySet: owner.keySet,
            recipients: [recipient.keySet.identity],
            message: 'Synthetic test text.',
        });
        return {
            recipient,
            envelope,
            res: await post(owner, '/switches', armBody(envelope, interval)),
        };
    };

    // The insert fails: 500, nothing armed anywhere.
    {
        const owner = await person();
        let failures = 0;
        pool.connect = async () => {
            const client = await realConnect();
            return {
                ...client,
                async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                    if (sql.startsWith('INSERT INTO deadman_switches')) {
                        failures += 1;
                        throw new Error('connection reset (test)');
                    }
                    return client.query<T>(sql, params);
                },
            };
        };
        let armedRes: Awaited<ReturnType<typeof arm>>;
        const failed = await logged('deadman_switch_write_failed', async () => {
            try {
                armedRes = await arm(owner);
            } finally {
                restore();
            }
        });
        const { envelope, res, recipient } = armedRes!;
        assert.equal(res.status, 500);
        assert.equal(((await res.json()) as { code: string }).code, 'switch_write_failed');
        assert.equal(failures, 1, 'one statement, not retried');
        assert.equal(failed, 1, 'logged');
        assert.equal(here.getDeadmanSwitch(envelope.releaseId), undefined, 'nothing in the mirror');
        assert.deepEqual(here.listDeadmanReleaseWraps(envelope.releaseId), [], 'no copies either');
        await here.drain();
        assert.equal(await stored(envelope.releaseId), undefined, 'no row');
        // Round 12: the copies written before the switch stay, as a stop
        // between the two writes leaves them (nothing deletes a copy row,
        // since another process's switch for the same envelope may be about
        // to land on them); no switch names them, so nothing lists, serves or
        // counts them.
        assert.deepEqual(
            (await storedCopies(envelope.releaseId)).map((c) => c.held),
            [true, true],
            'the copies written first stay, named by no switch'
        );
        assert.equal(releasedCopiesFor(recipient.id).length, 0, 'served to nobody');
        assert.equal(heldReleasesNaming(recipient.id).total, 0, 'counted toward no bound');
        const worker = await otherProcess();
        assert.equal(
            worker.getDeadmanSwitch(envelope.releaseId),
            undefined,
            'the worker never sees it'
        );
        assert.equal(armsInFlightCount(), 0, 'no arm left counted');
        const list = await app.request('/v1/deadman/switches', { headers: auth(owner) });
        assert.deepEqual(
            ((await list.json()) as { switches: unknown[] }).switches,
            [],
            'not in the owner’s list'
        );
        // Arming the same envelope again writes over those rows and arms.
        const again = await post(owner, '/switches', armBody(envelope));
        assert.equal(again.status, 201, 'the retry arms');
        assert.equal((await stored(envelope.releaseId))?.status, 'armed');
        assert.deepEqual(
            (await storedCopies(envelope.releaseId)).map((c) => c.held),
            [true, true]
        );
        assert.equal(heldReleasesNaming(recipient.id).total, 1, 'counted now');
    }

    // The insert is not answered in time: 503, nothing in the mirror; when
    // it lands, the switch and its copies are taken and announced, the
    // worker lists it once told, and the same envelope is then id_taken.
    {
        const owner = await person();
        let open!: () => void;
        const gate = new Promise<void>((resolve) => {
            open = resolve;
        });
        here.switchStatementTimeoutMs = 200;
        intercept(
            (sql) => sql.startsWith('INSERT INTO deadman_switches'),
            () => gate
        );
        let armedRes: Awaited<ReturnType<typeof arm>>;
        try {
            armedRes = await arm(owner);
        } finally {
            open();
        }
        const { envelope, res, recipient } = armedRes;
        assert.equal(res.status, 503);
        assert.equal(((await res.json()) as { code: string }).code, 'switch_write_unanswered');
        assert.equal(here.getDeadmanSwitch(envelope.releaseId), undefined, 'nothing in the mirror');
        await settled();
        restore();
        here.switchStatementTimeoutMs = 30_000;
        assert.equal((await stored(envelope.releaseId))?.status, 'armed', 'it landed');
        assert.equal(
            here.getDeadmanSwitch(envelope.releaseId)?.status,
            'armed',
            'taken as it settled'
        );
        assert.equal(here.listDeadmanReleaseWraps(envelope.releaseId).length, 2, 'its copies too');
        const told = announcedFor(envelope.releaseId);
        assert.equal(told.length, 1, 'announced');
        const worker = await otherProcess();
        assert.equal(
            worker.getDeadmanSwitch(envelope.releaseId)?.status,
            'armed',
            'the worker lists it'
        );
        assert.equal(worker.listDeadmanReleaseWraps(envelope.releaseId).length, 2);
        const again = await post(owner, '/switches', armBody(envelope));
        assert.equal(again.status, 409);
        assert.equal(((await again.json()) as { code: string }).code, 'release_id_taken');
        void recipient;
    }

    // A confirmed arm: 201, in Postgres before the answer; a worker store on
    // the same database fires it, and the person's copy is readable there.
    {
        const owner = await person();
        const { envelope, res } = await arm(owner);
        assert.equal(res.status, 201);
        assert.equal((await stored(envelope.releaseId))?.status, 'armed', 'in Postgres at the 201');
        assert.equal(announcedFor(envelope.releaseId).length, 1, 'announced');
        const worker = await otherProcess();
        assert.ok(
            worker.listAllDeadmanSwitches().some((sw) => sw.id === envelope.releaseId),
            'the worker’s store has it'
        );
        const firesAt = nextMoment();
        const fired = await worker.advanceDeadmanSwitch(
            envelope.releaseId,
            worker.getDeadmanSwitch(envelope.releaseId)!,
            { status: 'triggered', releasedAt: firesAt.toISOString() }
        );
        assert.ok(fired, 'the worker fires it');
        await worker.drain();
        assert.equal((await stored(envelope.releaseId))?.status, 'triggered');
    }
});

test('two arms at the edge of a per-recipient bound, sent at once, pass one at a time: the arm this process is writing counts until the database has answered', async () => {
    // Round 11 of part 2's review: with the arm awaiting Postgres, the second
    // of two arms would otherwise read the counts without the first and both
    // would pass the bound of five held releases naming one person.
    const owner = await person();
    const named = await person();
    const armNaming = async () => {
        const envelope = await protocol.buildReleaseEnvelope({
            ownerKeySet: owner.keySet,
            recipients: [named.keySet.identity],
            message: 'Synthetic test text.',
        });
        return armReleaseSwitch({
            ownerId: owner.id,
            input: { checkInIntervalSeconds: 3600, gracePeriodSeconds: 0, envelope },
        });
    };
    for (let i = 0; i < 4; i += 1) assert.equal((await armNaming()).kind, 'armed');
    // The fifth arm's insert is held at the database; the sixth, sent while
    // it waits, must read the fifth as counted and be refused, not pass the
    // bound and be written too.
    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
        open = resolve;
    });
    let reached!: () => void;
    const atTheGate = new Promise<void>((resolve) => {
        reached = resolve;
    });
    intercept(
        (sql) => sql.startsWith('INSERT INTO deadman_switches'),
        () => {
            reached();
            return gate;
        }
    );
    try {
        const fifth = armNaming();
        await atTheGate;
        assert.equal(armsInFlightCount(), 1, 'the fifth counts while it waits');
        const sixth = await armNaming();
        assert.equal(sixth.kind, 'recipient_limit', 'the sixth is refused');
        open();
        assert.equal((await fifth).kind, 'armed');
    } finally {
        open();
        restore();
    }
    assert.equal(armsInFlightCount(), 0);
    await here.drain();
});

test('a database stall is an outage of the sweep: a check-in refused unanswered during it, and a switch due while it stood, get the backlog window at the first pass after it, not the trigger; during the stall no statement is sent', async () => {
    // Round 11 of part 2's review (the verifiers' `checkin-during-stall.mts`):
    // while a switch statement stood unanswered every check-in was refused
    // 503 at once, and the first pass after the stall, within the backlog
    // tolerance of a deadline, fired a switch whose owner had checked in an
    // hour before it.
    // A switch due at the pass, so that the pass sends a statement (the one
    // held); earlier tests' switches may be due too, and whichever the pass
    // reaches first is the one held.
    await armed(60);
    const mine = await armed(3600);
    // A second owner refused the same way, whose check-in then lands on
    // another process: the refusal is moot and the switch is judged afresh.
    const theirs = await armed(3600);
    const deadline = new Date(here.getDeadmanSwitch(mine.switchId)!.triggerAt);
    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
        open = resolve;
    });
    here.switchStatementTimeoutMs = 200;
    const statements = intercept(
        (sql) => isSwitchUpdate(sql) && !isCarry(sql),
        () => gate
    );
    let dueDuringStall: { id: string } | undefined;
    try {
        // A due switch's move is the statement the stall holds; the pass ends
        // after the bound with nothing moved.
        assert.equal(
            await sweepOverdueDeadmanSwitches(new Date(Date.now() + 120_000), 15 * 60_000),
            0
        );
        assert.equal(statements.calls(), 1);
        // An hour before the deadline, the owner checks in: refused at once,
        // and the statement is not sent, so it was certainly not recorded.
        const started = Date.now();
        const checkIn = await post(mine.owner, `/switches/${mine.switchId}/check-in`);
        assert.equal(checkIn.status, 503);
        assert.equal(((await checkIn.json()) as { code: string }).code, 'switch_write_unanswered');
        assert.ok(Date.now() - started < 150, 'answered at once');
        assert.equal(statements.calls(), 1, 'the check-in’s statement was not sent');
        assert.equal(
            (await post(theirs.owner, `/switches/${theirs.switchId}/check-in`)).status,
            503
        );
        assert.equal(statements.calls(), 1);
        // Each refusal is carried into its switch's row while the stall still
        // stands, on a connection of its own (round 16 of part 2's review:
        // nothing was sent while a stall stood).
        await until(
            () =>
                here.ownerWriteUnansweredAt(mine.switchId) === undefined &&
                here.ownerWriteUnansweredAt(theirs.switchId) === undefined,
            3_000,
            'the two carries while the stall stands'
        );
        assert.ok((await columnOf(mine.switchId)) instanceof Date);
        assert.ok((await columnOf(theirs.switchId)) instanceof Date);
        // A switch due while the statements stood (a legacy one, written
        // plainly; the sweep's own outage covers every kind).
        const owner = await person();
        const dueAt = new Date().toISOString();
        dueDuringStall = here.createDeadmanSwitch({
            id: randomUUID(),
            ownerId: owner.id,
            status: 'armed',
            checkInIntervalSeconds: 60,
            gracePeriodSeconds: 0,
            lastCheckInAt: new Date(Date.now() - 60_000).toISOString(),
            triggerAt: dueAt,
            releaseAt: dueAt,
            recipients: [randomUUID()],
            encryptedPayload: 'legacy',
        });
        await new Promise((r) => setTimeout(r, 30));
    } finally {
        open();
        restore();
    }
    await settled();
    here.switchStatementTimeoutMs = 30_000;

    // The switch due during the stall, reached at once, within the
    // tolerance: the backlog window, not the trigger.
    await sweepOverdueDeadmanSwitches(new Date(), 15 * 60_000);
    await here.drain();
    assert.equal((await stored(dueDuringStall!.id))?.status, 'grace', 'the window, not fired');
    assert.equal((await stored(dueDuringStall!.id))?.released_at, null);

    // The other owner's check-in lands on another process: the refusal noted
    // here is moot, and at the deadline that switch fires as usual.
    const elsewhere = await otherProcess();
    const landedAt = new Date();
    checkInOn(elsewhere, theirs.switchId, landedAt);
    await elsewhere.drain();
    deliver(here, { src: 'x', m: 'deadmanSwitches', op: 'u', kv: [theirs.switchId] });
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(here.getDeadmanSwitch(theirs.switchId)?.lastCheckInAt, landedAt.toISOString());

    // The sweep reaches the owner's switch five minutes after its deadline,
    // within the 15-minute tolerance: the backlog window, not the trigger;
    // the other owner's, due moments later and checked in since, fires.
    const after = new Date(
        Math.max(deadline.getTime(), landedAt.getTime() + 3_600_000) + 5 * 60_000
    );
    await sweepOverdueDeadmanSwitches(after, 15 * 60_000);
    await here.drain();
    const row = await stored(mine.switchId);
    assert.equal(row?.status, 'grace', 'the backlog window, not fired');
    assert.equal(row?.released_at, null);
    assert.equal(row?.backlog_grace_started_at?.toISOString(), after.toISOString());
    assert.equal(here.getDeadmanSwitch(mine.switchId)?.status, 'grace');
    assert.equal(
        here.getDeadmanSwitch(mine.switchId)?.releaseAt,
        new Date(after.getTime() + 72 * 3_600_000).toISOString(),
        '72 hours from the pass'
    );
    assert.equal((await stored(theirs.switchId))?.status, 'triggered', 'judged afresh: fired');
    assert.equal(here.ownerWriteUnansweredAt(theirs.switchId), undefined);
    // The owner's check-in now lands and ends the window.
    const checkIn = await post(mine.owner, `/switches/${mine.switchId}/check-in`);
    assert.equal(checkIn.status, 200);
    await here.drain();
    const armedAgain = await stored(mine.switchId);
    assert.equal(armedAgain?.status, 'armed');
    assert.equal(armedAgain?.backlog_grace_started_at, null);
    // Cleared: the next pass over it, at a later deadline, is judged afresh.
    assert.equal(here.ownerWriteUnansweredAt(mine.switchId), undefined);
    await elsewhere.drain();
    // Nothing else of the test's stays due for the tests that follow.
    here.updateDeadmanSwitch(dueDuringStall!.id, { status: 'cancelled', encryptedPayload: '' });
    here.updateDeadmanSwitch(mine.switchId, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
});

test('a cancel answered 503 whose statement lands later: the switch is taken into the mirror cancelled and announced, its held copies are blanked, the owner’s list says cancelled, and a store told of it agrees', async () => {
    // Round 11 of part 2's review (the verifiers' `cancel-503-landed.mts`):
    // the landed cancel left the mirror armed, every copy held in Postgres,
    // announced nothing, and a later check-in answered 409 switch_cancelled
    // while the copies stayed until a second cancel nobody was told to make.
    const { owner, recipient, switchId } = await armed(3600);
    const api2 = await otherProcess();
    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
        open = resolve;
    });
    here.switchStatementTimeoutMs = 200;
    interceptHoldingCarries(gate);
    const announcedBefore = announcedFor(switchId).length;
    let res: Response;
    try {
        res = await post(owner, `/switches/${switchId}/cancel`);
    } finally {
        open();
    }
    assert.equal(res.status, 503);
    assert.equal(((await res.json()) as { code: string }).code, 'switch_write_unanswered');
    assert.equal(here.getDeadmanSwitch(switchId)?.status, 'armed', 'nothing of it until it lands');
    await settled();
    restore();
    here.switchStatementTimeoutMs = 30_000;
    const row = await stored(switchId);
    assert.equal(row?.status, 'cancelled', 'it landed');
    assert.equal(row?.encrypted_payload, '');
    assert.equal(here.getDeadmanSwitch(switchId)?.status, 'cancelled', 'taken as it settled');
    assert.deepEqual(
        (await storedCopies(switchId)).map((c) => c.held),
        [false, false],
        'every copy blanked in Postgres'
    );
    assert.equal(releasedCopiesFor(recipient.id).length, 0);
    const told = announcedFor(switchId).slice(announcedBefore);
    assert.equal(told.length, 1, 'announced as it settled');
    const view = await app.request(`/v1/deadman/switches/${switchId}`, { headers: auth(owner) });
    const body = (await view.json()) as { status: string; release?: unknown };
    assert.equal(body.status, 'cancelled', 'the owner’s view says cancelled');
    assert.equal(body.release, undefined, 'and holds no release');
    deliver(api2, told[0]);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(
        api2.getDeadmanSwitch(switchId)?.status,
        'cancelled',
        'the store told of it agrees'
    );
    const fresh = await otherProcess();
    assert.equal(fresh.getDeadmanSwitch(switchId)?.status, 'cancelled');
    assert.equal(
        fresh.listDeadmanReleaseWraps(switchId).filter((w) => w.sealedKey !== '').length,
        0,
        'a fresh process holds no copy of it'
    );
    await api2.drain();
});

test('a conditional switch write is announced: an applied move and a refused move each publish the switch, and a store refreshed from it lists the person’s copy', async () => {
    // Round 10 of part 2's review's verifiers: the publish after a
    // conditional write was the only way the API process learned of the
    // worker's trigger, and no test wired a transport for it.
    const { recipient, switchId } = await armed();
    const api = await otherProcess();
    const announcedBefore = announcedFor(switchId).length;
    const firesAt = nextMoment();
    assert.equal((await sweepOverdueDeadmanSwitches(firesAt, Number.MAX_SAFE_INTEGER)) >= 1, true);
    await here.drain();
    const applied = announcedFor(switchId).slice(announcedBefore);
    assert.deepEqual(
        applied.map((p) => ({ m: p.m, op: p.op, kv: p.kv })),
        [{ m: 'deadmanSwitches', op: 'u', kv: [switchId] }],
        'the applied move is announced once'
    );
    assert.equal(api.getDeadmanSwitch(switchId)?.status, 'armed', 'the other store has not heard');
    deliver(api, applied[0]);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(api.getDeadmanSwitch(switchId)?.status, 'triggered', 'refreshed from it');
    assert.equal(api.getDeadmanSwitch(switchId)?.releasedAt, firesAt.toISOString());
    assert.ok(
        api
            .listDeadmanReleaseWrapsForRecipient(recipient.id)
            .some((w) => w.switchId === switchId && w.sealedKey !== ''),
        'and holds the person’s copy on the fired switch, which its release read lists'
    );

    // A refused move (the owner checked in on the other process first) is
    // announced too, so a process whose mirror lagged is told to refresh.
    {
        const second = await armed();
        const elsewhere = await otherProcess();
        const before = announcedFor(second.switchId).length;
        const at = nextMoment();
        checkInOn(elsewhere, second.switchId, new Date(at.getTime() - 1_000));
        await elsewhere.drain();
        await sweepOverdueDeadmanSwitches(at, Number.MAX_SAFE_INTEGER);
        await here.drain();
        const refused = announcedFor(second.switchId).slice(before);
        assert.equal(refused.length, 1, 'the refused move is announced once');
        assert.equal(
            here.getDeadmanSwitch(second.switchId)?.status,
            'armed',
            'the check-in stands'
        );
        await elsewhere.drain();
    }
    await api.drain();
});

test('a check-in or cancel refused three times over other check-ins is 409 switch_changed; refused over a trigger or a cancel on the third attempt it is 409 switch_triggered or switch_cancelled, as on any attempt', async () => {
    // Round 10 of part 2's review's verifiers: no test pinned switch_changed,
    // and on the third attempt the routes answered it before looking at what
    // the switch had become.
    const interfere = (onEach: (attempt: number) => Promise<void>): { attempts: () => number } => {
        let attempts = 0;
        // The other store's own conditional write (the trigger below) goes
        // through this same pool: not interfered with in turn.
        let interfering = false;
        pool.connect = async () => {
            const client = await realConnect();
            return {
                ...client,
                async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                    if (isSwitchUpdate(sql) && !interfering) {
                        attempts += 1;
                        interfering = true;
                        try {
                            await onEach(attempts);
                        } finally {
                            interfering = false;
                        }
                    }
                    return client.query<T>(sql, params);
                },
            };
        };
        return { attempts: () => attempts };
    };
    const tick = () => new Date((clock += 1_000));
    for (const what of ['check-in', 'cancel'] as const) {
        // Another check-in lands before each attempt: three refusals.
        {
            const { owner, switchId } = await armed(3600);
            const elsewhere = await otherProcess();
            const made = interfere(async () => {
                checkInOn(elsewhere, switchId, tick());
                await elsewhere.drain();
            });
            let res: Response;
            try {
                res = await post(owner, `/switches/${switchId}/${what}`);
            } finally {
                restore();
            }
            assert.equal(res.status, 409, what);
            assert.equal(((await res.json()) as { code: string }).code, 'switch_changed', what);
            assert.equal(made.attempts(), 3, `${what}: three attempts`);
            await here.drain();
            assert.equal((await stored(switchId))?.status, 'armed', `${what}: nothing written`);
            await elsewhere.drain();
        }
        // The third attempt finds the switch fired: switch_triggered.
        {
            const { owner, switchId } = await armed(3600);
            const elsewhere = await otherProcess();
            const made = interfere(async (attempt) => {
                if (attempt < 3) {
                    checkInOn(elsewhere, switchId, tick());
                } else {
                    await elsewhere.advanceDeadmanSwitch(
                        switchId,
                        elsewhere.getDeadmanSwitch(switchId)!,
                        { status: 'triggered', releasedAt: tick().toISOString() }
                    );
                }
                await elsewhere.drain();
            });
            let res: Response;
            try {
                res = await post(owner, `/switches/${switchId}/${what}`);
            } finally {
                restore();
            }
            assert.equal(res.status, 409, what);
            assert.equal(((await res.json()) as { code: string }).code, 'switch_triggered', what);
            assert.equal(made.attempts(), 3, what);
            assert.equal(
                (await stored(switchId))?.status,
                'triggered',
                `${what}: the trigger stands`
            );
            await elsewhere.drain();
        }
        // The third attempt finds the switch cancelled: switch_cancelled, and
        // for the check-in the copies the cancel elsewhere left are blanked.
        {
            const { owner, switchId } = await armed(3600);
            const elsewhere = await otherProcess();
            const made = interfere(async (attempt) => {
                if (attempt < 3) {
                    checkInOn(elsewhere, switchId, tick());
                } else {
                    elsewhere.updateDeadmanSwitch(switchId, {
                        status: 'cancelled',
                        encryptedPayload: '',
                    });
                }
                await elsewhere.drain();
            });
            let res: Response;
            try {
                res = await post(owner, `/switches/${switchId}/${what}`);
            } finally {
                restore();
            }
            await here.drain();
            if (what === 'check-in') {
                assert.equal(res.status, 409);
                assert.equal(((await res.json()) as { code: string }).code, 'switch_cancelled');
            } else {
                // A cancel that finds the switch cancelled is the second cancel: 200.
                assert.equal(res.status, 200);
            }
            assert.equal(made.attempts(), 3, what);
            assert.deepEqual(
                (await storedCopies(switchId)).map((c) => c.held),
                [false, false],
                `${what}: the copies blanked`
            );
            await elsewhere.drain();
        }
    }
});

test('the 365-day removal and the second cancel write the content column only: a label another process erased is not put back, and a cancelled release switch still holding copies has them blanked by the removal pass', async () => {
    // Round 10 of part 2's review's verifiers: both were full-row writes
    // from this process's mirror, so the worker's removal could put back a
    // label the owner's deletion on the API process had just erased.
    {
        const { owner, switchId } = await armed(60, 'the blue folder');
        const api = await otherProcess();
        const firesAt = nextMoment();
        await sweepOverdueDeadmanSwitches(firesAt, Number.MAX_SAFE_INTEGER);
        await here.drain();
        assert.equal((await stored(switchId))?.status, 'triggered');
        // The API process erases the label (the owner's deletion of a fired
        // switch); this worker's mirror still has it.
        deliver(api, { src: 'x', m: 'deadmanSwitches', op: 'u', kv: [switchId] });
        await new Promise((r) => setTimeout(r, 100));
        api.eraseDeadmanSwitch(switchId);
        await api.drain();
        assert.equal((await stored(switchId))?.headline, null, 'erased in Postgres');
        assert.equal(here.getDeadmanSwitch(switchId)?.headline, 'the blue folder', 'still here');
        const removalAt = new Date(firesAt.getTime() + 366 * 24 * 3_600_000);
        await sweepOverdueDeadmanSwitches(removalAt, Number.MAX_SAFE_INTEGER);
        await here.drain();
        const row = await stored(switchId);
        assert.equal(row?.encrypted_payload, '', 'the content removed');
        assert.equal(row?.headline, null, 'the label stays erased');
        assert.deepEqual(
            (await storedCopies(switchId)).map((c) => c.held),
            [false, false]
        );
        void owner;
        await api.drain();
    }
    // The second cancel: a switch cancelled with its payload kept (as a
    // cancel before this code left it), its label erased elsewhere.
    {
        const { owner, switchId } = await armed(3600);
        await pg.query(
            "UPDATE deadman_switches SET status = 'cancelled', headline = NULL WHERE id = $1",
            [switchId]
        );
        deliver(here, { src: 'x', m: 'deadmanSwitches', op: 'u', kv: [switchId] });
        await new Promise((r) => setTimeout(r, 100));
        assert.equal(here.getDeadmanSwitch(switchId)?.status, 'cancelled');
        here.updateDeadmanSwitch(switchId, { headline: 'kept here' }); // the mirror alone differs now
        await here.drain();
        await pg.query('UPDATE deadman_switches SET headline = NULL WHERE id = $1', [switchId]);
        const res = await post(owner, `/switches/${switchId}/cancel`);
        assert.equal(res.status, 200);
        await here.drain();
        const row = await stored(switchId);
        assert.equal(row?.encrypted_payload, '', 'the content removed');
        assert.equal(row?.headline, null, 'the row’s other columns untouched');
        assert.deepEqual(
            (await storedCopies(switchId)).map((c) => c.held),
            [false, false]
        );
    }
    // A cancelled release switch still holding copies (a cancel written
    // plainly elsewhere, or a re-seal that reached a replica after the
    // cancel): the removal pass blanks them.
    {
        const { recipient, switchId } = await armed(3600);
        const elsewhere = await otherProcess();
        elsewhere.updateDeadmanSwitch(switchId, { status: 'cancelled', encryptedPayload: '' });
        await elsewhere.drain();
        deliver(here, { src: 'x', m: 'deadmanSwitches', op: 'u', kv: [switchId] });
        await new Promise((r) => setTimeout(r, 100));
        assert.equal(here.getDeadmanSwitch(switchId)?.status, 'cancelled');
        assert.deepEqual(
            (await storedCopies(switchId)).map((c) => c.held),
            [true, true],
            'held'
        );
        await sweepOverdueDeadmanSwitches(nextMoment(), Number.MAX_SAFE_INTEGER);
        await here.drain();
        assert.deepEqual(
            (await storedCopies(switchId)).map((c) => c.held),
            [false, false],
            'blanked'
        );
        assert.equal(releasedCopiesFor(recipient.id).length, 0);
        await elsewhere.drain();
    }
    // The same, found by the owner's check-in on a mirror that was told of
    // the cancel: 409 switch_cancelled, and the copies go with the answer.
    {
        const { owner, switchId } = await armed(3600);
        const elsewhere = await otherProcess();
        elsewhere.updateDeadmanSwitch(switchId, { status: 'cancelled', encryptedPayload: '' });
        await elsewhere.drain();
        deliver(here, { src: 'x', m: 'deadmanSwitches', op: 'u', kv: [switchId] });
        await new Promise((r) => setTimeout(r, 100));
        assert.deepEqual(
            (await storedCopies(switchId)).map((c) => c.held),
            [true, true],
            'held'
        );
        const res = await post(owner, `/switches/${switchId}/check-in`);
        assert.equal(res.status, 409);
        assert.equal(((await res.json()) as { code: string }).code, 'switch_cancelled');
        await here.drain();
        assert.deepEqual(
            (await storedCopies(switchId)).map((c) => c.held),
            [false, false],
            'blanked'
        );
        await elsewhere.drain();
    }
});

test('a release switch cancelled with its releasedAt kept (a shape the owner’s deletion over a trigger committed elsewhere wrote until round 12) is served to nobody and notified to nobody: the readers need the status, not releasedAt alone', async () => {
    // Round 10 of part 2's review's verifiers: `releasedCopiesFor` and the
    // notifier keyed on `releasedAt`, and only the emptied content kept such
    // a switch from being served.
    const { recipient, switchId } = await armed();
    const firesAt = nextMoment();
    await sweepOverdueDeadmanSwitches(firesAt, Number.MAX_SAFE_INTEGER);
    await here.drain();
    assert.equal(releasedCopiesFor(recipient.id).length, 1, 'listed while fired');
    assert.equal((await noticeRows(switchId)).length, 1, 'its notice owed');
    assert.equal(
        exportUserData(recipient.id)?.deadmanNotices.length,
        1,
        'the export lists the notice while fired'
    );
    // Cancelled with the content and `releasedAt` kept, as a plain cancel
    // written elsewhere over a trigger leaves it but for the content (since
    // round 12 the deletion itself leaves a fired switch fired).
    here.updateDeadmanSwitch(switchId, { status: 'cancelled' });
    await here.drain();
    assert.equal(here.getDeadmanSwitch(switchId)?.releasedAt, firesAt.toISOString());
    assert.equal(releasedCopiesFor(recipient.id).length, 0, 'not listed');
    assert.deepEqual(
        exportUserData(recipient.id)?.deadmanNotices,
        [],
        'the export’s notice filter asks standsFired too (round 12)'
    );
    const tick = await runDeadmanReleaseNotifier({ now: new Date(firesAt.getTime() + 1_000) });
    await here.drain();
    assert.equal(tick.caughtUp, 0, 'the catch-up writes nothing for it');
    assert.ok(tick.failed >= 1, 'its pending notice ends (other tests’ due notices end here too)');
    assert.equal(sendsFor(switchId).length, 0, 'nothing sent');
    const notice = here.getDeadmanReleaseNotice(switchId, recipient.id);
    assert.equal(notice?.status, 'failed');
    assert.equal(notice?.lastError, 'release_unavailable');
});

/** A release switch of `owner`'s naming a fresh recipient, through the service; its rows in Postgres. */
const armedFor = async (
    owner: Awaited<ReturnType<typeof person>>,
    checkInIntervalSeconds: number,
    label: string
) => {
    const recipient = await person();
    const envelope = await protocol.buildReleaseEnvelope({
        ownerKeySet: owner.keySet,
        recipients: [recipient.keySet.identity],
        message: 'Synthetic test text.',
    });
    const outcome = await armReleaseSwitch({
        ownerId: owner.id,
        input: { checkInIntervalSeconds, gracePeriodSeconds: 0, envelope, label },
    });
    assert.equal(outcome.kind, 'armed');
    await here.drain();
    return { recipient, envelope, switchId: envelope.releaseId };
};

/** What another process's arm of the same envelope writes (the service's row, as `armDeadmanSwitch` takes it). */
const switchInputFor = (
    envelope: Awaited<ReturnType<typeof protocol.buildReleaseEnvelope>>,
    ownerId: string
) => {
    const now = new Date();
    const later = new Date(now.getTime() + 3_600_000).toISOString();
    return {
        input: {
            id: envelope.releaseId,
            ownerId,
            status: 'armed' as const,
            checkInIntervalSeconds: 3600,
            gracePeriodSeconds: 0,
            lastCheckInAt: now.toISOString(),
            triggerAt: later,
            releaseAt: later,
            recipients: envelope.copies
                .map((copy) => copy.recipientAccountId)
                .filter((id) => id !== ownerId),
            encryptedPayload: '{"header":{},"ownerIdentity":{}}',
            releaseFormat: 'release-v1' as const,
        },
        copies: envelope.copies.map((copy) => ({
            switchId: envelope.releaseId,
            recipientAccountId: copy.recipientAccountId,
            recipientFingerprint: copy.recipientFingerprint,
            sealedKey: copy.sealedKey,
            signature: copy.signature,
        })),
    };
};

test('two processes arm one envelope: the arm that finds the id taken deletes nothing, takes the winner’s switch and copies into its mirror and answers id_taken, so Postgres never holds a switch without its copies and the owner can see and cancel it on either process', async () => {
    // Round 12 of part 2's review (the verifiers' `arm-race.mts` A and
    // `h1-pg-edge.mts` E): the losing arm "took back the copies it wrote" by
    // their `created_at`, which were the rows the winning arm's switch relied
    // on (its own copy inserts had been no-ops on them), so Postgres held an
    // armed switch with no copies, which fires and releases to nobody, while
    // the winner's mirror still showed them to the owner. Now nothing deletes
    // a copy row, and a taken id is taken into the mirror.
    const owner = await person();
    const recipient = await person();
    const envelope = await protocol.buildReleaseEnvelope({
        ownerKeySet: owner.keySet,
        recipients: [recipient.keySet.identity],
        message: 'Synthetic test text.',
    });
    const id = envelope.releaseId;
    const other = await otherProcess();
    const theirs = switchInputFor(envelope, owner.id);
    // A (this process, through the service) has written its copies and is
    // held at its switch insert; B (the other process) arms the same envelope
    // meanwhile and wins.
    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
        open = resolve;
    });
    let reached!: () => void;
    const atTheGate = new Promise<void>((resolve) => {
        reached = resolve;
    });
    intercept(
        (sql) => sql.startsWith('INSERT INTO deadman_switches'),
        () => {
            reached();
            return gate;
        }
    );
    const announcedBefore = announcedFor(id).length;
    let a: Awaited<ReturnType<typeof armReleaseSwitch>>;
    try {
        const armA = armReleaseSwitch({
            ownerId: owner.id,
            input: { checkInIntervalSeconds: 3600, gracePeriodSeconds: 0, envelope },
        });
        await atTheGate;
        assert.equal((await storedCopies(id)).length, 2, 'A has written its copies');
        const b = await other.armDeadmanSwitch(theirs.input, theirs.copies);
        assert.equal(b.kind, 'armed', 'B wins');
        assert.equal((await stored(id))?.status, 'armed');
        open();
        a = await armA;
    } finally {
        open();
        restore();
    }
    assert.equal(a.kind, 'id_taken', 'A finds the id taken');
    assert.equal((await stored(id))?.status, 'armed', 'B’s switch stands');
    assert.deepEqual(
        (await storedCopies(id)).map((c) => c.held),
        [true, true],
        'B’s copies survive A’s loss'
    );
    assert.equal(here.getDeadmanSwitch(id)?.status, 'armed', 'A’s mirror took B’s switch');
    assert.equal(here.listDeadmanReleaseWraps(id).length, 2, 'and its copies');
    assert.equal(announcedFor(id).length - announcedBefore, 1, 'announced once it was taken');
    assert.equal(armsInFlightCount(), 0);
    const list = await app.request('/v1/deadman/switches', { headers: auth(owner) });
    assert.ok(
        ((await list.json()) as { switches: Array<{ switchId: string }> }).switches.some(
            (sw) => sw.switchId === id
        ),
        'in the owner’s list on A'
    );
    const fresh = await otherProcess();
    assert.equal(fresh.getDeadmanSwitch(id)?.status, 'armed');
    assert.equal(
        fresh.listDeadmanReleaseWraps(id).filter((w) => w.sealedKey !== '').length,
        2,
        'a fresh process (the worker) hydrates both copies'
    );
    // The owner cancels on A: the copies go.
    const cancel = await post(owner, `/switches/${id}/cancel`);
    assert.equal(cancel.status, 200, 'cancellable on A');
    await here.drain();
    assert.equal((await stored(id))?.status, 'cancelled');
    assert.deepEqual(
        (await storedCopies(id)).map((c) => c.held),
        [false, false]
    );
    await other.drain();

    // The same, with nothing held: both stores arm at once (the same
    // millisecond included); exactly one arms, and both copies stay.
    const envelope2 = await protocol.buildReleaseEnvelope({
        ownerKeySet: owner.keySet,
        recipients: [recipient.keySet.identity],
        message: 'Synthetic test text.',
    });
    const mine = switchInputFor(envelope2, owner.id);
    const [x, y] = await Promise.all([
        here.armDeadmanSwitch(mine.input, mine.copies),
        other.armDeadmanSwitch(mine.input, mine.copies),
    ]);
    assert.deepEqual([x.kind, y.kind].sort(), ['armed', 'id_taken']);
    assert.equal((await stored(envelope2.releaseId))?.status, 'armed');
    assert.deepEqual(
        (await storedCopies(envelope2.releaseId)).map((c) => c.held),
        [true, true]
    );
    assert.equal(here.listDeadmanReleaseWraps(envelope2.releaseId).length, 2);
    assert.equal(other.listDeadmanReleaseWraps(envelope2.releaseId).length, 2);
    here.updateDeadmanSwitch(envelope2.releaseId, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
    await other.drain();
});

test('an arm whose statement fails after its insert committed is answered 201 from the row read again, listed, announced and cancellable; one whose statement and re-read both fail is 503 with nothing written, and the same envelope then arms', async () => {
    // Round 12 of part 2's review (the verifiers' `arm-race.mts` B): a
    // connection that died between the server committing the insert and the
    // client reading the answer was answered 500 "Nothing was armed", while
    // Postgres held the armed switch: invisible to the owner, uncancellable
    // on that process, and fired by a fresh worker.
    {
        const owner = await person();
        const recipient = await person();
        const envelope = await protocol.buildReleaseEnvelope({
            ownerKeySet: owner.keySet,
            recipients: [recipient.keySet.identity],
            message: 'Synthetic test text.',
        });
        const id = envelope.releaseId;
        pool.connect = async () => {
            const client = await realConnect();
            let dead = false;
            return {
                ...client,
                async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                    if (dead) throw new Error('Connection terminated unexpectedly (test)');
                    if (sql.startsWith('INSERT INTO deadman_switches')) {
                        await client.query<T>(sql, params); // the server commits it
                        dead = true;
                        throw new Error('Connection terminated unexpectedly (test)');
                    }
                    return client.query<T>(sql, params);
                },
            };
        };
        let res!: Response;
        const failed = await logged('deadman_switch_write_failed', async () => {
            try {
                res = await post(owner, '/switches', armBody(envelope, 3600));
            } finally {
                restore();
            }
        });
        assert.equal(res.status, 201, 'armed: the row was there when read again');
        assert.equal(failed, 1, 'the failure is logged');
        assert.equal(here.getDeadmanSwitch(id)?.status, 'armed', 'in the mirror');
        assert.equal(here.listDeadmanReleaseWraps(id).length, 2, 'with its copies');
        assert.equal(announcedFor(id).length, 1, 'announced');
        assert.equal((await stored(id))?.status, 'armed');
        const list = await app.request('/v1/deadman/switches', { headers: auth(owner) });
        assert.ok(
            ((await list.json()) as { switches: Array<{ switchId: string }> }).switches.some(
                (sw) => sw.switchId === id
            ),
            'in the owner’s list'
        );
        const again = await post(owner, '/switches', armBody(envelope, 3600));
        assert.equal(again.status, 409);
        assert.equal(((await again.json()) as { code: string }).code, 'release_id_taken');
        const cancel = await post(owner, `/switches/${id}/cancel`);
        assert.equal(cancel.status, 200, 'cancellable here');
        await here.drain();
        assert.equal((await stored(id))?.status, 'cancelled');
        assert.deepEqual(
            (await storedCopies(id)).map((c) => c.held),
            [false, false]
        );
    }
    // The statement fails before anything is written, and the read afterwards
    // fails too: 503, nothing anywhere. The outcome is unknown until the
    // switch has been read, so the stall stands and the switch is read again
    // (round 20 of part 2's review: nothing read it again, and the next arm
    // was sent at once); once a read has answered, the same envelope arms.
    {
        const owner = await person();
        const recipient = await person();
        const envelope = await protocol.buildReleaseEnvelope({
            ownerKeySet: owner.keySet,
            recipients: [recipient.keySet.identity],
            message: 'Synthetic test text.',
        });
        const id = envelope.releaseId;
        const savedRetry = here.carryRetryMs;
        here.carryRetryMs = 100;
        let switchStatements = 0;
        pool.connect = async () => {
            const client = await realConnect();
            return {
                ...client,
                async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                    if (/deadman_switches/.test(sql)) {
                        switchStatements += 1;
                        throw new Error('connection reset (test)');
                    }
                    return client.query<T>(sql, params);
                },
            };
        };
        const stallStands = () => here.switchStatementsStalledBetween(Date.now(), Date.now());
        let res!: Response;
        let during!: Response;
        let sentDuring = -1;
        try {
            res = await post(owner, '/switches', armBody(envelope, 3600));
            assert.equal(stallStands(), true, 'the stall stands: the switch is still to be read');
            const sentBefore = switchStatements;
            during = await post(owner, '/switches', armBody(envelope, 3600));
            sentDuring = switchStatements - sentBefore;
        } finally {
            restore();
        }
        assert.equal(res.status, 503);
        assert.equal(((await res.json()) as { code: string }).code, 'switch_write_unanswered');
        assert.equal(during.status, 503, 'an arm while the switch is still to be read is refused');
        assert.equal(sentDuring, 0, 'at once, unsent');
        assert.equal(here.getDeadmanSwitch(id), undefined, 'nothing in the mirror');
        assert.equal(await stored(id), undefined, 'no row');
        assert.deepEqual(await storedCopies(id), [], 'no copies: the statement failed before them');
        assert.equal(armsInFlightCount(), 0);
        try {
            await until(() => !stallStands(), 3_000, 'the switch read again, found absent');
        } finally {
            here.carryRetryMs = savedRetry;
        }
        const again = await post(owner, '/switches', armBody(envelope, 3600));
        assert.equal(again.status, 201, 'the same envelope arms once the database has answered');
        assert.equal((await stored(id))?.status, 'armed');
        here.updateDeadmanSwitch(id, { status: 'cancelled', encryptedPayload: '' });
        await here.drain();
    }
});

test('a switch statement’s stall stands until the landed row is in the mirror: an arm sent after the insert landed but before the re-read has put it there is 503, not let past a bound', async () => {
    // Round 12 of part 2's review (the verifiers' `h1-pg-edge.mts` F2): the
    // stall was cleared when the statement answered, before the settle's
    // re-read put the row in the mirror, so an arm sent in that window read
    // the bounds without the landed switch and passed them (21 held on one
    // process, a sixth release naming one person from one owner here).
    const owner = await person();
    const named = await person();
    const armNaming = async () => {
        const envelope = await protocol.buildReleaseEnvelope({
            ownerKeySet: owner.keySet,
            recipients: [named.keySet.identity],
            message: 'Synthetic test text.',
        });
        return armReleaseSwitch({
            ownerId: owner.id,
            input: { checkInIntervalSeconds: 3600, gracePeriodSeconds: 0, envelope },
        });
    };
    const stallFlag = () =>
        (here as unknown as { stalledSwitchStatement: unknown }).stalledSwitchStatement;
    for (let i = 0; i < 4; i += 1) assert.equal((await armNaming()).kind, 'armed');
    await here.drain();
    here.switchStatementTimeoutMs = 200;
    let openInsert!: () => void;
    const insertGate = new Promise<void>((resolve) => {
        openInsert = resolve;
    });
    intercept(
        (sql) => sql.startsWith('INSERT INTO deadman_switches'),
        () => insertGate
    );
    let openRead!: () => void;
    const readGate = new Promise<void>((resolve) => {
        openRead = resolve;
    });
    let readReached!: () => void;
    const atRead = new Promise<void>((resolve) => {
        readReached = resolve;
    });
    try {
        // The fifth arm's insert is held past the bound: 503, a stall.
        const fifth = await armNaming();
        assert.equal(fifth.kind, 'write_unanswered');
        assert.ok(stallFlag(), 'a stall stands');
        assert.equal(armsInFlightCount(), 0, 'the route no longer counts it');
        // The insert lands, and the settle's re-read is held.
        restore();
        intercept(
            (sql) => sql.startsWith('SELECT * FROM deadman_switches WHERE id'),
            () => {
                readReached();
                return readGate;
            }
        );
        openInsert();
        await atRead;
        assert.ok(stallFlag(), 'the stall still stands: the row is not in the mirror yet');
        assert.equal(heldReleasesNaming(named.id).total, 4, 'the mirror lacks the fifth');
        // An arm naming the person now would be the sixth: refused at once,
        // not written.
        const started = Date.now();
        const sixth = await armNaming();
        assert.equal(sixth.kind, 'write_unanswered', 'refused while the stall stands');
        assert.ok(Date.now() - started < 1_000, 'at once');
    } finally {
        openInsert();
        openRead();
        restore();
    }
    await settled();
    here.switchStatementTimeoutMs = 30_000;
    assert.equal(stallFlag(), null, 'the stall ended once the row was in the mirror');
    assert.equal(heldReleasesNaming(named.id).total, 5, 'the fifth is counted now');
    const pgNaming = (
        await pg.query(
            "SELECT count(*)::int AS n FROM deadman_release_wraps w JOIN deadman_switches s ON s.id = w.switch_id WHERE w.recipient_account_id = $1 AND s.owner_id = $2 AND s.encrypted_payload <> ''",
            [named.id, owner.id]
        )
    ).rows[0] as { n: number };
    assert.equal(pgNaming.n, 5, 'five in Postgres');
    assert.equal((await armNaming()).kind, 'recipient_limit', 'the sixth is refused by the bound');
    await here.drain();
});

test('the owner’s deletion is decided in Postgres: on a process that has not heard of a trigger another process committed it erases the release as fired (label and the owner’s copy gone; content, releasedAt and the recipients’ copies kept and served; a notice sent stands and one not yet sent still goes), a legacy switch fired elsewhere keeps its payload, an unfired switch loses everything, and while its statements run the account is already gone, so the owner’s other session can neither publish a release identity nor arm', async () => {
    // Decision 30, decided by the operator on 2026-11-02 and built in round
    // 12 of part 2's review: the deletion wrote each switch from the deleting
    // process's mirror, unconditionally, so on a process that had not heard of
    // a trigger another process committed it cancelled a release that had
    // fired and removed its content and copies. Now each switch is one
    // statement decided on the row Postgres holds.
    const owner = await person();
    const sent = await armedFor(owner, 60, 'label a');
    const pending = await armedFor(owner, 60, 'label b');
    const unfired = await armedFor(owner, 3600, 'label c');
    const legacyRecipient = await person();
    const legacy = here.createDeadmanSwitch({
        id: randomUUID(),
        ownerId: owner.id,
        roomId: '!room:test.local',
        status: 'armed',
        checkInIntervalSeconds: 60,
        gracePeriodSeconds: 0,
        lastCheckInAt: new Date().toISOString(),
        triggerAt: new Date(Date.now() + 60_000).toISOString(),
        releaseAt: new Date(Date.now() + 60_000).toISOString(),
        recipients: [legacyRecipient.id],
        encryptedPayload: 'legacy-payload',
        headline: 'label l',
    });
    await here.drain();
    // Another envelope of the owner's, to arm during the deletion.
    const extraRecipient = await person();
    const extra = await protocol.buildReleaseEnvelope({
        ownerKeySet: owner.keySet,
        recipients: [extraRecipient.keySet.identity],
        message: 'Synthetic test text.',
    });

    // The worker fires three of them and writes the two releases' notices,
    // sending one; this process is not told.
    const worker = await otherProcess();
    const firedAt = nextMoment();
    for (const sw of [sent, pending]) {
        const fired = await worker.advanceDeadmanSwitch(
            sw.switchId,
            worker.getDeadmanSwitch(sw.switchId)!,
            { status: 'triggered', releasedAt: firedAt.toISOString() }
        );
        assert.ok(fired);
        worker.createDeadmanReleaseNotice({
            switchId: sw.switchId,
            recipientAccountId: sw.recipient.id,
            nextAttemptAt: firedAt.toISOString(),
        });
    }
    worker.updateDeadmanReleaseNoticeIf(
        sent.switchId,
        sent.recipient.id,
        { status: 'pending' },
        {
            status: 'sent',
            attempts: 1,
            sentAt: firedAt.toISOString(),
            roomId: '!notices-a:test.local',
        }
    );
    assert.ok(
        await worker.advanceDeadmanSwitch(legacy.id, worker.getDeadmanSwitch(legacy.id)!, {
            status: 'triggered',
        })
    );
    await worker.drain();
    for (const id of [sent.switchId, pending.switchId, legacy.id]) {
        assert.equal(here.getDeadmanSwitch(id)?.status, 'armed', 'this process has not heard');
    }

    // The owner deletes their account on this process. While the first
    // switch's erase statement runs, the owner's other session publishes its
    // release identity again (the same one, which outside the window is a
    // free 200) and arms another release here: both refused, the account is
    // already gone (round 13 of part 2's review: the user row and the
    // identities' history were still there behind the awaits, so the
    // re-publish was 201 and an arm with it after the deletion fired).
    const issued = requestAccountDeletion({ userId: owner.id })!;
    let armDuring: ReturnType<typeof armReleaseSwitch> | undefined;
    // What the arm had answered while the deletion's first statement was
    // still held: refused for want of an account before any signature was
    // checked, since the user row goes before the first await (an arm refused
    // only at its second check, once the deletion had finished, would read
    // 'still verifying' here).
    let armWhileHeld: string | undefined;
    let republishWhileHeld: number | undefined;
    const announcedBefore = announced.length;
    const erases = intercept(
        (sql) => sql.startsWith('UPDATE deadman_switches SET headline = NULL'),
        async () => {
            const republished = await app.request('/v1/release-identities/me', {
                method: 'PUT',
                headers: auth(owner),
                body: JSON.stringify({ identity: owner.keySet.identity }),
            });
            republishWhileHeld = republished.status;
            armDuring = armReleaseSwitch({
                ownerId: owner.id,
                input: { checkInIntervalSeconds: 3600, gracePeriodSeconds: 0, envelope: extra },
            });
            armWhileHeld = await Promise.race([
                armDuring.then((o) => o.kind),
                new Promise<string>((r) => setTimeout(() => r('still verifying'), 300)),
            ]);
        }
    );
    let revokedAt: 'before the awaits' | 'later' | undefined;
    let outcome: Awaited<ReturnType<typeof confirmAccountDeletion>>;
    try {
        const confirming = confirmAccountDeletion(issued.token, owner.id, () => {
            revokedAt = erases.calls() === 0 ? 'before the awaits' : 'later';
        });
        outcome = await confirming;
    } finally {
        restore();
    }
    assert.equal(outcome.kind, 'ok');
    assert.equal(revokedAt, 'before the awaits', 'the token is revoked before any statement');
    assert.equal(erases.calls(), 4, 'one statement per switch');
    assert.equal(
        republishWhileHeld,
        404,
        'the re-publish during the deletion is refused: the account is already gone'
    );
    assert.equal(
        armWhileHeld,
        'no_account',
        'the arm during the deletion is refused at once: the account is already gone'
    );
    assert.equal((await armDuring!).kind, 'no_account');
    assert.equal(here.getCurrentReleaseIdentity(owner.id), undefined, 'no identity outlives it');
    await finishAccountDeletion(owner.id, here);
    // After the deletion the other session's arm and re-seal are refused too,
    // by the routes.
    const armAfter = await post(owner, '/switches', armBody(extra, 3600));
    assert.equal(armAfter.status, 404);
    assert.equal(((await armAfter.json()) as { code: string }).code, 'user_not_found');
    const resealAfter = await post(owner, `/switches/${unfired.switchId}/reseal`, {
        copy: unfired.envelope.copies.find((c) => c.recipientAccountId === unfired.recipient.id),
    });
    assert.equal(resealAfter.status, 404);
    assert.equal(((await resealAfter.json()) as { code: string }).code, 'user_not_found');
    await here.drain();
    assert.ok(
        here.listDeadmanSwitchesForOwner(owner.id).every((sw) => sw.status !== 'armed'),
        'no switch of the deleted owner’s stays armed'
    );
    assert.equal(await stored(extra.releaseId), undefined, 'the arm during it wrote nothing');

    // The two fired releases: erased as fired, served to the people named.
    for (const sw of [sent, pending]) {
        const row = await stored(sw.switchId);
        assert.equal(row?.status, 'triggered', 'fired, as Postgres had it');
        assert.equal(row?.released_at?.toISOString(), firedAt.toISOString(), 'releasedAt kept');
        assert.equal(row?.headline, null, 'the label gone');
        assert.notEqual(row?.encrypted_payload, '', 'the content kept');
        const copies = await storedCopies(sw.switchId);
        assert.equal(copies.find((c) => c.recipient_account_id === owner.id)?.held, false);
        assert.equal(copies.find((c) => c.recipient_account_id === sw.recipient.id)?.held, true);
        const mirrored = here.getDeadmanSwitch(sw.switchId)!;
        assert.equal(mirrored.status, 'triggered', 'the mirror took Postgres’s row');
        assert.equal(mirrored.releasedAt, firedAt.toISOString());
        assert.equal(mirrored.headline, undefined);
        assert.equal(
            releasedCopiesFor(sw.recipient.id).some((r) => r.releaseId === sw.switchId),
            true,
            'served to the person named, on this process too'
        );
        // Announced by the deletion itself, not only by the arm before it
        // (round 13: the arm's own announcement satisfied this).
        assert.ok(
            announced
                .slice(announcedBefore)
                .some(
                    (p) => p.m === 'deadmanSwitches' && p.op === 'u' && p.kv?.[0] === sw.switchId
                ),
            'announced by the deletion'
        );
    }
    // The notice sent stands; the one not yet sent still goes.
    assert.deepEqual(await noticeRows(sent.switchId), [{ status: 'sent' }]);
    deliver(here, {
        src: 'x',
        m: 'deadmanReleaseNotices',
        op: 'u',
        kv: [pending.switchId, pending.recipient.id],
    });
    await new Promise((r) => setTimeout(r, 100));
    await runDeadmanReleaseNotifier({ now: new Date(firedAt.getTime() + 1_000) });
    await here.drain();
    assert.equal(sendsFor(pending.switchId).length, 1, 'the pending notice is sent');
    assert.deepEqual(await noticeRows(pending.switchId), [{ status: 'sent' }]);
    assert.equal(sendsFor(sent.switchId).length, 0, 'the sent one is not sent again');

    // The legacy switch fired elsewhere: erased as fired, its payload kept.
    const legacyRow = await stored(legacy.id);
    assert.equal(legacyRow?.status, 'triggered');
    assert.equal(legacyRow?.encrypted_payload, 'legacy-payload');
    assert.equal(legacyRow?.headline, null);
    // The unfired release: cancelled, emptied, every copy blanked.
    const unfiredRow = await stored(unfired.switchId);
    assert.equal(unfiredRow?.status, 'cancelled');
    assert.equal(unfiredRow?.encrypted_payload, '');
    assert.equal(unfiredRow?.headline, null);
    assert.deepEqual(
        (await storedCopies(unfired.switchId)).map((c) => c.held),
        [false, false]
    );
    assert.equal(releasedCopiesFor(unfired.recipient.id).length, 0);
    // The worker, told of the deletion's writes, agrees.
    for (const sw of [sent, pending]) {
        deliver(worker, announcedFor(sw.switchId).at(-1)!);
    }
    await new Promise((r) => setTimeout(r, 100));
    for (const sw of [sent, pending]) {
        assert.equal(worker.getDeadmanSwitch(sw.switchId)?.status, 'triggered');
        assert.equal(worker.getDeadmanSwitch(sw.switchId)?.headline, undefined);
    }
    await worker.drain();
});

test('the owner’s deletion where the database does not answer, is not sent, or fails the erase: the same statement is queued and decides on Postgres’s row when it runs, this process keeps the switch as it had it meanwhile and a sweep pass here blanks nothing, so a release fired elsewhere stays fired with its copies and an unfired one is cancelled with its copies blanked', async () => {
    // Round 12 of part 2's review, on checking its own fix: where the
    // bounded erase statement was not answered, was refused at once because
    // a stall stood, or failed, the deletion fell back to this process's mirror, writing its erase whole
    // through the write-behind queue. That write landed after the statement,
    // in the switch's lane, so a release another process had fired, however
    // long before the database answered, was cancelled, emptied and its
    // recipients' copies blanked.
    const owner = await person();
    const firedOne = await armedFor(owner, 60, 'label f1');
    const firedTwo = await armedFor(owner, 60, 'label f2');
    const unfired = await armedFor(owner, 3600, 'label u');
    const worker = await otherProcess();
    const firedAt = nextMoment();
    for (const sw of [firedOne, firedTwo]) {
        assert.ok(
            await worker.advanceDeadmanSwitch(sw.switchId, worker.getDeadmanSwitch(sw.switchId)!, {
                status: 'triggered',
                releasedAt: firedAt.toISOString(),
            })
        );
    }
    await worker.drain();
    for (const sw of [firedOne, firedTwo]) {
        assert.equal(here.getDeadmanSwitch(sw.switchId)?.status, 'armed', 'not heard of here');
    }

    // The first erase statement is held past the 200 ms bound; the stall it
    // opens refuses the other two at once, unsent. All three are queued.
    here.switchStatementTimeoutMs = 200;
    let openErase!: () => void;
    const eraseGate = new Promise<void>((resolve) => {
        openErase = resolve;
    });
    const erases = intercept(
        (sql) => sql.startsWith('UPDATE deadman_switches SET headline = NULL'),
        () => eraseGate
    );
    const issued = requestAccountDeletion({ userId: owner.id })!;
    const announcedBefore = announced.length;
    let finishing: Promise<void> | undefined;
    let queued = 0;
    try {
        queued = await logged('deadman_switch_erase_queued', async () => {
            const outcome = await confirmAccountDeletion(issued.token, owner.id);
            assert.equal(outcome.kind, 'ok');
        });
        assert.equal(queued, 3, 'the three erases queued: one unanswered, two not sent');
        // Meanwhile this process keeps the switch whose erase is held as it
        // last had it, marked as an erase not yet landed, and holds no view
        // of its own of the erase (round 13 of part 2's review: it held its
        // own erase, cancelled and emptied, and a sweep pass here, whose
        // removal pass took that for a cancelled release, blanked every copy
        // of a release fired elsewhere, which then stood fired with its
        // content and nobody able to read it). A sweep pass here now blanks
        // nothing, and the switch is not served here meanwhile. (The other
        // two erases, queued in their own switches' lanes, may already have
        // landed.) The sweep pass first, so that what it does is what fails
        // where this process's view is wrong.
        await sweepOverdueDeadmanSwitches(
            new Date(firedAt.getTime() + 1_000),
            Number.MAX_SAFE_INTEGER
        );
        await new Promise((r) => setTimeout(r, 50));
        for (const sw of [firedOne, firedTwo]) {
            assert.equal(
                (await storedCopies(sw.switchId)).find(
                    (c) => c.recipient_account_id === sw.recipient.id
                )?.held,
                true,
                'a sweep pass here blanked nothing'
            );
        }
        assert.equal(here.getDeadmanSwitch(firedOne.switchId)?.status, 'armed', 'as it had it');
        assert.equal(here.getDeadmanSwitch(firedOne.switchId)?.encryptedPayload !== '', true);
        assert.equal(here.deadmanSwitchErasePending(firedOne.switchId), true, 'marked');
        assert.equal(
            releasedCopiesFor(firedOne.recipient.id).some((r) => r.releaseId === firedOne.switchId),
            false,
            'not served here while its erase is queued'
        );
        // The route's wait for this process's queued writes covers the queued
        // erases: it does not finish while the first is still held.
        let finished = false;
        finishing = finishAccountDeletion(owner.id, here).then(() => {
            finished = true;
        });
        await new Promise((r) => setTimeout(r, 300));
        assert.equal(finished, false, 'the deletion waits for its queued erases');
        openErase();
        await finishing;
        // Once the route's wait is over, the switch whose erase was not sent
        // at all is cancelled in Postgres: its queued statement was waited for.
        assert.equal((await stored(unfired.switchId))?.status, 'cancelled', 'waited for');
    } finally {
        openErase();
        restore();
        await finishing?.catch(() => undefined);
    }
    await settled();
    here.switchStatementTimeoutMs = 30_000;

    // The two releases the worker fired: fired in Postgres, as it had them.
    for (const sw of [firedOne, firedTwo]) {
        const row = await stored(sw.switchId);
        assert.equal(row?.status, 'triggered', 'still fired in Postgres');
        assert.equal(row?.released_at?.toISOString(), firedAt.toISOString(), 'releasedAt kept');
        assert.equal(row?.headline, null, 'the label gone');
        assert.notEqual(row?.encrypted_payload, '', 'the content kept');
        const copies = await storedCopies(sw.switchId);
        assert.equal(copies.find((c) => c.recipient_account_id === owner.id)?.held, false);
        assert.equal(
            copies.find((c) => c.recipient_account_id === sw.recipient.id)?.held,
            true,
            'the person’s copy held'
        );
        const mirrored = here.getDeadmanSwitch(sw.switchId)!;
        assert.equal(mirrored.status, 'triggered', 'the mirror took Postgres’s row when it landed');
        assert.equal(mirrored.releasedAt, firedAt.toISOString());
        assert.equal(
            releasedCopiesFor(sw.recipient.id).some((r) => r.releaseId === sw.switchId),
            true,
            'served to the person named'
        );
        assert.equal(here.deadmanSwitchErasePending(sw.switchId), false, 'the mark ended');
        assert.ok(
            announced
                .slice(announcedBefore)
                .some(
                    (p) => p.m === 'deadmanSwitches' && p.op === 'u' && p.kv?.[0] === sw.switchId
                ),
            'announced by the deletion'
        );
    }
    // The unfired one: cancelled, emptied, both copies blanked, in Postgres
    // and here.
    const unfiredRow = await stored(unfired.switchId);
    assert.equal(unfiredRow?.status, 'cancelled');
    assert.equal(unfiredRow?.encrypted_payload, '');
    assert.equal(unfiredRow?.headline, null);
    assert.deepEqual(
        (await storedCopies(unfired.switchId)).map((c) => c.held),
        [false, false]
    );
    assert.equal(here.getDeadmanReleaseWrap(unfired.switchId, unfired.recipient.id)?.sealedKey, '');
    assert.equal(
        (here as unknown as { stalledSwitchStatement: unknown }).stalledSwitchStatement,
        null,
        'the stall ended'
    );
    assert.ok(erases.calls() >= 4, 'the held statement and the three queued ones ran');

    // A statement that fails, and whose queued run fails once too: the
    // retry, on a fresh connection, cancels the switch and blanks its copies.
    const second = await person();
    const failing = await armedFor(second, 3600, 'label x');
    let thrown = 0;
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (sql.startsWith('UPDATE deadman_switches SET headline = NULL') && thrown < 2) {
                    thrown += 1;
                    throw new Error('Connection terminated unexpectedly');
                }
                return client.query<T>(sql, params);
            },
        };
    };
    // The erase's own retries (the account's other rows' writes can retry
    // too, for reasons of this test's seed data, and are not counted).
    let retried = 0;
    const warn = log.warn;
    log.warn = (m: string, fields?: Record<string, unknown>) => {
        if (
            m === 'db_write_behind_retry' &&
            fields?.error === 'Connection terminated unexpectedly'
        ) {
            retried += 1;
        }
        warn(m, fields as never);
    };
    try {
        const issuedTwo = requestAccountDeletion({ userId: second.id })!;
        assert.equal((await confirmAccountDeletion(issuedTwo.token, second.id)).kind, 'ok');
        await finishAccountDeletion(second.id, here);
    } finally {
        log.warn = warn;
        restore();
    }
    await settled();
    assert.equal(thrown, 2, 'the statement and the queued run’s first attempt failed');
    assert.equal(retried, 1, 'tried once more');
    const failingRow = await stored(failing.switchId);
    assert.equal(failingRow?.status, 'cancelled', 'cancelled by the retry');
    assert.equal(failingRow?.encrypted_payload, '');
    assert.deepEqual(
        (await storedCopies(failing.switchId)).map((c) => c.held),
        [false, false]
    );
    assert.equal(here.getDeadmanSwitch(failing.switchId)?.status, 'cancelled');
    assert.equal(here.getDeadmanReleaseWrap(failing.switchId, failing.recipient.id)?.sealedKey, '');
    await worker.drain();
});

test('an arm whose statement fails and whose look afterwards finds another owner’s switch with that id is 409 release_id_taken, not 201 with that owner’s view', async () => {
    // Round 12 of part 2's review, on checking its own fix: an arm whose
    // statement failed was answered as armed whenever the look afterwards
    // found a switch with the id, whoever owned it, and the route answered
    // 201 with that switch's owner's view (its label, the people it names,
    // its timing). Reached on a process not yet told of the other switch.
    const victim = await person();
    const named = await person();
    const victimEnvelope = await protocol.buildReleaseEnvelope({
        ownerKeySet: victim.keySet,
        recipients: [named.keySet.identity],
        message: 'Synthetic test text.',
    });
    const elsewhere = await otherProcess();
    const { input, copies } = switchInputFor(victimEnvelope, victim.id);
    const theirs = await elsewhere.armDeadmanSwitch(
        { ...input, headline: 'the victim’s label' },
        copies
    );
    assert.equal(theirs.kind, 'armed');
    await elsewhere.drain();
    const id = victimEnvelope.releaseId;
    assert.equal(here.getDeadmanSwitch(id), undefined, 'this process has not heard of it');

    // Another account arms an envelope of its own with the same id; its
    // statement fails at its first read, and the look afterwards finds the
    // victim's switch.
    const caller = await person();
    const callerNamed = await person();
    const callerEnvelope = await protocol.buildReleaseEnvelope({
        ownerKeySet: caller.keySet,
        recipients: [callerNamed.keySet.identity],
        message: 'Synthetic test text.',
        releaseId: id,
    });
    let thrown = 0;
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (sql.startsWith('SELECT * FROM deadman_switches WHERE id') && thrown === 0) {
                    thrown += 1;
                    throw new Error('Connection terminated unexpectedly (test)');
                }
                return client.query<T>(sql, params);
            },
        };
    };
    let res!: Response;
    try {
        res = await post(caller, '/switches', armBody(callerEnvelope, 3600));
    } finally {
        restore();
    }
    assert.equal(thrown, 1, 'the statement failed');
    const text = await res.text();
    assert.equal(res.status, 409, 'not armed');
    assert.equal((JSON.parse(text) as { code: string }).code, 'release_id_taken');
    assert.ok(!text.includes('the victim’s label'), 'nothing of the victim’s switch answered');
    assert.ok(!text.includes(named.id), 'nor whom it names');
    // The victim's switch is untouched in Postgres, and this process knows it now.
    assert.equal((await stored(id))?.status, 'armed');
    assert.equal((await stored(id))?.headline, 'the victim’s label');
    assert.deepEqual(
        (await storedCopies(id)).map((c) => c.recipient_account_id).sort(),
        [victim.id, named.id].sort()
    );
    assert.equal(here.getDeadmanSwitch(id)?.ownerId, victim.id);
    const list = await app.request('/v1/deadman/switches', { headers: auth(caller) });
    assert.deepEqual(
        ((await list.json()) as { switches: unknown[] }).switches,
        [],
        'the caller owns nothing'
    );
    here.updateDeadmanSwitch(id, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
    await elsewhere.drain();
});

test('an arm already past its checks when the owner’s deletion starts is waited for: its insert lands, the arm takes its switch back and is refused no_account, and nothing armed is left; one answered 503 whose insert lands later, and one another process armed, are erased by the deletion’s last statement in Postgres', async () => {
    // Round 13 of part 2's review: the deletion listed the owner's switches
    // from this process's mirror, which takes an arm's row only once Postgres
    // has answered, and nothing on the database side erased by owner, so an
    // arm whose insert was still being written, one answered 503 whose insert
    // landed later, and one another process armed, each stayed armed with its
    // content and every copy held, and fired at its deadline for an account
    // that was gone.
    const owner = await person();
    const named = await person();
    const envelope = await protocol.buildReleaseEnvelope({
        ownerKeySet: owner.keySet,
        recipients: [named.keySet.identity],
        message: 'Synthetic test text.',
    });
    let openInsert!: () => void;
    const insertGate = new Promise<void>((resolve) => {
        openInsert = resolve;
    });
    let reachedInsert!: () => void;
    const atInsert = new Promise<void>((resolve) => {
        reachedInsert = resolve;
    });
    intercept(
        (sql) => sql.startsWith('INSERT INTO deadman_switches'),
        async () => {
            reachedInsert();
            await insertGate;
        }
    );
    const arming = armReleaseSwitch({
        ownerId: owner.id,
        input: { checkInIntervalSeconds: 3600, gracePeriodSeconds: 0, envelope },
    });
    await atInsert;
    restore();
    const issued = requestAccountDeletion({ userId: owner.id })!;
    let confirmed = false;
    const deleting = confirmAccountDeletion(issued.token, owner.id).then((outcome) => {
        confirmed = true;
        return outcome;
    });
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(here.getUserById(owner.id), undefined, 'the account is already gone');
    assert.equal(confirmed, false, 'the deletion waits for the arm already past its checks');
    openInsert();
    const [armedOutcome, deletion] = await Promise.all([arming, deleting]);
    assert.equal(deletion.kind, 'ok');
    assert.equal(armedOutcome.kind, 'no_account', 'refused: the account went while it wrote');
    // The deletion's own writes only, not its last statement: the arm's
    // switch is already erased.
    await here.drain();
    const row = await stored(envelope.releaseId);
    assert.equal(row?.status, 'cancelled');
    assert.equal(row?.encrypted_payload, '');
    assert.deepEqual(
        (await storedCopies(envelope.releaseId)).map((c) => c.held),
        [false, false]
    );
    assert.equal(here.getDeadmanSwitch(envelope.releaseId)?.status, 'cancelled');

    // An arm answered 503 whose insert lands after the deletion, and one
    // another process armed before it heard of the deletion.
    const second = await person();
    const secondNamed = await person();
    const late = await protocol.buildReleaseEnvelope({
        ownerKeySet: second.keySet,
        recipients: [secondNamed.keySet.identity],
        message: 'Synthetic test text.',
    });
    const elsewhereEnvelope = await protocol.buildReleaseEnvelope({
        ownerKeySet: second.keySet,
        recipients: [secondNamed.keySet.identity],
        message: 'Synthetic test text.',
    });
    const elsewhere = await otherProcess();
    const fromElsewhere = switchInputFor(elsewhereEnvelope, second.id);
    assert.equal(
        (await elsewhere.armDeadmanSwitch(fromElsewhere.input, fromElsewhere.copies)).kind,
        'armed'
    );
    // And a third owner's release naming the account, armed there too: its
    // copy sealed to the account is one this process never had.
    const thirdOwner = await person();
    const naming = await protocol.buildReleaseEnvelope({
        ownerKeySet: thirdOwner.keySet,
        recipients: [second.keySet.identity],
        message: 'Synthetic test text.',
    });
    const namingInput = switchInputFor(naming, thirdOwner.id);
    assert.equal(
        (await elsewhere.armDeadmanSwitch(namingInput.input, namingInput.copies)).kind,
        'armed'
    );
    await elsewhere.drain();
    assert.equal(here.getDeadmanReleaseWrap(naming.releaseId, second.id), undefined);
    assert.equal(here.getDeadmanSwitch(elsewhereEnvelope.releaseId), undefined, 'not heard here');
    here.switchStatementTimeoutMs = 150;
    let openLate!: () => void;
    const lateGate = new Promise<void>((resolve) => {
        openLate = resolve;
    });
    intercept(
        (sql) => sql.startsWith('INSERT INTO deadman_switches'),
        () => lateGate
    );
    let finishing: Promise<void> | undefined;
    try {
        const res = await post(second, '/switches', armBody(late, 3600));
        assert.equal(res.status, 503, 'not answered in time');
        restore();
        const issuedTwo = requestAccountDeletion({ userId: second.id })!;
        assert.equal((await confirmAccountDeletion(issuedTwo.token, second.id)).kind, 'ok');
        finishing = finishAccountDeletion(second.id, here);
        await new Promise((r) => setTimeout(r, 100));
        openLate();
        await finishing;
    } finally {
        openLate();
        restore();
        await finishing?.catch(() => undefined);
        here.switchStatementTimeoutMs = 30_000;
    }
    await settled();
    for (const id of [late.releaseId, elsewhereEnvelope.releaseId]) {
        const erased = await stored(id);
        assert.equal(erased?.status, 'cancelled', 'erased by the deletion’s last statement');
        assert.equal(erased?.encrypted_payload, '');
        assert.deepEqual(
            (await storedCopies(id)).map((c) => c.held),
            [false, false]
        );
        assert.equal(here.getDeadmanSwitch(id)?.status, 'cancelled', 'taken here');
    }
    assert.deepEqual(
        (await storedCopies(naming.releaseId))
            .map((c) => [c.recipient_account_id === second.id, c.held])
            .sort(),
        [
            [false, true],
            [true, false],
        ],
        'the copy sealed to the account on another owner’s switch is blanked; the owner’s own stays'
    );
    assert.equal((await stored(naming.releaseId))?.status, 'armed', 'that switch is not touched');
    const fresh = await otherProcess();
    assert.equal(fresh.getDeadmanSwitch(late.releaseId)?.status, 'cancelled', 'and hydrated so');
    await elsewhere.drain();
    await fresh.drain();
});

test('a copy a re-seal wrote just before the owner’s deletion, still queued when the erase blanks the copies, is blanked once more after it lands: no held copy is left on the cancelled switch', async () => {
    // Round 13 of part 2's review: the erase's blanking of the copies runs in
    // the switch's lane, and a re-seal's queued copy write in the copy's own
    // lane, so the re-seal landed after the blanking and stayed held in
    // Postgres while this mirror took the blank row.
    const owner = await person();
    const sw = await armedFor(owner, 3600, 'label r');
    const wrap = here.getDeadmanReleaseWrap(sw.switchId, sw.recipient.id)!;
    let openCopy!: () => void;
    const copyGate = new Promise<void>((resolve) => {
        openCopy = resolve;
    });
    intercept(
        (sql) => sql.startsWith('INSERT INTO deadman_release_wraps'),
        () => copyGate
    );
    let outcome: Awaited<ReturnType<typeof confirmAccountDeletion>> | undefined;
    try {
        here.putDeadmanReleaseWrap({
            switchId: sw.switchId,
            recipientAccountId: sw.recipient.id,
            recipientFingerprint: wrap.recipientFingerprint,
            sealedKey: wrap.sealedKey,
            signature: wrap.signature,
        });
        await new Promise((r) => setTimeout(r, 50));
        const issued = requestAccountDeletion({ userId: owner.id })!;
        outcome = await confirmAccountDeletion(issued.token, owner.id);
    } finally {
        openCopy();
        restore();
    }
    assert.equal(outcome?.kind, 'ok');
    // The deletion's own writes only, not its last statement in Postgres.
    await here.drain();
    assert.equal((await stored(sw.switchId))?.status, 'cancelled');
    assert.deepEqual(
        (await storedCopies(sw.switchId)).map((c) => c.held),
        [false, false],
        'the re-sealed copy is blanked after it landed'
    );
    assert.equal(here.getDeadmanReleaseWrap(sw.switchId, sw.recipient.id)?.sealedKey, '');
});

test('the owner’s deletion of a switch whose row Postgres lacks (a write dropped before round 11) inserts the erased switch and erases it, and logs it', async () => {
    // Round 13 of part 2's review: no test reached this path of the erase.
    const owner = await person();
    const sw = await armedFor(owner, 3600, 'label d');
    await pg.query('DELETE FROM deadman_switches WHERE id = $1', [sw.switchId]);
    assert.equal(await stored(sw.switchId), undefined, 'the row is gone');
    const restored = await logged('deadman_switch_row_restored', async () => {
        const issued = requestAccountDeletion({ userId: owner.id })!;
        assert.equal((await confirmAccountDeletion(issued.token, owner.id)).kind, 'ok');
        await here.drain();
    });
    assert.equal(restored, 1, 'logged');
    const row = await stored(sw.switchId);
    assert.equal(row?.status, 'cancelled', 'written, erased');
    assert.equal(row?.encrypted_payload, '');
    assert.equal(row?.headline, null);
    assert.equal(here.getDeadmanSwitch(sw.switchId)?.status, 'cancelled');
});

test('a queued erase whose connection the pool refuses is tried once more and lands; one every attempt of which fails is dropped, and this process then reads the switch back as Postgres holds it, so a release fired elsewhere is served here and a sweep pass blanks nothing; where the read back fails too, this process’s sweep does not fire the switch', async () => {
    // Round 13 of part 2's review: a refused connection (the queue takes it
    // outside the erase's own retry) dropped the erase at once; and a dropped
    // erase left this process holding its own erased view for good, which its
    // removal pass took for a cancelled release.
    const owner = await person();
    const sw = await armedFor(owner, 3600, 'label q');
    await here.drain();
    let thrown = 0;
    let connects = 0;
    let refused = 0;
    pool.connect = async () => {
        connects += 1;
        if (thrown === 1 && refused === 0) {
            refused += 1;
            throw new Error('sorry, too many clients already');
        }
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (sql.startsWith('UPDATE deadman_switches SET headline = NULL') && thrown === 0) {
                    thrown += 1;
                    throw new Error('Connection terminated unexpectedly');
                }
                return client.query<T>(sql, params);
            },
        };
    };
    let landed = 0;
    let dropped = 0;
    try {
        landed = await logged('deadman_switch_erase_landed', async () => {
            dropped = await logged('db_write_behind_failed', async () => {
                const outcome = await here.eraseDeadmanSwitchUnlessFired(sw.switchId);
                assert.equal(outcome.kind, 'queued');
                await here.drain();
            });
        });
    } finally {
        restore();
    }
    assert.equal(thrown, 1, 'the statement failed');
    assert.equal(refused, 1, 'the queued erase’s connection was refused once');
    assert.equal(dropped, 0, 'not dropped');
    assert.equal(landed, 1, 'tried once more, and landed');
    assert.equal((await stored(sw.switchId))?.status, 'cancelled');
    assert.deepEqual(
        (await storedCopies(sw.switchId)).map((c) => c.held),
        [false, false]
    );
    assert.equal(here.deadmanSwitchErasePending(sw.switchId), false);
    assert.ok(connects >= 3);

    // Every attempt fails, the deletion's last statement included: dropped,
    // and read back.
    const second = await person();
    const fired = await armedFor(second, 60, 'label k');
    const unfired = await armedFor(second, 3600, 'label u');
    const worker = await otherProcess();
    const firedAt = nextMoment();
    assert.ok(
        await worker.advanceDeadmanSwitch(
            fired.switchId,
            worker.getDeadmanSwitch(fired.switchId)!,
            {
                status: 'triggered',
                releasedAt: firedAt.toISOString(),
            }
        )
    );
    await worker.drain();
    assert.equal(here.getDeadmanSwitch(fired.switchId)?.status, 'armed', 'not heard here');
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (sql.startsWith('UPDATE deadman_switches SET headline = NULL')) {
                    throw new Error('Connection terminated unexpectedly');
                }
                return client.query<T>(sql, params);
            },
        };
    };
    let droppedTwo = 0;
    try {
        droppedTwo = await logged('db_write_behind_failed', async () => {
            const issued = requestAccountDeletion({ userId: second.id })!;
            assert.equal((await confirmAccountDeletion(issued.token, second.id)).kind, 'ok');
            await finishAccountDeletion(second.id, here);
        });
    } finally {
        restore();
    }
    await settled();
    assert.ok(droppedTwo >= 2, 'both queued erases dropped');
    // The unfired one: as Postgres had it, armed, which a process that reads
    // it so fires at its deadline (the documented case where every attempt
    // to erase it fails, the deletion's last statement included).
    assert.equal((await stored(unfired.switchId))?.status, 'armed');
    assert.equal(here.getDeadmanSwitch(unfired.switchId)?.status, 'armed');
    assert.equal(here.deadmanSwitchErasePending(unfired.switchId), false, 'read back');
    // Tidy: cancel it, so the pass below and later passes in this file do
    // not fire it.
    assert.equal(
        (
            await here.updateDeadmanSwitchIf(
                unfired.switchId,
                here.getDeadmanSwitch(unfired.switchId)!,
                { status: 'cancelled', encryptedPayload: '' }
            )
        ).kind,
        'applied'
    );
    // The release fired elsewhere: read back as Postgres has it, served here,
    // and its label stays (the erase never landed).
    const mirrored = here.getDeadmanSwitch(fired.switchId)!;
    assert.equal(here.deadmanSwitchErasePending(fired.switchId), false, 'read back');
    assert.equal(mirrored.status, 'triggered');
    assert.equal(mirrored.releasedAt, firedAt.toISOString());
    assert.equal((await stored(fired.switchId))?.headline, 'label k', 'the label stays');
    assert.equal(
        releasedCopiesFor(fired.recipient.id).some((r) => r.releaseId === fired.switchId),
        true,
        'served here'
    );
    await sweepOverdueDeadmanSwitches(new Date(firedAt.getTime() + 1_000), Number.MAX_SAFE_INTEGER);
    await here.drain();
    assert.equal(
        (await storedCopies(fired.switchId)).find(
            (c) => c.recipient_account_id === fired.recipient.id
        )?.held,
        true,
        'a sweep pass here blanks nothing'
    );

    // Every attempt fails and so does the read back: the mark stays, and
    // this process's sweep does not fire the switch for the account that is
    // gone (a process that reads it from Postgres, as after a restart, has it
    // armed: the documented case).
    const third = await person();
    const stuck = await armedFor(third, 60, 'label s');
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (
                    sql.startsWith('UPDATE deadman_switches SET headline = NULL') ||
                    sql.startsWith('SELECT * FROM deadman_switches WHERE id')
                ) {
                    throw new Error('Connection terminated unexpectedly');
                }
                return client.query<T>(sql, params);
            },
        };
    };
    let unread = 0;
    try {
        unread = await logged('deadman_switch_erase_read_back_failed', async () => {
            const issued = requestAccountDeletion({ userId: third.id })!;
            assert.equal((await confirmAccountDeletion(issued.token, third.id)).kind, 'ok');
            await finishAccountDeletion(third.id, here);
        });
    } finally {
        restore();
    }
    assert.equal(unread, 1, 'the read back failed');
    assert.equal(here.deadmanSwitchErasePending(stuck.switchId), true, 'the mark stays');
    // The erase's own statement failed too, an unknown outcome: the switch
    // is read again until a read answers (round 20), which takes the row as
    // Postgres has it and leaves the mark, so what keeps the pass below from
    // firing the switch is the mark alone.
    assert.equal(statementsHeld(), true, 'the stall stands until the switch has been read');
    await readAgainNow();
    assert.equal(here.deadmanSwitchErasePending(stuck.switchId), true, 'the mark stays still');
    const due = new Date(Date.parse(here.getDeadmanSwitch(stuck.switchId)!.triggerAt) + 1_000);
    await sweepOverdueDeadmanSwitches(due, Number.MAX_SAFE_INTEGER);
    await here.drain();
    assert.equal((await stored(stuck.switchId))?.status, 'armed', 'not fired by this process');
    assert.equal(here.getDeadmanSwitch(stuck.switchId)?.status, 'armed');
    const restarted = await otherProcess();
    assert.equal(restarted.getDeadmanSwitch(stuck.switchId)?.status, 'armed', 'as Postgres has it');
    // Tidy: cancel it, so later passes in this file do not fire it.
    assert.equal(
        (
            await here.updateDeadmanSwitchIf(
                stuck.switchId,
                here.getDeadmanSwitch(stuck.switchId)!,
                {
                    status: 'cancelled',
                    encryptedPayload: '',
                }
            )
        ).kind,
        'applied'
    );
    await here.drain();
    await worker.drain();
    await restarted.drain();

    // Round 15 of part 2's review (the verifiers' `p2-d30-stale.mts` and
    // `r14v-claims` probe B): a release with no label, fired on the other
    // process and not told here, so this process still holds it armed; its
    // erase, the queued retry and the read back all fail, and the deletion's
    // last statement then runs. Its first `UPDATE` does not rewrite the row
    // (fired, no label, no refused attempt: nothing left to erase), and it
    // kept the stale armed view and the mark for good, so the release was
    // served to nobody here until a restart. Now the last statement takes a
    // row it did not rewrite where this mirror holds it marked or behind.
    const unlabelledOf = async (owner: Awaited<ReturnType<typeof person>>) => {
        const named = await person();
        const envelope = await protocol.buildReleaseEnvelope({
            ownerKeySet: owner.keySet,
            recipients: [named.keySet.identity],
            message: 'Synthetic test text.',
        });
        assert.equal(
            (
                await armReleaseSwitch({
                    ownerId: owner.id,
                    input: { checkInIntervalSeconds: 60, gracePeriodSeconds: 0, envelope },
                })
            ).kind,
            'armed'
        );
        await here.drain();
        return { named, id: envelope.releaseId };
    };
    const fourth = await person();
    const { named: quietNamed, id: quietId } = await unlabelledOf(fourth);
    // A second one of the same owner's, fired elsewhere and told here, so
    // only the mark is left behind once its erase and read back fail.
    const { id: toldId } = await unlabelledOf(fourth);
    const elsewhere = await otherProcess();
    const quietFiredAt = nextMoment();
    for (const id of [quietId, toldId]) {
        assert.ok(
            await elsewhere.advanceDeadmanSwitch(id, elsewhere.getDeadmanSwitch(id)!, {
                status: 'triggered',
                releasedAt: quietFiredAt.toISOString(),
            })
        );
    }
    await elsewhere.drain();
    deliver(here, { src: 'x', m: 'deadmanSwitches', op: 'u', kv: [toldId] });
    await until(
        () => here.getDeadmanSwitch(toldId)?.status === 'triggered',
        5_000,
        'the second told here'
    );
    assert.equal(here.getDeadmanSwitch(quietId)?.status, 'armed', 'not heard here');
    const failing = new Set([quietId, toldId]);
    let perSwitch = 0;
    let readBacks = 0;
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                // The erase of this one switch (`WHERE id = $1`) and its read
                // back fail; the last statement (`WHERE owner_id = $1`) and
                // its reads do not.
                if (
                    sql.startsWith('UPDATE deadman_switches SET headline = NULL') &&
                    sql.includes('WHERE id = $1') &&
                    failing.has(String(params?.[0]))
                ) {
                    perSwitch += 1;
                    throw new Error('Connection terminated unexpectedly (test)');
                }
                if (
                    sql.startsWith('SELECT * FROM deadman_switches WHERE id') &&
                    failing.has(String(params?.[0]))
                ) {
                    readBacks += 1;
                    throw new Error('Connection terminated unexpectedly (test)');
                }
                return client.query<T>(sql, params);
            },
        };
    };
    let quietMarked = false;
    let toldMarked = false;
    try {
        const issued = requestAccountDeletion({ userId: fourth.id })!;
        assert.equal((await confirmAccountDeletion(issued.token, fourth.id)).kind, 'ok');
        await here.drain();
        // The erase's own mark (the owner's mark, which also ends with the
        // last statement, is not what is asked here).
        const pending = (here as unknown as { erasesPending: Set<string> }).erasesPending;
        quietMarked = pending.has(quietId);
        toldMarked = pending.has(toldId);
        await finishAccountDeletion(fourth.id, here);
    } finally {
        restore();
    }
    // The first erase's statement failed and so did its read back, so the
    // stall stood from then (round 20): the second switch's statement was
    // not sent, only queued; and the first switch was read back in its lane
    // and once again at once, besides each dropped erase's own read back.
    assert.equal(statementsHeld(), true, 'the stall stands until the first switch has been read');
    await readAgainNow();
    await settled();
    assert.equal(
        perSwitch,
        5,
        'the first erase, and each one’s queued attempt and its retry, all failed'
    );
    assert.equal(
        readBacks,
        4,
        'and each read back: the failed statement’s two, each dropped erase’s'
    );
    assert.equal(quietMarked, true, 'marked before the last statement');
    assert.equal(toldMarked, true);
    assert.equal(
        here.deadmanSwitchErasePending(toldId),
        false,
        'the last statement ends the mark of a switch this mirror already had as Postgres has it'
    );
    assert.equal(here.getDeadmanSwitch(toldId)?.status, 'triggered');
    const quietRow = await stored(quietId);
    assert.equal(quietRow?.status, 'triggered', 'fired in Postgres, and kept');
    assert.equal(quietRow?.released_at?.toISOString(), quietFiredAt.toISOString());
    assert.equal(
        here.deadmanSwitchErasePending(quietId),
        false,
        'the last statement ends the mark'
    );
    assert.equal(here.getDeadmanSwitch(quietId)?.status, 'triggered', 'taken as Postgres has it');
    assert.equal(here.getDeadmanSwitch(quietId)?.releasedAt, quietFiredAt.toISOString());
    assert.ok(
        releasedCopiesFor(quietNamed.id).some((r) => r.releaseId === quietId),
        'served here to the person it named'
    );
    // And without any mark: a view behind a trigger elsewhere is taken by the
    // last statement on its status alone (the store's method called directly,
    // since every switch the deletion lists has had its own statement first).
    const fifth = await person();
    const { named: behindNamed, id: behindId } = await unlabelledOf(fifth);
    const third2 = await otherProcess();
    assert.ok(
        await third2.advanceDeadmanSwitch(behindId, third2.getDeadmanSwitch(behindId)!, {
            status: 'triggered',
            releasedAt: quietFiredAt.toISOString(),
        })
    );
    await third2.drain();
    assert.equal(here.getDeadmanSwitch(behindId)?.status, 'armed', 'not heard here');
    assert.equal(here.deadmanSwitchErasePending(behindId), false, 'and not marked');
    await here.eraseDeadmanSwitchesOfDeletedOwner(fifth.id);
    assert.equal(here.getDeadmanSwitch(behindId)?.status, 'triggered', 'taken on its status');
    assert.ok(releasedCopiesFor(behindNamed.id).some((r) => r.releaseId === behindId));
    await elsewhere.drain();
    await third2.drain();
});

test('the removal pass blanks a cancelled release switch’s copies only where Postgres has it cancelled: a view of it as cancelled that is behind a trigger blanks nothing, and the view is refreshed', async () => {
    // Round 13 of part 2's review: the pass blanked them through plain writes
    // from this process's view.
    const owner = await person();
    const sw = await armedFor(owner, 60, 'label v');
    const worker = await otherProcess();
    const firedAt = nextMoment();
    assert.ok(
        await worker.advanceDeadmanSwitch(sw.switchId, worker.getDeadmanSwitch(sw.switchId)!, {
            status: 'triggered',
            releasedAt: firedAt.toISOString(),
        })
    );
    await worker.drain();
    // This process's view: cancelled and emptied, behind Postgres's trigger.
    const switches = (here as unknown as { deadmanSwitches: Map<string, DeadmanSwitchRow> })
        .deadmanSwitches;
    switches.set(sw.switchId, {
        ...switches.get(sw.switchId)!,
        status: 'cancelled',
        encryptedPayload: '',
    });
    const behind = await logged('deadman_cancelled_view_behind', async () => {
        await removeExpiredReleases(new Date(firedAt.getTime() + 1_000));
    });
    await here.drain();
    assert.equal(behind, 1, 'logged');
    assert.deepEqual(
        (await storedCopies(sw.switchId)).map((c) => c.held),
        [true, true],
        'nothing blanked'
    );
    assert.equal(here.getDeadmanSwitch(sw.switchId)?.status, 'triggered', 'the view refreshed');
    await worker.drain();
});

test('an arm whose statement fails and whose look afterwards finds the same owner’s cancelled switch with that id is 409 release_id_taken, as the same request is without the failure, not 201', async () => {
    // Round 13 of part 2's review: the look compared the owner alone.
    const owner = await person();
    const named = await person();
    const envelope = await protocol.buildReleaseEnvelope({
        ownerKeySet: owner.keySet,
        recipients: [named.keySet.identity],
        message: 'Synthetic test text.',
    });
    const elsewhere = await otherProcess();
    const { input, copies } = switchInputFor(envelope, owner.id);
    assert.equal((await elsewhere.armDeadmanSwitch(input, copies)).kind, 'armed');
    const cancelled = await elsewhere.updateDeadmanSwitchIf(
        envelope.releaseId,
        elsewhere.getDeadmanSwitch(envelope.releaseId)!,
        { status: 'cancelled', encryptedPayload: '' }
    );
    assert.equal(cancelled.kind, 'applied');
    await elsewhere.drain();
    assert.equal(here.getDeadmanSwitch(envelope.releaseId), undefined, 'not heard here');
    let thrown = 0;
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (sql.startsWith('SELECT * FROM deadman_switches WHERE id') && thrown === 0) {
                    thrown += 1;
                    throw new Error('Connection terminated unexpectedly (test)');
                }
                return client.query<T>(sql, params);
            },
        };
    };
    let res!: Response;
    try {
        res = await post(owner, '/switches', armBody(envelope, 3600));
    } finally {
        restore();
    }
    assert.equal(thrown, 1, 'the statement failed');
    assert.equal(res.status, 409, 'not armed');
    assert.equal(((await res.json()) as { code: string }).code, 'release_id_taken');
    assert.equal((await stored(envelope.releaseId))?.status, 'cancelled');
    const control = await post(owner, '/switches', armBody(envelope, 3600));
    assert.equal(control.status, 409, 'the same request without the failure');
    await elsewhere.drain();
});

test('an account that owns a switch, deleted while a notice to it is being sent: the notice ends failed recipient_gone with no room or send recorded, since the account and its notices are gone before the deletion awaits its switch’s statement', async () => {
    // Round 13 of part 2's review: the account's copies and notices and its
    // row waited behind the switches' statements, so a send that answered
    // while the account's own switch statement was on its way found the
    // account and the row as they were and recorded the notice sent.
    const owner = await person();
    const account = await armedFor(owner, 60, 'label n');
    const deleted = account.recipient;
    // The account owns a switch of its own, so its deletion awaits a statement.
    await armedFor(deleted, 3600, 'label own');
    const at = nextMoment();
    const fired = await recordReleaseTrigger(here.getDeadmanSwitch(account.switchId)!, at);
    assert.ok(fired, 'fired');
    await here.drain();
    let openSend!: () => void;
    const sendGate = new Promise<void>((resolve) => {
        openSend = resolve;
    });
    let parked = 0;
    let answered = false;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
            typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('/send/') && url.includes(account.switchId) && parked === 0) {
            parked += 1;
            await sendGate;
            const res = await matrix.fetch(input, init);
            answered = true;
            return res;
        }
        return matrix.fetch(input, init);
    }) as typeof fetch;
    let tick: ReturnType<typeof runDeadmanReleaseNotifier> | undefined;
    try {
        tick = runDeadmanReleaseNotifier({ now: at });
        for (let i = 0; i < 300 && parked === 0; i += 1) {
            await new Promise((r) => setTimeout(r, 10));
        }
        assert.equal(parked, 1, 'the send is on its way');
        // The deletion starts; while its own switch's statement is on its
        // way, the parked send answers and the notifier records what it did
        // (the tick itself then waits for the queue, which the held
        // statement is in, so it ends after).
        let noticeWhileHeld: string | undefined;
        let copyWhileHeld: string | undefined;
        intercept(
            (sql) => sql.startsWith('UPDATE deadman_switches SET headline = NULL'),
            async () => {
                // The account's copy is already blanked: everything but the
                // switches goes before the first await.
                copyWhileHeld = here.getDeadmanReleaseWrap(account.switchId, deleted.id)?.sealedKey;
                openSend();
                for (let i = 0; i < 300 && !answered; i += 1) {
                    await new Promise((r) => setTimeout(r, 10));
                }
                await new Promise((r) => setTimeout(r, 300));
                noticeWhileHeld = here.getDeadmanReleaseNotice(
                    account.switchId,
                    deleted.id
                )?.status;
            }
        );
        const issued = requestAccountDeletion({ userId: deleted.id })!;
        assert.equal((await confirmAccountDeletion(issued.token, deleted.id)).kind, 'ok');
        restore();
        assert.equal(answered, true, 'the send answered while the statement was held');
        assert.equal(noticeWhileHeld, 'failed', 'and the notice was already ended then');
        assert.equal(copyWhileHeld, '', 'the copy sealed to the account went before the await');
        await finishAccountDeletion(deleted.id, here);
        await tick;
    } finally {
        openSend();
        restore();
        globalThis.fetch = realFetch;
        await tick?.catch(() => undefined);
    }
    await here.drain();
    const notice = here.getDeadmanReleaseNotice(account.switchId, deleted.id)!;
    assert.equal(notice.status, 'failed');
    assert.equal(notice.lastError, 'recipient_gone');
    assert.equal(notice.roomId, undefined);
    assert.equal(notice.sentAt, undefined);
    const rows = (
        await pg.query(
            'SELECT status, last_error, room_id, sent_at FROM deadman_release_notices ' +
                'WHERE switch_id = $1 AND recipient_account_id = $2',
            [account.switchId, deleted.id]
        )
    ).rows as Array<{
        status: string;
        last_error: string;
        room_id: string | null;
        sent_at: Date | null;
    }>;
    assert.deepEqual(rows, [
        { status: 'failed', last_error: 'recipient_gone', room_id: null, sent_at: null },
    ]);
});

// ---------------------------------------------------------------------------
// Round 14 of part 2's review: decision 31 (the operator's choice of
// 2026-11-02) and the round-13 verdicts.

/** `owner_attempt_refused_at` as Postgres has it: a Date, or null. */
const columnOf = async (switchId: string): Promise<Date | null> =>
    (
        (
            await pg.query('SELECT owner_attempt_refused_at FROM deadman_switches WHERE id = $1', [
                switchId,
            ])
        ).rows[0] as { owner_attempt_refused_at: Date | null }
    ).owner_attempt_refused_at;
/** Wait, polling, until `ok` holds; fails after `ms`. */
const until = async (ok: () => boolean, ms = 5_000, what = 'the condition'): Promise<void> => {
    const started = Date.now();
    while (!ok()) {
        if (Date.now() - started > ms) throw new Error(`timed out waiting for ${what}`);
        await new Promise((r) => setTimeout(r, 10));
    }
};
/** This process forgets a switch and its copies, as a process never told of their arm would be. */
const forget = (switchId: string) => {
    const maps = here as unknown as {
        deadmanSwitches: Map<string, unknown>;
        deadmanReleaseWraps: Map<string, { switchId: string }>;
    };
    maps.deadmanSwitches.delete(switchId);
    for (const [key, wrap] of [...maps.deadmanReleaseWraps.entries()]) {
        if (wrap.switchId === switchId) maps.deadmanReleaseWraps.delete(key);
    }
};

test('a check-in refused unanswered is carried into the switch’s row on a connection of its own, while this process’s stall still stands (decision 31, round 16): the column is set in Postgres and in every mirror, this process’s note ends, and a sweep that knows nothing but the row gives the window at the deadline; a landed check-in clears it', async () => {
    // Round 14 of part 2's review, the operator's choice of 2026-11-02: until
    // then the refusal was noted in the refusing process alone, so in the
    // deployed layout (the API process refuses, the worker sweeps) a check-in
    // refused during a database outage that ended before the deadline never
    // held the switch back, and it fired unless the owner checked in again.
    await armed(60); // due at the pass: its move is the statement held
    const mine = await armed(3600);
    const deadline = new Date(here.getDeadmanSwitch(mine.switchId)!.triggerAt);
    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
        open = resolve;
    });
    here.switchStatementTimeoutMs = 200;
    const statements = intercept(
        (sql) => isSwitchUpdate(sql) && !isCarry(sql),
        () => gate
    );
    const announcedBefore = announcedFor(mine.switchId).length;
    let before = 0;
    let after = 0;
    let carried = 0;
    try {
        assert.equal(
            await sweepOverdueDeadmanSwitches(new Date(Date.now() + 120_000), 15 * 60_000),
            0
        );
        assert.equal(statements.calls(), 1, 'the stall stands');
        carried = await logged('deadman_owner_attempt_carried', async () => {
            before = Date.now();
            const refused = await post(mine.owner, `/switches/${mine.switchId}/check-in`);
            after = Date.now();
            assert.equal(refused.status, 503);
            assert.equal(
                statements.calls(),
                1,
                'the check-in’s statement not sent during the stall'
            );
            // Round 16 of part 2's review: the carry is not held back by the
            // stall (it was, so while this process's stalled statement waited
            // nothing was carried, with the database answering every other
            // connection, and the worker fired the switch at its deadline).
            await until(
                () => here.ownerWriteUnansweredAt(mine.switchId) === undefined,
                5_000,
                'the carry while the stall stands'
            );
        });
        assert.equal(
            here.switchStatementsStalledBetween(Date.now(), Date.now()),
            true,
            'carried while the stall still stands'
        );
    } finally {
        open();
        restore();
    }
    await settled();
    here.switchStatementTimeoutMs = 30_000;
    assert.equal(carried, 1);
    const column = await columnOf(mine.switchId);
    assert.ok(column instanceof Date, 'the column is set');
    assert.ok(
        column.getTime() >= before && column.getTime() <= after,
        'to the attempt’s moment, not the refusal’s'
    );
    assert.equal(here.getDeadmanSwitch(mine.switchId)?.ownerAttemptRefusedAt, column.toISOString());
    assert.ok(
        announcedFor(mine.switchId).length > announcedBefore,
        'announced to the other processes'
    );
    const worker = await otherProcess();
    assert.equal(
        worker.getDeadmanSwitch(mine.switchId)?.ownerAttemptRefusedAt,
        column.toISOString(),
        'a fresh process hydrates it'
    );
    // The sweep at the deadline, five minutes late within a 15-minute
    // tolerance, in a process that knows nothing but the row: this one's note
    // is gone, and its stall was long before the deadline, so only the column
    // can hold the switch.
    const late = new Date(deadline.getTime() + 5 * 60_000);
    assert.equal(here.ownerWriteUnansweredAt(mine.switchId), undefined);
    assert.equal(here.switchStatementsStalledBetween(deadline.getTime(), late.getTime()), false);
    await sweepOverdueDeadmanSwitches(late, 15 * 60_000);
    await here.drain();
    const row = await stored(mine.switchId);
    assert.equal(row?.status, 'grace', 'the backlog window, not the trigger');
    assert.equal(row?.released_at, null);
    assert.equal(row?.backlog_grace_started_at?.toISOString(), late.toISOString());
    assert.equal(
        (await columnOf(mine.switchId))?.toISOString(),
        column.toISOString(),
        'the window keeps the record of the attempt'
    );
    // The owner's check-in lands: the column goes with the window.
    const checkIn = await post(mine.owner, `/switches/${mine.switchId}/check-in`);
    assert.equal(checkIn.status, 200);
    await here.drain();
    const armedAgain = await stored(mine.switchId);
    assert.equal(armedAgain?.status, 'armed');
    assert.equal(armedAgain?.backlog_grace_started_at, null);
    assert.equal(await columnOf(mine.switchId), null, 'cleared by the landed check-in');
    assert.equal(here.getDeadmanSwitch(mine.switchId)?.ownerAttemptRefusedAt, undefined);
    assert.equal(
        exportUserData(mine.owner.id)?.deadmanSwitches.find((s) => s.id === mine.switchId)
            ?.ownerAttemptRefusedAt,
        undefined
    );
    here.updateDeadmanSwitch(mine.switchId, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
    await worker.drain();
});

test('a refused attempt older than the switch’s last landed check-in holds nothing: the sweep fires at the deadline and the trigger clears the column', async () => {
    const sw = await armed(60);
    const last = Date.parse(here.getDeadmanSwitch(sw.switchId)!.lastCheckInAt);
    const older = new Date(last - 60_000).toISOString();
    await pg.query('UPDATE deadman_switches SET owner_attempt_refused_at = $2 WHERE id = $1', [
        sw.switchId,
        older,
    ]);
    deliver(here, { src: 'x', m: 'deadmanSwitches', op: 'u', kv: [sw.switchId] });
    await until(
        () => here.getDeadmanSwitch(sw.switchId)?.ownerAttemptRefusedAt === older,
        5_000,
        'the refresh'
    );
    const deadline = Date.parse(here.getDeadmanSwitch(sw.switchId)!.triggerAt);
    await sweepOverdueDeadmanSwitches(new Date(deadline + 5_000), 15 * 60_000);
    await here.drain();
    const row = await stored(sw.switchId);
    assert.equal(row?.status, 'triggered', 'judged on the check-in, the owner’s later word');
    assert.ok(row?.released_at);
    assert.equal(await columnOf(sw.switchId), null, 'the trigger clears it');
    assert.equal(here.getDeadmanSwitch(sw.switchId)?.ownerAttemptRefusedAt, undefined);
});

test('a carry that fails keeps this process’s note, and the next switch statement the database answers on this process tries it again, before the retry timer would', async () => {
    const mine = await armed(3600);
    const other = await armed(3600);
    // The retry timer is a minute away: only the other owner's answered
    // check-in can be what tries the carry again.
    here.carryRetryMs = 60_000;
    let thrown = 0;
    let carries = 0;
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (isSwitchUpdate(sql) && !isCarry(sql) && thrown === 0) {
                    thrown += 1;
                    throw new Error('Connection terminated unexpectedly (test)');
                }
                if (isCarry(sql)) {
                    carries += 1;
                    if (carries === 1) throw new Error('Connection terminated unexpectedly (test)');
                }
                return client.query<T>(sql, params);
            },
        };
    };
    let failed = 0;
    let carried = 0;
    try {
        failed = await logged('deadman_owner_attempt_carry_failed', async () => {
            assert.equal(
                (await post(mine.owner, `/switches/${mine.switchId}/check-in`)).status,
                503
            );
            await until(() => carries >= 1, 5_000, 'the carry’s attempt');
            await new Promise((r) => setTimeout(r, 50));
        });
        assert.equal(failed, 1, 'logged');
        assert.ok(here.ownerWriteUnansweredAt(mine.switchId), 'the note is kept');
        assert.equal(await columnOf(mine.switchId), null);
        // The next answer: another owner's check-in applied on this process.
        carried = await logged('deadman_owner_attempt_carried', async () => {
            assert.equal(
                (await post(other.owner, `/switches/${other.switchId}/check-in`)).status,
                200
            );
            await until(
                () => here.ownerWriteUnansweredAt(mine.switchId) === undefined,
                5_000,
                'the second carry'
            );
            await settled();
        });
    } finally {
        restore();
        here.carryRetryMs = 10_000;
    }
    assert.equal(carried, 1);
    assert.equal(carries, 2, 'tried once more');
    assert.ok((await columnOf(mine.switchId)) instanceof Date, 'carried at the next answer');
    assert.equal(
        here.getDeadmanSwitch(mine.switchId)?.ownerAttemptRefusedAt,
        (await columnOf(mine.switchId))?.toISOString()
    );
    for (const sw of [mine, other]) {
        here.updateDeadmanSwitch(sw.switchId, { status: 'cancelled', encryptedPayload: '' });
    }
    await here.drain();
});

test('the column never moves a switch that fired or was cancelled, and a check-in that landed elsewhere outranks the refused attempt: the carry is refused and the note ends; a cancel clears a column set', async () => {
    await armed(60); // due at the pass: its move is the statement held
    const fired = await armed(3600);
    const checkedIn = await armed(3600);
    const cancelled = await armed(3600);
    const worker = await otherProcess();
    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
        open = resolve;
    });
    here.switchStatementTimeoutMs = 200;
    const statements = interceptHoldingCarries(gate);
    const firedAt = nextMoment();
    try {
        assert.equal(
            await sweepOverdueDeadmanSwitches(new Date(Date.now() + 120_000), 15 * 60_000),
            0
        );
        assert.equal(statements.calls(), 1);
        for (const sw of [fired, checkedIn, cancelled]) {
            assert.equal((await post(sw.owner, `/switches/${sw.switchId}/check-in`)).status, 503);
            assert.ok(here.ownerWriteUnansweredAt(sw.switchId));
        }
        // Meanwhile, on another process: one fires, another's owner checks in,
        // and the third is cancelled there (its last check-in unchanged, so
        // only the status condition refuses the carry: round 14's check that
        // the cancelled status is refused on its own).
        assert.ok(
            await worker.advanceDeadmanSwitch(
                fired.switchId,
                worker.getDeadmanSwitch(fired.switchId)!,
                { status: 'triggered', releasedAt: firedAt.toISOString() }
            )
        );
        checkInOn(worker, checkedIn.switchId, new Date());
        worker.updateDeadmanSwitch(cancelled.switchId, {
            status: 'cancelled',
            encryptedPayload: '',
        });
        await worker.drain();
    } finally {
        open();
        restore();
    }
    const notCarried = await logged('deadman_owner_attempt_not_carried', async () => {
        await until(
            () =>
                here.ownerWriteUnansweredAt(fired.switchId) === undefined &&
                here.ownerWriteUnansweredAt(checkedIn.switchId) === undefined &&
                here.ownerWriteUnansweredAt(cancelled.switchId) === undefined,
            5_000,
            'the three carries refused'
        );
        await settled();
    });
    here.switchStatementTimeoutMs = 30_000;
    assert.equal(notCarried, 3, 'Postgres refused all three, and the three notes ended');
    assert.equal(await columnOf(fired.switchId), null, 'a fired switch takes no column');
    assert.equal(await columnOf(cancelled.switchId), null, 'a cancelled switch takes none either');
    assert.equal((await stored(cancelled.switchId))?.status, 'cancelled');
    assert.equal((await stored(fired.switchId))?.status, 'triggered');
    assert.equal((await stored(fired.switchId))?.released_at?.toISOString(), firedAt.toISOString());
    assert.equal(
        await columnOf(checkedIn.switchId),
        null,
        'a check-in landed since: the owner’s later word'
    );
    assert.notEqual(
        (await stored(checkedIn.switchId))?.last_check_in_at.toISOString(),
        here.getDeadmanSwitch(checkedIn.switchId)?.lastCheckInAt,
        'the landed check-in is not in this mirror yet, and still won'
    );
    // A column set on a fired switch moves nothing: terminal is terminal.
    await pg.query('UPDATE deadman_switches SET owner_attempt_refused_at = now() WHERE id = $1', [
        fired.switchId,
    ]);
    deliver(here, { src: 'x', m: 'deadmanSwitches', op: 'u', kv: [fired.switchId] });
    await until(
        () => here.getDeadmanSwitch(fired.switchId)?.ownerAttemptRefusedAt !== undefined,
        5_000,
        'the refresh'
    );
    await sweepOverdueDeadmanSwitches(new Date(firedAt.getTime() + 24 * 3_600_000), 15 * 60_000);
    await here.drain();
    assert.equal((await stored(fired.switchId))?.status, 'triggered');
    assert.equal((await stored(fired.switchId))?.released_at?.toISOString(), firedAt.toISOString());
    // A column set on a switch the owner then cancels goes with the cancel.
    const toCancel = await armed(3600);
    await pg.query('UPDATE deadman_switches SET owner_attempt_refused_at = now() WHERE id = $1', [
        toCancel.switchId,
    ]);
    deliver(here, { src: 'x', m: 'deadmanSwitches', op: 'u', kv: [toCancel.switchId] });
    await until(
        () => here.getDeadmanSwitch(toCancel.switchId)?.ownerAttemptRefusedAt !== undefined,
        5_000,
        'the refresh'
    );
    assert.equal((await post(toCancel.owner, `/switches/${toCancel.switchId}/cancel`)).status, 200);
    await here.drain();
    assert.equal(await columnOf(toCancel.switchId), null, 'cleared by the cancel');
    assert.equal(here.getDeadmanSwitch(toCancel.switchId)?.ownerAttemptRefusedAt, undefined);
    for (const sw of [checkedIn, cancelled]) {
        deliver(here, { src: 'x', m: 'deadmanSwitches', op: 'u', kv: [sw.switchId] });
    }
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(here.getDeadmanSwitch(cancelled.switchId)?.status, 'cancelled');
    here.updateDeadmanSwitch(checkedIn.switchId, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
    await worker.drain();
});

test('the deleting process’s own sweep starts no move of the owner’s switches until the deletion’s last statement over them has answered: one due while an earlier switch’s erase statement is held is not fired here, nor one read back armed after its erase was dropped, and the deletion then cancels each', async () => {
    // Round 14 of part 2's review: the sweep skipped only a switch whose erase
    // was queued; one listed but not yet reached, with the owner's row already
    // gone from this mirror, was fired at its deadline during the deletion's
    // awaits, then erased as fired and served (the verifiers' `d30-r13b.mts`
    // E and E2).
    const owner = await person();
    const s1 = await armedFor(owner, 3600, 'label e1');
    const s2 = await armedFor(owner, 60, 'label e2');
    assert.deepEqual(
        here.listDeadmanSwitchesForOwner(owner.id).map((s) => s.id),
        [s1.switchId, s2.switchId],
        'S1 is listed first'
    );
    const due = new Date(Date.parse(here.getDeadmanSwitch(s2.switchId)!.releaseAt) + 1_000);
    const seen: Record<string, unknown> = {};
    let done = false;
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (
                    !done &&
                    sql.startsWith('UPDATE deadman_switches SET headline = NULL') &&
                    params?.[0] === s1.switchId
                ) {
                    done = true;
                    seen.userGone = here.getUserById(owner.id) === undefined;
                    seen.marked = here.deadmanSwitchErasePending(s2.switchId);
                    seen.swept = await sweepOverdueDeadmanSwitches(due, Number.MAX_SAFE_INTEGER);
                    seen.s2 = (await stored(s2.switchId))?.status;
                    seen.s2Mirror = here.getDeadmanSwitch(s2.switchId)?.status;
                }
                return client.query<T>(sql, params);
            },
        };
    };
    const issued = requestAccountDeletion({ userId: owner.id })!;
    try {
        assert.equal((await confirmAccountDeletion(issued.token, owner.id)).kind, 'ok');
    } finally {
        restore();
    }
    assert.equal(done, true, 'S1’s erase statement was held');
    assert.equal(seen.userGone, true, 'the owner’s row was already gone from this mirror');
    assert.equal(seen.marked, true, 'the owner’s deletion holds this sweep off S2');
    assert.equal(seen.s2, 'armed', 'not fired by this process’s sweep during the deletion');
    assert.equal(seen.s2Mirror, 'armed');
    assert.equal(
        here.deadmanSwitchErasePending(s2.switchId),
        true,
        'the mark stays once every listed switch has had its statement (round 15)'
    );
    await finishAccountDeletion(owner.id, here);
    assert.equal(
        here.deadmanSwitchErasePending(s2.switchId),
        false,
        'and ends once the last statement over the owner’s switches has answered'
    );
    await settled();
    const row = await stored(s2.switchId);
    assert.equal(row?.status, 'cancelled', 'the deletion then cancelled it');
    assert.equal(row?.released_at, null);
    assert.deepEqual(
        (await storedCopies(s2.switchId)).map((c) => c.held),
        [false, false]
    );
    assert.equal(releasedCopiesFor(s2.recipient.id).length, 0, 'served to nobody');
    assert.deepEqual(await noticeRows(s2.switchId), []);

    // Round 15 of part 2's review (the verifiers' `r14v-claims` probe C): the
    // mark ended with the per-switch loop. A switch whose erase failed three
    // times and was then read back armed (Postgres's row, which ends the
    // queued erase's own mark) was fired by this process's sweep at its
    // deadline before the deletion's last statement ran, for the account
    // that was gone. Now the mark lasts until that statement has answered.
    const second = await person();
    const s3 = await armedFor(second, 60, 'label c');
    let erases = 0;
    const atLast: Record<string, unknown> = {};
    let lastSeen = false;
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (
                    sql.startsWith('UPDATE deadman_switches SET headline = NULL') &&
                    sql.includes('WHERE id = $1') &&
                    params?.[0] === s3.switchId
                ) {
                    erases += 1;
                    throw new Error('Connection terminated unexpectedly (test)');
                }
                if (
                    !lastSeen &&
                    sql.startsWith('UPDATE deadman_switches SET headline = NULL') &&
                    sql.includes('WHERE owner_id = $1') &&
                    params?.[0] === second.id
                ) {
                    // Just before the last statement: a pass at the deadline.
                    lastSeen = true;
                    atLast.mirror = here.getDeadmanSwitch(s3.switchId)?.status;
                    atLast.marked = here.deadmanSwitchErasePending(s3.switchId);
                    const due = new Date(
                        Date.parse(here.getDeadmanSwitch(s3.switchId)!.triggerAt) + 1_000
                    );
                    atLast.swept = await sweepOverdueDeadmanSwitches(due, Number.MAX_SAFE_INTEGER);
                    atLast.postgres = (await stored(s3.switchId))?.status;
                }
                return client.query<T>(sql, params);
            },
        };
    };
    try {
        const issued2 = requestAccountDeletion({ userId: second.id })!;
        assert.equal((await confirmAccountDeletion(issued2.token, second.id)).kind, 'ok');
        await finishAccountDeletion(second.id, here);
    } finally {
        restore();
    }
    await settled();
    assert.equal(erases, 3, 'the erase, its queued attempt and the retry all failed');
    assert.equal(lastSeen, true);
    assert.equal(atLast.mirror, 'armed', 'read back armed, as Postgres had it');
    assert.equal(atLast.marked, true, 'still marked when the pass ran');
    assert.equal(atLast.postgres, 'armed', 'not fired by this process’s sweep');
    const s3Row = await stored(s3.switchId);
    assert.equal(s3Row?.status, 'cancelled', 'the last statement then cancelled it');
    assert.equal(s3Row?.released_at, null);
    assert.equal(releasedCopiesFor(s3.recipient.id).length, 0);
    assert.deepEqual(await noticeRows(s3.switchId), []);
    assert.equal(here.deadmanSwitchErasePending(s3.switchId), false);
});

test('the deletion’s last statement takes every switch of the owner’s and every copy of theirs into this mirror: a release that fired on another process and that this process never had is served here from then on, and a switch with nothing left to erase is neither rewritten nor announced', async () => {
    // Round 14 of part 2's review (the verifiers' `d30-r13c.mts` I2'): the
    // last statement put the fired row into the mirror with the copies it had
    // blanked, the owner's alone, never the recipients' held ones, so
    // `GET /v1/deadman/releases` on the deleting process listed nothing until
    // it restarted. And its first statement rewrote every row of the owner's,
    // long-cancelled ones included, taking and announcing each.
    const owner = await person();
    await armedFor(owner, 3600, 'label i1');
    const gone = await armedFor(owner, 60, 'label i3');
    const spentNamed = await person();
    const spentEnvelope = await protocol.buildReleaseEnvelope({
        ownerKeySet: owner.keySet,
        recipients: [spentNamed.keySet.identity],
        message: 'Synthetic test text.',
    });
    assert.equal(
        (
            await armReleaseSwitch({
                ownerId: owner.id,
                input: {
                    checkInIntervalSeconds: 3600,
                    gracePeriodSeconds: 0,
                    envelope: spentEnvelope,
                },
            })
        ).kind,
        'armed'
    );
    // No label, cancelled through the route: nothing of it is left to erase.
    assert.equal((await post(owner, `/switches/${spentEnvelope.releaseId}/cancel`)).status, 200);
    // And a fired switch with no label, which this process never had either:
    // the last statement's erase changes nothing of it, and it goes into the
    // mirror all the same, announced to nobody.
    const quietNamed = await person();
    const quietEnvelope = await protocol.buildReleaseEnvelope({
        ownerKeySet: owner.keySet,
        recipients: [quietNamed.keySet.identity],
        message: 'Synthetic test text.',
    });
    assert.equal(
        (
            await armReleaseSwitch({
                ownerId: owner.id,
                input: {
                    checkInIntervalSeconds: 60,
                    gracePeriodSeconds: 0,
                    envelope: quietEnvelope,
                },
            })
        ).kind,
        'armed'
    );
    // And two more this process never had, each carrying a refused attempt of
    // the owner's in Postgres (decision 31, carried by another process): one
    // armed, which the last statement cancels, and one cancelled with nothing
    // else left, which it rewrites for that column alone (round 14's checks
    // that the last statement erases the column, and that its narrowed
    // `WHERE` still reaches a row whose only remnant is the column).
    const unlabelled = async (checkInIntervalSeconds: number) => {
        const named = await person();
        const envelope = await protocol.buildReleaseEnvelope({
            ownerKeySet: owner.keySet,
            recipients: [named.keySet.identity],
            message: 'Synthetic test text.',
        });
        const outcome = await armReleaseSwitch({
            ownerId: owner.id,
            input: { checkInIntervalSeconds, gracePeriodSeconds: 0, envelope },
        });
        assert.equal(outcome.kind, 'armed');
        return envelope.releaseId;
    };
    const refusedArmed = await unlabelled(3600);
    const refusedSpent = await unlabelled(3600);
    assert.equal((await post(owner, `/switches/${refusedSpent}/cancel`)).status, 200);
    // And two cancelled ones this process never had, each with one remnant
    // only: content left behind, or a backlog window (round 15 of part 2's
    // review: the clauses of the narrowed `WHERE` that reach each were
    // untested alone).
    const leftContent = await unlabelled(3600);
    const leftWindow = await unlabelled(3600);
    for (const id of [leftContent, leftWindow]) {
        assert.equal((await post(owner, `/switches/${id}/cancel`)).status, 200);
    }
    await here.drain();
    forget(leftContent);
    forget(leftWindow);
    await pg.query("UPDATE deadman_switches SET encrypted_payload = 'left behind' WHERE id = $1", [
        leftContent,
    ]);
    await pg.query('UPDATE deadman_switches SET backlog_grace_started_at = now() WHERE id = $1', [
        leftWindow,
    ]);
    const worker = await otherProcess();
    forget(gone.switchId);
    forget(quietEnvelope.releaseId);
    for (const id of [refusedArmed, refusedSpent]) {
        forget(id);
        await pg.query(
            'UPDATE deadman_switches SET owner_attempt_refused_at = now() WHERE id = $1',
            [id]
        );
        assert.ok((await columnOf(id)) instanceof Date);
    }
    assert.equal(here.getDeadmanSwitch(gone.switchId), undefined);
    assert.equal(here.listDeadmanReleaseWraps(gone.switchId).length, 0);
    assert.equal(here.getDeadmanSwitch(quietEnvelope.releaseId), undefined);
    const firedAt = nextMoment();
    for (const id of [gone.switchId, quietEnvelope.releaseId]) {
        assert.ok(
            await worker.advanceDeadmanSwitch(id, worker.getDeadmanSwitch(id)!, {
                status: 'triggered',
                releasedAt: firedAt.toISOString(),
            })
        );
    }
    worker.createDeadmanReleaseNotice({
        switchId: gone.switchId,
        recipientAccountId: gone.recipient.id,
        nextAttemptAt: firedAt.toISOString(),
    });
    await worker.drain();
    const issued = requestAccountDeletion({ userId: owner.id })!;
    assert.equal((await confirmAccountDeletion(issued.token, owner.id)).kind, 'ok');
    await settled();
    // The deletion's own erase of each listed switch has run (one statement
    // each, announced); what follows is the last statement's alone.
    const spentAnnounced = announcedFor(spentEnvelope.releaseId).length;
    const quietAnnounced = announcedFor(quietEnvelope.releaseId).length;
    await finishAccountDeletion(owner.id, here);
    await settled();
    const mirrored = here.getDeadmanSwitch(gone.switchId);
    assert.equal(mirrored?.status, 'triggered', 'taken into this mirror, fired');
    assert.equal(mirrored?.releasedAt, firedAt.toISOString());
    assert.equal(mirrored?.headline, undefined, 'its label erased');
    assert.deepEqual(
        here
            .listDeadmanReleaseWraps(gone.switchId)
            .map((c) => [
                c.recipientAccountId === owner.id ? 'owner' : 'recipient',
                c.sealedKey !== '',
            ])
            .sort(),
        [
            ['owner', false],
            ['recipient', true],
        ],
        'the recipient’s held copy is in this mirror too'
    );
    assert.ok(
        releasedCopiesFor(gone.recipient.id).some((r) => r.releaseId === gone.switchId),
        'served on the deleting process'
    );
    const res = await app.request('/v1/deadman/releases', { headers: auth(gone.recipient) });
    assert.equal(res.status, 200);
    assert.ok(
        ((await res.json()) as { releases: Array<{ releaseId: string }> }).releases.some(
            (r) => r.releaseId === gone.switchId
        ),
        'listed by the route here'
    );
    assert.deepEqual(await noticeRows(gone.switchId), [{ status: 'pending' }]);
    assert.equal(
        announcedFor(spentEnvelope.releaseId).length,
        spentAnnounced,
        'a switch with nothing left to erase is not rewritten or announced'
    );
    const spent = await stored(spentEnvelope.releaseId);
    assert.equal(spent?.status, 'cancelled');
    assert.equal(spent?.headline, null);
    // The fired switch with no label: nothing to erase, so not announced, yet
    // in this mirror with the recipient's copy and served here.
    assert.equal(
        announcedFor(quietEnvelope.releaseId).length,
        quietAnnounced,
        'unchanged: not announced'
    );
    assert.equal(
        here.getDeadmanSwitch(quietEnvelope.releaseId)?.status,
        'triggered',
        'taken silently'
    );
    assert.ok(
        here
            .listDeadmanReleaseWraps(quietEnvelope.releaseId)
            .some((c) => c.recipientAccountId === quietNamed.id && c.sealedKey !== ''),
        'with the recipient’s held copy'
    );
    assert.ok(
        releasedCopiesFor(quietNamed.id).some((r) => r.releaseId === quietEnvelope.releaseId),
        'served here too'
    );
    // The two carrying a refused attempt: each loses it, the armed one
    // cancelled, the spent one rewritten for the column alone.
    for (const id of [refusedArmed, refusedSpent]) {
        assert.equal(await columnOf(id), null, 'the owner’s refused attempt erased');
        assert.equal((await stored(id))?.status, 'cancelled');
        assert.equal(here.getDeadmanSwitch(id)?.status, 'cancelled', 'taken into this mirror');
        assert.equal(here.getDeadmanSwitch(id)?.ownerAttemptRefusedAt, undefined);
    }
    assert.equal((await stored(refusedArmed))?.encrypted_payload, '', 'emptied');
    const content = await stored(leftContent);
    assert.equal(content?.status, 'cancelled');
    assert.equal(
        content?.encrypted_payload,
        '',
        'the content left on a cancelled switch is erased'
    );
    const window = await stored(leftWindow);
    assert.equal(window?.status, 'cancelled');
    assert.equal(window?.backlog_grace_started_at, null, 'and so is a backlog window left on one');
    await worker.drain();
});

test('a view of a cancelled release switch whose copies are behind Postgres (held here, blank there) is set right by one removal pass and costs no statement at the next; while a switch statement stands unanswered the pass sends none', async () => {
    // Round 14 of part 2's review (the verifiers' `d30-r13b.mts` K): the
    // conditional blanking blanked nothing where Postgres already had the
    // copies blank, nothing refreshed the mirror's copies, and the same
    // statement went out on every pass, for ever; and during a stall it was
    // still sent, one bound per such switch.
    const worker = await otherProcess();
    const staleOn = async (count: number): Promise<string[]> => {
        const ids: string[] = [];
        for (let i = 0; i < count; i += 1) {
            const sw = await armed(3600);
            deliver(worker, { src: 'x', m: 'deadmanSwitches', op: 'u', kv: [sw.switchId] });
            await until(
                () => worker.getDeadmanSwitch(sw.switchId) !== undefined,
                5_000,
                'the worker'
            );
            const cancelled = await worker.updateDeadmanSwitchIf(
                sw.switchId,
                worker.getDeadmanSwitch(sw.switchId)!,
                { status: 'cancelled', encryptedPayload: '' }
            );
            assert.equal(cancelled.kind, 'applied');
            ids.push(sw.switchId);
        }
        await worker.drain();
        await pg.query(
            "UPDATE deadman_release_wraps SET sealed_key = '', signature = '' WHERE switch_id = ANY($1::text[])",
            [ids]
        );
        // This process is told of the switch rows, never of the copies.
        for (const id of ids) deliver(here, { src: 'x', m: 'deadmanSwitches', op: 'u', kv: [id] });
        await until(
            () => ids.every((id) => here.getDeadmanSwitch(id)?.status === 'cancelled'),
            5_000,
            'the refresh'
        );
        return ids;
    };
    const heldHere = (ids: string[]) =>
        ids.filter((id) => here.listDeadmanReleaseWraps(id).some((w) => w.sealedKey !== '')).length;
    const stale = await staleOn(3);
    assert.equal(heldHere(stale), 3, 'this mirror still holds their copies');
    let blankStatements = 0;
    const counting = (ids: string[]) => {
        pool.connect = async () => {
            const client = await realConnect();
            return {
                ...client,
                async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                    if (
                        sql.includes("AND status = 'cancelled')") &&
                        typeof params?.[0] === 'string' &&
                        ids.includes(params[0])
                    ) {
                        blankStatements += 1;
                    }
                    return client.query<T>(sql, params);
                },
            };
        };
    };
    counting(stale);
    try {
        const refreshed = await logged('deadman_cancelled_copies_view_refreshed', async () => {
            await removeExpiredReleases(new Date());
        });
        assert.equal(blankStatements, 3, 'one statement per stale switch');
        assert.equal(refreshed, 3, 'each view set right');
        assert.equal(heldHere(stale), 0);
        assert.equal(
            (
                (
                    await pg.query(
                        "SELECT count(*)::int AS n FROM deadman_release_wraps WHERE switch_id = ANY($1::text[]) AND sealed_key <> ''",
                        [stale]
                    )
                ).rows[0] as { n: number }
            ).n,
            0,
            'and Postgres unchanged'
        );
        blankStatements = 0;
        await removeExpiredReleases(new Date());
        assert.equal(blankStatements, 0, 'the next pass asks nothing');
    } finally {
        restore();
    }
    // During a stall: another such switch, and a check-in's statement held.
    const duringStall = await staleOn(1);
    const holder = await armed(3600);
    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
        open = resolve;
    });
    here.switchStatementTimeoutMs = 200;
    blankStatements = 0;
    let held = 0;
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (sql.includes("AND status = 'cancelled')") && params?.[0] === duringStall[0]) {
                    blankStatements += 1;
                }
                if (isSwitchUpdate(sql) && !isCarry(sql) && held === 0) {
                    held += 1;
                    await gate;
                }
                return client.query<T>(sql, params);
            },
        };
    };
    try {
        assert.equal(
            (await post(holder.owner, `/switches/${holder.switchId}/check-in`)).status,
            503
        );
        assert.equal(held, 1, 'the stall stands');
        const started = Date.now();
        await removeExpiredReleases(new Date());
        assert.ok(Date.now() - started < 150, 'the pass costs nothing for it');
        assert.equal(blankStatements, 0, 'nothing sent to the stalled database');
        assert.equal(heldHere(duringStall), 1, 'left as it was');
    } finally {
        open();
        restore();
    }
    await settled();
    here.switchStatementTimeoutMs = 30_000;
    counting(duringStall);
    try {
        await removeExpiredReleases(new Date());
        assert.equal(blankStatements, 1, 'once the database answers, one statement sets it right');
        assert.equal(heldHere(duringStall), 0);
    } finally {
        restore();
    }
    here.updateDeadmanSwitch(holder.switchId, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
    await worker.drain();
});

test('an arm whose statement fails and whose look afterwards finds the same owner’s armed switch with that id, armed on another process, is 409 release_id_taken: this call’s moment tells this arm’s own insert from an earlier one', async () => {
    // Round 14 of part 2's review: of the look's conditions, the owner and the
    // moment, only their conjunction was pinned; without the moment the same
    // owner's switch armed elsewhere was answered 201 and taken as this arm's,
    // where the same request without the failure is 409.
    const owner = await person();
    const named = await person();
    const envelope = await protocol.buildReleaseEnvelope({
        ownerKeySet: owner.keySet,
        recipients: [named.keySet.identity],
        message: 'Synthetic test text.',
    });
    const elsewhere = await otherProcess();
    const { input, copies } = switchInputFor(envelope, owner.id);
    assert.equal(
        (await elsewhere.armDeadmanSwitch({ ...input, headline: 'armed elsewhere' }, copies)).kind,
        'armed'
    );
    await elsewhere.drain();
    assert.equal(here.getDeadmanSwitch(envelope.releaseId), undefined, 'not heard here');
    const before = await stored(envelope.releaseId);
    let thrown = 0;
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (sql.startsWith('SELECT * FROM deadman_switches WHERE id') && thrown === 0) {
                    thrown += 1;
                    throw new Error('Connection terminated unexpectedly (test)');
                }
                return client.query<T>(sql, params);
            },
        };
    };
    let res!: Response;
    try {
        res = await post(owner, '/switches', armBody(envelope, 3600));
    } finally {
        restore();
    }
    assert.equal(thrown, 1, 'the statement failed');
    assert.equal(res.status, 409, 'not this arm’s insert');
    assert.equal(((await res.json()) as { code: string }).code, 'release_id_taken');
    const after = await stored(envelope.releaseId);
    assert.equal(after?.status, 'armed');
    assert.equal(after?.headline, 'armed elsewhere');
    assert.equal(after?.updated_at.toISOString(), before?.updated_at.toISOString(), 'untouched');
    assert.equal(
        here.getDeadmanSwitch(envelope.releaseId)?.headline,
        'armed elsewhere',
        'known here now'
    );
    const control = await post(owner, '/switches', armBody(envelope, 3600));
    assert.equal(control.status, 409, 'the same request without the failure');
    here.updateDeadmanSwitch(envelope.releaseId, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
    await elsewhere.drain();
});

test('the deletion’s wait for the owner’s arms in flight is bounded (decision 33): an arm whose failed statement’s read-back waits on a pool that does not answer no longer keeps the deletion from listing and erasing the owner’s switches, the wait’s end is logged; the route’s answer still waits for that read-back through the drain of the deletion’s writes (decision 27); nothing is armed once the pool answers', async () => {
    // Round 14 of part 2's review (the verifiers' `r13v-fq.mts` R4): the wait
    // had no bound, so such a pool kept `confirmAccountDeletion` from
    // returning for good, the account already gone and the token revoked.
    // Round 15: the bound shortens that step only. The route answers after
    // `finishAccountDeletion`, whose drain waits, with no bound (decision
    // 27), for every queued call of the process, the arm's read-back
    // included (the verifiers' `r14v-claims` probe A2).
    const owner = await person();
    const named = await person();
    const envelope = await protocol.buildReleaseEnvelope({
        ownerKeySet: owner.keySet,
        recipients: [named.keySet.identity],
        message: 'Synthetic test text.',
    });
    let thrown = 0;
    let hung = 0;
    let releaseHang!: () => void;
    const hang = new Promise<void>((resolve) => {
        releaseHang = resolve;
    });
    pool.connect = async () => {
        if (thrown === 1 && hung === 0) {
            hung += 1;
            await hang;
        }
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (sql.startsWith('SELECT * FROM deadman_switches WHERE id') && thrown === 0) {
                    thrown += 1;
                    throw new Error('Connection terminated unexpectedly (test)');
                }
                return client.query<T>(sql, params);
            },
        };
    };
    const arming = armReleaseSwitch({
        ownerId: owner.id,
        input: { checkInIntervalSeconds: 3600, gracePeriodSeconds: 0, envelope },
    });
    await until(() => hung === 1, 5_000, 'the read-back to wait for a connection');
    assert.equal(armsInFlightCount(), 1, 'the arm is in flight');
    const issued = requestAccountDeletion({ userId: owner.id })!;
    const started = Date.now();
    const timedOut = await logged('account_deletion_arms_wait_timeout', async () => {
        assert.equal(
            (await confirmAccountDeletion(issued.token, owner.id, undefined, 300)).kind,
            'ok'
        );
    });
    const took = Date.now() - started;
    assert.equal(timedOut, 1, 'logged');
    assert.ok(
        took >= 300 && took < 3_000,
        `answered after the bound, not after the pool (${took} ms)`
    );
    assert.equal(here.getUserById(owner.id), undefined);
    assert.equal(armsInFlightCount(), 1, 'the arm is still in flight');
    // What the route does next: `finishAccountDeletion`, whose drain waits
    // for the read-back still queued.
    let finished = false;
    const finishing = finishAccountDeletion(owner.id, here).then(() => {
        finished = true;
    });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(finished, false, 'the route’s answer waits for the pool through the drain');
    releaseHang();
    const outcome = await arming;
    await finishing;
    restore();
    assert.equal(outcome.kind, 'write_failed', 'the read-back found no row: nothing armed');
    assert.equal(armsInFlightCount(), 0);
    await settled();
    assert.equal(await stored(envelope.releaseId), undefined, 'nothing in Postgres');
    assert.equal(here.getDeadmanSwitch(envelope.releaseId), undefined);
    assert.equal(ACCOUNT_DELETION_ARMS_WAIT_MS, 30_000);
});

// ---------------------------------------------------------------------------
// Round 15 of part 2's review: what the verifiers found in round 14's fixes.

test('a refused check-in is carried by the refusing process on its own: a statement that throws is carried at once, and a carry the database refuses at connect is tried again every carryRetryMs, so it lands once the database answers with no other request on the process (decision 31)', async () => {
    // Round 15 of part 2's review (the verifiers' `d31-attacks.mts` S3): a
    // carry that failed was tried again only when another switch statement
    // of the process answered. In `deploy/docker/production` nothing else on
    // the API process asks the database by itself, so after an outage that
    // refused connections the worker fired the switch at its deadline.
    const quick = await armed(3600);
    const slow = await armed(3600);
    const deadline = new Date(here.getDeadmanSwitch(slow.switchId)!.triggerAt);
    // The statement throws once while the database is up: carried at once,
    // with no timer able to do it (the retry is a minute away).
    here.carryRetryMs = 60_000;
    let thrown = 0;
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (isSwitchUpdate(sql) && !isCarry(sql) && thrown === 0) {
                    thrown += 1;
                    throw new Error('Connection terminated unexpectedly (test)');
                }
                return client.query<T>(sql, params);
            },
        };
    };
    try {
        assert.equal((await post(quick.owner, `/switches/${quick.switchId}/check-in`)).status, 503);
        await until(
            () => here.ownerWriteUnansweredAt(quick.switchId) === undefined,
            3_000,
            'the carry sent with the note'
        );
    } finally {
        restore();
    }
    assert.equal(thrown, 1);
    assert.ok((await columnOf(quick.switchId)) instanceof Date, 'carried at once');
    // The database refuses connections (it is restarting): the check-in fails
    // at once, and the carry sent with the note fails too. The failed
    // check-in is an unknown outcome, and its read back fails as well, so
    // the stall stands and the switch is read again every carryRetryMs
    // beside the carry (round 20 of part 2's review: no stall opened, and
    // nothing read the switch again).
    here.carryRetryMs = 150;
    let refusing = true;
    let refusedConnects = 0;
    pool.connect = async () => {
        if (refusing) {
            refusedConnects += 1;
            throw new Error('connect ECONNREFUSED 127.0.0.1:5432 (test)');
        }
        return realConnect();
    };
    let failedCarries = 0;
    try {
        failedCarries = await logged('deadman_owner_attempt_carry_failed', async () => {
            assert.equal(
                (await post(slow.owner, `/switches/${slow.switchId}/check-in`)).status,
                503
            );
            assert.ok(here.ownerWriteUnansweredAt(slow.switchId), 'noted');
            // The statement, its read back and the read again at once, the
            // carry at once; then one carry and one read again each 150 ms.
            await until(() => refusedConnects >= 8, 3_000, 'the carry tried while refused');
        });
        assert.ok(failedCarries >= 2, `tried again on its own (${failedCarries})`);
        assert.equal(await columnOf(slow.switchId), null);
        assert.ok(here.ownerWriteUnansweredAt(slow.switchId), 'the note is kept');
        assert.equal(statementsHeld(), true, 'the stall stands while the switch cannot be read');
        // The database answers again. Nothing else is asked on this process.
        refusing = false;
        await until(
            () => here.ownerWriteUnansweredAt(slow.switchId) === undefined,
            3_000,
            'the carry on its timer'
        );
        await until(() => !statementsHeld(), 3_000, 'the switch read again on its timer');
    } finally {
        restore();
        here.carryRetryMs = 10_000;
    }
    const column = await columnOf(slow.switchId);
    assert.ok(column instanceof Date, 'carried with no other request on the process');
    assert.ok(column.getTime() < deadline.getTime(), 'before the deadline');
    // And held at the deadline, from the column alone (this process's note
    // is gone, and the stall ended long before the deadline).
    const late = new Date(deadline.getTime() + 5 * 60_000);
    await sweepOverdueDeadmanSwitches(late, 15 * 60_000);
    await here.drain();
    const row = await stored(slow.switchId);
    assert.equal(row?.status, 'grace', 'the backlog window, not the trigger');
    assert.equal(row?.released_at, null);
    for (const sw of [quick, slow]) {
        here.updateDeadmanSwitch(sw.switchId, { status: 'cancelled', encryptedPayload: '' });
    }
    await here.drain();
});

test('the trigger is refused in Postgres over a refused attempt the sweeping process has not heard of: a carry that landed from another process while this one was not told holds the switch, this mirror takes the row, the next pass gives the window, and a switch that had its window fires when it ends (decision 31)', async () => {
    // Round 15 of part 2's review (the verifiers' `d31-attacks.mts` S2 and
    // `p1-d31-worker.mts` A and A2): the trigger's conditional write checked
    // only the status and the last check-in, so a worker whose mirror had not
    // received the carry's announcement (lost, or its refresh failed) fired
    // the switch over a refusal Postgres held, and the trigger cleared the
    // column. Here the API process (a second store, its pool refusing
    // connections, told to nobody) refuses the check-in; the database
    // answers; its carry lands on its own timer; this process plays the
    // worker, whose mirror never hears of it.
    const sw = await armed(3600);
    const deadline = new Date(here.getDeadmanSwitch(sw.switchId)!.triggerAt);
    const client = await realConnect();
    let refusing = false;
    const apiPool = {
        connect: async () => {
            if (refusing) throw new Error('connect ECONNREFUSED 127.0.0.1:5432 (test)');
            return client;
        },
        end: async () => {},
    };
    const api = new store.PostgresBackedDb();
    await api.init(apiPool as never);
    api.carryRetryMs = 100;
    const read = api.getDeadmanSwitch(sw.switchId)!;
    const refreshed = applyCheckIn(read, new Date());
    refusing = true;
    const outcome = await api.updateDeadmanSwitchIf(sw.switchId, read, {
        status: refreshed.status,
        lastCheckInAt: refreshed.lastCheckInAt,
        triggerAt: refreshed.triggerAt,
        releaseAt: refreshed.releaseAt,
        backlogGraceStartedAt: refreshed.backlogGraceStartedAt,
        ownerAttemptRefusedAt: refreshed.ownerAttemptRefusedAt,
    });
    assert.equal(outcome.kind, 'unanswered');
    refusing = false;
    await until(
        () => api.ownerWriteUnansweredAt(sw.switchId) === undefined,
        3_000,
        'the API process’s carry'
    );
    const column = await columnOf(sw.switchId);
    assert.ok(column instanceof Date, 'carried into Postgres');
    assert.equal(
        here.getDeadmanSwitch(sw.switchId)?.ownerAttemptRefusedAt,
        undefined,
        'this process was not told'
    );
    // The worker's pass at the deadline, five minutes late within a 15-minute
    // tolerance: its mirror holds nothing that would give the window.
    const late = new Date(deadline.getTime() + 5 * 60_000);
    const held = await logged('deadman_trigger_held_by_refused_attempt', async () => {
        await sweepOverdueDeadmanSwitches(late, 15 * 60_000);
        await here.drain();
    });
    assert.equal(held, 1, 'refused in Postgres, logged');
    const after = await stored(sw.switchId);
    assert.equal(after?.status, 'armed', 'not fired');
    assert.equal(after?.released_at, null);
    assert.equal(
        (await columnOf(sw.switchId))?.toISOString(),
        column.toISOString(),
        'the column kept'
    );
    assert.equal(
        here.getDeadmanSwitch(sw.switchId)?.ownerAttemptRefusedAt,
        column.toISOString(),
        'the refusal took Postgres’s row into this mirror'
    );
    assert.deepEqual(await noticeRows(sw.switchId), [], 'no notice');
    assert.equal(releasedCopiesFor(sw.recipient.id).length, 0, 'served to nobody');
    // The next pass: the backlog window.
    const next = new Date(late.getTime() + 30_000);
    await sweepOverdueDeadmanSwitches(next, 15 * 60_000);
    await here.drain();
    const windowed = await stored(sw.switchId);
    assert.equal(windowed?.status, 'grace');
    assert.equal(windowed?.backlog_grace_started_at?.toISOString(), next.toISOString());
    assert.equal((await columnOf(sw.switchId))?.toISOString(), column.toISOString());
    // The window ends with no check-in: the switch fires, the column
    // notwithstanding (a switch that had its window is judged afresh).
    const ends = new Date(Date.parse(here.getDeadmanSwitch(sw.switchId)!.releaseAt) + 1_000);
    await sweepOverdueDeadmanSwitches(ends, 15 * 60_000);
    await here.drain();
    const fired = await stored(sw.switchId);
    assert.equal(fired?.status, 'triggered', 'fired at the window’s end');
    assert.ok(fired?.released_at);
    assert.equal(await columnOf(sw.switchId), null, 'the trigger clears the column');
    await api.drain();
});

test('a carry writes the attempt’s moment, keeps the newer of two refused attempts, keeps the column in this mirror when the switch was refreshed while it ran, and never writes over a newer attempt another process carried (decision 31)', async () => {
    // Round 15 of part 2's review: four checks of round 14's carry that no
    // test reached alone (the verifiers' Q05, Q03, Q04 and Q01).
    here.switchStatementTimeoutMs = 1_000;
    here.carryRetryMs = 100;
    let refuseConnect = false;
    let holdConnect: Promise<void> | null = null;
    let holdCarry: Promise<void> | null = null;
    let carriesHeld = 0;
    pool.connect = async () => {
        if (refuseConnect) throw new Error('connect ECONNREFUSED 127.0.0.1:5432 (test)');
        if (holdConnect) {
            const gate = holdConnect;
            holdConnect = null;
            await gate;
        }
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (isCarry(sql) && holdCarry) {
                    const gate = holdCarry;
                    holdCarry = null;
                    carriesHeld += 1;
                    await gate;
                }
                return client.query<T>(sql, params);
            },
        };
    };
    const gate = () => {
        let open!: () => void;
        const promise = new Promise<void>((resolve) => {
            open = resolve;
        });
        return { promise, open };
    };
    const s = await armed(3600);
    const t = await armed(3600);
    const u = await armed(3600);
    try {
        // Q05: a check-in refused after its bound, not during a standing
        // stall, carries the moment it was made, not the refusal's. Its
        // carry, sent with the note on a connection of its own (round 16),
        // is held at the database.
        const first = gate();
        holdConnect = first.promise;
        const carry1 = gate();
        holdCarry = carry1.promise;
        const before1 = Date.now();
        assert.equal((await post(s.owner, `/switches/${s.switchId}/check-in`)).status, 503);
        const after1 = Date.now();
        assert.ok(after1 - before1 >= 1_000, 'refused after the bound');
        const note1 = here.ownerWriteUnansweredAt(s.switchId)!;
        assert.ok(
            Date.parse(note1.at) >= before1 && Date.parse(note1.at) < before1 + 500,
            'noted with the attempt’s moment'
        );
        await until(() => carriesHeld === 1, 3_000, 'the first carry held');
        // Q03: while the first carry is held the owner tries again and is
        // refused again, at once (the first check-in's statement still
        // stands); the second attempt's moment is what the switch ends with.
        const before2 = Date.now();
        assert.equal((await post(s.owner, `/switches/${s.switchId}/check-in`)).status, 503);
        const after2 = Date.now();
        assert.ok(after2 - before2 < 500, 'refused at once while the stall stands');
        const note2 = here.ownerWriteUnansweredAt(s.switchId)!;
        assert.notEqual(note2, note1, 'a newer note');
        assert.ok(Date.parse(note2.at) >= before2 && Date.parse(note2.at) < before2 + 500);
        carry1.open();
        await until(
            () => here.ownerWriteUnansweredAt(s.switchId) === undefined,
            5_000,
            'both carries'
        );
        first.open(); // the statement's turn comes after the bound: not run
        await settled();
        const column = await columnOf(s.switchId);
        assert.ok(column instanceof Date);
        assert.ok(
            column.getTime() >= before2 && column.getTime() < before2 + 500,
            'the second attempt’s moment'
        );
        assert.equal(
            here.getDeadmanSwitch(s.switchId)?.ownerAttemptRefusedAt,
            column.toISOString()
        );

        // Q04: the switch is refreshed in this mirror while the carry is held
        // at the database; when it lands the mirror keeps the column.
        refuseConnect = true;
        assert.equal((await post(t.owner, `/switches/${t.switchId}/check-in`)).status, 503);
        const carryT = gate();
        holdCarry = carryT.promise;
        refuseConnect = false;
        await until(() => carriesHeld === 2, 3_000, 'the retried carry held');
        const marker = new Date(Date.now() - 1_000).toISOString();
        await pg.query('UPDATE deadman_switches SET updated_at = $2 WHERE id = $1', [
            t.switchId,
            marker,
        ]);
        deliver(here, { src: 'x', m: 'deadmanSwitches', op: 'u', kv: [t.switchId] });
        await until(
            () => here.getDeadmanSwitch(t.switchId)?.updatedAt === marker,
            3_000,
            'the refresh'
        );
        carryT.open();
        await until(
            () => here.ownerWriteUnansweredAt(t.switchId) === undefined,
            3_000,
            'the carry'
        );
        const columnT = await columnOf(t.switchId);
        assert.ok(columnT instanceof Date, 'carried');
        assert.equal(
            here.getDeadmanSwitch(t.switchId)?.ownerAttemptRefusedAt,
            columnT.toISOString(),
            'kept in this mirror over the refresh'
        );

        // Q01: another process carried a newer attempt of the owner's before
        // this one's carry landed: this one is refused, the newer kept.
        refuseConnect = true;
        assert.equal((await post(u.owner, `/switches/${u.switchId}/check-in`)).status, 503);
        const noteU = here.ownerWriteUnansweredAt(u.switchId)!;
        await new Promise((r) => setTimeout(r, 20));
        const newer = new Date(Date.parse(noteU.at) + 10).toISOString();
        await pg.query('UPDATE deadman_switches SET owner_attempt_refused_at = $2 WHERE id = $1', [
            u.switchId,
            newer,
        ]);
        let notCarried = 0;
        notCarried = await logged('deadman_owner_attempt_not_carried', async () => {
            refuseConnect = false;
            await until(
                () => here.ownerWriteUnansweredAt(u.switchId) === undefined,
                3_000,
                'the carry refused'
            );
        });
        assert.equal(notCarried, 1, 'refused by Postgres');
        assert.equal((await columnOf(u.switchId))?.toISOString(), newer, 'the newer attempt kept');
    } finally {
        restore();
        here.switchStatementTimeoutMs = 30_000;
        here.carryRetryMs = 10_000;
    }
    await settled();
    for (const sw of [s, t, u]) {
        deliver(here, { src: 'x', m: 'deadmanSwitches', op: 'u', kv: [sw.switchId] });
    }
    await new Promise((r) => setTimeout(r, 100));
    for (const sw of [s, t, u]) {
        here.updateDeadmanSwitch(sw.switchId, { status: 'cancelled', encryptedPayload: '' });
    }
    await here.drain();
});

// ---------------------------------------------------------------------------
// Round 16 of part 2's review: the carry has a bound of its own and is not
// held back by this process's other statements.

/**
 * A second store playing the API process, on its own pool over this
 * database's one connection, so only its statements can be refused, held or
 * left unanswered; `mode` says what its next connection does.
 */
const apiProcess = async () => {
    const shared = await realConnect();
    const releases: Array<Error | undefined> = [];
    const state: {
        refuse: boolean;
        holdConnect: Promise<void> | null;
        /** With `holdConnect`: only a connection asked for by this method of the store is held. */
        holdConnectFrom: string | null;
        holdQuery: ((sql: string) => Promise<void> | null) | null;
    } = { refuse: false, holdConnect: null, holdConnectFrom: null, holdQuery: null };
    const apiPool = {
        connect: async () => {
            if (state.refuse) throw new Error('connect ECONNREFUSED 127.0.0.1:5432 (test)');
            if (
                state.holdConnect &&
                (state.holdConnectFrom === null || calledFrom(state.holdConnectFrom))
            ) {
                const gate = state.holdConnect;
                state.holdConnect = null;
                await gate;
            }
            return {
                async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                    const gate = state.holdQuery?.(sql);
                    if (gate) await gate;
                    return shared.query<T>(sql, params);
                },
                release: (err?: Error) => {
                    releases.push(err);
                },
            };
        },
        end: async () => {},
    };
    const api = new store.PostgresBackedDb();
    await api.init(apiPool as never);
    return { api, state, releases };
};
const checkInPatchOf = (record: DeadmanSwitchRow) => {
    const refreshed = applyCheckIn(record, new Date());
    return {
        status: refreshed.status,
        lastCheckInAt: refreshed.lastCheckInAt,
        triggerAt: refreshed.triggerAt,
        releaseAt: refreshed.releaseAt,
        backlogGraceStartedAt: refreshed.backlogGraceStartedAt,
        ownerAttemptRefusedAt: refreshed.ownerAttemptRefusedAt,
    };
};
const gateOpen = () => {
    let open!: () => void;
    const promise = new Promise<void>((resolve) => {
        open = resolve;
    });
    return { promise, open };
};

test('a carry is not held back by this process’s own statement that does not answer: the check-in whose statement hangs is refused 503 and its carry, on a connection of its own, lands while that statement still stands, so the worker’s pass at the deadline gives the window (round 16)', async () => {
    // Round 16 of part 2's review (the verifiers' `p1b-standing-stall.mts`,
    // `stall-carry.mts` C1 and `snap-d31-r15-s12.mts`): a carry was sent only
    // while no switch statement of the process stood unanswered, so while the
    // refused check-in's own statement hung, which the shared pool bounds by
    // nothing (one the database's host acknowledged before it went silent
    // stands until the process restarts where that host is gone or the
    // silence outlasts its own retransmission, and until the database
    // answers where its process stops answering on a host that stays up:
    // rounds 17 to 19), no carry was sent with
    // the database answering every other connection, and the worker fired
    // the switch at its deadline. Here the API process's check-in statement
    // never answers until the end; this process plays the worker. The
    // window it gets is one, and the switch fires when it ends (round 17;
    // the verifiers' `lockout.mts`): test 50.
    const sw = await armed(3600);
    const deadline = new Date(here.getDeadmanSwitch(sw.switchId)!.triggerAt);
    const { api, state } = await apiProcess();
    api.switchStatementTimeoutMs = 200;
    api.carryRetryMs = 100;
    const hang = gateOpen();
    let carries = 0;
    let hung = 0;
    state.holdQuery = (sql) => {
        if (isCarry(sql)) {
            carries += 1;
            return null;
        }
        if (isSwitchUpdate(sql) && hung === 0) {
            hung += 1;
            return hang.promise;
        }
        return null;
    };
    try {
        const read = api.getDeadmanSwitch(sw.switchId)!;
        const outcome = await api.updateDeadmanSwitchIf(sw.switchId, read, checkInPatchOf(read));
        assert.equal(outcome.kind, 'unanswered', 'refused after the bound: the route answers 503');
        assert.equal(hung, 1, 'the check-in’s own statement stands unanswered');
        await until(
            () => api.ownerWriteUnansweredAt(sw.switchId) === undefined,
            3_000,
            'the carry while the statement stands'
        );
        assert.equal(carries, 1, 'sent once, on a connection of its own');
        const column = await columnOf(sw.switchId);
        assert.ok(column instanceof Date, 'the refused attempt is in Postgres');
        assert.ok(column.getTime() < deadline.getTime(), 'well before the deadline');
        assert.equal(
            api.getDeadmanSwitch(sw.switchId)?.ownerAttemptRefusedAt,
            column.toISOString(),
            'and in the API process’s mirror'
        );
        // The stall still stands: every check-in on that process is refused at
        // once, as the documents say.
        assert.equal(
            api.switchStatementsStalledBetween(Date.now(), Date.now()),
            true,
            'the stall stands'
        );
        const again = await api.updateDeadmanSwitchIf(
            sw.switchId,
            api.getDeadmanSwitch(sw.switchId)!,
            checkInPatchOf(api.getDeadmanSwitch(sw.switchId)!)
        );
        assert.equal(again.kind, 'unanswered', 'refused at once while the stall stands');
        // The worker's pass at the deadline, five minutes late within a
        // 15-minute tolerance, with a mirror that was never told of the carry.
        assert.equal(here.getDeadmanSwitch(sw.switchId)?.ownerAttemptRefusedAt, undefined);
        const late = new Date(deadline.getTime() + 5 * 60_000);
        await sweepOverdueDeadmanSwitches(late, 15 * 60_000);
        await here.drain();
        const next = new Date(late.getTime() + 30_000);
        await sweepOverdueDeadmanSwitches(next, 15 * 60_000);
        await here.drain();
        const row = await stored(sw.switchId);
        assert.equal(row?.status, 'grace', 'the backlog window, not the trigger');
        assert.equal(row?.released_at, null);
        assert.equal(releasedCopiesFor(sw.recipient.id).length, 0, 'served to nobody');
    } finally {
        hang.open();
        await api.drain();
    }
    here.updateDeadmanSwitch(sw.switchId, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
});

test('a carry that does not answer is given up after carryTimeoutMs, its connection dropped, and tried again on a new one: a connection the pool does not hand over, then a statement that hangs, then the carry lands with nothing else asked of the process, and a connection handed over late goes back unused (round 16)', async () => {
    // Round 16 of part 2's review (the verifiers' `p1-hung-carry.mts` and
    // `stall-carry.mts` C2): the carry had no bound of its own, so one sent on
    // a connection the database never answered held its note as on its way,
    // nothing tried it again, and the worker fired the switch at its deadline.
    const sw = await armed(3600);
    const deadline = new Date(here.getDeadmanSwitch(sw.switchId)!.triggerAt);
    const { api, state, releases } = await apiProcess();
    api.carryRetryMs = 100;
    api.carryTimeoutMs = 200;
    const lateConnect = gateOpen();
    const hungCarry = gateOpen();
    let carries = 0;
    state.holdQuery = (sql) => {
        if (!isCarry(sql)) return null;
        carries += 1;
        return carries === 1 ? hungCarry.promise : null;
    };
    let failures = 0;
    try {
        failures = await logged('deadman_owner_attempt_carry_failed', async () => {
            // The database refuses connections: the check-in fails at once,
            // and the carry tried with the note fails too. (The failed
            // check-in's switch is read again on the same timer until a read
            // answers, round 20; the connection held below is the carry's.)
            state.refuse = true;
            const read = api.getDeadmanSwitch(sw.switchId)!;
            const outcome = await api.updateDeadmanSwitchIf(
                sw.switchId,
                read,
                checkInPatchOf(read)
            );
            assert.equal(outcome.kind, 'unanswered');
            assert.ok(api.ownerWriteUnansweredAt(sw.switchId), 'noted');
            await new Promise((r) => setTimeout(r, 50));
            // The carry's next try's connection is not handed over until the end.
            state.holdConnectFrom = 'runCarryPass';
            state.holdConnect = lateConnect.promise;
            state.refuse = false;
            await until(() => state.holdConnect === null, 3_000, 'the try whose connection hangs');
            // The one after: its statement hangs.
            await until(() => carries === 1, 3_000, 'the try whose statement hangs');
            // The one after that lands, with nothing else asked of the process.
            await until(
                () => api.ownerWriteUnansweredAt(sw.switchId) === undefined,
                3_000,
                'the carry on a new connection'
            );
        });
        assert.ok(failures >= 3, `each failed or unanswered try is logged (${failures})`);
        assert.equal(carries, 2, 'the hung statement, then the one that landed');
        assert.ok(
            releases.some(
                (err) => err instanceof Error && /no answer within 200 ms/.test(err.message)
            ),
            'the hung statement’s connection is given back with the error, so the pool drops it'
        );
        const column = await columnOf(sw.switchId);
        assert.ok(column instanceof Date, 'carried');
        assert.ok(column.getTime() < deadline.getTime());
        // The connection handed over after its try's bound goes back unused.
        const before = releases.length;
        lateConnect.open();
        await until(() => releases.length > before, 3_000, 'the late connection given back');
        assert.equal(releases.at(-1), undefined, 'given back without an error, unused');
        assert.equal(carries, 2, 'nothing sent on it');
        // The worker's pass at the deadline holds the switch, from the column.
        const late = new Date(deadline.getTime() + 5 * 60_000);
        await sweepOverdueDeadmanSwitches(late, 15 * 60_000);
        await here.drain();
        await sweepOverdueDeadmanSwitches(new Date(late.getTime() + 30_000), 15 * 60_000);
        await here.drain();
        const row = await stored(sw.switchId);
        assert.equal(row?.status, 'grace', 'the backlog window, not the trigger');
        assert.equal(row?.released_at, null);
    } finally {
        lateConnect.open();
        hungCarry.open();
        await api.drain();
    }
    here.updateDeadmanSwitch(sw.switchId, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
});

test('a legacy switch’s trigger is refused in Postgres over a refused attempt carried from another process the sweeping process was not told of: the next pass gives the window, the column is kept, and the switch fires when the window ends (decision 31, round 16)', async () => {
    // Round 16 of part 2's review (the verifiers' X02 and
    // `p3-legacy-trigger.mts`): the trigger's condition keys on the status
    // alone, so it covers the legacy trigger too, but only release switches
    // reached it in a test, and a mutant that limited it to release triggers
    // passed every test while firing a legacy switch over a carried refusal.
    const owner = await person();
    const recipient = await person();
    const now = new Date();
    const legacy = here.createDeadmanSwitch({
        id: randomUUID(),
        ownerId: owner.id,
        roomId: '!room:test.local',
        status: 'armed',
        checkInIntervalSeconds: 3600,
        gracePeriodSeconds: 0,
        lastCheckInAt: now.toISOString(),
        triggerAt: new Date(now.getTime() + 3_600_000).toISOString(),
        releaseAt: new Date(now.getTime() + 3_600_000).toISOString(),
        recipients: [recipient.id],
        encryptedPayload: 'legacy-payload',
    });
    await here.drain();
    const deadline = new Date(legacy.triggerAt);
    const { api, state } = await apiProcess();
    api.carryRetryMs = 100;
    state.refuse = true;
    const read = api.getDeadmanSwitch(legacy.id)!;
    assert.equal(read.releaseFormat, 'legacy', 'a legacy switch');
    const outcome = await api.updateDeadmanSwitchIf(legacy.id, read, checkInPatchOf(read));
    assert.equal(outcome.kind, 'unanswered');
    state.refuse = false;
    await until(
        () => api.ownerWriteUnansweredAt(legacy.id) === undefined,
        3_000,
        'the API process’s carry'
    );
    const column = await columnOf(legacy.id);
    assert.ok(column instanceof Date, 'carried into Postgres');
    assert.equal(here.getDeadmanSwitch(legacy.id)?.ownerAttemptRefusedAt, undefined, 'not told');
    const late = new Date(deadline.getTime() + 5 * 60_000);
    const held = await logged('deadman_trigger_held_by_refused_attempt', async () => {
        await sweepOverdueDeadmanSwitches(late, 15 * 60_000);
        await here.drain();
    });
    assert.equal(held, 1, 'refused in Postgres, logged');
    const after = await stored(legacy.id);
    assert.equal(after?.status, 'armed', 'not fired');
    assert.equal(after?.encrypted_payload, 'legacy-payload');
    assert.equal((await columnOf(legacy.id))?.toISOString(), column.toISOString(), 'kept');
    assert.ok(
        !here
            .listDeadmanSwitchesForRecipient(recipient.id)
            .some((s) => s.id === legacy.id && s.status === 'triggered'),
        'nothing readable to the person named'
    );
    const next = new Date(late.getTime() + 30_000);
    await sweepOverdueDeadmanSwitches(next, 15 * 60_000);
    await here.drain();
    const windowed = await stored(legacy.id);
    assert.equal(windowed?.status, 'grace', 'the backlog window');
    assert.equal(windowed?.backlog_grace_started_at?.toISOString(), next.toISOString());
    const ends = new Date(Date.parse(here.getDeadmanSwitch(legacy.id)!.releaseAt) + 1_000);
    await sweepOverdueDeadmanSwitches(ends, 15 * 60_000);
    await here.drain();
    const fired = await stored(legacy.id);
    assert.equal(fired?.status, 'triggered', 'fired at the window’s end');
    assert.equal(await columnOf(legacy.id), null, 'the trigger clears the column');
    await api.drain();
});

test('the deletion’s last statement takes a row it did not rewrite with its copies as Postgres has them: a switch a queued erase cancelled, whose copies were blanked by the last statement or before it with the answer lost, is held cancelled with no sealed copy in the deleting process’s mirror (round 16)', async () => {
    // Round 16 of part 2's review (the verifiers' `p2-behind-copies.mts`):
    // the row taken as behind (marked, or another status than Postgres's)
    // went into the mirror, but its copies only where the mirror lacked
    // them, so the deleting process held the recipients' sealed copies of a
    // switch Postgres had cancelled with them blank, until it restarted (in
    // `deploy/docker/production` the API process runs no removal pass).
    // The queued erase: its switch statement lands (cancelled and emptied);
    // its copies statement loses its connection, before it runs or after it
    // committed; its retry is refused at connect; and the read back fails
    // too, so this process keeps the switch armed and marked, with the copy
    // held.
    for (const copiesLost of ['before running', 'after committing'] as const) {
        const owner = await person();
        const sw = await armedFor(owner, 3600, `label p2 ${copiesLost}`);
        let phase: 'fail-once' | 'partial' | 'fail-all' | 'ok' = 'fail-once';
        pool.connect = async () => {
            if (phase === 'fail-once') {
                phase = 'partial';
                throw new Error('connect ECONNREFUSED 127.0.0.1:5432 (test)');
            }
            if (phase === 'fail-all') {
                throw new Error('connect ECONNREFUSED 127.0.0.1:5432 (test)');
            }
            const client = await realConnect();
            if (phase === 'ok') return client;
            return {
                ...client,
                async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                    if (sql.startsWith('UPDATE deadman_release_wraps')) {
                        if (copiesLost === 'after committing') await client.query(sql, params);
                        phase = 'fail-all';
                        throw new Error('Connection terminated unexpectedly (test)');
                    }
                    return client.query<T>(sql, params);
                },
            };
        };
        const heldCopy = () =>
            here
                .listDeadmanReleaseWraps(sw.switchId)
                .find((w) => w.recipientAccountId === sw.recipient.id);
        const storedCopy = async () =>
            (await storedCopies(sw.switchId)).find(
                (c) => c.recipient_account_id === sw.recipient.id
            );
        try {
            here.beginOwnerDeletion(owner.id);
            assert.equal((await here.eraseDeadmanSwitchUnlessFired(sw.switchId)).kind, 'queued');
            await until(() => phase === 'fail-all', 3_000, 'the copies statement lost');
            await new Promise((r) => setTimeout(r, 300));
            assert.equal((await stored(sw.switchId))?.status, 'cancelled', 'cancelled in Postgres');
            assert.equal(
                (await storedCopy())?.held,
                copiesLost === 'before running',
                `its copy there (${copiesLost})`
            );
            assert.equal(here.getDeadmanSwitch(sw.switchId)?.status, 'armed', 'armed here');
            assert.equal(here.deadmanSwitchErasePending(sw.switchId), true, 'and marked');
            assert.notEqual(heldCopy()?.sealedKey, '', 'the copy held here');
        } finally {
            phase = 'ok';
            restore();
        }
        const announcedBefore = announced.length;
        await finishAccountDeletion(owner.id, here);
        assert.equal((await stored(sw.switchId))?.status, 'cancelled');
        assert.equal((await storedCopy())?.held, false, 'blank in Postgres');
        assert.equal(here.getDeadmanSwitch(sw.switchId)?.status, 'cancelled', 'taken here');
        assert.equal(here.deadmanSwitchErasePending(sw.switchId), false, 'the mark ends');
        assert.equal(
            heldCopy()?.sealedKey,
            '',
            `no sealed copy left in this mirror (${copiesLost})`
        );
        assert.equal(heldCopy()?.signature, '');
        if (copiesLost === 'before running') {
            assert.ok(
                announced
                    .slice(announcedBefore)
                    .some(
                        (p) =>
                            p.m === 'deadmanReleaseWraps' &&
                            p.kv?.[0] === sw.switchId &&
                            p.kv?.[1] === sw.recipient.id
                    ),
                'the copy the last statement blanked is announced'
            );
        }
        assert.equal(releasedCopiesFor(sw.recipient.id).length, 0, 'served to nobody');
    }
});

test('a carry whose answer is lost after it landed is written again by the next try, so the refusing process takes the column and announces it; the retry timer goes when a note ends any other way, and shutdown gives a note one last try (round 16)', async () => {
    // Round 16 of part 2's review. A try given up on (its bound passed, or
    // its connection lost after the statement committed) may have landed;
    // the next try writes the same moment again rather than being refused
    // over it, so this mirror still takes the column. And the timer went only
    // when a carry answered, so a note ended otherwise left a timer that
    // fired once for nothing (the verifiers' claims finding).
    const sw = await armed(3600);
    const { api, state } = await apiProcess();
    const announcedByApi: StoreChangePayload[] = [];
    (
        api as unknown as {
            transport: { publish(p: StoreChangePayload): void; close(): Promise<void> };
        }
    ).transport = {
        publish: (payload) => {
            announcedByApi.push(payload);
        },
        close: async () => {},
    };
    api.carryRetryMs = 100;
    let carries = 0;
    let lost = 0;
    state.holdQuery = (sql) => {
        if (!isCarry(sql)) return null;
        carries += 1;
        return null;
    };
    // The first carry runs, and its answer is lost on the way back.
    const shared = await realConnect();
    const apiInternals = api as unknown as {
        pool: { connect(): Promise<{ query: typeof shared.query; release(err?: Error): void }> };
        carryRetryTimer: ReturnType<typeof setTimeout> | null;
    };
    const apiConnect = apiInternals.pool.connect;
    let failCarries = false;
    apiInternals.pool.connect = async () => {
        const client = await apiConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (isCarry(sql) && failCarries) {
                    throw new Error('Connection terminated unexpectedly (test: the carry fails)');
                }
                const answer = await client.query<T>(sql, params);
                if (isCarry(sql) && lost === 0) {
                    lost += 1;
                    throw new Error('Connection terminated unexpectedly (test: after commit)');
                }
                return answer;
            },
        };
    };
    state.refuse = true;
    const read = api.getDeadmanSwitch(sw.switchId)!;
    assert.equal(
        (await api.updateDeadmanSwitchIf(sw.switchId, read, checkInPatchOf(read))).kind,
        'unanswered'
    );
    const note = api.ownerWriteUnansweredAt(sw.switchId)!;
    state.refuse = false;
    await until(
        () => api.ownerWriteUnansweredAt(sw.switchId) === undefined,
        3_000,
        'the carry written again'
    );
    assert.equal(lost, 1, 'the first landed with its answer lost');
    assert.ok(carries >= 2, 'written again');
    assert.equal((await columnOf(sw.switchId))?.toISOString(), note.at);
    assert.equal(
        api.getDeadmanSwitch(sw.switchId)?.ownerAttemptRefusedAt,
        note.at,
        'the refusing process takes the column'
    );
    assert.ok(
        announcedByApi.some((p) => p.m === 'deadmanSwitches' && p.kv?.[0] === sw.switchId),
        'and announces it'
    );

    // The timer goes when the last waiting note ends other than by its carry:
    // a check-in of the owner's applies on this process.
    api.carryRetryMs = 60_000;
    state.refuse = true;
    const read2 = api.getDeadmanSwitch(sw.switchId)!;
    assert.equal(
        (await api.updateDeadmanSwitchIf(sw.switchId, read2, checkInPatchOf(read2))).kind,
        'unanswered'
    );
    await until(() => apiInternals.carryRetryTimer !== null, 3_000, 'the retry timer set');
    state.refuse = false;
    // The refused check-in's switch is read first (round 20: its statement
    // failed, an unknown outcome, and no statement is sent until then). The
    // read answering, the carry is tried at once; it fails here, so its
    // timer is set again, a minute away, and the note still waits.
    failCarries = true;
    await readAgainNow(api);
    await until(() => apiInternals.carryRetryTimer !== null, 3_000, 'the retry timer set again');
    assert.ok(api.ownerWriteUnansweredAt(sw.switchId), 'the note still waits for its carry');
    const read3 = api.getDeadmanSwitch(sw.switchId)!;
    assert.equal(
        (await api.updateDeadmanSwitchIf(sw.switchId, read3, checkInPatchOf(read3))).kind,
        'applied'
    );
    await until(
        () => api.ownerWriteUnansweredAt(sw.switchId) === undefined,
        3_000,
        'the note ended by the check-in'
    );
    assert.equal(apiInternals.carryRetryTimer, null, 'no timer left to fire for nothing');
    failCarries = false;

    // Shutdown: a note not yet carried gets one last try, waited for, and no
    // timer is set after it.
    state.refuse = true;
    const read4 = api.getDeadmanSwitch(sw.switchId)!;
    assert.equal(
        (await api.updateDeadmanSwitchIf(sw.switchId, read4, checkInPatchOf(read4))).kind,
        'unanswered'
    );
    await until(() => apiInternals.carryRetryTimer !== null, 3_000, 'the retry timer set');
    const before = carries;
    state.refuse = false;
    await api.shutdown();
    assert.ok(carries > before, 'one last try');
    assert.equal(api.ownerWriteUnansweredAt(sw.switchId), undefined, 'it landed');
    assert.ok((await columnOf(sw.switchId)) instanceof Date);
    assert.equal(apiInternals.carryRetryTimer, null, 'no timer after shutdown');
    // Where that last try fails, no timer is set after it: the note is lost
    // with the process, as the documents say.
    const second = await apiProcess();
    (
        second.api as unknown as { transport: { publish(): void; close(): Promise<void> } }
    ).transport = { publish: () => {}, close: async () => {} };
    second.api.carryRetryMs = 60_000;
    second.state.refuse = true;
    const read5 = second.api.getDeadmanSwitch(sw.switchId)!;
    assert.equal(
        (await second.api.updateDeadmanSwitchIf(sw.switchId, read5, checkInPatchOf(read5))).kind,
        'unanswered'
    );
    const secondInternals = second.api as unknown as {
        carryRetryTimer: ReturnType<typeof setTimeout> | null;
    };
    await until(() => secondInternals.carryRetryTimer !== null, 3_000, 'the retry timer set');
    const failedTries = await logged('deadman_owner_attempt_carry_failed', async () => {
        await second.api.shutdown();
    });
    assert.equal(failedTries, 1, 'one last try, refused');
    assert.ok(second.api.ownerWriteUnansweredAt(sw.switchId), 'the note is kept, and lost with it');
    assert.equal(secondInternals.carryRetryTimer, null, 'and no timer is set after it');
    here.updateDeadmanSwitch(sw.switchId, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
});

test('a carry whose answer comes back while a late statement’s settle is reading the switch back never takes the place of the row the settle reads back: a cancel that landed after the carry leaves the switch cancelled with no copy held in Postgres or in the refusing process, a check-in that landed after it leaves its own last check-in, and the column never goes onto a cancelled row (round 17)', async () => {
    // Round 17 of part 2's review (the verifiers' `r1b-cancel-vs-settle.mts`
    // and `r1-carry-vs-settle.mts`). Since round 16 the carry runs outside the
    // switch's lane, so its row is what Postgres held when it ran. Here the
    // owner's statement is held before it is sent until past its bound (503,
    // noted); the carry runs in Postgres first, with its answer held; then
    // the statement lands, and the settle's read back is held. In the race
    // order the carry's answer comes back while that read is out (the settle
    // then left its newer row out of the mirror, and a cancel's copies stayed
    // held in Postgres and here); in the control order it comes back after
    // the settle has taken its row (the column then went onto the cancelled
    // row, which Postgres holds without one).
    for (const shape of ['cancel', 'check-in'] as const) {
        for (const order of ['race', 'control'] as const) {
            const sw = await armed(3600);
            const { api, state } = await apiProcess();
            api.switchStatementTimeoutMs = 200;
            api.carryRetryMs = 60_000;
            const statement = gateOpen();
            const carryAnswer = gateOpen();
            const settleRead = gateOpen();
            let sent = false;
            let carried = false;
            let settleReads = 0;
            state.holdQuery = (sql) => {
                if (isCarry(sql)) return null;
                if (isSwitchUpdate(sql) && !sent) {
                    sent = true;
                    return statement.promise;
                }
                if (sql.startsWith('SELECT * FROM deadman_switches WHERE id = $1') && sent) {
                    settleReads += 1;
                    return settleRead.promise;
                }
                return null;
            };
            const internals = api as unknown as {
                pool: {
                    connect(): Promise<{
                        query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
                        release(err?: Error): void;
                    }>;
                };
            };
            const connect = internals.pool.connect;
            internals.pool.connect = async () => {
                const client = await connect();
                return {
                    ...client,
                    async query<T>(sql: string, params?: unknown[]) {
                        const answer = await client.query<T>(sql, params);
                        if (isCarry(sql)) {
                            carried = true;
                            await carryAnswer.promise;
                        }
                        return answer;
                    },
                };
            };
            const stallStands = () => api.switchStatementsStalledBetween(Date.now(), Date.now());
            const read = api.getDeadmanSwitch(sw.switchId)!;
            const patch =
                shape === 'cancel'
                    ? {
                          status: 'cancelled' as const,
                          encryptedPayload: '',
                          ownerAttemptRefusedAt: undefined,
                      }
                    : checkInPatchOf(read);
            const what = `${shape}, ${order}`;
            try {
                assert.equal(
                    (await api.updateDeadmanSwitchIf(sw.switchId, read, patch)).kind,
                    'unanswered',
                    `${what}: refused after its bound`
                );
                await until(() => carried, 3_000, 'the carry run in Postgres');
                statement.open();
                await until(() => settleReads === 1, 3_000, 'the settle’s read back');
                assert.equal(
                    (await stored(sw.switchId))?.status,
                    shape === 'cancel' ? 'cancelled' : 'armed',
                    `${what}: the statement landed after the carry`
                );
                assert.equal(await columnOf(sw.switchId), null, `${what}: and cleared the column`);
                if (order === 'race') {
                    carryAnswer.open();
                    await until(
                        () => api.ownerWriteUnansweredAt(sw.switchId) === undefined,
                        3_000,
                        'the carry’s answer'
                    );
                    settleRead.open();
                } else {
                    settleRead.open();
                    await until(() => !stallStands(), 3_000, 'the settle');
                    carryAnswer.open();
                    await until(
                        () => api.ownerWriteUnansweredAt(sw.switchId) === undefined,
                        3_000,
                        'the carry’s answer'
                    );
                }
                await until(() => !stallStands(), 3_000, 'the stall’s end');
                await api.drain();
            } finally {
                statement.open();
                carryAnswer.open();
                settleRead.open();
                await api.drain();
            }
            const row = await stored(sw.switchId);
            const mirror = api.getDeadmanSwitch(sw.switchId)!;
            if (shape === 'cancel') {
                assert.equal(row?.status, 'cancelled');
                assert.equal(
                    mirror.status,
                    'cancelled',
                    `${what}: cancelled in the refusing process`
                );
                assert.equal(mirror.encryptedPayload, '', `${what}: its content gone there`);
                assert.deepEqual(
                    (await storedCopies(sw.switchId)).filter((c) => c.held),
                    [],
                    `${what}: no copy held in Postgres`
                );
                assert.deepEqual(
                    api.listDeadmanReleaseWraps(sw.switchId).filter((w) => w.sealedKey !== ''),
                    [],
                    `${what}: nor in the refusing process`
                );
            } else {
                assert.equal(
                    mirror.lastCheckInAt,
                    row?.last_check_in_at.toISOString(),
                    `${what}: the landed check-in in the refusing process`
                );
            }
            assert.equal(await columnOf(sw.switchId), null);
            assert.equal(
                mirror.ownerAttemptRefusedAt,
                undefined,
                `${what}: no refused attempt where Postgres holds none`
            );
            if (shape === 'check-in') {
                here.updateDeadmanSwitch(sw.switchId, {
                    status: 'cancelled',
                    encryptedPayload: '',
                });
                await here.drain();
            }
        }
    }
});

test('a landed carry takes the row Postgres returned where this mirror is still as the carry read it: a change another process made that this process was not told of comes in with the column (round 17)', async () => {
    // Round 17 of part 2's review: the verifiers' V12, the full row's take
    // replaced by the column alone, passed every test, since in each the
    // carry's row differed from the mirror in the column only.
    const sw = await armed(3600);
    const { api, state } = await apiProcess();
    api.carryRetryMs = 100;
    // Another process's write this one is not told of.
    const read = here.getDeadmanSwitch(sw.switchId)!;
    assert.equal(
        (await here.updateDeadmanSwitchIf(sw.switchId, read, { headline: 'set elsewhere' })).kind,
        'applied'
    );
    assert.equal(api.getDeadmanSwitch(sw.switchId)?.headline, undefined, 'not told');
    state.refuse = true;
    const apiRead = api.getDeadmanSwitch(sw.switchId)!;
    assert.equal(
        (await api.updateDeadmanSwitchIf(sw.switchId, apiRead, checkInPatchOf(apiRead))).kind,
        'unanswered'
    );
    const note = api.ownerWriteUnansweredAt(sw.switchId)!;
    state.refuse = false;
    await until(
        () => api.ownerWriteUnansweredAt(sw.switchId) === undefined,
        3_000,
        'the carry on the retry timer'
    );
    assert.equal((await columnOf(sw.switchId))?.toISOString(), note.at);
    const mirror = api.getDeadmanSwitch(sw.switchId)!;
    assert.equal(mirror.ownerAttemptRefusedAt, note.at, 'the column taken');
    assert.equal(mirror.headline, 'set elsewhere', 'with the row Postgres returned');
    here.updateDeadmanSwitch(sw.switchId, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
});

test('the deletion’s last statement, taking a row it did not rewrite because this mirror holds it behind Postgres, ends this process’s note of a refused attempt and its retry timer, with every carry failing meanwhile (round 17)', async () => {
    // Round 17 of part 2's review: the verifiers' V16, the behind take's
    // `endOwnerWriteNote` removed, passed every test, since a carry tried
    // after the take is refused over the cancelled switch and ends the note
    // anyway. Here every carry fails, so only the take can end it.
    const sw = await armed(3600);
    const retryMs = here.carryRetryMs;
    here.carryRetryMs = 60_000;
    let carries = 0;
    let refuse = true;
    pool.connect = async () => {
        if (refuse) throw new Error('connect ECONNREFUSED 127.0.0.1:5432 (test)');
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (isCarry(sql)) {
                    carries += 1;
                    throw new Error('Connection terminated unexpectedly (test: the carry fails)');
                }
                return client.query<T>(sql, params);
            },
        };
    };
    const internals = here as unknown as {
        carryRetryTimer: ReturnType<typeof setTimeout> | null;
    };
    try {
        const read = here.getDeadmanSwitch(sw.switchId)!;
        assert.equal(
            (await here.updateDeadmanSwitchIf(sw.switchId, read, checkInPatchOf(read))).kind,
            'unanswered'
        );
        assert.ok(here.ownerWriteUnansweredAt(sw.switchId), 'noted');
        await until(() => internals.carryRetryTimer !== null, 3_000, 'the retry timer set');
        refuse = false;
        // Cancelled in Postgres by a write this process was not told of,
        // leaving nothing for the deletion's first statement to rewrite.
        await pg.query(
            "UPDATE deadman_switches SET status = 'cancelled', encrypted_payload = '' WHERE id = $1",
            [sw.switchId]
        );
        here.beginOwnerDeletion(sw.owner.id);
        await finishAccountDeletion(sw.owner.id, here);
        assert.equal(
            await columnOf(sw.switchId),
            null,
            `no carry landed (${carries} sent, each failed)`
        );
        assert.equal(
            here.getDeadmanSwitch(sw.switchId)?.status,
            'cancelled',
            'taken as Postgres has it'
        );
        assert.equal(here.ownerWriteUnansweredAt(sw.switchId), undefined, 'the note ends');
        assert.equal(internals.carryRetryTimer, null, 'and its retry timer');
    } finally {
        refuse = false;
        restore();
        here.carryRetryMs = retryMs;
        // The refused check-in's statement failed at connect and so did its
        // read back, so its switch is still to be read (round 20), a minute
        // away on its timer: read now, so the stall does not outlive the test.
        await readAgainNow();
    }
});

test('a carry that lands after a late move’s settle has read the switch back, its answer coming while that read is out, has its column taken while the read is out once Postgres is read to hold it, and again after the settle’s row, which lacks it (rounds 17 and 18)', async () => {
    // Round 17 of part 2's review. The other order to test 45's: the move
    // into grace stalls and lands, its settle reads the switch, and only
    // then does the owner's refused check-in's carry run, which Postgres
    // takes (the move changed neither the switch's last check-in nor made it
    // fired or cancelled). The settle's row lacks the column; the carry's
    // answer, kept off the mirror's row while the read is out, has its
    // column taken onto the mirror's entry once Postgres is read to hold it
    // (round 18), and again after the settle's row.
    const sw = await armed(3600);
    here.switchStatementTimeoutMs = 200;
    const moveGate = gateOpen();
    const carryGate = gateOpen();
    const settleGate = gateOpen();
    let moveSent = false;
    let moveLanded = false;
    let carryReached = false;
    let settleReached = false;
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (isCarry(sql) && !carryReached) {
                    carryReached = true;
                    await carryGate.promise;
                    return client.query<T>(sql, params);
                }
                if (isSwitchUpdate(sql) && !isCarry(sql) && params?.includes(sw.switchId)) {
                    if (!moveSent) {
                        moveSent = true;
                        await moveGate.promise;
                        const answer = await client.query<T>(sql, params);
                        moveLanded = true;
                        return answer;
                    }
                }
                if (
                    sql.startsWith('SELECT * FROM deadman_switches WHERE id = $1') &&
                    moveLanded &&
                    !settleReached
                ) {
                    const answer = await client.query<T>(sql, params);
                    settleReached = true;
                    await settleGate.promise;
                    return answer;
                }
                return client.query<T>(sql, params);
            },
        };
    };
    try {
        const before = here.getDeadmanSwitch(sw.switchId)!;
        assert.equal(
            await here.advanceDeadmanSwitch(sw.switchId, before, { status: 'grace' }),
            undefined,
            'the move stalls'
        );
        assert.equal(here.switchStatementsStalledBetween(Date.now(), Date.now()), true);
        const read = here.getDeadmanSwitch(sw.switchId)!;
        assert.equal(read.status, 'armed');
        assert.equal(
            (await here.updateDeadmanSwitchIf(sw.switchId, read, checkInPatchOf(read))).kind,
            'unanswered',
            'the check-in refused at once during the stall'
        );
        const note = here.ownerWriteUnansweredAt(sw.switchId)!;
        await until(() => carryReached, 3_000, 'the carry, held before it is sent');
        moveGate.open();
        await until(() => settleReached, 3_000, 'the settle’s read, answered and held');
        assert.equal((await stored(sw.switchId))?.status, 'grace', 'the move landed');
        carryGate.open();
        await until(
            () => here.ownerWriteUnansweredAt(sw.switchId) === undefined,
            3_000,
            'the carry’s answer'
        );
        assert.equal(
            (await columnOf(sw.switchId))?.toISOString(),
            note.at,
            'the carry landed after the read'
        );
        await until(
            () => here.getDeadmanSwitch(sw.switchId)?.ownerAttemptRefusedAt === note.at,
            3_000,
            'the column read back while the settle’s read is out'
        );
        assert.equal(here.getDeadmanSwitch(sw.switchId)?.status, 'armed', 'the row not yet taken');
        settleGate.open();
        await until(
            () => !here.switchStatementsStalledBetween(Date.now(), Date.now()),
            3_000,
            'the stall’s end'
        );
        const mirror = here.getDeadmanSwitch(sw.switchId)!;
        assert.equal(mirror.status, 'grace', 'the settle’s row taken');
        assert.equal(mirror.ownerAttemptRefusedAt, note.at, 'and the carry’s column after it');
    } finally {
        moveGate.open();
        carryGate.open();
        settleGate.open();
        restore();
        here.switchStatementTimeoutMs = 30_000;
        await settled();
    }
    here.updateDeadmanSwitch(sw.switchId, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
});

test('a landed carry whose answer comes back after this mirror took a later refused attempt another process carried keeps the later one (round 17)', async () => {
    // Round 17 of part 2's review: the column alone goes into a mirror entry
    // that is not the one the carry read only where that entry holds no
    // later attempt, as Postgres's condition has it.
    const sw = await armed(3600);
    const { api, state } = await apiProcess();
    api.carryRetryMs = 60_000;
    const carryAnswer = gateOpen();
    let carried = false;
    let failed = false;
    state.holdQuery = (sql) => {
        if (isSwitchUpdate(sql) && !isCarry(sql) && !failed) {
            failed = true;
            return Promise.reject(new Error('Connection terminated unexpectedly (test)'));
        }
        return null;
    };
    const internals = api as unknown as {
        pool: {
            connect(): Promise<{
                query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
                release(err?: Error): void;
            }>;
        };
    };
    const connect = internals.pool.connect;
    internals.pool.connect = async () => {
        const client = await connect();
        return {
            ...client,
            async query<T>(sql: string, params?: unknown[]) {
                const answer = await client.query<T>(sql, params);
                if (isCarry(sql)) {
                    carried = true;
                    await carryAnswer.promise;
                }
                return answer;
            },
        };
    };
    try {
        const read = api.getDeadmanSwitch(sw.switchId)!;
        assert.equal(
            (await api.updateDeadmanSwitchIf(sw.switchId, read, checkInPatchOf(read))).kind,
            'unanswered',
            'its statement failed'
        );
        const note = api.ownerWriteUnansweredAt(sw.switchId)!;
        await until(() => carried, 3_000, 'the carry landed, its answer held');
        // Another process carries a later refused attempt, and this one is
        // told of it and refreshes.
        const later = new Date(Date.parse(note.at) + 60_000).toISOString();
        await pg.query(
            'UPDATE deadman_switches SET owner_attempt_refused_at = $2::timestamptz WHERE id = $1',
            [sw.switchId, later]
        );
        deliver(api, { src: 'elsewhere', m: 'deadmanSwitches', op: 'u', kv: [sw.switchId] });
        await until(
            () => api.getDeadmanSwitch(sw.switchId)?.ownerAttemptRefusedAt === later,
            3_000,
            'the refresh'
        );
        carryAnswer.open();
        await until(
            () => api.ownerWriteUnansweredAt(sw.switchId) === undefined,
            3_000,
            'the carry’s answer'
        );
        assert.equal(
            api.getDeadmanSwitch(sw.switchId)?.ownerAttemptRefusedAt,
            later,
            'the later attempt kept'
        );
        assert.equal((await columnOf(sw.switchId))?.toISOString(), later);
    } finally {
        carryAnswer.open();
        await api.drain();
    }
    here.updateDeadmanSwitch(sw.switchId, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
});

test('a known gap, pinned (decision 35): a statement of the API process’s that never answers holds its switch back for one backlog window only; every check-in and cancel there is refused 503 throughout, each carried, and the worker fires the switch when the window ends with that process still refusing (round 17)', async () => {
    // Round 17 of part 2's review (the verifiers' `lockout.mts`). The shared
    // pool sets no statement timeout or TCP keepalive, so a statement whose
    // bytes the database's host acknowledged before it went silent stands
    // until the process restarts where that host is gone or the silence
    // outlasts the host's own retransmission of its answer (about 15
    // minutes; round 18), and until the database answers where its process
    // stops answering on a host that stays up (round 19); decision 35 puts
    // a bound to the operator.
    // This pins what the documents now say happens meanwhile, so that a
    // change to it is seen; it is not a behaviour anyone chose for itself.
    const sw = await armed(3600);
    const deadline = Date.parse(here.getDeadmanSwitch(sw.switchId)!.triggerAt);
    const { api, state } = await apiProcess();
    api.switchStatementTimeoutMs = 200;
    api.carryRetryMs = 100;
    const hang = gateOpen();
    let hung = 0;
    state.holdQuery = (sql) => {
        if (isSwitchUpdate(sql) && !isCarry(sql) && hung === 0) {
            hung += 1;
            return hang.promise;
        }
        return null;
    };
    const checkIn = async () => {
        const read = api.getDeadmanSwitch(sw.switchId)!;
        return (await api.updateDeadmanSwitchIf(sw.switchId, read, checkInPatchOf(read))).kind;
    };
    const carried = () =>
        until(() => api.ownerWriteUnansweredAt(sw.switchId) === undefined, 3_000, 'the carry');
    try {
        assert.equal(await checkIn(), 'unanswered', 'the statement never answers: 503');
        await carried();
        // The worker was not told of the carry: its first pass's trigger is
        // refused in Postgres over the column and takes the row, and the
        // next gives the window (test 42).
        await sweepOverdueDeadmanSwitches(new Date(deadline + 5 * 60_000), 15 * 60_000);
        await here.drain();
        await sweepOverdueDeadmanSwitches(new Date(deadline + 5 * 60_000 + 30_000), 15 * 60_000);
        await here.drain();
        const windowed = await stored(sw.switchId);
        assert.equal(windowed?.status, 'grace', 'the backlog window at the deadline');
        assert.ok(windowed?.backlog_grace_started_at);
        const windowEnd = Date.parse(here.getDeadmanSwitch(sw.switchId)!.releaseAt);
        assert.ok(windowEnd >= deadline + 72 * 3_600_000, 'a 72-hour window');
        const tries = [await checkIn(), await checkIn()];
        const read = api.getDeadmanSwitch(sw.switchId)!;
        tries.push(
            (
                await api.updateDeadmanSwitchIf(sw.switchId, read, {
                    status: 'cancelled',
                    encryptedPayload: '',
                    ownerAttemptRefusedAt: undefined,
                })
            ).kind
        );
        assert.deepEqual(
            tries,
            ['unanswered', 'unanswered', 'unanswered'],
            'every check-in and cancel there refused at once during the window'
        );
        await carried();
        assert.ok((await columnOf(sw.switchId)) instanceof Date, 'each carried');
        await sweepOverdueDeadmanSwitches(new Date(windowEnd + 60_000), 15 * 60_000);
        await here.drain();
        const fired = await stored(sw.switchId);
        assert.equal(fired?.status, 'triggered', 'fired when the window ended');
        assert.ok(fired?.released_at);
        assert.equal(releasedCopiesFor(sw.recipient.id).length, 1, 'and served');
        assert.equal(
            api.switchStatementsStalledBetween(Date.now(), Date.now()),
            true,
            'with the API process’s statement still standing'
        );
        assert.equal(await checkIn(), 'unanswered', 'and its owner still refused there');
    } finally {
        hang.open();
        await api.drain();
    }
});

// ---------------------------------------------------------------------------
// Round 18 of part 2's review: a carried column goes onto a mirror entry
// only once Postgres is read to hold it or after a settle that took its row.

/** This store's pool, whose `connect` a test can wrap. */
const poolOf = (target: Store) =>
    (
        target as unknown as {
            pool: {
                connect(): Promise<{
                    query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
                    release(err?: Error): void;
                }>;
            };
        }
    ).pool;
/** A store's private field, read for a timer or a waiting list. */
const internal = <T>(target: Store, field: string): T =>
    (target as unknown as Record<string, T>)[field];
/** The read back of a landed carry's column (`confirmCarriedColumns`). */
const isColumnRead = (sql: string) =>
    sql.startsWith('SELECT owner_attempt_refused_at FROM deadman_switches');

test('a carry whose answer comes back while a late cancel’s settle is reading the switch back, a read that then fails, leaves no refused attempt in the refusing process: the column goes onto that process’s row only once Postgres is read to hold it, a failed read back takes nothing, and the switch read again is taken cancelled with its copies blanked (rounds 18 and 19)', async () => {
    // Round 18 of part 2's review. Round 17 kept a carry's answer that came
    // while a settle was reading the switch back off the mirror, and took its
    // column in the settle's `finally` whatever the settle did. Here the
    // carry lands first, the owner's cancel then lands late (clearing the
    // column), the carry's answer comes while the settle's read is out, and
    // that read fails: round 17 put the column onto the armed row the mirror
    // still held, where Postgres holds the switch cancelled with none. Round
    // 19: the failed read is tried again on a connection of its own, which
    // answers here, so the cancel reaches this process's mirror and its
    // copies are blanked (before, the switch stayed armed here with every
    // copy held, in Postgres too).
    const sw = await armed(3600);
    const { api, state } = await apiProcess();
    api.switchStatementTimeoutMs = 200;
    api.carryRetryMs = 60_000;
    const statement = gateOpen();
    const carryAnswer = gateOpen();
    const settleRead = gateOpen();
    let sent = false;
    let carried = false;
    let settleReads = 0;
    let columnReads = 0;
    state.holdQuery = (sql) => {
        if (isCarry(sql)) return null;
        if (isColumnRead(sql)) {
            columnReads += 1;
            return null;
        }
        if (isSwitchUpdate(sql) && !sent) {
            sent = true;
            return statement.promise;
        }
        if (sql.startsWith('SELECT * FROM deadman_switches WHERE id = $1') && sent) {
            settleReads += 1;
            if (settleReads > 1) return null;
            return settleRead.promise.then(() => {
                throw new Error('Connection terminated unexpectedly (test: the read back fails)');
            });
        }
        return null;
    };
    const internals = poolOf(api);
    const connect = internals.connect;
    internals.connect = async () => {
        const client = await connect();
        return {
            ...client,
            async query<T>(sql: string, params?: unknown[]) {
                const answer = await client.query<T>(sql, params);
                if (isCarry(sql)) {
                    carried = true;
                    await carryAnswer.promise;
                }
                return answer;
            },
        };
    };
    const heldCopiesInPostgres = async () =>
        (await storedCopies(sw.switchId)).filter((copy) => copy.held).length;
    assert.ok((await heldCopiesInPostgres()) > 0, 'the copies are held before the cancel');
    const stallStands = () => api.switchStatementsStalledBetween(Date.now(), Date.now());
    let failedReads = 0;
    try {
        failedReads = await logged('deadman_switch_settle_read_failed', async () => {
            const read = api.getDeadmanSwitch(sw.switchId)!;
            assert.equal(
                (
                    await api.updateDeadmanSwitchIf(sw.switchId, read, {
                        status: 'cancelled',
                        encryptedPayload: '',
                        ownerAttemptRefusedAt: undefined,
                    })
                ).kind,
                'unanswered',
                'the cancel refused after its bound'
            );
            await until(() => carried, 3_000, 'the carry run in Postgres');
            statement.open();
            await until(() => settleReads === 1, 3_000, 'the settle’s read back');
            assert.equal((await stored(sw.switchId))?.status, 'cancelled', 'the cancel landed');
            assert.equal(await columnOf(sw.switchId), null, 'after the carry, clearing it');
            carryAnswer.open();
            await until(
                () => api.ownerWriteUnansweredAt(sw.switchId) === undefined,
                3_000,
                'the carry’s answer, while the read is out'
            );
            await until(
                () => internal<Map<string, unknown>>(api, 'carriedColumnsToConfirm').size === 0,
                3_000,
                'its column read back from Postgres'
            );
            assert.equal(
                api.getDeadmanSwitch(sw.switchId)?.ownerAttemptRefusedAt,
                undefined,
                'not taken while the read is out, since Postgres holds none'
            );
            settleRead.open();
            await until(() => !stallStands(), 3_000, 'the stall’s end');
            await api.drain();
        });
    } finally {
        statement.open();
        carryAnswer.open();
        settleRead.open();
        await api.drain();
    }
    assert.equal(failedReads, 1, 'the settle’s read back failed, once');
    assert.equal(settleReads, 2, 'and was read again');
    assert.equal(await columnOf(sw.switchId), null);
    const mirror = api.getDeadmanSwitch(sw.switchId)!;
    assert.equal(
        mirror.ownerAttemptRefusedAt,
        undefined,
        'no refused attempt in the refusing process where Postgres holds none'
    );
    assert.ok(columnReads >= 1, 'the column was read back from Postgres');
    assert.equal(mirror.status, 'cancelled', 'the cancel reached the refusing process');
    assert.equal(mirror.encryptedPayload, '', 'with its content gone');
    assert.equal(await heldCopiesInPostgres(), 0, 'and every copy blanked in Postgres');
    assert.equal(
        api.listDeadmanReleaseWraps(sw.switchId).filter((wrap) => wrap.sealedKey !== '').length,
        0,
        'and in the refusing process'
    );
});

test('a carry answered after this mirror took a trigger made elsewhere leaves no refused attempt on the fired row: the carry lands in the backlog window, its answer is held while the worker fires at the window’s end and the refusing process refreshes (round 18)', async () => {
    // Round 18 of part 2's review (the verifiers' `pa-fired.mts`): round 17's
    // test 45 pinned only the cancelled half of `takeCarriedColumn`'s guard,
    // so removing the fired half passed every test. Without it the refusing
    // process's mirror, and so its export, listed a refused attempt on a
    // fired switch that Postgres does not hold (the trigger clears it).
    const sw = await armed(3600);
    const id = sw.switchId;
    const deadline = Date.parse(here.getDeadmanSwitch(id)!.triggerAt);
    const { api, state } = await apiProcess();
    api.switchStatementTimeoutMs = 200;
    api.carryRetryMs = 100;
    let failNext = true;
    state.holdQuery = (sql) => {
        if (isSwitchUpdate(sql) && !isCarry(sql) && failNext) {
            failNext = false;
            return Promise.reject(new Error('Connection terminated unexpectedly (test)'));
        }
        return null;
    };
    const holdCarry = { on: false, gate: gateOpen(), reached: false };
    const internals = poolOf(api);
    const connect = internals.connect;
    internals.connect = async () => {
        const client = await connect();
        return {
            ...client,
            async query<T>(sql: string, params?: unknown[]) {
                const answer = await client.query<T>(sql, params);
                if (isCarry(sql) && holdCarry.on) {
                    holdCarry.reached = true;
                    await holdCarry.gate.promise;
                }
                return answer;
            },
        };
    };
    const checkIn = async () => {
        const read = api.getDeadmanSwitch(id)!;
        return (await api.updateDeadmanSwitchIf(id, read, checkInPatchOf(read))).kind;
    };
    try {
        assert.equal(await checkIn(), 'unanswered', 'the first check-in’s statement fails');
        await until(() => api.ownerWriteUnansweredAt(id) === undefined, 3_000, 'its carry');
        for (let i = 0; i < 3 && (await stored(id))?.status !== 'grace'; i += 1) {
            await sweepOverdueDeadmanSwitches(
                new Date(deadline + 5 * 60_000 + i * 30_000),
                15 * 60_000
            );
            await here.drain();
        }
        assert.equal((await stored(id))?.status, 'grace', 'the backlog window');
        const windowEnd = Date.parse(here.getDeadmanSwitch(id)!.releaseAt);
        failNext = true;
        holdCarry.on = true;
        assert.equal(await checkIn(), 'unanswered', 'the second check-in’s statement fails');
        const note = api.ownerWriteUnansweredAt(id)!;
        await until(() => holdCarry.reached, 3_000, 'the second carry landed, its answer held');
        assert.equal((await columnOf(id))?.toISOString(), note.at);
        for (let i = 0; i < 3 && (await stored(id))?.status !== 'triggered'; i += 1) {
            await sweepOverdueDeadmanSwitches(
                new Date(windowEnd + 60_000 + i * 30_000),
                15 * 60_000
            );
            await here.drain();
        }
        assert.equal(
            (await stored(id))?.status,
            'triggered',
            'the worker fired at the window’s end'
        );
        assert.equal(await columnOf(id), null, 'and the trigger cleared the column');
        deliver(api, { src: 'elsewhere', m: 'deadmanSwitches', op: 'u', kv: [id] });
        await until(() => api.getDeadmanSwitch(id)?.status === 'triggered', 3_000, 'the refresh');
        holdCarry.gate.open();
        await until(
            () => api.ownerWriteUnansweredAt(id) === undefined,
            3_000,
            'the carry’s answer'
        );
        await api.drain();
        const mirror = api.getDeadmanSwitch(id)!;
        assert.equal(mirror.status, 'triggered');
        assert.equal(
            await columnOf(id),
            null,
            'Postgres holds no refused attempt on the fired switch'
        );
        assert.equal(mirror.ownerAttemptRefusedAt, undefined, 'nor does the refusing process');
    } finally {
        holdCarry.gate.open();
        await api.drain();
    }
});

test('while a late move’s settle cannot read the switch back, a carry that lands meanwhile reaches this process’s mirror and export once Postgres is read to hold it, a failed read of it tried again; a later refused attempt too; the settle’s row is then taken with the column (round 18)', async () => {
    // Round 18 of part 2's review (the verifiers' R17v-AR1, run on test 48's
    // harness). Round 17 kept the column off the mirror until the settle's
    // read, in the switch's lane and bounded by nothing, had ended, so for
    // as long as it stood this process's export lacked the refused attempts
    // Postgres held. The move's own change (grace) still reaches the mirror
    // only with the settle's row: that is the stall's documented part.
    const sw = await armed(3600);
    const retryMs = here.carryRetryMs;
    here.switchStatementTimeoutMs = 200;
    here.carryRetryMs = 100;
    const moveGate = gateOpen();
    const settleGate = gateOpen();
    let moveSent = false;
    let moveLanded = false;
    let settleReached = false;
    let columnReads = 0;
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (isColumnRead(sql)) {
                    columnReads += 1;
                    if (columnReads === 1) {
                        throw new Error(
                            'Connection terminated unexpectedly (test: the first read fails)'
                        );
                    }
                }
                if (isSwitchUpdate(sql) && !isCarry(sql) && params?.includes(sw.switchId)) {
                    if (!moveSent) {
                        moveSent = true;
                        await moveGate.promise;
                        const answer = await client.query<T>(sql, params);
                        moveLanded = true;
                        return answer;
                    }
                }
                if (
                    sql.startsWith('SELECT * FROM deadman_switches WHERE id = $1') &&
                    moveLanded &&
                    !settleReached
                ) {
                    settleReached = true;
                    await settleGate.promise;
                }
                return client.query<T>(sql, params);
            },
        };
    };
    const exported = () =>
        exportUserData(sw.owner.id)?.deadmanSwitches.find((s) => s.id === sw.switchId);
    try {
        const before = here.getDeadmanSwitch(sw.switchId)!;
        assert.equal(
            await here.advanceDeadmanSwitch(sw.switchId, before, { status: 'grace' }),
            undefined,
            'the move stalls'
        );
        moveGate.open();
        await until(() => settleReached, 3_000, 'the settle’s read, held unanswered');
        assert.equal((await stored(sw.switchId))?.status, 'grace', 'the move landed');
        const checkIn = async () => {
            const read = here.getDeadmanSwitch(sw.switchId)!;
            return (await here.updateDeadmanSwitchIf(sw.switchId, read, checkInPatchOf(read))).kind;
        };
        assert.equal(await checkIn(), 'unanswered', 'refused at once during the stall');
        const first = here.ownerWriteUnansweredAt(sw.switchId)!;
        await until(
            () => here.getDeadmanSwitch(sw.switchId)?.ownerAttemptRefusedAt === first.at,
            3_000,
            'the column in the mirror while the read stands'
        );
        assert.ok(columnReads >= 2, 'its first read back failed and was tried again');
        assert.equal((await columnOf(sw.switchId))?.toISOString(), first.at);
        assert.equal(exported()?.ownerAttemptRefusedAt, first.at, 'and in the export');
        assert.equal(
            here.switchStatementsStalledBetween(Date.now(), Date.now()),
            true,
            'stalled still'
        );
        assert.equal(here.getDeadmanSwitch(sw.switchId)?.status, 'armed', 'the move not yet taken');
        assert.equal(await checkIn(), 'unanswered', 'a second check-in refused at once');
        const second = here.ownerWriteUnansweredAt(sw.switchId)!;
        assert.ok(second.at > first.at);
        await until(
            () => here.getDeadmanSwitch(sw.switchId)?.ownerAttemptRefusedAt === second.at,
            3_000,
            'the later attempt in the mirror while the read stands'
        );
        assert.equal((await columnOf(sw.switchId))?.toISOString(), second.at);
        settleGate.open();
        await until(
            () => !here.switchStatementsStalledBetween(Date.now(), Date.now()),
            3_000,
            'the stall’s end'
        );
        const mirror = here.getDeadmanSwitch(sw.switchId)!;
        assert.equal(mirror.status, 'grace', 'the settle’s row taken over the column it carried');
        assert.equal(mirror.ownerAttemptRefusedAt, second.at, 'with the later attempt');
    } finally {
        moveGate.open();
        settleGate.open();
        restore();
        here.switchStatementTimeoutMs = 30_000;
        here.carryRetryMs = retryMs;
        await settled();
    }
    here.updateDeadmanSwitch(sw.switchId, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
});

// ---------------------------------------------------------------------------
// Round 19 of part 2's review: a settle whose read back fails is read again
// on a connection of its own; each settle that takes its row takes the
// carried columns again after it; and the branches of round 18's read back
// of a carried column are pinned.

/** The switch's row read in its lane, or read again (`settleSwitchStatement`, `retrySettleReads`). */
const isSwitchRead = (sql: string) =>
    sql.startsWith('SELECT * FROM deadman_switches WHERE id = $1');
/** Whether this call was made by the named method of the store (its synchronous part is on the stack). */
const calledFrom = (method: string) => (new Error().stack ?? '').includes(method);
/** The copies of a switch this process's mirror holds sealed. */
const wrapsHeldInMirror = (switchId: string) =>
    here.listDeadmanReleaseWraps(switchId).filter((wrap) => wrap.sealedKey !== '').length;
/** `ms` milliseconds, then `'pending'`: a bounded wait that tells a promise still out. */
const pendingAfter = (work: Promise<unknown>, ms: number) =>
    Promise.race([
        work.then(() => 'settled' as const),
        new Promise<'pending'>((r) => setTimeout(() => r('pending'), ms)),
    ]);

test('a late cancel whose settle read back fails, in the natural order (its carry answered first, then the cancel lands, then the read back fails), is read again on a connection of its own until one answers, each try within carryTimeoutMs, the stall standing meanwhile: the refusing process then holds the switch cancelled, every copy is blanked in Postgres, it is announced, and the owner’s list, the export and a store told of it say cancelled (round 19)', async () => {
    // Round 19 of part 2's review (the verifiers' attack-replay and claims
    // probes, order `carry-answer-first`): the cancel's carry runs at once on
    // a connection of its own while the cancel stalls, so its answer usually
    // comes before the cancel lands, and its row (armed, with the column)
    // went into the mirror. The cancel then landed (cancelled, column
    // cleared, content emptied) and its read back failed: nothing was taken,
    // announced or blanked, so this process, its export and the worker held
    // the switch armed and Postgres held every sealed copy until the owner
    // cancelled again, a process restarted, or the switch's deadline passed.
    const sw = await armed(3600);
    const id = sw.switchId;
    const other = await otherProcess();
    const saved = { timeout: here.carryTimeoutMs, retry: here.carryRetryMs };
    here.switchStatementTimeoutMs = 200;
    here.carryTimeoutMs = 300;
    here.carryRetryMs = 100;
    const cancelGate = gateOpen();
    const lateConnect = gateOpen();
    let cancelSent = false;
    let cancelLanded = false;
    let switchReads = 0;
    let retryConnects = 0;
    let lateConnectionReleased: boolean | null = null;
    const releasedWith: unknown[] = [];
    pool.connect = async () => {
        const fromRetry = calledFrom('runSettleRetryPass');
        if (fromRetry) retryConnects += 1;
        const late = fromRetry && retryConnects === 1;
        if (late) await lateConnect.promise;
        const client = await realConnect();
        let readSwitch = false;
        let queried = false;
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                queried = true;
                if (isSwitchUpdate(sql) && !isCarry(sql) && params?.includes(id) && !cancelSent) {
                    cancelSent = true;
                    await cancelGate.promise;
                    const answer = await client.query<T>(sql, params);
                    cancelLanded = true;
                    return answer;
                }
                if (isSwitchRead(sql) && cancelLanded) {
                    switchReads += 1;
                    readSwitch = true;
                    if (switchReads === 1) {
                        throw new Error(
                            'Connection terminated unexpectedly (test: the read back fails)'
                        );
                    }
                    if (switchReads === 2) await new Promise<void>(() => {});
                }
                return client.query<T>(sql, params);
            },
            release: (err?: Error) => {
                if (late) lateConnectionReleased = !queried;
                if (readSwitch && fromRetry) releasedWith.push(err);
                client.release?.(err);
            },
        };
    };
    const heldCopiesInPostgres = async () =>
        (await storedCopies(id)).filter((copy) => copy.held).length;
    const stallStands = () => here.switchStatementsStalledBetween(Date.now(), Date.now());
    let failedReads = 0;
    const before = announcedFor(id).length;
    try {
        failedReads = await logged('deadman_switch_settle_read_failed', async () => {
            const cancel = await post(sw.owner, `/switches/${id}/cancel`);
            assert.equal(cancel.status, 503, 'the cancel refused after its bound');
            await until(
                () => here.ownerWriteUnansweredAt(id) === undefined,
                3_000,
                'the cancel’s carry, answered'
            );
            const note = (await columnOf(id))?.toISOString();
            assert.ok(note, 'the carry landed');
            assert.equal(here.getDeadmanSwitch(id)?.status, 'armed');
            assert.equal(
                here.getDeadmanSwitch(id)?.ownerAttemptRefusedAt,
                note,
                'its row, with the column, in the mirror before the cancel lands'
            );
            cancelGate.open();
            await until(() => switchReads >= 2, 3_000, 'the read back failed and is read again');
            assert.equal((await stored(id))?.status, 'cancelled', 'the cancel landed');
            assert.equal(stallStands(), true, 'the stall stands while the switch is read again');
            const checkIn = await post(sw.owner, `/switches/${id}/check-in`);
            assert.equal(checkIn.status, 503, 'a check-in meanwhile is refused at once');
            await until(
                () => here.getDeadmanSwitch(id)?.status === 'cancelled',
                5_000,
                'the switch read again and taken'
            );
            await until(() => !stallStands(), 3_000, 'the stall’s end');
            await here.drain();
        });
    } finally {
        cancelGate.open();
        lateConnect.open();
        restore();
        here.switchStatementTimeoutMs = 30_000;
        here.carryTimeoutMs = saved.timeout;
        here.carryRetryMs = saved.retry;
        await settled();
    }
    assert.equal(
        retryConnects,
        3,
        'a connection not handed over in time, a read that hangs, then one that answers'
    );
    assert.equal(switchReads, 3);
    assert.equal(
        failedReads,
        3,
        'the lane’s read, the connection’s bound and the read’s bound, each logged'
    );
    assert.equal(releasedWith.length, 2, 'both connections that read the switch went back');
    assert.match(
        String((releasedWith[0] as Error | undefined)?.message),
        /no answer within 300 ms/,
        'the one whose read passed its bound with the error, so the pool drops it'
    );
    assert.equal(releasedWith[1], undefined, 'the one that answered without one');
    await until(() => lateConnectionReleased !== null, 3_000, 'the connection handed over late');
    assert.equal(lateConnectionReleased, true, 'given back unused');
    const mirror = here.getDeadmanSwitch(id)!;
    assert.equal(mirror.status, 'cancelled');
    assert.equal(mirror.encryptedPayload, '');
    assert.equal(mirror.ownerAttemptRefusedAt, undefined, 'the cancel cleared the column');
    assert.equal(await heldCopiesInPostgres(), 0, 'every copy blanked in Postgres');
    assert.equal(wrapsHeldInMirror(id), 0, 'and in the refusing process');
    const list = await app.request('/v1/deadman/switches', { headers: auth(sw.owner) });
    const listed = (
        (await list.json()) as { switches: Array<{ switchId: string; status: string }> }
    ).switches.find((s) => s.switchId === id);
    assert.equal(listed?.status, 'cancelled', 'the owner’s list');
    assert.equal(
        exportUserData(sw.owner.id)?.deadmanSwitches.find((s) => s.id === id)?.status,
        'cancelled',
        'the export'
    );
    assert.ok(announcedFor(id).length > before, 'announced');
    assert.equal(other.getDeadmanSwitch(id)?.status, 'armed', 'the other process not yet told');
    deliver(other, announcedFor(id).at(-1)!);
    await until(() => other.getDeadmanSwitch(id)?.status === 'cancelled', 3_000, 'told, it agrees');
});

test('two settles of one switch overlapping keep a carried column Postgres holds: the first takes a row read before the carry landed, the second keeps its row out, and the column read back meanwhile is taken again after the first row, so the refusing process and its export list the refused attempt (round 19)', async () => {
    // Round 19 of part 2's review (the verifiers' O1): the sweep's move into
    // grace stalls; the owner's check-in on the same read is sent before
    // the move's bound and stalls too, so two settles of the switch overlap.
    // The check-in's carry lands after settle A's read has run in Postgres
    // and before its answer comes, and its answer comes while both settles
    // are out, so its column is read back and taken. Then A takes its row,
    // which lacks the column; B, whose entry predates A's row, keeps its row
    // out. Round 18 took the notes' columns again only after the last
    // settle and only where that one took its row, so the column, already
    // read back, was gone from this mirror for good.
    const sw = await armed(3600);
    const retryMs = here.carryRetryMs;
    here.switchStatementTimeoutMs = 200;
    here.carryRetryMs = 60_000;
    const moveGate = gateOpen();
    const checkInGate = gateOpen();
    const carryGate = gateOpen();
    const settleA = gateOpen();
    let moveSent = false;
    let checkInSent = false;
    let checkInRan = false;
    let readsAfterCheckIn = 0;
    let carryReached = false;
    let aHeld = false;
    let bRead = false;
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (isCarry(sql)) {
                    carryReached = true;
                    await carryGate.promise;
                    return client.query<T>(sql, params);
                }
                if (isSwitchUpdate(sql) && params?.includes(sw.switchId)) {
                    if (!moveSent) {
                        moveSent = true;
                        await moveGate.promise;
                        return client.query<T>(sql, params);
                    }
                    if (!checkInSent) {
                        checkInSent = true;
                        await checkInGate.promise;
                        const answer = await client.query<T>(sql, params);
                        checkInRan = true;
                        return answer;
                    }
                }
                if (isSwitchRead(sql) && checkInRan) {
                    // 1: the refused check-in's own read; 2: settle A's,
                    // run now and answered later; 3: settle B's.
                    readsAfterCheckIn += 1;
                    if (readsAfterCheckIn === 2) {
                        const answer = await client.query<T>(sql, params);
                        aHeld = true;
                        await settleA.promise;
                        return answer;
                    }
                    if (readsAfterCheckIn === 3) {
                        const answer = await client.query<T>(sql, params);
                        bRead = true;
                        return answer;
                    }
                }
                return client.query<T>(sql, params);
            },
        };
    };
    const exported = () =>
        exportUserData(sw.owner.id)?.deadmanSwitches.find((s) => s.id === sw.switchId);
    let note: { at: string; lastCheckInAt: string } | undefined;
    try {
        const read = here.getDeadmanSwitch(sw.switchId)!;
        const move = here.advanceDeadmanSwitch(sw.switchId, read, { status: 'grace' });
        await until(() => moveSent, 3_000, 'the move sent');
        here.switchStatementTimeoutMs = 1_000;
        const checkIn = here.updateDeadmanSwitchIf(sw.switchId, read, checkInPatchOf(read));
        here.switchStatementTimeoutMs = 200;
        assert.equal(await move, undefined, 'the move stalls');
        moveGate.open();
        await until(() => checkInSent, 3_000, 'the check-in sent, behind the move');
        assert.equal((await checkIn).kind, 'unanswered', 'and stalls too');
        note = here.ownerWriteUnansweredAt(sw.switchId)!;
        await until(() => carryReached, 3_000, 'the check-in’s carry, held before it runs');
        checkInGate.open();
        await until(() => aHeld, 3_000, 'settle A’s read run, its answer held');
        assert.equal((await stored(sw.switchId))?.status, 'grace', 'the move landed');
        assert.equal(await columnOf(sw.switchId), null, 'A read before the carry landed');
        carryGate.open();
        await until(
            () => here.ownerWriteUnansweredAt(sw.switchId) === undefined,
            3_000,
            'the carry answered'
        );
        assert.equal((await columnOf(sw.switchId))?.toISOString(), note.at, 'the carry landed');
        await until(
            () => here.getDeadmanSwitch(sw.switchId)?.ownerAttemptRefusedAt === note!.at,
            3_000,
            'the column read back while both settles are out'
        );
        settleA.open();
        await until(() => bRead, 3_000, 'settle B’s read');
        await until(
            () => !here.switchStatementsStalledBetween(Date.now(), Date.now()),
            3_000,
            'the stall’s end'
        );
        await settled();
    } finally {
        moveGate.open();
        checkInGate.open();
        carryGate.open();
        settleA.open();
        restore();
        here.switchStatementTimeoutMs = 30_000;
        here.carryRetryMs = retryMs;
        await settled();
    }
    const mirror = here.getDeadmanSwitch(sw.switchId)!;
    assert.equal((await columnOf(sw.switchId))?.toISOString(), note!.at, 'Postgres holds it');
    assert.equal(mirror.status, 'grace', 'the move taken');
    assert.equal(
        mirror.ownerAttemptRefusedAt,
        note!.at,
        'the refusing process holds the refused attempt Postgres holds'
    );
    assert.equal(exported()?.ownerAttemptRefusedAt, note!.at, 'and its export lists it');
    here.updateDeadmanSwitch(sw.switchId, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
});

/**
 * A move of `sw` that stalls and lands, its settle's read held before it runs
 * until `settleGate` opens; `onColumnRead` runs before each read back of a
 * carried column, with its number; `releasedAfterColumnRead` lists the error
 * each connection that read a column was given back with.
 */
const stalledMoveHoldingSettle = async (
    sw: { switchId: string },
    onColumnRead: (n: number) => Promise<void> | void,
    onConnect: () => Promise<void> | void = () => undefined
) => {
    const moveGate = gateOpen();
    const settleGate = gateOpen();
    let moveSent = false;
    let moveLanded = false;
    let settleReached = false;
    let columnReads = 0;
    const releasedAfterColumnRead: unknown[] = [];
    pool.connect = async () => {
        await onConnect();
        const client = await realConnect();
        let readColumn = false;
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (isColumnRead(sql)) {
                    columnReads += 1;
                    readColumn = true;
                    await onColumnRead(columnReads);
                }
                if (
                    isSwitchUpdate(sql) &&
                    !isCarry(sql) &&
                    params?.includes(sw.switchId) &&
                    !moveSent
                ) {
                    moveSent = true;
                    await moveGate.promise;
                    const answer = await client.query<T>(sql, params);
                    moveLanded = true;
                    return answer;
                }
                if (isSwitchRead(sql) && moveLanded && !settleReached) {
                    settleReached = true;
                    await settleGate.promise;
                }
                return client.query<T>(sql, params);
            },
            release: (err?: Error) => {
                if (readColumn) releasedAfterColumnRead.push(err);
                client.release?.(err);
            },
        };
    };
    const before = here.getDeadmanSwitch(sw.switchId)!;
    assert.equal(
        await here.advanceDeadmanSwitch(sw.switchId, before, { status: 'grace' }),
        undefined,
        'the move stalls'
    );
    moveGate.open();
    await until(() => settleReached, 3_000, 'the settle’s read, held');
    return {
        settleGate,
        moveGate,
        reads: () => columnReads,
        releasedAfterColumnRead,
    };
};
/** A check-in on this process refused at once during the stall, and its note. */
const refusedCheckInHere = async (switchId: string) => {
    const read = here.getDeadmanSwitch(switchId)!;
    assert.equal(
        (await here.updateDeadmanSwitchIf(switchId, read, checkInPatchOf(read))).kind,
        'unanswered'
    );
    return here.ownerWriteUnansweredAt(switchId)!;
};

test('a read back of a carried column that does not answer is given up after carryTimeoutMs and tried again: a connection the pool does not hand over in time, then a read that hangs, whose connection goes back with the error, then the column is taken while the settle’s read still stands (round 19)', async () => {
    // Round 19 of part 2's review (the verifiers' O2, and U2, U3 and U4:
    // removing the bound on the read, the bound on the connection, or the
    // error the connection goes back with, each passed every test).
    const sw = await armed(3600);
    const saved = { timeout: here.carryTimeoutMs, retry: here.carryRetryMs };
    here.switchStatementTimeoutMs = 200;
    here.carryTimeoutMs = 300;
    here.carryRetryMs = 100;
    let confirmConnects = 0;
    const lateConnect = gateOpen();
    let held: Awaited<ReturnType<typeof stalledMoveHoldingSettle>> | undefined;
    try {
        held = await stalledMoveHoldingSettle(
            sw,
            (n) => (n === 1 ? new Promise<void>(() => {}) : undefined),
            async () => {
                if (!calledFrom('runColumnConfirmPass')) return;
                confirmConnects += 1;
                if (confirmConnects === 1) await lateConnect.promise;
            }
        );
        const note = await refusedCheckInHere(sw.switchId);
        await until(
            () => here.getDeadmanSwitch(sw.switchId)?.ownerAttemptRefusedAt === note.at,
            5_000,
            'the column in the mirror after a connection and a read that did not answer'
        );
        assert.equal(confirmConnects, 3, 'three tries, each on a new connection');
        assert.equal(held.reads(), 2, 'the second try’s read hung, the third answered');
        assert.match(
            String((held.releasedAfterColumnRead[0] as Error | undefined)?.message),
            /no answer within 300 ms/,
            'the hung read’s connection went back with the error, so the pool drops it'
        );
        assert.equal(
            here.switchStatementsStalledBetween(Date.now(), Date.now()),
            true,
            'the settle’s read still stands'
        );
    } finally {
        lateConnect.open();
        held?.moveGate.open();
        held?.settleGate.open();
        restore();
        here.switchStatementTimeoutMs = 30_000;
        here.carryTimeoutMs = saved.timeout;
        here.carryRetryMs = saved.retry;
        await settled();
    }
    here.updateDeadmanSwitch(sw.switchId, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
});

test('a carry answered while a read back of carried columns is out is read back when that read ends, with no timer: the second refused attempt reaches the mirror while the settle’s read still stands (round 19)', async () => {
    // Round 19 of part 2's review (the verifiers' O3, and U1: without the
    // read run again after one that answered, a carry answered while a read
    // was out waited until the settle ended, which is round 18's R17v-AR1).
    const sw = await armed(3600);
    const retryMs = here.carryRetryMs;
    here.switchStatementTimeoutMs = 200;
    here.carryRetryMs = 60_000;
    const readGate = gateOpen();
    let held: Awaited<ReturnType<typeof stalledMoveHoldingSettle>> | undefined;
    try {
        held = await stalledMoveHoldingSettle(sw, (n) => (n === 1 ? readGate.promise : undefined));
        const first = await refusedCheckInHere(sw.switchId);
        await until(() => held!.reads() === 1, 3_000, 'the first read back, held');
        const second = await refusedCheckInHere(sw.switchId);
        assert.ok(second.at > first.at);
        await until(
            () => here.ownerWriteUnansweredAt(sw.switchId) === undefined,
            3_000,
            'the second carry answered'
        );
        assert.equal((await columnOf(sw.switchId))?.toISOString(), second.at);
        readGate.open();
        await until(
            () => here.getDeadmanSwitch(sw.switchId)?.ownerAttemptRefusedAt === second.at,
            3_000,
            'the second column in the mirror'
        );
        assert.equal(held.reads(), 2, 'read again once the first read ended');
        assert.equal(
            here.switchStatementsStalledBetween(Date.now(), Date.now()),
            true,
            'the settle’s read still stands'
        );
    } finally {
        readGate.open();
        held?.moveGate.open();
        held?.settleGate.open();
        restore();
        here.switchStatementTimeoutMs = 30_000;
        here.carryRetryMs = retryMs;
        await settled();
    }
    here.updateDeadmanSwitch(sw.switchId, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
});

test('a settle that takes its row ends the waiting read back of the columns it took, and the timer set after that read failed goes with it (round 19)', async () => {
    // Round 19 of part 2's review: the timer of the read back was not
    // cleared when a settle that took its row resolved the waiting notes, so
    // it woke once for nothing (the defect round 16 fixed for the carry's).
    const sw = await armed(3600);
    const retryMs = here.carryRetryMs;
    here.switchStatementTimeoutMs = 200;
    here.carryRetryMs = 60_000;
    let held: Awaited<ReturnType<typeof stalledMoveHoldingSettle>> | undefined;
    const waiting = () => internal<Map<string, unknown>>(here, 'carriedColumnsToConfirm');
    const timer = () => internal<unknown>(here, 'columnConfirmTimer');
    try {
        held = await stalledMoveHoldingSettle(sw, (n) => {
            if (n === 1)
                throw new Error('Connection terminated unexpectedly (test: the read fails)');
        });
        const note = await refusedCheckInHere(sw.switchId);
        await until(
            () => held!.reads() === 1 && timer() !== null,
            3_000,
            'the read failed, a retry set'
        );
        assert.equal(waiting().has(sw.switchId), true, 'the column waits');
        assert.equal(here.getDeadmanSwitch(sw.switchId)?.ownerAttemptRefusedAt, undefined);
        held.settleGate.open();
        await until(
            () => here.getDeadmanSwitch(sw.switchId)?.status === 'grace',
            3_000,
            'the settle’s row taken'
        );
        assert.equal(
            here.getDeadmanSwitch(sw.switchId)?.ownerAttemptRefusedAt,
            note.at,
            'with the column after it'
        );
        assert.equal(waiting().has(sw.switchId), false, 'nothing waits');
        assert.equal(timer(), null, 'and no timer is left');
        assert.equal(held.reads(), 1);
    } finally {
        held?.moveGate.open();
        held?.settleGate.open();
        restore();
        here.switchStatementTimeoutMs = 30_000;
        here.carryRetryMs = retryMs;
        await settled();
    }
    here.updateDeadmanSwitch(sw.switchId, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
});

test('a refresh that replaces this process’s entry while a late move’s settle reads keeps the settle’s older row out; drain waits for a read back of a carried column under way, and one that fails after shutdown sets no timer (round 19)', async () => {
    // Round 19 of part 2's review (U8, U6 and U7: a settle that took its row
    // over any change, drain not waiting for the read back, and a timer set
    // after shutdown, each passed every test). Another process cancels the
    // switch after the settle's read ran and before its answer came; this
    // process is told and refreshes; the settle's row (grace) is older and
    // stays out. The refused check-in's column waits, its read back held.
    const sw = await armed(3600);
    const id = sw.switchId;
    const { api, state } = await apiProcess();
    api.switchStatementTimeoutMs = 200;
    api.carryRetryMs = 60_000;
    const moveGate = gateOpen();
    const settleAnswer = gateOpen();
    const columnRead = gateOpen();
    let moveSent = false;
    let moveLanded = false;
    let settleRan = false;
    let columnReads = 0;
    state.holdQuery = (sql) => {
        if (isSwitchUpdate(sql) && !isCarry(sql) && !moveSent) {
            moveSent = true;
            return moveGate.promise.then(() => {
                moveLanded = true;
            });
        }
        if (isColumnRead(sql)) {
            columnReads += 1;
            return columnRead.promise.then(() => {
                throw new Error('Connection terminated unexpectedly (test: the read fails)');
            });
        }
        return null;
    };
    const internals = poolOf(api);
    const connect = internals.connect;
    internals.connect = async () => {
        const client = await connect();
        return {
            ...client,
            async query<T>(sql: string, params?: unknown[]) {
                const answer = await client.query<T>(sql, params);
                if (isSwitchRead(sql) && moveLanded && !settleRan) {
                    settleRan = true;
                    await settleAnswer.promise;
                }
                return answer;
            },
        };
    };
    const waiting = () => internal<Map<string, unknown>>(api, 'carriedColumnsToConfirm');
    try {
        const read = api.getDeadmanSwitch(id)!;
        assert.equal(await api.advanceDeadmanSwitch(id, read, { status: 'grace' }), undefined);
        moveGate.open();
        await until(() => settleRan, 3_000, 'the settle’s read run, its answer held');
        const armedRead = api.getDeadmanSwitch(id)!;
        assert.equal(
            (await api.updateDeadmanSwitchIf(id, armedRead, checkInPatchOf(armedRead))).kind,
            'unanswered',
            'a check-in refused at once during the stall'
        );
        await until(() => columnReads === 1, 3_000, 'its carry landed, its column read back, held');
        await pg.query(
            "UPDATE deadman_switches SET status = 'cancelled', encrypted_payload = '', " +
                'owner_attempt_refused_at = NULL, updated_at = now() WHERE id = $1',
            [id]
        );
        deliver(api, { src: 'elsewhere', m: 'deadmanSwitches', op: 'u', kv: [id] });
        await until(() => api.getDeadmanSwitch(id)?.status === 'cancelled', 3_000, 'the refresh');
        settleAnswer.open();
        await until(
            () => !api.switchStatementsStalledBetween(Date.now(), Date.now()),
            3_000,
            'the settle ended'
        );
        assert.equal(
            api.getDeadmanSwitch(id)?.status,
            'cancelled',
            'the settle’s older row (grace) kept out over the refresh'
        );
        assert.equal(waiting().has(id), true, 'the column still waits for its read back');
        assert.equal(
            await pendingAfter(api.drain(), 300),
            'pending',
            'drain waits for the read back under way'
        );
        const down = api.shutdown();
        columnRead.open();
        await down;
        assert.equal(waiting().has(id), true, 'the column waits still');
        assert.equal(
            internal<unknown>(api, 'columnConfirmTimer'),
            null,
            'and no timer was set after shutdown'
        );
    } finally {
        moveGate.open();
        settleAnswer.open();
        columnRead.open();
    }
});

test('a settle read again after its read back failed: drain waits for a try under way, and shutdown gives the settle one last try, which ends the timer set after a try that failed, and sets no timer after it (round 19)', async () => {
    const sw = await armed(3600);
    const id = sw.switchId;
    const { api, state } = await apiProcess();
    api.switchStatementTimeoutMs = 200;
    api.carryRetryMs = 60_000;
    const moveGate = gateOpen();
    const firstAgain = gateOpen();
    const lastAgain = gateOpen();
    let moveSent = false;
    let moveLanded = false;
    let switchReads = 0;
    state.holdQuery = (sql) => {
        if (isSwitchUpdate(sql) && !isCarry(sql) && !moveSent) {
            moveSent = true;
            return moveGate.promise.then(() => {
                moveLanded = true;
            });
        }
        if (isSwitchRead(sql) && moveLanded) {
            switchReads += 1;
            const failing = new Error('Connection terminated unexpectedly (test: the read fails)');
            if (switchReads === 1) return Promise.reject(failing);
            const gate = switchReads === 2 ? firstAgain : lastAgain;
            return gate.promise.then(() => {
                throw failing;
            });
        }
        return null;
    };
    const timer = () => internal<unknown>(api, 'settleRetryTimer');
    const stallStands = () => api.switchStatementsStalledBetween(Date.now(), Date.now());
    try {
        const read = api.getDeadmanSwitch(id)!;
        assert.equal(await api.advanceDeadmanSwitch(id, read, { status: 'grace' }), undefined);
        moveGate.open();
        await until(() => switchReads === 2, 3_000, 'the read back failed, a read again held');
        assert.equal(
            await pendingAfter(api.drain(), 300),
            'pending',
            'drain waits for the try under way'
        );
        firstAgain.open();
        await until(() => timer() !== null, 3_000, 'the try failed, a retry set');
        assert.equal(stallStands(), true, 'the stall stands');
        const down = api.shutdown();
        assert.equal(timer(), null, 'shutdown’s last try ended the timer');
        await until(() => switchReads === 3, 3_000, 'and gave the settle one last try');
        lastAgain.open();
        await down;
        assert.equal(timer(), null, 'which, failing, set no timer');
        assert.equal(api.getDeadmanSwitch(id)?.status, 'armed', 'nothing read, nothing taken');
    } finally {
        moveGate.open();
        firstAgain.open();
        lastAgain.open();
    }
    here.updateDeadmanSwitch(id, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
});

test('a read back of carried columns made while the timer set after a failed one is waiting ends that timer: a second carry answered meanwhile is read back at once, and nothing wakes later for nothing (round 19)', async () => {
    const sw = await armed(3600);
    const retryMs = here.carryRetryMs;
    here.switchStatementTimeoutMs = 200;
    here.carryRetryMs = 60_000;
    let held: Awaited<ReturnType<typeof stalledMoveHoldingSettle>> | undefined;
    const waiting = () => internal<Map<string, unknown>>(here, 'carriedColumnsToConfirm');
    const timer = () => internal<unknown>(here, 'columnConfirmTimer');
    try {
        held = await stalledMoveHoldingSettle(sw, (n) => {
            if (n === 1)
                throw new Error('Connection terminated unexpectedly (test: the read fails)');
        });
        await refusedCheckInHere(sw.switchId);
        await until(() => timer() !== null, 3_000, 'the first read failed, a retry set');
        const second = await refusedCheckInHere(sw.switchId);
        await until(
            () => here.getDeadmanSwitch(sw.switchId)?.ownerAttemptRefusedAt === second.at,
            3_000,
            'the second carry’s column read back at once'
        );
        assert.equal(held.reads(), 2);
        assert.equal(waiting().has(sw.switchId), false, 'nothing waits');
        assert.equal(timer(), null, 'and the timer went when that read began');
    } finally {
        held?.moveGate.open();
        held?.settleGate.open();
        restore();
        here.switchStatementTimeoutMs = 30_000;
        here.carryRetryMs = retryMs;
        await settled();
    }
    here.updateDeadmanSwitch(sw.switchId, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
});

test('a settle whose taking of the row read again throws is ended, logged, and its stall with it, rather than standing for good (round 19)', async () => {
    // Round 19 of part 2's review: the read again's take is guarded, so a
    // fault in it (here the announcement throwing, twice: once after the
    // lane's read, which then counts as failed, once after the read again)
    // ends the settle instead of leaving its stall standing with the try's
    // promise rejected and unhandled.
    const sw = await armed(3600);
    const id = sw.switchId;
    const { api, state } = await apiProcess();
    api.switchStatementTimeoutMs = 200;
    api.carryRetryMs = 60_000;
    const moveGate = gateOpen();
    let moveSent = false;
    let moveLanded = false;
    let throws = 0;
    state.holdQuery = (sql) => {
        if (isSwitchUpdate(sql) && !isCarry(sql) && !moveSent) {
            moveSent = true;
            return moveGate.promise.then(() => {
                moveLanded = true;
            });
        }
        return null;
    };
    (api as unknown as { transport: { publish(p: StoreChangePayload): void } }).transport = {
        publish: (payload) => {
            if (moveLanded && payload.m === 'deadmanSwitches' && throws < 2) {
                throws += 1;
                throw new Error('test: the announcement throws');
            }
        },
    };
    let takeFailed = 0;
    try {
        takeFailed = await logged('deadman_switch_settle_take_failed', async () => {
            const read = api.getDeadmanSwitch(id)!;
            assert.equal(await api.advanceDeadmanSwitch(id, read, { status: 'grace' }), undefined);
            moveGate.open();
            await until(
                () => !api.switchStatementsStalledBetween(Date.now(), Date.now()),
                3_000,
                'the stall’s end'
            );
            await api.drain();
        });
    } finally {
        moveGate.open();
    }
    assert.equal(throws, 2, 'the take threw after the lane’s read and after the read again');
    assert.equal(takeFailed, 1, 'the second, logged');
    assert.equal(internal<unknown[]>(api, 'settleReadsToRetry').length, 0, 'nothing waits');
    here.updateDeadmanSwitch(id, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
});

test('the stall stands while any statement that passed its bound has not settled: with two out, the one that passed its bound last settling first does not end it, and the other, landing late with its read back failing, keeps it until the switch has been read again; a check-in and an arm meanwhile are refused at once, unsent (round 19)', async () => {
    // Round 19 of part 2's review, found on reading that round's own fix:
    // the stall was one slot holding the statement that passed its bound
    // last. Two owners' writes sent within one bound of each other both
    // stall; when the later one settled the stall ended, with the earlier
    // one still unanswered, or landed with its row not yet read back into
    // this mirror, so statements were sent again and an arm read the bounds
    // without that row (the rule test 17 pins for one statement).
    const x = await armed(3600);
    const y = await armed(3600);
    const z = await armed(3600);
    const armOwner = await person();
    const armNamed = await person();
    const envelope = await protocol.buildReleaseEnvelope({
        ownerKeySet: armOwner.keySet,
        recipients: [armNamed.keySet.identity],
        message: 'Synthetic test text.',
    });
    const arm = () =>
        armReleaseSwitch({
            ownerId: armOwner.id,
            input: { checkInIntervalSeconds: 3600, gracePeriodSeconds: 0, envelope },
        });
    const retryMs = here.carryRetryMs;
    here.switchStatementTimeoutMs = 200;
    here.carryRetryMs = 100;
    const gateX = gateOpen();
    const gateY = gateOpen();
    const readAgain = gateOpen();
    let xSent = false;
    let xLanded = false;
    let ySent = false;
    let xReads = 0;
    let zStatements = 0;
    let armStatements = 0;
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (isSwitchUpdate(sql) && !isCarry(sql)) {
                    if (params?.includes(x.switchId) && !xSent) {
                        xSent = true;
                        await gateX.promise;
                        const answer = await client.query<T>(sql, params);
                        xLanded = true;
                        return answer;
                    }
                    if (params?.includes(y.switchId) && !ySent) {
                        ySent = true;
                        await gateY.promise;
                        return client.query<T>(sql, params);
                    }
                    if (params?.includes(z.switchId)) zStatements += 1;
                }
                if (params?.includes(envelope.releaseId) && !isCarry(sql)) armStatements += 1;
                if (isSwitchRead(sql) && xLanded && params?.includes(x.switchId)) {
                    xReads += 1;
                    if (xReads === 1) {
                        throw new Error(
                            'Connection terminated unexpectedly (test: the read back fails)'
                        );
                    }
                    if (xReads === 2) await readAgain.promise;
                }
                return client.query<T>(sql, params);
            },
        };
    };
    const stallStands = () => here.switchStatementsStalledBetween(Date.now(), Date.now());
    const checkInZ = async () => {
        const read = here.getDeadmanSwitch(z.switchId)!;
        return (await here.updateDeadmanSwitchIf(z.switchId, read, checkInPatchOf(read))).kind;
    };
    try {
        const readX = here.getDeadmanSwitch(x.switchId)!;
        const readY = here.getDeadmanSwitch(y.switchId)!;
        const cancelX = here.updateDeadmanSwitchIf(x.switchId, readX, {
            status: 'cancelled',
            encryptedPayload: '',
            ownerAttemptRefusedAt: undefined,
        });
        await until(() => xSent, 3_000, 'the cancel sent');
        await new Promise((r) => setTimeout(r, 50));
        const checkInY = here.updateDeadmanSwitchIf(y.switchId, readY, checkInPatchOf(readY));
        await until(
            () => ySent,
            3_000,
            'the other owner’s check-in sent, within the first’s bound'
        );
        assert.equal((await cancelX).kind, 'unanswered', 'the cancel passes its bound first');
        assert.equal((await checkInY).kind, 'unanswered', 'the check-in passes its bound last');
        assert.equal(stallStands(), true);

        // The statement that passed its bound last answers and settles; the
        // cancel still stands unanswered.
        gateY.open();
        await until(
            () => here.getDeadmanSwitch(y.switchId)?.lastCheckInAt !== readY.lastCheckInAt,
            3_000,
            'the check-in, landed late, read back into the mirror'
        );
        await new Promise((r) => setTimeout(r, 50));
        assert.equal((await stored(x.switchId))?.status, 'armed', 'the cancel has not landed');
        assert.equal(stallStands(), true, 'the stall stands: the cancel is still unanswered');
        assert.equal(await checkInZ(), 'unanswered', 'a check-in meanwhile is refused');
        assert.equal(zStatements, 0, 'unsent');

        // The cancel lands; its read back fails, and the read again is held.
        gateX.open();
        await until(() => xReads >= 2, 3_000, 'the cancel’s read back failed and is read again');
        assert.equal((await stored(x.switchId))?.status, 'cancelled', 'the cancel landed');
        assert.equal(here.getDeadmanSwitch(x.switchId)?.status, 'armed', 'not yet in the mirror');
        assert.equal(stallStands(), true, 'the stall stands until the switch has been read again');
        assert.equal(await checkInZ(), 'unanswered', 'a check-in meanwhile is refused');
        assert.equal(zStatements, 0, 'unsent');
        assert.equal((await arm()).kind, 'write_unanswered', 'and so is an arm');
        assert.equal(armStatements, 0, 'unsent');

        readAgain.open();
        await until(
            () => here.getDeadmanSwitch(x.switchId)?.status === 'cancelled',
            3_000,
            'the switch read again and taken'
        );
        await until(() => !stallStands(), 3_000, 'the stall’s end');
        assert.equal(await checkInZ(), 'applied', 'a check-in is sent again');
        assert.equal((await arm()).kind, 'armed', 'and an arm');
    } finally {
        gateX.open();
        gateY.open();
        readAgain.open();
        restore();
        here.switchStatementTimeoutMs = 30_000;
        here.carryRetryMs = retryMs;
        await settled();
    }
    assert.equal(
        (here as unknown as { stalledSwitchStatement: unknown }).stalledSwitchStatement,
        null,
        'no statement is left out'
    );
    for (const id of [y.switchId, z.switchId, envelope.releaseId]) {
        here.updateDeadmanSwitch(id, { status: 'cancelled', encryptedPayload: '' });
    }
    await here.drain();
});

test('an arm answered 503 whose insert lands and whose read back fails is read again with its copies: the switch and every copy of it reach the mirror, the bounds count it and the owner’s list shows it (round 19)', async () => {
    // Round 19 of part 2's review, on reading that round's own fix: the read
    // again reads the copies where the lane's read would have (the arm), and
    // nothing pinned it; without them this process would hold an armed
    // switch whose copies it lacks, counted toward no person's bound.
    const owner = await person();
    const named = await person();
    const envelope = await protocol.buildReleaseEnvelope({
        ownerKeySet: owner.keySet,
        recipients: [named.keySet.identity],
        message: 'Synthetic test text.',
    });
    const id = envelope.releaseId;
    const retryMs = here.carryRetryMs;
    here.switchStatementTimeoutMs = 200;
    here.carryRetryMs = 100;
    const insertGate = gateOpen();
    let landed = false;
    let reads = 0;
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (sql.startsWith('INSERT INTO deadman_switches') && params?.includes(id)) {
                    await insertGate.promise;
                    const answer = await client.query<T>(sql, params);
                    landed = true;
                    return answer;
                }
                if (isSwitchRead(sql) && landed && params?.includes(id)) {
                    reads += 1;
                    if (reads === 1) {
                        throw new Error(
                            'Connection terminated unexpectedly (test: the read back fails)'
                        );
                    }
                }
                return client.query<T>(sql, params);
            },
        };
    };
    const before = announced.filter((p) => p.m === 'deadmanReleaseWraps').length;
    try {
        const outcome = await armReleaseSwitch({
            ownerId: owner.id,
            input: { checkInIntervalSeconds: 3600, gracePeriodSeconds: 0, envelope },
        });
        assert.equal(outcome.kind, 'write_unanswered', 'the arm passes its bound');
        assert.equal(here.getDeadmanSwitch(id), undefined, 'nothing in the mirror');
        insertGate.open();
        await until(
            () => here.getDeadmanSwitch(id)?.status === 'armed',
            3_000,
            'the arm read again and taken'
        );
        await until(
            () => !here.switchStatementsStalledBetween(Date.now(), Date.now()),
            3_000,
            'the stall’s end'
        );
    } finally {
        insertGate.open();
        restore();
        here.switchStatementTimeoutMs = 30_000;
        here.carryRetryMs = retryMs;
        await settled();
    }
    assert.equal(reads, 2, 'the lane’s read failed, the read again answered');
    assert.equal(wrapsHeldInMirror(id), 2, 'with its copies: the owner’s and the person’s');
    assert.equal(heldReleasesNaming(named.id).total, 1, 'the person’s bound counts it');
    assert.equal(
        announced.filter((p) => p.m === 'deadmanReleaseWraps').length - before,
        2,
        'each copy announced'
    );
    const list = await app.request('/v1/deadman/switches', { headers: auth(owner) });
    const listed = (
        (await list.json()) as { switches: Array<{ switchId: string; status: string }> }
    ).switches.find((s) => s.switchId === id);
    assert.equal(listed?.status, 'armed', 'the owner’s list');
    here.updateDeadmanSwitch(id, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
});

test('one read again at a time: a settle whose read back fails while a read again is under way is read by it, on its connection, and one that joins after its last read and before it has ended is read at once after it, not left waiting with no timer (round 19)', async () => {
    // Round 19 of part 2's review, on reading that round's own fix. A second
    // read again started beside one under way would read the same settle
    // and then drop another, unread, from the head of the list, whose stall
    // would stand for good; and a settle that joins the list between a read
    // again's last read and its end finds one under way, so only that one's
    // end can start the next: neither line was pinned. The second case is a
    // window of a few microtasks, reached here by joining a settle from the
    // connection's release, which the read again makes after its last read.
    const x = await armed(3600);
    const y = await armed(3600);
    const z = await armed(3600);
    const retryMs = here.carryRetryMs;
    here.switchStatementTimeoutMs = 200;
    here.carryRetryMs = 60_000;
    const gateX = gateOpen();
    const gateY = gateOpen();
    const xAgain = gateOpen();
    let xSent = false;
    let xLanded = false;
    let ySent = false;
    let yLanded = false;
    let xReads = 0;
    let yReads = 0;
    let zReads = 0;
    let retryConnects = 0;
    let atRelease: (() => void) | null = null;
    pool.connect = async () => {
        const fromRetry = calledFrom('runSettleRetryPass');
        if (fromRetry) retryConnects += 1;
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (isSwitchUpdate(sql) && !isCarry(sql)) {
                    if (params?.includes(x.switchId) && !xSent) {
                        xSent = true;
                        await gateX.promise;
                        const answer = await client.query<T>(sql, params);
                        xLanded = true;
                        return answer;
                    }
                    if (params?.includes(y.switchId) && !ySent) {
                        ySent = true;
                        await gateY.promise;
                        const answer = await client.query<T>(sql, params);
                        yLanded = true;
                        return answer;
                    }
                }
                if (isSwitchRead(sql)) {
                    const failing = new Error(
                        'Connection terminated unexpectedly (test: the read back fails)'
                    );
                    if (xLanded && params?.includes(x.switchId)) {
                        xReads += 1;
                        if (xReads === 1) throw failing;
                        if (xReads === 2) await xAgain.promise;
                    }
                    if (yLanded && params?.includes(y.switchId)) {
                        yReads += 1;
                        if (yReads === 1) throw failing;
                    }
                    if (fromRetry && params?.includes(z.switchId)) zReads += 1;
                }
                return client.query<T>(sql, params);
            },
            release: (err?: Error) => {
                if (fromRetry) {
                    const run = atRelease;
                    atRelease = null;
                    run?.();
                }
                client.release?.(err);
            },
        };
    };
    const waiting = () => internal<unknown[]>(here, 'settleReadsToRetry').length;
    let joined: Promise<void> | undefined;
    let atJoin: { connects: number; yReads: number } | undefined;
    try {
        const readX = here.getDeadmanSwitch(x.switchId)!;
        const readY = here.getDeadmanSwitch(y.switchId)!;
        const cancelX = here.updateDeadmanSwitchIf(x.switchId, readX, {
            status: 'cancelled',
            encryptedPayload: '',
            ownerAttemptRefusedAt: undefined,
        });
        await until(() => xSent, 3_000, 'the cancel sent');
        const checkInY = here.updateDeadmanSwitchIf(y.switchId, readY, checkInPatchOf(readY));
        await until(() => ySent, 3_000, 'the check-in sent');
        assert.equal((await cancelX).kind, 'unanswered');
        assert.equal((await checkInY).kind, 'unanswered');

        gateX.open();
        await until(
            () => xReads === 2,
            3_000,
            'the cancel’s read back failed, its read again held'
        );
        assert.equal(retryConnects, 1);
        gateY.open();
        await until(() => waiting() === 2, 3_000, 'the check-in’s read back failed and waits too');
        await new Promise((r) => setTimeout(r, 50));
        assert.equal(retryConnects, 1, 'no second read again beside the one under way');

        // A settle joins at the release the read again makes after its last
        // read: the one under way is over but for its end.
        atRelease = () => {
            atJoin = { connects: retryConnects, yReads };
            joined = (
                here as unknown as { retrySettleRead(settle: unknown): Promise<void> }
            ).retrySettleRead({
                id: z.switchId,
                seen: here.getDeadmanSwitch(z.switchId),
                withCopies: false,
                reading: { reading: 1, notes: [] },
            });
        };
        xAgain.open();
        await until(() => joined !== undefined, 3_000, 'the read again’s end');
        assert.deepEqual(
            atJoin,
            { connects: 1, yReads: 2 },
            'the check-in’s switch read by the read again under way, on its one connection'
        );
        assert.equal(
            await pendingAfter(joined!, 2_000),
            'settled',
            'the settle that joined at its end is read at once after it'
        );
        assert.equal(zReads, 1);
        assert.equal(retryConnects, 2, 'by a read again of its own');
        assert.equal(internal<unknown>(here, 'settleRetryTimer'), null, 'on no timer');
        assert.equal(waiting(), 0, 'nothing waits');
        await until(
            () => !here.switchStatementsStalledBetween(Date.now(), Date.now()),
            3_000,
            'the stall’s end'
        );
    } finally {
        gateX.open();
        gateY.open();
        xAgain.open();
        restore();
        here.switchStatementTimeoutMs = 30_000;
        here.carryRetryMs = retryMs;
        await settled();
    }
    assert.equal(here.getDeadmanSwitch(x.switchId)?.status, 'cancelled', 'the cancel taken');
    assert.equal(wrapsHeldInMirror(x.switchId), 0, 'its copies blanked');
    for (const id of [y.switchId, z.switchId]) {
        here.updateDeadmanSwitch(id, { status: 'cancelled', encryptedPayload: '' });
    }
    await here.drain();
});

test('drain, having waited for a read again under way, waits for what it queued: a late cancel’s copies, blanked when the switch read again is taken, are in Postgres when drain returns (round 19)', async () => {
    // Round 19 of part 2's review, on reading that round's own fix: drain
    // waited for a read again under way (test 60) and then for the queue
    // once more, and nothing pinned the second wait. (A read again that
    // ends while drain is still in its first wait for the queue is not this
    // case: what it queues then is behind that wait's snapshot.)
    const sw = await armed(3600);
    const id = sw.switchId;
    const { api, state } = await apiProcess();
    api.switchStatementTimeoutMs = 200;
    api.carryRetryMs = 60_000;
    const cancelGate = gateOpen();
    const again = gateOpen();
    const blankGate = gateOpen();
    let cancelSent = false;
    let cancelLanded = false;
    let switchReads = 0;
    let blanksHeld = 0;
    state.holdQuery = (sql) => {
        if (isCarry(sql)) return null;
        if (isSwitchUpdate(sql) && !cancelSent) {
            cancelSent = true;
            return cancelGate.promise.then(() => {
                cancelLanded = true;
            });
        }
        if (isSwitchRead(sql) && cancelLanded) {
            switchReads += 1;
            if (switchReads === 1) {
                return Promise.reject(
                    new Error('Connection terminated unexpectedly (test: the read fails)')
                );
            }
            if (switchReads === 2) return again.promise;
        }
        if (cancelLanded && sql.startsWith('INSERT INTO deadman_release_wraps')) {
            blanksHeld += 1;
            return blankGate.promise;
        }
        return null;
    };
    const heldInPostgres = async () => (await storedCopies(id)).filter((copy) => copy.held).length;
    try {
        const read = api.getDeadmanSwitch(id)!;
        assert.equal(
            (
                await api.updateDeadmanSwitchIf(id, read, {
                    status: 'cancelled',
                    encryptedPayload: '',
                    ownerAttemptRefusedAt: undefined,
                })
            ).kind,
            'unanswered'
        );
        cancelGate.open();
        await until(() => switchReads === 2, 3_000, 'the read back failed, a read again held');
        const draining = api.drain();
        assert.equal(await pendingAfter(draining, 200), 'pending', 'drain waits for the try');
        again.open();
        await until(() => blanksHeld > 0, 3_000, 'the switch taken cancelled, its blanking sent');
        assert.equal(api.getDeadmanSwitch(id)?.status, 'cancelled');
        assert.equal(await heldInPostgres(), 2, 'the copies still held in Postgres');
        assert.equal(
            await pendingAfter(draining, 300),
            'pending',
            'drain waits for the blanking the read again queued'
        );
        blankGate.open();
        await draining;
        assert.equal(await heldInPostgres(), 0, 'in Postgres when drain returns');
    } finally {
        cancelGate.open();
        again.open();
        blankGate.open();
        state.holdQuery = null;
        await api.drain();
    }
});

test('a settle that has ended leaves nothing behind for a later carry: the carry of a check-in refused afterwards takes the row Postgres returned, a change made elsewhere included, not its column alone (round 19)', async () => {
    // Round 19 of part 2's review, on reading that round's own fix: a
    // switch stays marked as being settled until its last settle ends, and
    // nothing pinned the mark's end; left standing, every later carry of
    // the switch would be read back column by column, and the rest of the
    // row it returned dropped.
    const sw = await armed(3600);
    const id = sw.switchId;
    const { api, state } = await apiProcess();
    api.switchStatementTimeoutMs = 200;
    api.carryRetryMs = 100;
    const lateGate = gateOpen();
    let lateSent = false;
    state.holdQuery = (sql) => {
        if (isSwitchUpdate(sql) && !isCarry(sql) && !lateSent) {
            lateSent = true;
            return lateGate.promise;
        }
        return null;
    };
    try {
        const read = api.getDeadmanSwitch(id)!;
        assert.equal(
            (await api.updateDeadmanSwitchIf(id, read, { headline: 'late' })).kind,
            'unanswered',
            'a statement passes its bound'
        );
        lateGate.open();
        await until(
            () => api.getDeadmanSwitch(id)?.headline === 'late',
            3_000,
            'it lands and is settled'
        );
        await until(
            () => !api.switchStatementsStalledBetween(Date.now(), Date.now()),
            3_000,
            'the stall’s end'
        );
        await until(
            () => api.ownerWriteUnansweredAt(id) === undefined,
            3_000,
            'the late statement’s own refusal, carried or refused'
        );
    } finally {
        lateGate.open();
        state.holdQuery = null;
    }
    // Another process's write this one is not told of.
    const hereRead = here.getDeadmanSwitch(id)!;
    assert.equal(
        (await here.updateDeadmanSwitchIf(id, hereRead, { headline: 'set elsewhere' })).kind,
        'applied'
    );
    assert.equal(api.getDeadmanSwitch(id)?.headline, 'late', 'not told');
    state.refuse = true;
    const apiRead = api.getDeadmanSwitch(id)!;
    assert.equal(
        (await api.updateDeadmanSwitchIf(id, apiRead, checkInPatchOf(apiRead))).kind,
        'unanswered'
    );
    const note = api.ownerWriteUnansweredAt(id)!;
    state.refuse = false;
    await until(() => api.ownerWriteUnansweredAt(id) === undefined, 3_000, 'the carry lands');
    const mirror = api.getDeadmanSwitch(id)!;
    assert.equal(mirror.ownerAttemptRefusedAt, note.at, 'the column taken');
    assert.equal(mirror.headline, 'set elsewhere', 'with the row Postgres returned');
    here.updateDeadmanSwitch(id, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
});

test('an arm at a bound is refused until an earlier arm’s landed row is in the mirror, also where another statement passed its bound after that arm and settled first: the sixth release naming one person from one owner is not let past the bound of five (round 19)', async () => {
    // Round 19 of part 2's review, on reading that round's own fix: test 17's
    // rule with a second statement out. The fifth arm's insert passes its
    // bound; another owner's check-in, sent within that bound, passes its own
    // after it and then lands and settles, which ended the stall while the
    // fifth arm's row, landed, was not yet read back; a sixth arm then read
    // the bounds without it and was armed, six held in Postgres.
    const owner = await person();
    const named = await person();
    const other = await armed(3600);
    const armNaming = async () => {
        const envelope = await protocol.buildReleaseEnvelope({
            ownerKeySet: owner.keySet,
            recipients: [named.keySet.identity],
            message: 'Synthetic test text.',
        });
        return armReleaseSwitch({
            ownerId: owner.id,
            input: { checkInIntervalSeconds: 3600, gracePeriodSeconds: 0, envelope },
        });
    };
    for (let i = 0; i < 4; i += 1) assert.equal((await armNaming()).kind, 'armed');
    await here.drain();
    const retryMs = here.carryRetryMs;
    here.switchStatementTimeoutMs = 200;
    here.carryRetryMs = 60_000;
    const insertGate = gateOpen();
    const checkInGate = gateOpen();
    const readGate = gateOpen();
    let insertHeld = false;
    let insertLanded = false;
    let checkInSent = false;
    let readHeld = false;
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (sql.startsWith('INSERT INTO deadman_switches') && !insertHeld) {
                    insertHeld = true;
                    await insertGate.promise;
                    const answer = await client.query<T>(sql, params);
                    insertLanded = true;
                    return answer;
                }
                if (
                    isSwitchUpdate(sql) &&
                    !isCarry(sql) &&
                    params?.includes(other.switchId) &&
                    !checkInSent
                ) {
                    checkInSent = true;
                    await checkInGate.promise;
                    return client.query<T>(sql, params);
                }
                if (
                    isSwitchRead(sql) &&
                    insertLanded &&
                    !readHeld &&
                    !params?.includes(other.switchId)
                ) {
                    readHeld = true;
                    await readGate.promise;
                }
                return client.query<T>(sql, params);
            },
        };
    };
    const stallStands = () => here.switchStatementsStalledBetween(Date.now(), Date.now());
    try {
        const fifth = armNaming();
        await until(() => insertHeld, 5_000, 'the fifth arm’s insert, held');
        const read = here.getDeadmanSwitch(other.switchId)!;
        const checkIn = here.updateDeadmanSwitchIf(other.switchId, read, checkInPatchOf(read));
        await until(() => checkInSent, 3_000, 'another owner’s check-in sent within that bound');
        assert.equal((await fifth).kind, 'write_unanswered', 'the arm passes its bound first');
        assert.equal((await checkIn).kind, 'unanswered', 'the check-in passes its bound last');
        // The fifth arm's insert lands, and its read back is held.
        insertGate.open();
        await until(() => readHeld, 3_000, 'the fifth arm’s read back, held');
        // The check-in lands and settles.
        checkInGate.open();
        await until(
            () => here.getDeadmanSwitch(other.switchId)?.lastCheckInAt !== read.lastCheckInAt,
            3_000,
            'the check-in read back into the mirror'
        );
        await new Promise((r) => setTimeout(r, 50));
        assert.equal(stallStands(), true, 'the stall stands: the fifth is not in the mirror yet');
        assert.equal(heldReleasesNaming(named.id).total, 4, 'the mirror lacks the fifth');
        assert.equal((await armNaming()).kind, 'write_unanswered', 'a sixth is refused meanwhile');
        readGate.open();
        await until(() => !stallStands(), 3_000, 'the stall’s end');
    } finally {
        insertGate.open();
        checkInGate.open();
        readGate.open();
        restore();
        here.switchStatementTimeoutMs = 30_000;
        here.carryRetryMs = retryMs;
        await settled();
    }
    assert.equal(heldReleasesNaming(named.id).total, 5, 'the fifth is counted now');
    const pgNaming = (
        await pg.query(
            "SELECT count(*)::int AS n FROM deadman_release_wraps w JOIN deadman_switches s ON s.id = w.switch_id WHERE w.recipient_account_id = $1 AND s.owner_id = $2 AND s.encrypted_payload <> ''",
            [named.id, owner.id]
        )
    ).rows[0] as { n: number };
    assert.equal(pgNaming.n, 5, 'five in Postgres');
    assert.equal((await armNaming()).kind, 'recipient_limit', 'the sixth is refused by the bound');
    here.updateDeadmanSwitch(other.switchId, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
});

// ---------------------------------------------------------------------------
// Round 20 of part 2's review: a switch statement that rejects is an unknown
// outcome, within its bound or after it. The connection can be lost after
// the database applied the statement (a failover, a reset, a pooler dropping
// its client), and nothing read the switch back: a cancel the database had
// applied left the refusing process, its list and its export holding the
// switch armed with its content and every sealed copy held in Postgres, and
// an arm whose insert had committed was in no mirror and counted toward no
// bound, until the owner's next write of the switch, a restart or the
// deadline (the verifiers' `R19V2-LATE-CANCEL`, `R19V2-LATE-ARM`,
// `R19V-FQ-B1` to `B3`, `F1`, `F2`, and the claims probes A, C and C2).

/**
 * This process's first statement matching `isStatement` for the switch `id`
 * runs in Postgres, after `delayMs` where given, and its answer is then lost
 * (it throws). Reads of the switch afterwards are counted; `failRead` makes
 * the n-th of them fail and `holdRead` holds it. `restore()` ends it.
 */
const answerLostAfterCommit = (
    id: string,
    isStatement: (sql: string) => boolean,
    options: {
        delayMs?: number;
        failRead?: (n: number) => boolean;
        holdRead?: (n: number) => Promise<void> | null;
    } = {}
) => {
    const seen = { applied: false, readsAfter: 0, statementsSent: 0 };
    let lost = false;
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (isStatement(sql) && params?.includes(id)) {
                    seen.statementsSent += 1;
                    if (!lost) {
                        lost = true;
                        if (options.delayMs) {
                            await new Promise((r) => setTimeout(r, options.delayMs));
                        }
                        await client.query<T>(sql, params);
                        seen.applied = true;
                        throw new Error(
                            'Connection terminated unexpectedly (test: the answer is lost after the commit)'
                        );
                    }
                }
                if (seen.applied && isSwitchRead(sql) && params?.includes(id)) {
                    seen.readsAfter += 1;
                    const n = seen.readsAfter;
                    if (options.failRead?.(n)) {
                        throw new Error(
                            'Connection terminated unexpectedly (test: the read back fails)'
                        );
                    }
                    const hold = options.holdRead?.(n);
                    if (hold) await hold;
                }
                return client.query<T>(sql, params);
            },
        };
    };
    return seen;
};
const isOwnerStatement = (sql: string) => isSwitchUpdate(sql) && !isCarry(sql);
const isSwitchInsert = (sql: string) => sql.startsWith('INSERT INTO deadman_switches');
/** A stall in the sweep's sense standing now (`switchStalls`), which a hold that ended at once never was. */
const stallStandsNow = () => here.switchStatementsStalledBetween(Date.now(), Date.now());

/** A cancel that Postgres applied is everywhere this process answers from, and told to the others. */
const assertCancelledEverywhere = async (
    sw: Awaited<ReturnType<typeof armed>>,
    other: Store,
    announcedBefore: number
) => {
    const id = sw.switchId;
    await here.drain();
    const row = await stored(id);
    assert.equal(row?.status, 'cancelled', 'cancelled in Postgres');
    assert.equal(row?.encrypted_payload, '', 'its content emptied there');
    assert.equal(
        (await storedCopies(id)).filter((copy) => copy.held).length,
        0,
        'every copy blanked in Postgres'
    );
    const mirror = here.getDeadmanSwitch(id)!;
    assert.equal(mirror.status, 'cancelled', 'the refusing process holds it cancelled');
    assert.equal(mirror.encryptedPayload, '', 'without its content');
    assert.equal(wrapsHeldInMirror(id), 0, 'and with no sealed copy');
    const list = await app.request('/v1/deadman/switches', { headers: auth(sw.owner) });
    const listed = (
        (await list.json()) as { switches: Array<{ switchId: string; status: string }> }
    ).switches.find((s) => s.switchId === id);
    assert.equal(listed?.status, 'cancelled', 'the owner’s list');
    assert.equal(
        exportUserData(sw.owner.id)?.deadmanSwitches.find((s) => s.id === id)?.status,
        'cancelled',
        'the export'
    );
    assert.ok(announcedFor(id).length > announcedBefore, 'announced');
    assert.equal(other.getDeadmanSwitch(id)?.status, 'armed', 'the other process not yet told');
    deliver(other, announcedFor(id).at(-1)!);
    await until(() => other.getDeadmanSwitch(id)?.status === 'cancelled', 3_000, 'told, it agrees');
    // The refusal was noted and carried; over the cancelled row the carry is
    // refused, so no refused attempt is left anywhere.
    await until(() => here.ownerWriteUnansweredAt(id) === undefined, 3_000, 'the note’s end');
    assert.equal(await columnOf(id), null, 'no refused attempt on the cancelled row');
    assert.equal(here.getDeadmanSwitch(id)?.ownerAttemptRefusedAt, undefined);
};

test('a cancel the database applied whose answer is lost within its bound is answered 503 only once the switch has been read back: the refusing process holds it cancelled, its copies are blanked in Postgres, it is announced, the owner’s list and the export say cancelled, and no stall is left behind (round 20)', async () => {
    const sw = await armed(3600);
    const id = sw.switchId;
    const other = await otherProcess();
    const began = Date.now();
    const lost = answerLostAfterCommit(id, isOwnerStatement);
    const before = announcedFor(id).length;
    let failures = 0;
    let readBacks = 0;
    try {
        readBacks = await logged('deadman_switch_read_back_after_failure', async () => {
            failures = await logged('deadman_switch_write_failed', async () => {
                const cancel = await post(sw.owner, `/switches/${id}/cancel`);
                assert.equal(cancel.status, 503, 'the outcome is unknown to the route');
                assert.equal(
                    ((await cancel.json()) as { code: string }).code,
                    'switch_write_unanswered'
                );
                // At the answer, not some time after it.
                assert.equal(
                    here.getDeadmanSwitch(id)?.status,
                    'cancelled',
                    'read back and taken before the route answered'
                );
                assert.equal(statementsHeld(), false, 'nothing is held back after the read');
            });
        });
    } finally {
        restore();
    }
    assert.equal(failures, 1, 'the failure is logged');
    assert.equal(readBacks, 1, 'and the read back that followed it');
    assert.equal(lost.statementsSent, 1, 'the statement was sent once');
    assert.equal(lost.readsAfter, 1, 'the switch read once, in its lane');
    assert.equal(
        here.switchStatementsStalledBetween(began, Date.now()),
        false,
        'a read back that answers at once is no stall in the sweep’s sense'
    );
    assert.equal(internal<unknown[]>(here, 'settleReadsToRetry').length, 0);
    await assertCancelledEverywhere(sw, other, before);
});

test('a cancel the database applied after its bound, whose statement then rejects, is read back as a late answer is: the stall stands until the switch has been read, and the refusing process then holds it cancelled with every copy blanked in Postgres (round 20)', async () => {
    const sw = await armed(3600);
    const id = sw.switchId;
    const other = await otherProcess();
    here.switchStatementTimeoutMs = 200;
    const lost = answerLostAfterCommit(id, isOwnerStatement, { delayMs: 450 });
    const before = announcedFor(id).length;
    try {
        const cancel = await post(sw.owner, `/switches/${id}/cancel`);
        assert.equal(cancel.status, 503, 'refused after its bound');
        assert.equal(lost.applied, false, 'the statement is still out');
        assert.equal(stallStandsNow(), true, 'the stall stands while it is');
        assert.equal(here.getDeadmanSwitch(id)?.status, 'armed');
        await until(() => lost.applied, 3_000, 'the cancel applied in Postgres, its answer lost');
        await until(() => !statementsHeld(), 3_000, 'the stall’s end');
        assert.equal(
            here.getDeadmanSwitch(id)?.status,
            'cancelled',
            'the stall ended only once the switch had been read back'
        );
        assert.equal(stallStandsNow(), false);
    } finally {
        restore();
        here.switchStatementTimeoutMs = 30_000;
        await settled();
    }
    assert.equal(lost.readsAfter, 1, 'read once after the rejection');
    await assertCancelledEverywhere(sw, other, before);
});

test('a cancel the database applied whose answer is lost and whose read back fails too: the stall stands, a check-in meanwhile is refused at once and unsent, and the switch is read again until a read answers, which leaves it cancelled everywhere (round 20)', async () => {
    const sw = await armed(3600);
    const id = sw.switchId;
    const other = await otherProcess();
    const savedRetry = here.carryRetryMs;
    here.carryRetryMs = 100;
    // The lane's read and the read again made at once both fail; the next,
    // on its timer, answers.
    const lost = answerLostAfterCommit(id, isOwnerStatement, { failRead: (n) => n <= 2 });
    const before = announcedFor(id).length;
    let failedReads = 0;
    try {
        failedReads = await logged('deadman_switch_settle_read_failed', async () => {
            const cancel = await post(sw.owner, `/switches/${id}/cancel`);
            assert.equal(cancel.status, 503);
            assert.equal(here.getDeadmanSwitch(id)?.status, 'armed', 'nothing could be read yet');
            assert.equal(statementsHeld(), true, 'the outcome is unknown: nothing is sent');
            assert.equal(
                stallStandsNow(),
                true,
                'a stall in the sweep’s sense from the failed read'
            );
            const sentBefore = lost.statementsSent;
            const checkIn = await post(sw.owner, `/switches/${id}/check-in`);
            assert.equal(checkIn.status, 503, 'a check-in meanwhile is refused');
            assert.equal(lost.statementsSent, sentBefore, 'at once, unsent');
            await until(() => !statementsHeld(), 3_000, 'the switch read again');
            assert.equal(here.getDeadmanSwitch(id)?.status, 'cancelled', 'and taken');
            assert.equal(stallStandsNow(), false, 'the stall ended with it');
        });
    } finally {
        restore();
        here.carryRetryMs = savedRetry;
        await settled();
    }
    assert.equal(
        lost.readsAfter,
        3,
        'the lane’s read, the read again at once, then one that answers'
    );
    assert.equal(failedReads, 2, 'each failed read is logged');
    await assertCancelledEverywhere(sw, other, before);
});

/** An owner with four releases held naming one person, at the per-owner bound of five less one. */
const fourNamingOnePerson = async () => {
    const owner = await person();
    const named = await person();
    const envelopeNaming = () =>
        protocol.buildReleaseEnvelope({
            ownerKeySet: owner.keySet,
            recipients: [named.keySet.identity],
            message: 'Synthetic test text.',
        });
    const armRoute = async (envelope: Awaited<ReturnType<typeof envelopeNaming>>) => {
        const res = await post(owner, '/switches', armBody(envelope, 3600));
        return `${res.status} ${((await res.json()) as { code?: string }).code ?? ''}`.trim();
    };
    for (let i = 0; i < 4; i += 1) assert.equal(await armRoute(await envelopeNaming()), '201');
    await here.drain();
    const heldInPostgres = async () =>
        (
            (
                await pg.query(
                    'SELECT count(*)::int AS n FROM deadman_release_wraps w JOIN deadman_switches s ' +
                        'ON s.id = w.switch_id WHERE w.recipient_account_id = $1 AND s.owner_id = $2 ' +
                        "AND s.status IN ('armed', 'grace') AND w.sealed_key <> ''",
                    [named.id, owner.id]
                )
            ).rows[0] as { n: number }
        ).n;
    const listed = async (switchId: string) =>
        (
            (await (
                await app.request('/v1/deadman/switches', { headers: auth(owner) })
            ).json()) as { switches: Array<{ switchId: string }> }
        ).switches.some((s) => s.switchId === switchId);
    const tidy = async () => {
        await pg.query(
            "UPDATE deadman_switches SET status = 'cancelled', encrypted_payload = '' WHERE owner_id = $1",
            [owner.id]
        );
        for (const sw of here.listDeadmanSwitchesForOwner(owner.id)) {
            here.updateDeadmanSwitch(sw.id, { status: 'cancelled', encryptedPayload: '' });
        }
        await here.drain();
    };
    return { owner, named, envelopeNaming, armRoute, heldInPostgres, listed, tidy };
};

test('an arm past its bound whose insert the database committed and whose statement then rejects is read back with its copies: the switch is in the owner’s list, announced and counted, and the sixth release naming one person from one owner is refused by the bound, on one process (round 20)', async () => {
    const { owner, named, envelopeNaming, armRoute, heldInPostgres, listed, tidy } =
        await fourNamingOnePerson();
    const fifth = await envelopeNaming();
    const sixth = await envelopeNaming();
    here.switchStatementTimeoutMs = 200;
    const lost = answerLostAfterCommit(fifth.releaseId, isSwitchInsert, { delayMs: 450 });
    try {
        assert.equal(
            await armRoute(fifth),
            '503 switch_write_unanswered',
            'refused after its bound'
        );
        assert.equal(stallStandsNow(), true, 'the stall stands while the insert is out');
        assert.equal(
            await armRoute(sixth),
            '503 switch_write_unanswered',
            'an arm during the stall is refused, unsent'
        );
        await until(() => lost.applied, 3_000, 'the insert committed, its answer lost');
        await until(() => !statementsHeld(), 3_000, 'the stall’s end');
        assert.equal(
            here.getDeadmanSwitch(fifth.releaseId)?.status,
            'armed',
            'the stall ended only once the fifth had been read back into the mirror'
        );
    } finally {
        restore();
        here.switchStatementTimeoutMs = 30_000;
        await settled();
    }
    assert.equal(lost.readsAfter, 1, 'read once after the rejection');
    assert.equal(here.listDeadmanReleaseWraps(fifth.releaseId).length, 2, 'with its copies');
    assert.equal(await listed(fifth.releaseId), true, 'in the owner’s list');
    assert.ok(announcedFor(fifth.releaseId).length >= 1, 'announced');
    assert.equal(
        heldReleasesNaming(named.id).fromOwner.get(owner.id),
        5,
        'counted toward the bound'
    );
    assert.equal(await armRoute(sixth), '409 recipient_limit', 'the sixth is refused by the bound');
    assert.equal(await heldInPostgres(), 5, 'five in Postgres, not six');
    // The route checks the bounds before the id, and the fifth itself now
    // fills this one, so the fifth envelope again is refused by the bound;
    // with room under it again, it is refused as taken.
    assert.equal(
        await armRoute(fifth),
        '409 recipient_limit',
        'the fifth envelope again is refused by the bound it fills'
    );
    const another = here
        .listDeadmanSwitchesForOwner(owner.id)
        .find((sw) => sw.id !== fifth.releaseId && sw.status === 'armed')!;
    assert.equal((await post(owner, `/switches/${another.id}/cancel`)).status, 200);
    assert.equal(
        await armRoute(fifth),
        '409 release_id_taken',
        'and, with room under the bound, as already taken'
    );
    await tidy();
});

test('an arm whose insert the database committed, whose answer is lost within its bound and whose read back fails too, is answered 503 with the stall standing: the next arm is refused at once, unsent, until the switch has been read again, and the sixth release is then refused by the bound (round 20)', async () => {
    const { owner, named, envelopeNaming, armRoute, heldInPostgres, listed, tidy } =
        await fourNamingOnePerson();
    const fifth = await envelopeNaming();
    const sixth = await envelopeNaming();
    const savedRetry = here.carryRetryMs;
    here.carryRetryMs = 100;
    const lost = answerLostAfterCommit(fifth.releaseId, isSwitchInsert, {
        failRead: (n) => n <= 2,
    });
    let sixthInserts = 0;
    const counting = pool.connect;
    pool.connect = async () => {
        const client = await counting();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (isSwitchInsert(sql) && params?.includes(sixth.releaseId)) sixthInserts += 1;
                return client.query<T>(sql, params);
            },
        };
    };
    try {
        assert.equal(await armRoute(fifth), '503 switch_write_unanswered');
        assert.equal(lost.applied, true, 'the insert committed');
        assert.equal(here.getDeadmanSwitch(fifth.releaseId), undefined, 'and could not be read');
        assert.equal(statementsHeld(), true, 'so nothing is sent until it has been');
        assert.equal(
            heldReleasesNaming(named.id).fromOwner.get(owner.id),
            4,
            'the mirror lacks it'
        );
        assert.equal(
            await armRoute(sixth),
            '503 switch_write_unanswered',
            'the next arm is not let past a bound the hidden switch has filled'
        );
        assert.equal(sixthInserts, 0, 'refused at once, unsent');
        await until(() => !statementsHeld(), 3_000, 'the fifth read again');
    } finally {
        restore();
        here.carryRetryMs = savedRetry;
        await settled();
    }
    assert.equal(
        lost.readsAfter,
        3,
        'the lane’s read, the read again at once, then one that answers'
    );
    assert.equal(here.getDeadmanSwitch(fifth.releaseId)?.status, 'armed', 'in the mirror');
    assert.equal(here.listDeadmanReleaseWraps(fifth.releaseId).length, 2, 'with its copies');
    assert.equal(await listed(fifth.releaseId), true, 'in the owner’s list');
    assert.ok(announcedFor(fifth.releaseId).length >= 1, 'announced');
    assert.equal(
        heldReleasesNaming(named.id).fromOwner.get(owner.id),
        5,
        'counted toward the bound'
    );
    assert.equal(await armRoute(sixth), '409 recipient_limit', 'the sixth is refused by the bound');
    assert.equal(await heldInPostgres(), 5, 'five in Postgres, not six');
    await tidy();
});

test('a failed statement’s read back is waited for only for what is left of the statement’s bound: a check-in whose statement fails and whose read back does not answer is 503 at the bound, a stall from then on, and the row is taken when the read answers (round 20)', async () => {
    const sw = await armed(3600);
    const id = sw.switchId;
    here.switchStatementTimeoutMs = 300;
    const readGate = gateOpen();
    let failed = false;
    let reads = 0;
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (isOwnerStatement(sql) && params?.includes(id) && !failed) {
                    failed = true;
                    throw new Error(
                        'Connection terminated unexpectedly (test: before anything ran)'
                    );
                }
                if (failed && isSwitchRead(sql) && params?.includes(id)) {
                    reads += 1;
                    if (reads === 1) await readGate.promise;
                }
                return client.query<T>(sql, params);
            },
        };
    };
    try {
        const started = Date.now();
        const checkIn = await post(sw.owner, `/switches/${id}/check-in`);
        const took = Date.now() - started;
        assert.equal(checkIn.status, 503);
        assert.ok(
            took >= 250 && took < 2_000,
            `answered at the statement’s bound, not when the read back answers (${took} ms)`
        );
        assert.equal(reads, 1, 'the read back is out');
        assert.equal(statementsHeld(), true, 'and nothing is sent meanwhile');
        assert.equal(stallStandsNow(), true, 'a stall in the sweep’s sense from the bound on');
        const seen = here.getDeadmanSwitch(id);
        readGate.open();
        await until(() => !statementsHeld(), 3_000, 'the read back answered');
        assert.equal(stallStandsNow(), false);
        assert.equal(here.getDeadmanSwitch(id)?.status, 'armed', 'the row as Postgres holds it');
        assert.notEqual(here.getDeadmanSwitch(id), seen, 'taken into the mirror');
    } finally {
        readGate.open();
        restore();
        here.switchStatementTimeoutMs = 30_000;
        await settled();
    }
    const again = await post(sw.owner, `/switches/${id}/check-in`);
    assert.equal(again.status, 200, 'a check-in afterwards is made');
    here.updateDeadmanSwitch(id, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
});

test('a shutdown begun while a cancel stands unanswered waits for the read back of a cancel that lands during it: the process ends holding the switch cancelled, with its copies blanked in Postgres (round 20)', async () => {
    // The verifiers' `R19V-FQ-C2`: the drain's first wait was a snapshot of
    // the queue, which held the stalled statement and not the read back
    // queued once it landed, so shutdown returned as soon as the cancel
    // landed, with Postgres cancelled, every sealed copy held and this
    // process's last view armed.
    const sw = await armed(3600);
    const id = sw.switchId;
    const { api, state } = await apiProcess();
    api.switchStatementTimeoutMs = 200;
    api.carryRetryMs = 60_000;
    const cancelGate = gateOpen();
    const laneRead = gateOpen();
    let cancelSent = false;
    let cancelLanded = false;
    let switchReads = 0;
    state.holdQuery = (sql) => {
        if (isCarry(sql)) return null;
        if (isSwitchUpdate(sql) && !cancelSent) {
            cancelSent = true;
            return cancelGate.promise.then(() => {
                cancelLanded = true;
            });
        }
        if (isSwitchRead(sql) && cancelLanded) {
            switchReads += 1;
            if (switchReads === 1) return laneRead.promise;
        }
        return null;
    };
    const heldInPostgres = async () => (await storedCopies(id)).filter((copy) => copy.held).length;
    try {
        const read = api.getDeadmanSwitch(id)!;
        assert.equal(
            (
                await api.updateDeadmanSwitchIf(id, read, {
                    status: 'cancelled',
                    encryptedPayload: '',
                    ownerAttemptRefusedAt: undefined,
                })
            ).kind,
            'unanswered',
            'the cancel refused after its bound'
        );
        const down = api.shutdown();
        await new Promise((r) => setTimeout(r, 50));
        cancelGate.open();
        await until(() => switchReads === 1, 3_000, 'the cancel landed, its read back held');
        assert.equal((await stored(id))?.status, 'cancelled', 'cancelled in Postgres');
        assert.equal(
            await pendingAfter(down, 400),
            'pending',
            'shutdown waits for the landed cancel’s read back'
        );
        assert.equal(api.getDeadmanSwitch(id)?.status, 'armed', 'which has not been taken yet');
        assert.equal(await heldInPostgres(), 2, 'nor the copies blanked');
        laneRead.open();
        await down;
    } finally {
        cancelGate.open();
        laneRead.open();
        state.holdQuery = null;
    }
    assert.equal(api.getDeadmanSwitch(id)?.status, 'cancelled', 'taken before shutdown returned');
    assert.equal(await heldInPostgres(), 0, 'and the blanking it queued written');
    here.updateDeadmanSwitch(id, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
});

test('the read again of a settle keeps its older row out over a refresh made while its answer was out, and a switch then found cancelled has its held copies blanked though its row was kept out (round 20)', async () => {
    // The verifiers' `R19V-FQ-A`, adopted. Test 59 pins the keep-out for the
    // lane's read only; two mutants of round 19's take passed every test: one
    // that takes the row read again over a change made since the settle
    // began (the mirror then showed `grace` over a cancel a refresh had
    // brought), and one that blanks a cancelled switch's copies only where
    // the row was taken (a late cancel kept out by a refresh then left every
    // sealed copy held in Postgres).
    const sw = await armed(3600);
    const id = sw.switchId;
    const { api, state } = await apiProcess();
    api.switchStatementTimeoutMs = 200;
    api.carryRetryMs = 60_000;
    const moveGate = gateOpen();
    const againAnswer = gateOpen();
    let moveSent = false;
    let moveLanded = false;
    let laneReadFailed = false;
    let againRan = false;
    state.holdQuery = (sql) => {
        if (isSwitchUpdate(sql) && !isCarry(sql) && !moveSent) {
            moveSent = true;
            return moveGate.promise.then(() => {
                moveLanded = true;
            });
        }
        return null;
    };
    const internals = poolOf(api);
    const connect = internals.connect;
    internals.connect = async () => {
        const fromRetry = calledFrom('runSettleRetryPass');
        const client = await connect();
        return {
            ...client,
            async query<T>(sql: string, params?: unknown[]) {
                if (isSwitchRead(sql) && moveLanded && !fromRetry && !laneReadFailed) {
                    laneReadFailed = true;
                    throw new Error(
                        'Connection terminated unexpectedly (test: the lane read fails)'
                    );
                }
                const answer = await client.query<T>(sql, params);
                if (isSwitchRead(sql) && fromRetry && !againRan) {
                    againRan = true;
                    await againAnswer.promise;
                }
                return answer;
            },
        };
    };
    const stallStands = () => api.switchStatementsStalledBetween(Date.now(), Date.now());
    const heldInPostgres = async () => (await storedCopies(id)).filter((copy) => copy.held).length;
    try {
        const read = api.getDeadmanSwitch(id)!;
        assert.equal(
            await api.advanceDeadmanSwitch(id, read, { status: 'grace' }),
            undefined,
            'the move stalls'
        );
        moveGate.open();
        await until(
            () => againRan,
            3_000,
            'the lane read failed, the read again ran, its answer held'
        );
        assert.equal(laneReadFailed, true);
        assert.equal(api.getDeadmanSwitch(id)?.status, 'armed', 'nothing taken yet');
        assert.equal((await stored(id))?.status, 'grace', 'the move landed');
        // Cancelled in Postgres by another process, which this one is told of
        // while the read again's answer (grace) is still out.
        await pg.query(
            "UPDATE deadman_switches SET status = 'cancelled', encrypted_payload = '', " +
                'owner_attempt_refused_at = NULL, updated_at = now() WHERE id = $1',
            [id]
        );
        deliver(api, { src: 'elsewhere', m: 'deadmanSwitches', op: 'u', kv: [id] });
        await until(() => api.getDeadmanSwitch(id)?.status === 'cancelled', 3_000, 'the refresh');
        assert.equal(stallStands(), true, 'the stall stands while the read again is out');
        assert.equal(await heldInPostgres(), 2, 'the copies still held in Postgres');
        againAnswer.open();
        await until(() => !stallStands(), 3_000, 'the settle ended');
        await api.drain();
        assert.equal(
            api.getDeadmanSwitch(id)?.status,
            'cancelled',
            'the read again’s older row (grace) kept out over the refresh'
        );
        assert.equal(
            await heldInPostgres(),
            0,
            'the switch found cancelled has its held copies blanked though its row was kept out'
        );
    } finally {
        moveGate.open();
        againAnswer.open();
        state.holdQuery = null;
        internals.connect = connect;
        await api.drain();
    }
    here.updateDeadmanSwitch(id, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
});

test('a move whose statement fails and whose switch is read back at once holds nothing back: the hold is over when the store answers, the pass goes on to the next due switch, whose move is sent and applied, no stall is recorded, and the failed move is made by the next pass (round 20)', async () => {
    // The hold a failed statement leaves ends a few turns of the microtask
    // queue after its switch has been read; the store waits those out before
    // it answers, so the sweep's next move, made at once, is not refused
    // over a hold that is already over (a legacy switch's move is made in
    // the very turn the store's answer comes back in).
    {
        const sw = await armed(3600);
        let failedOnce = false;
        pool.connect = async () => {
            const client = await realConnect();
            return {
                ...client,
                async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                    if (isOwnerStatement(sql) && params?.includes(sw.switchId) && !failedOnce) {
                        failedOnce = true;
                        throw new Error(
                            'Connection terminated unexpectedly (test: before anything ran)'
                        );
                    }
                    return client.query<T>(sql, params);
                },
            };
        };
        let heldAtTheAnswer: boolean;
        try {
            const read = here.getDeadmanSwitch(sw.switchId)!;
            const moved = await here.advanceDeadmanSwitch(sw.switchId, read, { status: 'grace' });
            heldAtTheAnswer = statementsHeld();
            assert.equal(moved, undefined, 'the move failed');
        } finally {
            restore();
        }
        assert.equal(failedOnce, true);
        assert.equal(heldAtTheAnswer, false, 'the hold is over when the store answers');
        assert.equal((await stored(sw.switchId))?.status, 'armed');
        here.updateDeadmanSwitch(sw.switchId, { status: 'cancelled', encryptedPayload: '' });
        await here.drain();
    }
    const first = await armed(60);
    const second = await armed(60);
    const ids = [first.switchId, second.switchId];
    const began = Date.now();
    let failed: string | null = null;
    let sentToTheOther = 0;
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                const id = ids.find((x) => params?.includes(x));
                if (isOwnerStatement(sql) && id) {
                    if (failed === null) {
                        failed = id;
                        throw new Error(
                            'Connection terminated unexpectedly (test: before anything ran)'
                        );
                    }
                    if (id !== failed) sentToTheOther += 1;
                }
                return client.query<T>(sql, params);
            },
        };
    };
    const due = new Date(
        Math.max(...ids.map((id) => Date.parse(here.getDeadmanSwitch(id)!.triggerAt))) + 1_000
    );
    let readBacks = 0;
    try {
        readBacks = await logged('deadman_switch_read_back_after_failure', async () => {
            await sweepOverdueDeadmanSwitches(due, Number.MAX_SAFE_INTEGER);
        });
    } finally {
        restore();
    }
    assert.ok(failed, 'one move failed');
    const other = ids.find((id) => id !== failed)!;
    assert.equal(readBacks, 1, 'its switch was read back');
    assert.equal(sentToTheOther, 1, 'the next switch’s move was sent in the same pass');
    assert.notEqual((await stored(other))?.status, 'armed', 'and applied');
    assert.equal((await stored(failed!))?.status, 'armed', 'the failed move changed nothing');
    assert.equal(here.getDeadmanSwitch(failed!)?.status, 'armed');
    assert.equal(statementsHeld(), false, 'nothing is held back');
    assert.equal(
        here.switchStatementsStalledBetween(began, Date.now()),
        false,
        'and no stall was recorded, so the next pass does not take it for an outage'
    );
    await sweepOverdueDeadmanSwitches(due, Number.MAX_SAFE_INTEGER);
    assert.notEqual(
        (await stored(failed!))?.status,
        'armed',
        'the next pass makes the failed move'
    );
    assert.equal((await stored(failed!))?.backlog_grace_started_at, null, 'with no backlog window');
    for (const id of ids)
        here.updateDeadmanSwitch(id, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
});

test('an arm past its bound that then answers that the id is taken, by a switch this process had not heard of, is read back when it answers: the switch and its copies reach this process, its owner’s list and the bounds, and are announced (round 20)', async () => {
    // A late answer that found the id taken was dropped: the arm's caller,
    // answered 503 at the bound, took nothing of it, so the switch stayed out
    // of this process until the owner armed the envelope once more and that
    // arm answered in time.
    const owner = await person();
    const recipient = await person();
    const envelope = await protocol.buildReleaseEnvelope({
        ownerKeySet: owner.keySet,
        recipients: [recipient.keySet.identity],
        message: 'Synthetic test text.',
    });
    const id = envelope.releaseId;
    const elsewhere = await otherProcess();
    const theirs = switchInputFor(envelope, owner.id);
    assert.equal((await elsewhere.armDeadmanSwitch(theirs.input, theirs.copies)).kind, 'armed');
    assert.equal(here.getDeadmanSwitch(id), undefined, 'this process has not heard of it');
    const armRoute = async () => {
        const res = await post(owner, '/switches', armBody(envelope, 3600));
        return `${res.status} ${((await res.json()) as { code?: string }).code ?? ''}`.trim();
    };
    here.switchStatementTimeoutMs = 200;
    const gate = gateOpen();
    let heldOnce = false;
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (isSwitchRead(sql) && params?.includes(id) && !heldOnce) {
                    heldOnce = true;
                    await gate.promise;
                }
                return client.query<T>(sql, params);
            },
        };
    };
    const before = announcedFor(id).length;
    try {
        assert.equal(await armRoute(), '503 switch_write_unanswered', 'refused at its bound');
        assert.equal(here.getDeadmanSwitch(id), undefined, 'nothing taken yet');
        assert.equal(stallStandsNow(), true, 'the stall stands while the arm is out');
        gate.open();
        await until(() => !statementsHeld(), 3_000, 'the stall’s end');
        assert.equal(
            here.getDeadmanSwitch(id)?.status,
            'armed',
            'the stall ended only once the switch it found had been read into this process'
        );
    } finally {
        gate.open();
        restore();
        here.switchStatementTimeoutMs = 30_000;
        await settled();
    }
    assert.equal(here.listDeadmanReleaseWraps(id).length, 2, 'with its copies');
    assert.ok(announcedFor(id).length > before, 'announced');
    assert.equal(
        heldReleasesNaming(recipient.id).fromOwner.get(owner.id),
        1,
        'counted toward the bounds'
    );
    const list = await app.request('/v1/deadman/switches', { headers: auth(owner) });
    assert.ok(
        ((await list.json()) as { switches: Array<{ switchId: string }> }).switches.some(
            (sw) => sw.switchId === id
        ),
        'in the owner’s list'
    );
    assert.equal(
        await armRoute(),
        '409 release_id_taken',
        'the envelope again is refused as taken'
    );
    assert.equal(
        (await post(owner, `/switches/${id}/cancel`)).status,
        200,
        'and it can be cancelled'
    );
    await here.drain();
    await elsewhere.drain();
});

test('a shutdown begun while a cancel is out, within its bound, waits for the read back of one whose answer is then lost, and then for the blanking of its copies that the take queued: the process ends holding the switch cancelled, with its copies blanked in Postgres (round 20)', async () => {
    // As the test of a cancel that lands during shutdown, for a statement
    // that fails within its bound: its read back is queued only when it
    // fails, after the drain took its snapshot of the queue.
    const sw = await armed(3600);
    const id = sw.switchId;
    const { api } = await apiProcess();
    api.carryRetryMs = 60_000;
    const cancelGate = gateOpen();
    const laneRead = gateOpen();
    const blanking = gateOpen();
    let cancelSent = false;
    let cancelApplied = false;
    let switchReads = 0;
    let blankingsHeld = 0;
    const internals = poolOf(api);
    const connect = internals.connect;
    internals.connect = async () => {
        const client = await connect();
        return {
            ...client,
            async query<T>(sql: string, params?: unknown[]) {
                if (isSwitchUpdate(sql) && !isCarry(sql) && !cancelSent) {
                    cancelSent = true;
                    await cancelGate.promise;
                    await client.query<T>(sql, params);
                    cancelApplied = true;
                    throw new Error(
                        'Connection terminated unexpectedly (test: the answer is lost after the commit)'
                    );
                }
                if (isSwitchRead(sql) && cancelApplied) {
                    switchReads += 1;
                    if (switchReads === 1) await laneRead.promise;
                }
                if (cancelApplied && sql.startsWith('INSERT INTO deadman_release_wraps')) {
                    blankingsHeld += 1;
                    await blanking.promise;
                }
                return client.query<T>(sql, params);
            },
        };
    };
    const heldInPostgres = async () => (await storedCopies(id)).filter((copy) => copy.held).length;
    try {
        const read = api.getDeadmanSwitch(id)!;
        const cancelling = api.updateDeadmanSwitchIf(id, read, {
            status: 'cancelled',
            encryptedPayload: '',
            ownerAttemptRefusedAt: undefined,
        });
        await until(() => cancelSent, 3_000, 'the cancel sent');
        const down = api.shutdown();
        await new Promise((r) => setTimeout(r, 50));
        cancelGate.open();
        await until(
            () => switchReads === 1,
            3_000,
            'the cancel applied, its answer lost, its read back held'
        );
        assert.equal((await stored(id))?.status, 'cancelled', 'cancelled in Postgres');
        assert.equal(
            await pendingAfter(down, 400),
            'pending',
            'shutdown waits for the failed cancel’s read back'
        );
        assert.equal(api.getDeadmanSwitch(id)?.status, 'armed', 'which has not been taken yet');
        assert.equal(await heldInPostgres(), 2, 'nor the copies blanked');
        laneRead.open();
        assert.equal((await cancelling).kind, 'unanswered');
        await until(() => blankingsHeld >= 1, 3_000, 'the take’s blanking of the copies, held');
        assert.equal(
            api.getDeadmanSwitch(id)?.status,
            'cancelled',
            'the switch read back and taken'
        );
        assert.equal(
            await pendingAfter(down, 300),
            'pending',
            'shutdown waits for the blanking the take queued'
        );
        assert.equal(await heldInPostgres(), 2, 'which has not been written yet');
        blanking.open();
        await down;
    } finally {
        cancelGate.open();
        laneRead.open();
        blanking.open();
        internals.connect = connect;
    }
    assert.equal(api.getDeadmanSwitch(id)?.status, 'cancelled', 'taken before shutdown returned');
    assert.equal(await heldInPostgres(), 0, 'and the blanking it queued written');
    here.updateDeadmanSwitch(id, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
});

test('a stated limit, pinned: an arm whose insert the database commits only after its failed statement’s switch was read back and not found is answered 500 and is in no process’s memory, so the next arm passes the bound it would have filled; arming the same message again is refused by that bound first, and with room under the bound is refused as taken, which puts the switch in the owner’s list (round 20)', async () => {
    // What the documents state and nothing here closes: a statement the
    // database was still running when it lost its client can commit after
    // the look that follows the failure. The verifiers' `R19V-ARM`,
    // commit-after-read.
    const { owner, named, envelopeNaming, armRoute, heldInPostgres, listed, tidy } =
        await fourNamingOnePerson();
    const fifth = await envelopeNaming();
    const sixth = await envelopeNaming();
    let insert: { sql: string; params: unknown[] } | null = null;
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (isSwitchInsert(sql) && params?.includes(fifth.releaseId) && !insert) {
                    insert = { sql, params: params ?? [] };
                    throw new Error(
                        'Connection terminated unexpectedly (test: the insert is still running)'
                    );
                }
                return client.query<T>(sql, params);
            },
        };
    };
    try {
        assert.equal(await armRoute(fifth), '500 switch_write_failed', 'looked up, not found');
    } finally {
        restore();
    }
    assert.equal(statementsHeld(), false, 'the look answered: nothing is held back');
    // The insert the server was still running commits now.
    assert.ok(insert, 'the insert was sent');
    const late = insert as { sql: string; params: unknown[] };
    await pg.query(late.sql, late.params);
    assert.equal((await stored(fifth.releaseId))?.status, 'armed', 'armed in Postgres');
    assert.equal(here.getDeadmanSwitch(fifth.releaseId), undefined, 'and in no process’s memory');
    assert.equal(await listed(fifth.releaseId), false, 'nor in the owner’s list');
    assert.equal(heldReleasesNaming(named.id).fromOwner.get(owner.id), 4, 'nor counted');
    assert.equal(
        await armRoute(sixth),
        '201',
        'the next arm passes the bound it would have filled'
    );
    assert.equal(await heldInPostgres(), 6, 'six held in Postgres where the bound is five');
    assert.equal(
        await armRoute(fifth),
        '409 recipient_limit',
        'the same message again is refused by the bound, which the route checks first'
    );
    assert.equal(await listed(fifth.releaseId), false, 'and is still not listed');
    // With room under the bound, the arm reaches the store, which finds the
    // switch and takes it.
    assert.equal((await post(owner, `/switches/${sixth.releaseId}/cancel`)).status, 200);
    assert.equal(await armRoute(fifth), '409 release_id_taken', 'then refused as taken');
    assert.equal(await listed(fifth.releaseId), true, 'and listed');
    assert.equal(here.listDeadmanReleaseWraps(fifth.releaseId).length, 2, 'with its copies');
    assert.equal(heldReleasesNaming(named.id).fromOwner.get(owner.id), 5, 'and counted');
    await tidy();
});

test('a refresh whose read of the switch ran before a late cancel landed, and whose answer reaches this process after the cancel’s settle began, does not leave it holding the switch armed: the settle’s row, kept out over the changed entry, is followed by a re-read of the switch, and the copies of a switch read cancelled are blanked whatever this process holds (round 20)', async () => {
    // Found while fitting the settle to the merged store. A settle keeps its
    // row out where the mirror's entry changed since it began, taking the
    // change for newer. A refresh's row is not always: its read can have run
    // before the late statement landed, and its answer can reach this
    // process after the settle began. This process then held the row from
    // before the cancel, armed with its content, and every sealed copy
    // stayed held in Postgres, with Postgres holding the switch cancelled.
    const sw = await armed(3600);
    const id = sw.switchId;
    const { api } = await apiProcess();
    api.switchStatementTimeoutMs = 200;
    api.carryRetryMs = 60_000;
    const cancelGate = gateOpen();
    const refreshAnswer = gateOpen();
    const laneRead = gateOpen();
    let cancelSent = false;
    let refreshRan = false;
    let laneReads = 0;
    const internals = poolOf(api);
    const connect = internals.connect;
    internals.connect = async () => {
        const client = await connect();
        return {
            ...client,
            async query<T>(sql: string, params?: unknown[]) {
                if (isSwitchUpdate(sql) && !isCarry(sql) && !cancelSent) {
                    cancelSent = true;
                    await cancelGate.promise;
                    return client.query<T>(sql, params);
                }
                if (/^SELECT x\.\* FROM deadman_switches/.test(sql) && !refreshRan) {
                    // The refresh's read runs now, before the cancel lands;
                    // its answer is held.
                    const answer = await client.query<T>(sql, params);
                    refreshRan = true;
                    await refreshAnswer.promise;
                    return answer;
                }
                if (isSwitchRead(sql) && cancelSent) {
                    laneReads += 1;
                    if (laneReads === 1) await laneRead.promise;
                }
                return client.query<T>(sql, params);
            },
        };
    };
    const entry = () =>
        (api as unknown as { deadmanSwitches: Map<string, unknown> }).deadmanSwitches.get(id);
    const heldInPostgres = async () => (await storedCopies(id)).filter((copy) => copy.held).length;
    try {
        const read = api.getDeadmanSwitch(id)!;
        assert.equal(
            (
                await api.updateDeadmanSwitchIf(id, read, {
                    status: 'cancelled',
                    encryptedPayload: '',
                    ownerAttemptRefusedAt: undefined,
                })
            ).kind,
            'unanswered',
            'the cancel refused after its bound'
        );
        // The refused cancel's carry lands on the armed row first.
        await until(() => api.ownerWriteUnansweredAt(id) === undefined, 3_000, 'the carry');
        const before = entry();
        // Another process changed nothing that matters and says so: this
        // process reads the switch, still armed in Postgres.
        deliver(api, { src: 'elsewhere', m: 'deadmanSwitches', op: 'u', kv: [id] });
        await until(() => refreshRan, 3_000, 'the refresh’s read, before the cancel lands');
        cancelGate.open();
        await until(() => laneReads === 1, 3_000, 'the cancel landed, its settle begun');
        assert.equal((await stored(id))?.status, 'cancelled', 'cancelled in Postgres');
        refreshAnswer.open();
        await until(() => entry() !== before, 3_000, 'the refresh’s older row applied');
        assert.equal(api.getDeadmanSwitch(id)?.status, 'armed', 'the row from before the cancel');
        laneRead.open();
        await until(() => !statementsHeld(api), 3_000, 'the settle ended');
        await api.drain();
    } finally {
        cancelGate.open();
        refreshAnswer.open();
        laneRead.open();
        internals.connect = connect;
        await api.drain();
    }
    assert.equal(
        api.getDeadmanSwitch(id)?.status,
        'cancelled',
        'the switch was read again after the settle’s row was kept out'
    );
    assert.equal(api.getDeadmanSwitch(id)?.encryptedPayload, '', 'without its content');
    assert.equal(
        await heldInPostgres(),
        0,
        'the copies of a switch read cancelled are blanked, though this process held it armed'
    );
    here.updateDeadmanSwitch(id, { status: 'cancelled', encryptedPayload: '' });
    await here.drain();
});
