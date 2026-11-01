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

const matrix = createMatrixStub({ domain: 'test.local' });
globalThis.fetch = matrix.fetch;

const store = await import('../src/db/store');
const { MIGRATIONS_DIR, migrateUp } = await import('../src/db/migrate');
const { PGlite } = await import('@electric-sql/pglite');
const protocol = await import('@blackout/protocol');
const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { sweepOverdueDeadmanSwitches } = await import('../src/modules/deadman');
const { armReleaseSwitch, releasedCopiesFor } = await import('../src/services/deadmanReleases');
const { runDeadmanReleaseNotifier } = await import('../src/services/deadmanReleaseNotifier');
const { applyCheckIn } = await import('../src/services/deadmanScheduler');
const { log } = await import('../src/telemetry/logger');

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
const armed = async () => {
    const owner = await person();
    const recipient = await person();
    const envelope = await protocol.buildReleaseEnvelope({
        ownerKeySet: owner.keySet,
        recipients: [recipient.keySet.identity],
        message: 'Synthetic test text.',
    });
    const outcome = await armReleaseSwitch({
        ownerId: owner.id,
        input: { checkInIntervalSeconds: 60, gracePeriodSeconds: 0, envelope },
    });
    assert.equal(outcome.kind, 'armed');
    await here.drain();
    return { owner, recipient, switchId: envelope.releaseId };
};

const stored = async (switchId: string) =>
    (
        await pg.query(
            'SELECT status, released_at, last_check_in_at, encrypted_payload FROM deadman_switches WHERE id = $1',
            [switchId]
        )
    ).rows[0] as
        | {
              status: string;
              released_at: Date | null;
              last_check_in_at: Date;
              encrypted_payload: string;
          }
        | undefined;
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
        await here.drain();
        await new Promise((r) => setTimeout(r, 50));
        here.switchStatementTimeoutMs = 30_000;
        assert.equal((await stored(switchId))?.status, 'triggered', 'it landed after all');
        assert.equal(here.getDeadmanSwitch(switchId)?.status, 'armed', 'not yet heard of here');
        const later = new Date(at.getTime() + 60_000);
        await sweepOverdueDeadmanSwitches(later, Number.MAX_SAFE_INTEGER);
        assert.equal(here.getDeadmanSwitch(switchId)?.releasedAt, at.toISOString());
        assert.equal(releasedCopiesFor(recipient.id).length, 1, 'the person’s copy now listed');
        const sent = await runDeadmanReleaseNotifier({ now: later });
        await here.drain();
        assert.equal(sent.caughtUp, 1, 'the catch-up wrote its notice row');
        assert.equal(sendsFor(switchId).length, 1, 'sent once');
    }

    // A move whose turn in the queue had not come when the bound ran out is
    // not run when it comes: the write ahead of it is held.
    {
        const { switchId } = await armed();
        const at = nextMoment();
        let open!: () => void;
        const gate = new Promise<void>((resolve) => {
            open = resolve;
        });
        here.switchStatementTimeoutMs = 200;
        const ahead = intercept(
            (sql) => sql.startsWith('INSERT INTO users'),
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
            await person(); // its row's write is the one held
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

test('a switch whose own arming write was dropped still fires: Postgres has no row, so the move writes the switch whole', async () => {
    // Round 10 of part 2's review. The sweep's conditional move matched no
    // row and the read found none, so a switch whose arming write had failed
    // twice and been dropped stayed armed in the owner's list, never fired,
    // and nothing said so on any pass.
    let failures = 0;
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (failures < 2 && sql.startsWith('INSERT INTO deadman_switches')) {
                    failures += 1;
                    throw new Error('connection reset (test)');
                }
                return client.query<T>(sql, params);
            },
        };
    };
    let fixture: Awaited<ReturnType<typeof armed>>;
    try {
        fixture = await armed();
    } finally {
        restore();
    }
    const { recipient, switchId } = fixture;
    assert.equal(failures, 2);
    assert.equal(await stored(switchId), undefined, 'the arming write was dropped');
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
    await here.drain();
    assert.equal(writesHere, 0, 'nothing queued');
    const row = await stored(switchId);
    assert.equal(row?.status, 'cancelled', 'the cancel stands');
    assert.equal(row?.encrypted_payload, '');
    assert.equal(here.getDeadmanSwitch(switchId)?.status, 'cancelled', 'the mirror took it');
    await api.drain();
});

test('the owner’s check-in and cancel are conditional in Postgres: on a process whose mirror has not heard of a trigger they answer 409 switch_triggered, the trigger and the release stand, and a check-in over another check-in is made over it', async () => {
    // Round 10 of part 2's review. The routes wrote full rows from their own
    // mirror: a check-in the app accepted after the worker's trigger had
    // committed set the switch back to armed while its releasedAt stayed set,
    // the person's copy stayed readable and their notice was sent, the owner
    // was told the check-in had worked, and later check-ins were accepted.
    const auth = (user: { id: string; username: string }) => ({
        authorization: `Bearer ${signJwt(user.id, user.username, 600)}`,
        'content-type': 'application/json',
    });
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
