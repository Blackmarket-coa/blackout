/**
 * The release notifier's writes in the deployed topology
 * (`deploy/docker/production`: the loops run in `worker`, account deletion on
 * `app`, each with its own Postgres-backed mirror, write-behind and change
 * notifications between them). A deletion the app committed while the worker
 * had a notice in hand must stand in Postgres whenever the app's change
 * notification reaches the worker: before the send answers (the worker's own
 * re-read sees it) or after (the worker's writes are conditional in the
 * database, `updateDeadmanReleaseNoticeIf`). As round 4 built it the worker's
 * full-row upsert landed over the app's committed `failed` / `recipient_gone`
 * / no room, and Postgres ended `sent` with the room (round 5 of part 2's
 * review, `release-envelope-2026-10-26.md`). Round 6: the same for a notice
 * row the app had not yet heard of when it deleted (the worker's sweep wrote
 * it moments before), which the app's own writes cannot reach: the worker
 * reads the person's copy from the database before it makes a room and
 * before it sends, and the deletion's end pass (`finishAccountDeletion`)
 * ends and forgets the room of every row of theirs in the database; the
 * catch-up's creation of a row is insert-only there; and the notifier's end
 * for an account found gone after a send does not land over a `sent` that
 * another notifier committed during a leader handover.
 *
 * The worker is this process's store singleton (`BLACKOUT_DB_MODE=postgres`)
 * on an in-process PGlite with every migration applied, running the real
 * notifier against the stand-in homeserver; the app is a second
 * PostgresBackedDb on the same database, running the account deletion's own
 * release writes (`eraseReleaseCopiesAndNoticesOf`, then
 * `finishAccountDeletion`, as `confirmAccountDeletion` and the route call
 * them; the user row and the rest of the deletion are left, since neither the
 * notifier's read of the copy nor the end pass reads them). Change
 * notifications are delivered by hand, so the only variable is when the app's
 * reaches the worker.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';
import { createMatrixStub } from './_fixtures/matrixStub';
import type { ReleaseKeySet } from '@blackout/protocol';

process.env.NODE_ENV = 'test';
process.env.BLACKOUT_DB_MODE = 'postgres';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api-test';
process.env.JWT_AUDIENCE = 'blackout-client-test';
process.env.MATRIX_HOMESERVER = 'https://matrix.test.local';
process.env.MATRIX_BOT_TOKEN = 'syt_test_admin_token';
process.env.MATRIX_HOMESERVER_DOMAIN = 'test.local';

const matrix = createMatrixStub({ domain: 'test.local' });
globalThis.fetch = matrix.fetch;

const store = await import('../src/db/store');
const { MIGRATIONS_DIR, migrateUp } = await import('../src/db/migrate');
const { PGlite } = await import('@electric-sql/pglite');
const protocol = await import('@blackout/protocol');
const { sweepOverdueDeadmanSwitches } = await import('../src/modules/deadman');
const { armReleaseSwitch } = await import('../src/services/deadmanReleases');
const { NOTICE_RETRY_WINDOW_MS, runDeadmanReleaseNotifier } = await import(
    '../src/services/deadmanReleaseNotifier'
);
const { eraseReleaseCopiesAndNoticesOf, finishAccountDeletion } = await import(
    '../src/services/accountLifecycle'
);
const { upsertRecord } = await import('../src/db/pgWriter');

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
const worker = store.db as InstanceType<typeof store.PostgresBackedDb>;
assert.ok(worker instanceof store.PostgresBackedDb, 'the singleton is the Postgres store');
await worker.init(pool as never); // no transport: peer changes are delivered by hand

type PeerChange = { src: string; m: string; op: 'u' | 'r'; kv?: string[] };
const settle = () => new Promise((resolve) => setTimeout(resolve, 200));

const person = async (): Promise<{ id: string; keySet: ReleaseKeySet }> => {
    const id = randomUUID();
    const username = `pn-${id.slice(0, 8)}`;
    worker.createUser({
        id,
        username,
        email: `${username}@example.com`,
        passwordHash: 'unused',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: 'pk',
    });
    const keySet = await protocol.createReleaseKeySet(id);
    worker.publishReleaseIdentity({
        id: randomUUID(),
        accountId: id,
        formatVersion: keySet.identity.v,
        signingKey: keySet.identity.signingKey,
        x25519Key: keySet.identity.x25519Key,
        mlkem768Key: keySet.identity.mlkem768Key,
        signature: keySet.identity.signature,
        fingerprint: keySet.fingerprint,
    });
    return { id, keySet };
};

let clock = Date.now() + 100_000;
/** Arm a release naming the recipient on the worker, and fire it (`beforeSweep` runs between). */
const release = async (recipient: { keySet: ReleaseKeySet }, beforeSweep?: () => Promise<void>) => {
    const owner = await person();
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
    await beforeSweep?.();
    const at = new Date((clock += 300_000));
    sweepOverdueDeadmanSwitches(at, Number.MAX_SAFE_INTEGER);
    return { switchId: envelope.releaseId, at };
};

