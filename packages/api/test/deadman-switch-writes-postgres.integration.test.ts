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
const { armReleaseSwitch, armsInFlightCount, releasedCopiesFor } = await import(
    '../src/services/deadmanReleases'
);
const { runDeadmanReleaseNotifier } = await import('../src/services/deadmanReleaseNotifier');
const { applyCheckIn } = await import('../src/services/deadmanScheduler');
const { log } = await import('../src/telemetry/logger');
type StoreChangePayload = import('../src/db/pgNotify').StoreChangePayload;

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
                        if (isSwitchUpdate(sql)) updates += 1;
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
            const again = await post(owner, `/switches/${switchId}/check-in`);
            assert.equal(again.status, 200, 'made once the write landed');
            await here.drain();
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
        const { envelope, res } = armedRes!;
        assert.equal(res.status, 500);
        assert.equal(((await res.json()) as { code: string }).code, 'switch_write_failed');
        assert.equal(failures, 1, 'one statement, not retried');
        assert.equal(failed, 1, 'logged');
        assert.equal(here.getDeadmanSwitch(envelope.releaseId), undefined, 'nothing in the mirror');
        assert.deepEqual(here.listDeadmanReleaseWraps(envelope.releaseId), [], 'no copies either');
        await here.drain();
        assert.equal(await stored(envelope.releaseId), undefined, 'no row');
        assert.deepEqual(
            await storedCopies(envelope.releaseId),
            [],
            'the copies written first were taken back'
        );
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

test('a release switch cancelled with its releasedAt kept (the owner’s deletion over a trigger committed elsewhere) is served to nobody and notified to nobody: the readers need the status, not releasedAt alone', async () => {
    // Round 10 of part 2's review's verifiers: `releasedCopiesFor` and the
    // notifier keyed on `releasedAt`, and only the emptied content kept such
    // a switch from being served.
    const { recipient, switchId } = await armed();
    const firesAt = nextMoment();
    await sweepOverdueDeadmanSwitches(firesAt, Number.MAX_SAFE_INTEGER);
    await here.drain();
    assert.equal(releasedCopiesFor(recipient.id).length, 1, 'listed while fired');
    assert.equal((await noticeRows(switchId)).length, 1, 'its notice owed');
    // Cancelled with the content and `releasedAt` kept, as the merge of the
    // deletion over the trigger leaves it but for the content.
    here.updateDeadmanSwitch(switchId, { status: 'cancelled' });
    await here.drain();
    assert.equal(here.getDeadmanSwitch(switchId)?.releasedAt, firesAt.toISOString());
    assert.equal(releasedCopiesFor(recipient.id).length, 0, 'not listed');
    const tick = await runDeadmanReleaseNotifier({ now: new Date(firesAt.getTime() + 1_000) });
    await here.drain();
    assert.equal(tick.caughtUp, 0, 'the catch-up writes nothing for it');
    assert.ok(tick.failed >= 1, 'its pending notice ends (other tests’ due notices end here too)');
    assert.equal(sendsFor(switchId).length, 0, 'nothing sent');
    const notice = here.getDeadmanReleaseNotice(switchId, recipient.id);
    assert.equal(notice?.status, 'failed');
    assert.equal(notice?.lastError, 'release_unavailable');
});
