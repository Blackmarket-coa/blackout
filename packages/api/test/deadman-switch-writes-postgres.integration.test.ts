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
        const statements = intercept(isSwitchUpdate, () => gate);
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
    const statements = intercept(isSwitchUpdate, () => gate);
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
    intercept(isSwitchUpdate, () => gate);
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
    // fails too: 503, nothing anywhere; the same envelope then arms.
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
            return {
                ...client,
                async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                    if (/deadman_switches/.test(sql)) throw new Error('connection reset (test)');
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
        assert.equal(res.status, 503);
        assert.equal(((await res.json()) as { code: string }).code, 'switch_write_unanswered');
        assert.equal(here.getDeadmanSwitch(id), undefined, 'nothing in the mirror');
        assert.equal(await stored(id), undefined, 'no row');
        assert.deepEqual(await storedCopies(id), [], 'no copies: the statement failed before them');
        assert.equal(armsInFlightCount(), 0);
        const again = await post(owner, '/switches', armBody(envelope, 3600));
        assert.equal(again.status, 201, 'the same envelope arms once the database answers');
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
    await settled();
    assert.equal(perSwitch, 6, 'each erase, its queued attempt and the retry all failed');
    assert.equal(readBacks, 2, 'and each read back');
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
const isCarry = (sql: string) =>
    sql.startsWith('UPDATE deadman_switches SET owner_attempt_refused_at');
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

test('a check-in refused unanswered is carried into the switch’s row once the database answers (decision 31): the column is set in Postgres and in every mirror, this process’s note ends, and a sweep that knows nothing but the row gives the window at the deadline; a landed check-in clears it', async () => {
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
    const statements = intercept(isSwitchUpdate, () => gate);
    const announcedBefore = announcedFor(mine.switchId).length;
    let before = 0;
    let after = 0;
    try {
        assert.equal(
            await sweepOverdueDeadmanSwitches(new Date(Date.now() + 120_000), 15 * 60_000),
            0
        );
        assert.equal(statements.calls(), 1, 'the stall stands');
        before = Date.now();
        const refused = await post(mine.owner, `/switches/${mine.switchId}/check-in`);
        after = Date.now();
        assert.equal(refused.status, 503);
        assert.equal(statements.calls(), 1, 'not sent during the stall, and not carried yet');
        assert.ok(here.ownerWriteUnansweredAt(mine.switchId), 'noted in this process');
        assert.equal(
            await columnOf(mine.switchId),
            null,
            'nothing in Postgres while the stall stands'
        );
    } finally {
        open();
        restore();
    }
    // The stall settles: the note is carried.
    const carried = await logged('deadman_owner_attempt_carried', async () => {
        await until(
            () => here.ownerWriteUnansweredAt(mine.switchId) === undefined,
            5_000,
            'the carry'
        );
        await settled();
    });
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

test('a carry that fails keeps this process’s note, and the next answer the database gives tries it again', async () => {
    await armed(60); // due at the pass: its move is the statement held
    const mine = await armed(3600);
    const other = await armed(3600);
    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
        open = resolve;
    });
    here.switchStatementTimeoutMs = 200;
    let held = 0;
    let carries = 0;
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (isSwitchUpdate(sql) && !isCarry(sql) && held === 0) {
                    held += 1;
                    await gate;
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
    try {
        assert.equal(
            await sweepOverdueDeadmanSwitches(new Date(Date.now() + 120_000), 15 * 60_000),
            0
        );
        assert.equal(held, 1);
        assert.equal((await post(mine.owner, `/switches/${mine.switchId}/check-in`)).status, 503);
        open();
        failed = await logged('deadman_owner_attempt_carry_failed', async () => {
            await until(() => carries >= 1, 5_000, 'the carry’s attempt');
            await settled();
        });
        here.switchStatementTimeoutMs = 30_000;
        assert.equal(failed, 1, 'logged');
        assert.ok(here.ownerWriteUnansweredAt(mine.switchId), 'the note is kept');
        assert.equal(await columnOf(mine.switchId), null);
    } catch (err) {
        open();
        restore();
        throw err;
    }
    // The next answer: another owner's check-in applied on this process (the
    // pool still counts the carries, and throws no more).
    let carried = 0;
    try {
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
    const statements = intercept(isSwitchUpdate, () => gate);
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
    // at once, so no stall opens, and the carry sent with the note fails too.
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
            await until(() => refusedConnects >= 4, 3_000, 'the carry tried while refused');
        });
        assert.ok(failedCarries >= 2, `tried again on its own (${failedCarries})`);
        assert.equal(await columnOf(slow.switchId), null);
        assert.ok(here.ownerWriteUnansweredAt(slow.switchId), 'the note is kept');
        // The database answers again. Nothing else is asked on this process.
        refusing = false;
        await until(
            () => here.ownerWriteUnansweredAt(slow.switchId) === undefined,
            3_000,
            'the carry on its timer'
        );
    } finally {
        restore();
        here.carryRetryMs = 10_000;
    }
    const column = await columnOf(slow.switchId);
    assert.ok(column instanceof Date, 'carried with no other request on the process');
    assert.ok(column.getTime() < deadline.getTime(), 'before the deadline');
    // And held at the deadline, from the column alone (this process's note
    // is gone, and nothing stalled).
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
        // stall, carries the moment it was made, not the refusal's.
        const first = gate();
        holdConnect = first.promise;
        const before1 = Date.now();
        assert.equal((await post(s.owner, `/switches/${s.switchId}/check-in`)).status, 503);
        const after1 = Date.now();
        assert.ok(after1 - before1 >= 1_000, 'refused after the bound');
        const note1 = here.ownerWriteUnansweredAt(s.switchId)!;
        assert.ok(
            Date.parse(note1.at) >= before1 && Date.parse(note1.at) < before1 + 500,
            'noted with the attempt’s moment'
        );
        // Q03: the first carry is held at the database while the owner tries
        // again and is refused again; the second attempt's moment is what
        // the switch ends with.
        const carry1 = gate();
        holdCarry = carry1.promise;
        first.open(); // the statement's turn comes after the bound: not run
        await until(() => carriesHeld === 1, 3_000, 'the first carry held');
        const before2 = Date.now();
        assert.equal((await post(s.owner, `/switches/${s.switchId}/check-in`)).status, 503);
        const after2 = Date.now();
        assert.ok(after2 - before2 >= 1_000, 'refused after the bound, behind the carry');
        const note2 = here.ownerWriteUnansweredAt(s.switchId)!;
        assert.ok(Date.parse(note2.at) >= before2 && Date.parse(note2.at) < before2 + 500);
        carry1.open();
        await until(
            () => here.ownerWriteUnansweredAt(s.switchId) === undefined,
            5_000,
            'both carries'
        );
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