type Store = InstanceType<typeof store.PostgresBackedDb>;
/**
 * The account deletion's release writes on the app, as the deletion and the
 * route run them. The route answers once `finishAccountDeletion` returns, so
 * by then every write the deletion queued is in Postgres.
 */
const deleteOnApp = async (app: Store, accountId: string) => {
    eraseReleaseCopiesAndNoticesOf(app, accountId);
    await finishAccountDeletion(accountId, app);
    assert.equal(
        (app as unknown as { queue: { depth: number } }).queue.depth,
        0,
        'the deletion is in the database before the route answers'
    );
};

const committed = async (switchId: string, accountId: string) =>
    (
        await pg.query(
            'SELECT status, last_error, room_id FROM deadman_release_notices WHERE switch_id = $1 AND recipient_account_id = $2',
            [switchId, accountId]
        )
    ).rows[0] as { status: string; last_error: string | null; room_id: string | null };

const urlOf = (input: RequestInfo | URL): string =>
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

test('an account deletion the API process committed while the worker had a notice in hand stands in Postgres, whenever its change notification reaches the worker, and whether or not the API process had seen the notice row', async () => {
    type Row = { status: string; last_error: string | null; room_id: string | null };
    const GONE: Row = { status: 'failed', last_error: 'recipient_gone', room_id: null };
    type Variant = {
        name: string;
        /**
         * An earlier notice made the person's room (`known`); the homeserver
         * has since lost it (`purged`); or the person has left it (`left`).
         */
        room: 'none' | 'known' | 'purged' | 'left';
        /**
         * The homeserver call the deletion lands during; `none`: before the
         * tick; `after`: once the tick's writes are in Postgres.
         */
        park: 'send' | 'create' | 'invite' | 'none' | 'after';
        /** The notification reaches the worker while that call is in flight, not after. */
        early?: boolean;
        /** The parked send is refused, so the worker records a retry. */
        refused?: boolean;
        /** The tick comes after the retry window, so the worker ends the row itself. */
        late?: boolean;
        /**
         * The app booted before the sweep wrote the notice row and has not
         * heard of it when it deletes (round 6), so its own writes cannot
         * reach the row.
         */
        unseen?: boolean;
        /** What Postgres must hold for the row at the end (default: ended, no room). */
        expect?: Row;
        /** Sends of this notice the homeserver saw (default: not checked). */
        sends?: number;
        /** Rooms made for the person in this notice's tick (default: not checked). */
        creates?: number;
    };
    const variants: Variant[] = [
        { name: 'room known, during the send, told after', room: 'known', park: 'send' },
        {
            name: 'room known, during the send, told during',
            room: 'known',
            park: 'send',
            early: true,
        },
        { name: 'room made now, during the send, told after', room: 'none', park: 'send' },
        { name: 'room made now, during the create, told after', room: 'none', park: 'create' },
        {
            name: 'room purged and replaced now, during the create, told after',
            room: 'purged',
            park: 'create',
        },
        {
            name: 'room known, during a send the homeserver refuses, told after',
            room: 'known',
            park: 'send',
            refused: true,
        },
        { name: 'person left, during the re-invite, told after', room: 'left', park: 'invite' },
        {
            name: 'before a tick after the retry window, told after',
            room: 'known',
            park: 'none',
            late: true,
        },
        {
            name: 'a row the app had not seen, deleted before the tick, told after',
            room: 'none',
            park: 'none',
            unseen: true,
            sends: 0,
            creates: 0,
        },
        {
            name: 'a row the app had not seen, room known, deleted before the tick, told after',
            room: 'known',
            park: 'none',
            unseen: true,
            sends: 0,
            creates: 0,
        },
        {
            name: 'a row the app had not seen, deleted during the create, told after',
            room: 'none',
            park: 'create',
            unseen: true,
            sends: 0,
            creates: 1,
        },
        {
            name: 'a row the app had not seen, deleted during the send, told after',
            room: 'none',
            park: 'send',
            unseen: true,
            sends: 1,
        },
        {
            name: 'a row the app had not seen, deleted after the worker recorded it sent, told after',
            room: 'none',
            park: 'after',
            unseen: true,
            expect: { status: 'sent', last_error: null, room_id: null },
            sends: 1,
        },
    ];
    for (const variant of variants) {
        const expected = variant.expect ?? GONE;
        const recipient = await person();
        const mxid = `@pn-${recipient.id.slice(0, 8)}:test.local`;
        let earlier: { switchId: string } | undefined;
        if (variant.room !== 'none') {
            // An earlier notice made the person's room; its writes landed in
            // Postgres, conditional on the row still pending there.
            const first = await release(recipient);
            earlier = first;
            assert.equal((await runDeadmanReleaseNotifier({ now: first.at })).sent, 1);
            await worker.drain();
            const sent = await committed(first.switchId, recipient.id);
            assert.equal(
                sent.status,
                'sent',
                `${variant.name}: a conditional write lands on a pending row`
            );
            assert.ok(sent.room_id, variant.name);
            if (variant.room === 'purged') matrix.purgeRoom(sent.room_id);
            if (variant.room === 'left') {
                const state = matrix.rooms.get(sent.room_id) as Array<{
                    type: string;
                    state_key?: string;
                    content?: Record<string, unknown>;
                }>;
                matrix.rooms.set(sent.room_id, [
                    ...state.filter((e) => !(e.type === 'm.room.member' && e.state_key === mxid)),
                    { type: 'm.room.member', state_key: mxid, content: { membership: 'leave' } },
                ]);
            }
        }
        let app!: Store;
        // What the app announces to the other processes, delivered to the
        // worker by hand below, as the transport would deliver it.
        const announced: PeerChange[] = [];
        const bootApp = async () => {
            await worker.drain();
            app = new store.PostgresBackedDb();
            await app.init(pool as never, {
                publish: (payload) => announced.push(payload as PeerChange),
                subscribe: async () => undefined,
                onReconnect: () => undefined,
                close: async () => undefined,
            });
        };
        // The app boots after the arm (it has the copy) and, unless the row
        // is to be one it never saw, after the sweep wrote the notice row.
        const notice = await release(recipient, variant.unseen ? bootApp : undefined);
        if (!variant.unseen) await bootApp();
        await worker.drain();
        if (variant.unseen) {
            assert.equal(
                app.getDeadmanReleaseNotice(notice.switchId, recipient.id),
                undefined,
                `${variant.name}: the app has not heard of the row`
            );
            assert.equal((await committed(notice.switchId, recipient.id)).status, 'pending');
        }

        // The call is parked until the app has committed the deletion.
        let open!: () => void;
        const gate = new Promise<void>((resolve) => {
            open = resolve;
        });
        let parked = false;
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = urlOf(input);
            const hit =
                variant.park === 'send'
                    ? url.includes('/send/') && url.includes(notice.switchId)
                    : variant.park === 'create'
                    ? url.includes('/createRoom') && String(init?.body).includes(mxid)
                    : variant.park === 'invite'
                    ? url.includes('/state/m.room.member/')
                    : false;
            if (hit && !parked) {
                parked = true;
                await gate;
            }
            return matrix.fetch(input, init);
        }) as typeof fetch;
        const tellWorker = () => {
            const peer = worker as unknown as { applyPeerChange(payload: PeerChange): void };
            for (const payload of announced.splice(0)) peer.applyPeerChange(payload);
        };
        const deleteAndCheck = async () => {
            await deleteOnApp(app, recipient.id);
            assert.deepEqual(
                await committed(notice.switchId, recipient.id),
                expected,
                `${variant.name}: the app committed the deletion`
            );
            const own = app.getDeadmanReleaseNotice(notice.switchId, recipient.id)!;
            assert.equal(own.status, expected.status, `${variant.name}: the app's own mirror`);
            assert.equal(own.roomId, undefined, variant.name);
        };
        const sendsBefore = matrix.sends.filter((x) => x.txnId.includes(notice.switchId)).length;
        const createsBefore = matrix.creates.filter((x) =>
            JSON.stringify(x.body.invite).includes(mxid)
        ).length;
        try {
            if (variant.park === 'none') {
                await deleteAndCheck();
                const after = variant.late
                    ? new Date(notice.at.getTime() + NOTICE_RETRY_WINDOW_MS + 1000)
                    : notice.at;
                assert.equal((await runDeadmanReleaseNotifier({ now: after })).failed, 1);
                tellWorker();
                await settle();
            } else if (variant.park === 'after') {
                assert.equal((await runDeadmanReleaseNotifier({ now: notice.at })).sent, 1);
                await worker.drain();
                assert.equal((await committed(notice.switchId, recipient.id)).status, 'sent');
                await deleteAndCheck();
                tellWorker();
                await settle();
            } else {
                const tick = runDeadmanReleaseNotifier({ now: notice.at });
                for (let i = 0; i < 200 && !parked; i += 1) {
                    await new Promise((r) => setTimeout(r, 10));
                }
                assert.ok(parked, `${variant.name}: the call was reached`);
                await deleteAndCheck();
                if (variant.early) {
                    tellWorker();
                    await settle();
                }
                if (variant.refused) matrix.sendStatus = 500;
                open();
                await tick;
                matrix.sendStatus = 200;
                if (!variant.early) {
                    tellWorker();
                    await settle();
                }
            }
            await worker.drain();
        } finally {
            open();
            matrix.sendStatus = 200;
            globalThis.fetch = matrix.fetch;
        }

        assert.deepEqual(
            await committed(notice.switchId, recipient.id),
            expected,
            `${variant.name}: Postgres keeps the deletion's row`
        );
        if (variant.sends !== undefined) {
            assert.equal(
                matrix.sends.filter((x) => x.txnId.includes(notice.switchId)).length - sendsBefore,
                variant.sends,
                `${variant.name}: sends of this notice`
            );
        }
        if (variant.creates !== undefined) {
            assert.equal(
                matrix.creates.filter((x) => JSON.stringify(x.body.invite).includes(mxid)).length -
                    createsBefore,
                variant.creates,
                `${variant.name}: rooms made for the person`
            );
        }
        if (earlier) {
            const kept = await committed(earlier.switchId, recipient.id);
            assert.equal(kept.status, 'sent', variant.name);
            assert.equal(
                kept.room_id,
                null,
                `${variant.name}: the earlier row keeps the deletion's forgotten room, not a replacement`
            );
        }
        const mirrored = worker.getDeadmanReleaseNotice(notice.switchId, recipient.id)!;
        assert.equal(
            mirrored.status,
            expected.status,
            `${variant.name}: the worker's mirror, once told`
        );
        assert.equal(mirrored.roomId, undefined, variant.name);
        const booted = new store.PostgresBackedDb();
        await booted.init(pool as never);
        const fresh = booted.getDeadmanReleaseNotice(notice.switchId, recipient.id)!;
        assert.equal(fresh.status, expected.status, `${variant.name}: a replica booting now`);
        assert.equal(fresh.roomId, undefined, variant.name);
    }
});

test('the store’s conditional notice write: applied in Postgres only while the stored row holds the condition, by status or by room', async () => {
    const recipient = await person();
    const notice = await release(recipient);
    await worker.drain();

    // Pending on both sides: the worker's conditional write lands.
    assert.ok(
        worker.updateDeadmanReleaseNoticeIf(
            notice.switchId,
            recipient.id,
            { status: 'pending' },
            { roomId: '!old:test.local' }
        )
    );
    await worker.drain();
    assert.equal((await committed(notice.switchId, recipient.id)).room_id, '!old:test.local');

    // The app clears the room and ends the row; the worker has not seen it.
    const app = new store.PostgresBackedDb();
    await app.init(pool as never);
    app.updateDeadmanReleaseNotice(notice.switchId, recipient.id, {
        roomId: undefined,
        status: 'failed',
        lastError: 'recipient_gone',
    });
    await app.drain();

    // The worker's mirror still says pending and the old room: in memory its
    // conditional writes apply, in Postgres neither lands.
    assert.ok(
        worker.updateDeadmanReleaseNoticeIf(
            notice.switchId,
            recipient.id,
            { roomId: '!old:test.local' },
            { roomId: '!new:test.local' }
        ),
        'the mirror still held the old room'
    );
    assert.ok(
        worker.updateDeadmanReleaseNoticeIf(
            notice.switchId,
            recipient.id,
            { status: 'pending' },
            { status: 'sent', lastError: undefined }
        )
    );
    await worker.drain();
    assert.deepEqual(await committed(notice.switchId, recipient.id), {
        status: 'failed',
        last_error: 'recipient_gone',
        room_id: null,
    });

    // In memory a row that no longer holds the condition is not written.
    assert.equal(
        worker.updateDeadmanReleaseNoticeIf(
            notice.switchId,
            recipient.id,
            { status: 'pending' },
            { attempts: 99 }
        ),
        undefined
    );
    assert.equal(worker.getDeadmanReleaseNotice(notice.switchId, recipient.id)!.attempts, 0);
});

test('a notice row is created only where Postgres has none: a process whose mirror has the fired switch but not yet the row another process sent does not set it back to pending', async () => {
    // A leader handover: the old leader (the worker here) fired the switch and
    // sent the notice; the new one has the switch's change notification but
    // not yet the row's, so its catch-up writes the row its mirror lacks. As
    // a plain upsert that write set Postgres back to pending with no attempts,
    // and the notice was sent again (round 6 of part 2's review).
    const recipient = await person();
    const owner = await person();
    const envelope = await protocol.buildReleaseEnvelope({
        ownerKeySet: owner.keySet,
        recipients: [recipient.keySet.identity],
        message: 'Synthetic test text.',
    });
    const armed = await armReleaseSwitch({
        ownerId: owner.id,
        input: { checkInIntervalSeconds: 60, gracePeriodSeconds: 0, envelope },
    });
    assert.equal(armed.kind, 'armed');
    await worker.drain();
    const standby = new store.PostgresBackedDb();
    await standby.init(pool as never);

    const at = new Date((clock += 300_000));
    sweepOverdueDeadmanSwitches(at, Number.MAX_SAFE_INTEGER);
    assert.equal((await runDeadmanReleaseNotifier({ now: at })).sent, 1);
    await worker.drain();
    const sentRow = (
        await pg.query(
            'SELECT status, attempts, room_id, sent_at FROM deadman_release_notices WHERE switch_id = $1 AND recipient_account_id = $2',
            [envelope.releaseId, recipient.id]
        )
    ).rows[0] as { status: string; attempts: number; room_id: string; sent_at: unknown };
    assert.equal(sentRow.status, 'sent');
    assert.ok(sentRow.room_id);

    // The standby hears of the switch, not yet of the row.
    (standby as unknown as { applyPeerChange(payload: PeerChange): void }).applyPeerChange({
        src: 'worker',
        m: 'deadmanSwitches',
        op: 'u',
        kv: [envelope.releaseId],
    });
    await settle();
    assert.equal(standby.getDeadmanSwitch(envelope.releaseId)?.status, 'triggered');
    assert.equal(standby.getDeadmanReleaseNotice(envelope.releaseId, recipient.id), undefined);
    const created = standby.createDeadmanReleaseNotice({
        switchId: envelope.releaseId,
        recipientAccountId: recipient.id,
        nextAttemptAt: at.toISOString(),
    });
    assert.equal(created?.status, 'pending', 'its mirror lacked the row, so it wrote one');
    await standby.drain();

    assert.deepEqual(
        (
            await pg.query(
                'SELECT status, attempts, room_id, sent_at FROM deadman_release_notices WHERE switch_id = $1 AND recipient_account_id = $2',
                [envelope.releaseId, recipient.id]
            )
        ).rows[0],
        sentRow,
        'Postgres keeps the sent row'
    );
    const booted = new store.PostgresBackedDb();
    await booted.init(pool as never);
    assert.equal(booted.getDeadmanReleaseNotice(envelope.releaseId, recipient.id)?.status, 'sent');
    // Told of the row, the standby reads it as Postgres has it.
    (standby as unknown as { applyPeerChange(payload: PeerChange): void }).applyPeerChange({
        src: 'worker',
        m: 'deadmanReleaseNotices',
        op: 'u',
        kv: [envelope.releaseId, recipient.id],
    });
    await settle();
    assert.equal(standby.getDeadmanReleaseNotice(envelope.releaseId, recipient.id)?.status, 'sent');
});

test('after a send, the end for an account found gone is conditional too: during a leader handover a sent that another notifier committed stands', async () => {
    // The worker's send is in flight; meanwhile another notifier (a standby
    // that took over) sent the same notice and committed `sent` with its
    // room, and the account is gone from the worker's view another way (not
    // through the deletion, which would have blanked the copy). The worker's
    // end, written unconditionally, turned that `sent` into `failed` (round 6
    // of part 2's review: the record had called the guard on this write
    // equivalent).
    const recipient = await person();
    const notice = await release(recipient);
    await worker.drain();
    const other = new store.PostgresBackedDb();
    await other.init(pool as never);

    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
        open = resolve;
    });
    let parked = false;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = urlOf(input);
        if (url.includes('/send/') && url.includes(notice.switchId) && !parked) {
            parked = true;
            await gate;
        }
        return matrix.fetch(input, init);
    }) as typeof fetch;
    try {
        const tick = runDeadmanReleaseNotifier({ now: notice.at });
        for (let i = 0; i < 200 && !parked; i += 1) {
            await new Promise((r) => setTimeout(r, 10));
        }
        assert.ok(parked, 'the send was reached');
        other.updateDeadmanReleaseNotice(notice.switchId, recipient.id, {
            status: 'sent',
            attempts: 1,
            sentAt: new Date().toISOString(),
            roomId: '!other-room:test.local',
        });
        await other.drain();
        (worker as unknown as { users: Map<string, unknown> }).users.delete(recipient.id);
        open();
        const result = await tick;
        assert.equal(result.failed, 1, 'this tick ended it as gone');
        await worker.drain();
    } finally {
        open();
        globalThis.fetch = matrix.fetch;
    }
    assert.deepEqual(await committed(notice.switchId, recipient.id), {
        status: 'sent',
        last_error: null,
        room_id: '!other-room:test.local',
    });
    const booted = new store.PostgresBackedDb();
    await booted.init(pool as never);
    assert.equal(booted.getDeadmanReleaseNotice(notice.switchId, recipient.id)?.status, 'sent');
});

test('the writer refuses a conditional write it cannot carry into Postgres, and writes nothing', async () => {
    const recipient = await person();
    const notice = await release(recipient);
    await worker.drain();
    const plan = (worker as unknown as { plans: Map<string, never> }).plans.get(
        'deadmanReleaseNotices'
    )!;
    const client = await pool.connect();
    const before = await committed(notice.switchId, recipient.id);
    const record = {
        ...worker.getDeadmanReleaseNotice(notice.switchId, recipient.id)!,
        status: 'failed',
        lastError: 'should-not-land',
    };
    // A guard field with no column, one with no value, and a guard on an
    // insert-only write: each throws rather than drop the condition.
    await assert.rejects(
        upsertRecord(client as never, plan, record, { noSuchField: 'pending' }),
        /names a field with no column or value/
    );
    await assert.rejects(
        upsertRecord(client as never, plan, record, { status: 'pending', roomId: undefined }),
        /names a field with no column or value/
    );
    await assert.rejects(
        upsertRecord(client as never, plan, record, { status: 'pending' }, true),
        /carries a guard/
    );
    assert.deepEqual(await committed(notice.switchId, recipient.id), before, 'nothing written');
    // With a guard it can carry, the same record lands.
    await upsertRecord(client as never, plan, record, { status: 'pending' });
    assert.equal((await committed(notice.switchId, recipient.id)).last_error, 'should-not-land');
});
