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
import { createMatrixStub, createdRoomState, memberEvent } from './_fixtures/matrixStub';
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
const { computeDeadlines } = await import('../src/services/deadmanScheduler');

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
// Every change to a notice row, in order, so a test can see what Postgres held
// between two moments and not only at the end (a write that set a deleted
// person's row back to pending, later ended again, shows here).
await pg.exec(`
    CREATE TABLE notice_audit (
        seq SERIAL PRIMARY KEY,
        switch_id TEXT NOT NULL,
        recipient_account_id TEXT NOT NULL,
        status TEXT NOT NULL,
        room_id TEXT
    );
    CREATE FUNCTION notice_audit_row() RETURNS trigger AS $$
    BEGIN
        INSERT INTO notice_audit (switch_id, recipient_account_id, status, room_id)
        VALUES (NEW.switch_id, NEW.recipient_account_id, NEW.status, NEW.room_id);
        RETURN NEW;
    END
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER notice_audit_after AFTER INSERT OR UPDATE ON deadman_release_notices
        FOR EACH ROW EXECUTE FUNCTION notice_audit_row();
`);
const auditMark = async (): Promise<number> =>
    Number(
        (
            (await pg.query('SELECT coalesce(max(seq), 0) AS n FROM notice_audit')).rows[0] as {
                n: number;
            }
        ).n
    );
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
    await sweepOverdueDeadmanSwitches(at, Number.MAX_SAFE_INTEGER);
    return { switchId: envelope.releaseId, at };
};

type Store = InstanceType<typeof store.PostgresBackedDb>;
/**
 * The account deletion's release writes on the app, as the deletion and the
 * route run them. The route answers once `finishAccountDeletion` returns,
 * which waits with no bound for every write the app had queued, the
 * deletion's among them, to be attempted in Postgres (a write that fails
 * twice is dropped and logged, so attempted is not always written), and then
 * for the last statement at most its bound (round 8 of part 2's review: the
 * bound covered the drain too, and this helper said the writes were in
 * Postgres by the answer).
 */
const deleteOnApp = async (app: Store, accountId: string) => {
    eraseReleaseCopiesAndNoticesOf(app, accountId);
    await finishAccountDeletion(accountId, app);
    assert.equal(
        (app as unknown as { queue: { depth: number } }).queue.depth,
        0,
        'the deletion’s queued writes have been attempted before the route answers'
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
         * The homeserver call the deletion lands during; `state`: the read of
         * the known room's state; `none`: before the tick; `after`: once the
         * tick's writes are in Postgres.
         */
        park: 'send' | 'create' | 'invite' | 'state' | 'none' | 'after';
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
        /** Invites of the person in this notice's tick (default: not checked). */
        invites?: number;
        /** Reads of the known room's state in this notice's tick (default: not checked). */
        stateReads?: number;
        /** The homeserver refuses the room's alias, so a create without it follows (round 7). */
        aliasRefused?: boolean;
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
            stateReads: 0,
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
        // Round 7: the deletion commits while the known room's state is
        // read, and what follows that read is a create (the room is gone) or
        // a re-invite (the person left). As round 6 left it, only the mirror
        // was read between the state and those calls, so the room was made,
        // or the person invited, for an account already deleted.
        {
            name: 'room purged, deleted during the state read, told after',
            room: 'purged',
            park: 'state',
            sends: 0,
            creates: 0,
        },
        {
            name: 'a row the app had not seen, room purged, deleted during the state read, told after',
            room: 'purged',
            park: 'state',
            unseen: true,
            sends: 0,
            creates: 0,
        },
        {
            name: 'a row the app had not seen, alias refused, deleted during the create with the alias, told after',
            room: 'none',
            park: 'create',
            unseen: true,
            aliasRefused: true,
            sends: 0,
            creates: 0,
        },
        {
            name: 'person left, deleted during the state read, told after',
            room: 'left',
            park: 'state',
            sends: 0,
            invites: 0,
        },
        {
            name: 'a row the app had not seen, person left, deleted during the state read, told after',
            room: 'left',
            park: 'state',
            unseen: true,
            sends: 0,
            invites: 0,
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
        let knownRoom = '';
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
            knownRoom = sent.room_id;
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
                    : variant.park === 'state'
                    ? url.includes(
                          `/_synapse/admin/v1/rooms/${encodeURIComponent(knownRoom)}/state`
                      )
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
        let deletedAt = 0;
        const deleteAndCheck = async () => {
            await deleteOnApp(app, recipient.id);
            deletedAt = await auditMark();
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
        const invitesBefore = matrix.invites.filter((x) => x.userId === mxid).length;
        const stateReadsBefore = matrix.stateReads.filter((x) => x === knownRoom).length;
        if (variant.aliasRefused) matrix.aliasRefusal = { status: 403, errcode: 'M_FORBIDDEN' };
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
            matrix.aliasRefusal = null;
            globalThis.fetch = matrix.fetch;
        }

        assert.deepEqual(
            await committed(notice.switchId, recipient.id),
            expected,
            `${variant.name}: Postgres keeps the deletion's row`
        );
        if (variant.stateReads !== undefined) {
            assert.equal(
                matrix.stateReads.filter((x) => x === knownRoom).length - stateReadsBefore,
                variant.stateReads,
                `${variant.name}: reads of the known room's state`
            );
        }
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
        if (variant.invites !== undefined) {
            assert.equal(
                matrix.invites.filter((x) => x.userId === mxid).length - invitesBefore,
                variant.invites,
                `${variant.name}: invites of the person`
            );
        }
        // Nor did Postgres hold anything else in between: once the deletion
        // committed, no write set a row of the person's back to pending or gave
        // one a room, even for a moment before a later write ended it again.
        assert.ok(deletedAt > 0, variant.name);
        assert.deepEqual(
            (
                await pg.query(
                    'SELECT status, room_id FROM notice_audit WHERE seq > $1 AND recipient_account_id = $2 ORDER BY seq',
                    [deletedAt, recipient.id]
                )
            ).rows.filter(
                (row) =>
                    (row as { status: string }).status === 'pending' ||
                    (row as { room_id: string | null }).room_id !== null
            ),
            [],
            `${variant.name}: nothing after the deletion put a row back`
        );
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
    await sweepOverdueDeadmanSwitches(at, Number.MAX_SAFE_INTEGER);
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

test('a leader taking over within the change notification’s lag sends nothing the old leader sent and makes no second room: its own tick reads the row from Postgres before it makes a room and before it sends', async () => {
    // Round 7 of part 2's review. The catch-up's create is insert-only in
    // Postgres (round 6), so Postgres kept the old leader's `sent`; but the
    // new leader's mirror held the pending row its own create returned, and
    // the same tick found the room through the alias and sent the notice
    // again (deduplicated only while the homeserver keeps the transaction
    // id), or, with the alias refused, made a second room, invited the person
    // into it and sent there. The worker is the new leader here; a second
    // store is the old one, firing the switch as the sweep does and sending
    // as the notifier does, through the real client with the notifier's own
    // create body.
    const { matrixClient } = await import('../src/integrations/matrix-client');
    const notifier = await import('../src/services/deadmanReleaseNotifier');
    type Variant = {
        name: string;
        /** The homeserver refuses the alias, so the old leader's room has none. */
        aliasRefused?: boolean;
        /** The old leader's send was refused: Postgres has the row pending, with its room and a retry. */
        oldSendRefused?: boolean;
        /** The new leader never heard of the trigger: its mirror has the switch armed, and its sweep fires it. */
        armedInMirror?: boolean;
        /** The new leader's own send is refused too, so it records a retry over the old one's. */
        newSendRefused?: boolean;
    };
    const variants: Variant[] = [
        { name: 'sent, room with the alias' },
        { name: 'sent, alias refused', aliasRefused: true },
        {
            name: 'room recorded and the send refused, alias refused',
            aliasRefused: true,
            oldSendRefused: true,
        },
        {
            name: 'room recorded and the send refused, and refused again for the new leader',
            aliasRefused: true,
            oldSendRefused: true,
            newSendRefused: true,
        },
        { name: 'sent, the trigger not yet heard of either', armedInMirror: true },
    ];
    for (const variant of variants) {
        const recipient = await person();
        const owner = await person();
        const mxid = `@pn-${recipient.id.slice(0, 8)}:test.local`;
        const envelope = await protocol.buildReleaseEnvelope({
            ownerKeySet: owner.keySet,
            recipients: [recipient.keySet.identity],
            message: 'Synthetic test text.',
        });
        const armed = await armReleaseSwitch({
            ownerId: owner.id,
            input: { checkInIntervalSeconds: 60, gracePeriodSeconds: 0, envelope },
        });
        assert.equal(armed.kind, 'armed', variant.name);
        const switchId = envelope.releaseId;
        await worker.drain();

        const old = new store.PostgresBackedDb();
        await old.init(pool as never);
        const at = new Date((clock += 300_000));
        const releasedAt = at.toISOString();
        if (variant.aliasRefused) matrix.aliasRefusal = { status: 403, errcode: 'M_FORBIDDEN' };
        try {
            old.updateDeadmanSwitch(switchId, { status: 'triggered', releasedAt });
            old.createDeadmanReleaseNotice({
                switchId,
                recipientAccountId: recipient.id,
                nextAttemptAt: releasedAt,
            });
            const made = await matrixClient.createRoom({
                name: 'Blackout notices',
                ...(variant.aliasRefused
                    ? {}
                    : { aliasLocalpart: notifier.noticeRoomAliasLocalpart(mxid) }),
                visibility: 'private',
                preset: 'public_chat',
                encrypted: false,
                initialState: [notifier.NOTICE_ROOM_JOIN_RULE],
                invite: [mxid],
                isDirect: true,
                powerLevelOverride: { ...notifier.NOTICE_ROOM_POWER_LEVELS },
            });
            assert.ok(made.ok, variant.name);
            const oldRoom = made.roomId;
            if (variant.oldSendRefused) matrix.sendStatus = 500;
            const firstSend = await matrixClient.sendEvent(
                oldRoom,
                notifier.noticeContent(switchId),
                { txnId: notifier.noticeTxnId(switchId, recipient.id) }
            );
            matrix.sendStatus = 200;
            assert.equal(firstSend.ok, !variant.oldSendRefused, variant.name);
            old.updateDeadmanReleaseNoticeIf(
                switchId,
                recipient.id,
                { status: 'pending' },
                variant.oldSendRefused
                    ? {
                          attempts: 1,
                          lastError: 'matrix_send_status_500',
                          nextAttemptAt: new Date(at.getTime() + 30_000).toISOString(),
                          roomId: oldRoom,
                      }
                    : {
                          status: 'sent',
                          attempts: 1,
                          sentAt: new Date().toISOString(),
                          roomId: oldRoom,
                      }
            );
            await old.drain();
            const stored = (
                await pg.query(
                    'SELECT status, attempts, room_id FROM deadman_release_notices WHERE switch_id = $1 AND recipient_account_id = $2',
                    [switchId, recipient.id]
                )
            ).rows[0] as { status: string; attempts: number; room_id: string };
            assert.equal(stored.status, variant.oldSendRefused ? 'pending' : 'sent', variant.name);

            // The new leader: told of the switch but not yet of the row, or
            // of neither.
            if (!variant.armedInMirror) {
                (
                    worker as unknown as { applyPeerChange(payload: PeerChange): void }
                ).applyPeerChange({ src: 'old', m: 'deadmanSwitches', op: 'u', kv: [switchId] });
                await settle();
                assert.equal(worker.getDeadmanSwitch(switchId)?.status, 'triggered', variant.name);
            } else {
                assert.equal(worker.getDeadmanSwitch(switchId)?.status, 'armed', variant.name);
                await sweepOverdueDeadmanSwitches(at, Number.MAX_SAFE_INTEGER);
            }
            if (!variant.armedInMirror) {
                assert.equal(
                    worker.getDeadmanReleaseNotice(switchId, recipient.id),
                    undefined,
                    `${variant.name}: the new leader has not heard of the row`
                );
            }
            const sendsBefore = matrix.sends.filter((x) => x.txnId.includes(switchId)).length;
            const roomsBefore = matrix.creates.filter((x) =>
                JSON.stringify(x.body.invite).includes(mxid)
            ).length;
            const invitesBefore = matrix.invites.filter((x) => x.userId === mxid).length;
            const stateReadsBefore = matrix.stateReads.filter((r) => r === oldRoom).length;
            if (variant.newSendRefused) matrix.sendStatus = 500;
            let tick = await runDeadmanReleaseNotifier({ now: at });
            await worker.drain();
            if (variant.oldSendRefused) {
                // Judged at the attempt's first read, before anything is asked
                // of the homeserver: the known room's state is not read
                // either (round 9 of part 2's review: with that judgement
                // removed, a later read stopped the attempt, but only after
                // the room's state had been read).
                assert.equal(
                    matrix.stateReads.filter((r) => r === oldRoom).length - stateReadsBefore,
                    0,
                    `${variant.name}: the room's state not read before the old leader's retry time`
                );
                // Round 8: Postgres has the old leader's retry set for 30 s
                // on; the new leader's catch-up row was due now. It is left
                // for its time: nothing sent, nothing written, and the
                // mirror takes the stored row with that time.
                assert.equal(
                    matrix.sends.filter((x) => x.txnId.includes(switchId)).length - sendsBefore,
                    0,
                    `${variant.name}: not attempted before the old leader's retry time`
                );
                assert.ok(tick.elsewhere >= 1, `${variant.name}: counted elsewhere`);
                assert.deepEqual(
                    (
                        await pg.query(
                            'SELECT status, attempts, room_id FROM deadman_release_notices WHERE switch_id = $1 AND recipient_account_id = $2',
                            [switchId, recipient.id]
                        )
                    ).rows[0],
                    stored,
                    `${variant.name}: Postgres as the old leader left it`
                );
                const waiting = worker.getDeadmanReleaseNotice(switchId, recipient.id)!;
                assert.equal(
                    waiting.nextAttemptAt,
                    new Date(at.getTime() + 30_000).toISOString(),
                    `${variant.name}: the mirror has the old leader's retry time`
                );
                assert.equal(waiting.attempts, 1, variant.name);
                tick = await runDeadmanReleaseNotifier({ now: new Date(at.getTime() + 30_000) });
                await worker.drain();
            }
            matrix.sendStatus = 200;

            const newSends = matrix.sends
                .filter((x) => x.txnId.includes(switchId))
                .slice(sendsBefore);
            assert.equal(
                matrix.creates.filter((x) => JSON.stringify(x.body.invite).includes(mxid)).length -
                    roomsBefore,
                0,
                `${variant.name}: no second room`
            );
            assert.equal(
                matrix.invites.filter((x) => x.userId === mxid).length - invitesBefore,
                0,
                `${variant.name}: nobody invited again`
            );
            const after = (
                await pg.query(
                    'SELECT status, attempts, room_id FROM deadman_release_notices WHERE switch_id = $1 AND recipient_account_id = $2',
                    [switchId, recipient.id]
                )
            ).rows[0] as { status: string; attempts: number; room_id: string };
            const mirrored = worker.getDeadmanReleaseNotice(switchId, recipient.id)!;
            if (variant.oldSendRefused) {
                // Pending there: the new leader tries it, once, in the old
                // leader's room, and counts from the old leader's attempt.
                assert.deepEqual(
                    newSends.map((x) => x.roomId),
                    [oldRoom],
                    `${variant.name}: one send, in the room Postgres had`
                );
                const status = variant.newSendRefused ? 'pending' : 'sent';
                // (The tick's totals also count rows earlier cases left due.)
                assert.ok((variant.newSendRefused ? tick.retried : tick.sent) >= 1, variant.name);
                assert.deepEqual(after, { status, attempts: 2, room_id: oldRoom }, variant.name);
                assert.equal(mirrored.status, status, `${variant.name}: the new leader's mirror`);
                assert.equal(mirrored.attempts, 2, variant.name);
            } else {
                assert.equal(newSends.length, 0, `${variant.name}: not sent again`);
                assert.ok(tick.elsewhere >= 1, `${variant.name}: counted as sent elsewhere`);
                assert.deepEqual(
                    after,
                    stored,
                    `${variant.name}: Postgres keeps the old leader's row`
                );
                assert.equal(mirrored.status, 'sent', `${variant.name}: the new leader's mirror`);
            }
            assert.equal(mirrored.roomId, oldRoom, variant.name);
        } finally {
            matrix.aliasRefusal = null;
            matrix.sendStatus = 200;
        }
    }
});

test('a copy this process’s mirror holds and Postgres does not (its write was dropped) ends the notice as copy_unavailable, unsent, not as recipient_gone', async () => {
    // A write that fails twice is dropped (`db_write_behind_failed`) while
    // the mirror keeps the row. Round 6's read of the copy from Postgres then
    // found none and ended the notice `recipient_gone` for a person who still
    // exists (round 7 of part 2's review). The dropped write is stood in for
    // by deleting the committed row.
    const recipient = await person();
    const mxid = `@pn-${recipient.id.slice(0, 8)}:test.local`;
    // An earlier notice made the person's room, so the attempt has a known
    // room whose state it could read (round 9: nothing is asked of the
    // homeserver once the first read has found the copy missing).
    const earlier = await release(recipient);
    await runDeadmanReleaseNotifier({ now: earlier.at });
    await worker.drain();
    const knownRoom = worker.getDeadmanReleaseNotice(earlier.switchId, recipient.id)?.roomId;
    assert.ok(knownRoom, 'the person has a room');
    const createsBefore = matrix.creates.filter((x) =>
        JSON.stringify(x.body.invite).includes(mxid)
    ).length;
    const notice = await release(recipient, async () => {
        await worker.drain();
        await pg.query('DELETE FROM deadman_release_wraps WHERE recipient_account_id = $1', [
            recipient.id,
        ]);
    });
    const stateReadsBefore = matrix.stateReads.filter((r) => r === knownRoom).length;
    assert.ok(
        worker.getDeadmanReleaseWrap(notice.switchId, recipient.id)?.sealedKey,
        'the mirror still holds the copy'
    );
    const tick = await runDeadmanReleaseNotifier({ now: notice.at });
    await worker.drain();
    assert.equal(tick.failed, 1);
    assert.deepEqual(await committed(notice.switchId, recipient.id), {
        status: 'failed',
        last_error: 'copy_unavailable',
        room_id: null,
    });
    assert.ok(worker.getUserById(recipient.id), 'the person still exists');
    assert.equal(matrix.sends.filter((x) => x.txnId.includes(notice.switchId)).length, 0);
    assert.equal(
        matrix.creates.filter((x) => JSON.stringify(x.body.invite).includes(mxid)).length,
        createsBefore,
        'no room made'
    );
    assert.equal(
        matrix.stateReads.filter((r) => r === knownRoom).length - stateReadsBefore,
        0,
        'the known room’s state not read'
    );
});

test('the row read from Postgres goes into the mirror only when this process wrote nothing to it during the read: a deletion here during the read stands, and a row sent elsewhere is still not sent', async () => {
    // Round 7: `readDeadmanReleaseCommitted` puts the stored notice row into
    // the mirror so a leader taking over sends nothing the old one sent. A
    // write this process makes to the row while the read is in flight is
    // newer than what the read returns, and is kept. The read's query is
    // hooked so that a write lands at that moment.
    type Variant = { name: string; during: 'deletion' | 'write'; sentElsewhere: boolean };
    const variants: Variant[] = [
        {
            name: 'the account deleted on this process during the read',
            during: 'deletion',
            sentElsewhere: false,
        },
        {
            name: 'sent by another process, this one writing the row during each read',
            during: 'write',
            sentElsewhere: true,
        },
    ];
    const realConnect = pool.connect;
    for (const variant of variants) {
        const recipient = await person();
        const notice = await release(recipient);
        await worker.drain();
        if (variant.sentElsewhere) {
            const other = new store.PostgresBackedDb();
            await other.init(pool as never);
            other.updateDeadmanReleaseNotice(notice.switchId, recipient.id, {
                status: 'sent',
                attempts: 1,
                sentAt: new Date().toISOString(),
                roomId: '!elsewhere:test.local',
            });
            await other.drain();
        }
        const sendsBefore = matrix.sends.filter((x) => x.txnId.includes(notice.switchId)).length;
        const mxid = `@pn-${recipient.id.slice(0, 8)}:test.local`;
        const roomsBefore = matrix.creates.filter((x) =>
            JSON.stringify(x.body.invite).includes(mxid)
        ).length;
        let hooked = 0;
        let deleted = false;
        const during = () => {
            hooked += 1;
            if (variant.during === 'deletion') {
                // At the read right before the send (the room is made by
                // then), the last one: nothing after it would correct the
                // mirror if the read undid the deletion there.
                const made =
                    matrix.creates.filter((x) => JSON.stringify(x.body.invite).includes(mxid))
                        .length > roomsBefore;
                if (made && !deleted) {
                    deleted = true;
                    eraseReleaseCopiesAndNoticesOf(worker, recipient.id);
                }
            } else {
                worker.updateDeadmanReleaseNoticeIf(
                    notice.switchId,
                    recipient.id,
                    { status: 'pending' },
                    { lastError: 'written during the read' }
                );
            }
        };
        pool.connect = async () => {
            const client = await realConnect();
            return {
                ...client,
                async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                    const result = await client.query<T>(sql, params);
                    if (
                        sql.startsWith('SELECT * FROM deadman_release_notices WHERE switch_id') &&
                        params?.[1] === recipient.id
                    ) {
                        during();
                    }
                    return result;
                },
            };
        };
        try {
            await runDeadmanReleaseNotifier({ now: notice.at });
        } finally {
            pool.connect = realConnect;
        }
        await worker.drain();
        assert.ok(hooked > 0, `${variant.name}: the read was hooked`);
        if (variant.during === 'deletion')
            assert.ok(deleted, `${variant.name}: deleted during the read`);
        assert.equal(
            matrix.sends.filter((x) => x.txnId.includes(notice.switchId)).length - sendsBefore,
            0,
            `${variant.name}: not sent`
        );
        const mirrored = worker.getDeadmanReleaseNotice(notice.switchId, recipient.id)!;
        const stored = await committed(notice.switchId, recipient.id);
        if (variant.during === 'deletion') {
            assert.equal(
                mirrored.status,
                'failed',
                `${variant.name}: the mirror keeps the deletion`
            );
            assert.equal(mirrored.lastError, 'recipient_gone', variant.name);
            assert.deepEqual(stored, {
                status: 'failed',
                last_error: 'recipient_gone',
                room_id: null,
            });
        } else {
            assert.equal(stored.status, 'sent', `${variant.name}: Postgres keeps the other's send`);
            assert.equal(stored.room_id, '!elsewhere:test.local', variant.name);
            assert.equal(
                mirrored.status,
                'pending',
                `${variant.name}: the mirror kept its own write`
            );
        }
    }
});

/** Arm a release naming the recipient on the worker, unfired; its id. */
const armed = async (recipient: { keySet: ReleaseKeySet }): Promise<string> => {
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
    return envelope.releaseId;
};

const roomsMadeFor = (mxid: string): number =>
    matrix.creates.filter((x) => JSON.stringify(x.body.invite).includes(mxid)).length;

const tellWorker = async (m: string, kv: string[]) => {
    (worker as unknown as { applyPeerChange(payload: PeerChange): void }).applyPeerChange({
        src: 'old',
        m,
        op: 'u',
        kv,
    });
    await settle();
};

test('a leader taking over leaves a notice whose retry the old leader set for later until that time: an alias room still being made, which the old leader looked at moments before, is looked at again only a backoff after that look, and the person gets that one room', async () => {
    // Round 8 of part 2's review. The new leader's catch-up writes the row it
    // lacks as due now; round 7's read put the stored row into its mirror
    // (attempts 1, `matrix_alias_room_not_ready`) but did not compare the
    // stored retry time with now, so the attempt went ahead seconds after the
    // old leader's first look, took the room still being made for an
    // abandoned one, made the person a room without the alias and sent there;
    // the slow create then finished as a second room.
    const notifier = await import('../src/services/deadmanReleaseNotifier');
    const recipient = await person();
    const mxid = `@pn-${recipient.id.slice(0, 8)}:test.local`;
    const switchId = await armed(recipient);
    await worker.drain();
    const alias = notifier.noticeRoomAlias(mxid);
    const slow = `!slow-${recipient.id.slice(0, 8)}:test.local`;
    // A create still in progress: the alias names a room with the bot's
    // `m.room.create` alone.
    matrix.rooms.set(slow, [
        {
            type: 'm.room.create',
            state_key: '',
            sender: matrix.botUserId,
            content: { room_version: '10' },
        },
    ]);
    matrix.aliases.set(alias, slow);
    try {
        const old = new store.PostgresBackedDb();
        await old.init(pool as never);
        const at = new Date((clock += 300_000));
        const retryAt = new Date(at.getTime() + notifier.noticeBackoffMs(1));
        old.updateDeadmanSwitch(switchId, { status: 'triggered', releasedAt: at.toISOString() });
        old.createDeadmanReleaseNotice({
            switchId,
            recipientAccountId: recipient.id,
            nextAttemptAt: at.toISOString(),
        });
        // The old leader's first look, recorded as its notifier records it.
        old.updateDeadmanReleaseNoticeIf(
            switchId,
            recipient.id,
            { status: 'pending' },
            {
                attempts: 1,
                lastError: notifier.ALIAS_ROOM_NOT_READY,
                nextAttemptAt: retryAt.toISOString(),
            }
        );
        await old.drain();
        await tellWorker('deadmanSwitches', [switchId]);
        assert.equal(
            worker.getDeadmanReleaseNotice(switchId, recipient.id),
            undefined,
            'the new leader has not heard of the row'
        );
        const roomsBefore = roomsMadeFor(mxid);
        const stateReadsBefore = matrix.stateReads.filter((r) => r === slow).length;

        const early = await runDeadmanReleaseNotifier({ now: new Date(at.getTime() + 1_000) });
        await worker.drain();
        assert.ok(early.elsewhere >= 1, 'counted elsewhere, not sent, retried or failed');
        assert.equal(roomsMadeFor(mxid) - roomsBefore, 0, 'no room made before the retry time');
        assert.equal(
            matrix.stateReads.filter((r) => r === slow).length - stateReadsBefore,
            0,
            'the alias room not looked at again before the retry time'
        );
        assert.equal(matrix.sends.filter((x) => x.txnId.includes(switchId)).length, 0);
        const stored = (
            await pg.query(
                'SELECT status, attempts, last_error FROM deadman_release_notices WHERE switch_id = $1 AND recipient_account_id = $2',
                [switchId, recipient.id]
            )
        ).rows[0];
        assert.deepEqual(
            stored,
            { status: 'pending', attempts: 1, last_error: notifier.ALIAS_ROOM_NOT_READY },
            'Postgres as the old leader left it'
        );
        assert.equal(
            worker.getDeadmanReleaseNotice(switchId, recipient.id)?.nextAttemptAt,
            retryAt.toISOString(),
            'the mirror has the old leader’s retry time'
        );

        // The homeserver finishes the create meanwhile.
        matrix.rooms.set(
            slow,
            createdRoomState(
                matrix.botUserId,
                {
                    name: 'Blackout notices',
                    preset: 'public_chat',
                    initial_state: [notifier.NOTICE_ROOM_JOIN_RULE],
                    invite: [mxid],
                    power_level_content_override: { ...notifier.NOTICE_ROOM_POWER_LEVELS },
                },
                alias
            )
        );
        await runDeadmanReleaseNotifier({ now: retryAt });
        await worker.drain();
        assert.equal(roomsMadeFor(mxid) - roomsBefore, 0, 'no room made: the one room');
        assert.deepEqual(
            matrix.sends.filter((x) => x.txnId.includes(switchId)).map((x) => x.roomId),
            [slow],
            'sent once, into the room the create made'
        );
        assert.deepEqual(await committed(switchId, recipient.id), {
            status: 'sent',
            last_error: null,
            room_id: slow,
        });
    } finally {
        matrix.purgeRoom(slow);
    }
});

test('a leader taking over uses the room the old leader recorded on another of the person’s notices: with the alias refused, a notice its own sweep fires, or one whose mirror names a room the old leader replaced, makes no second room', async () => {
    // Round 8 of part 2's review: round 7's read put only the notice's own
    // row into the mirror, and `findDeadmanNoticeRoom` read the person's
    // other rows from the mirror alone, so a new leader that had not heard
    // of the room the old leader recorded on the person's other notice made
    // them a second one when the homeserver refused the alias.
    const notifier = await import('../src/services/deadmanReleaseNotifier');
    const { matrixClient } = await import('../src/integrations/matrix-client');
    const makeOldRoom = async (mxid: string) => {
        const made = await matrixClient.createRoom({
            name: 'Blackout notices',
            visibility: 'private',
            preset: 'public_chat',
            encrypted: false,
            initialState: [notifier.NOTICE_ROOM_JOIN_RULE],
            invite: [mxid],
            isDirect: true,
            powerLevelOverride: { ...notifier.NOTICE_ROOM_POWER_LEVELS },
        });
        assert.ok(made.ok);
        return made.roomId;
    };
    for (const variant of [
        'its own sweep fires a newer release',
        'its mirror names a room the old leader replaced',
    ] as const) {
        const recipient = await person();
        const mxid = `@pn-${recipient.id.slice(0, 8)}:test.local`;
        let staleRoom: string | undefined;
        if (variant === 'its mirror names a room the old leader replaced') {
            // An earlier notice, sent by the worker itself into a room the
            // homeserver has since purged.
            const earlier = await release(recipient);
            await runDeadmanReleaseNotifier({ now: earlier.at });
            await worker.drain();
            staleRoom = worker.getDeadmanReleaseNotice(earlier.switchId, recipient.id)?.roomId;
            assert.ok(staleRoom, variant);
            matrix.purgeRoom(staleRoom);
        }
        const s1 = await armed(recipient);
        const s2 = await armed(recipient);
        await worker.drain();
        matrix.aliasRefusal = { status: 403, errcode: 'M_FORBIDDEN' };
        try {
            const old = new store.PostgresBackedDb();
            await old.init(pool as never);
            const at = new Date((clock += 300_000));
            old.updateDeadmanSwitch(s1, { status: 'triggered', releasedAt: at.toISOString() });
            old.createDeadmanReleaseNotice({
                switchId: s1,
                recipientAccountId: recipient.id,
                nextAttemptAt: at.toISOString(),
            });
            const oldRoom = await makeOldRoom(mxid);
            const sentByOld = await matrixClient.sendEvent(oldRoom, notifier.noticeContent(s1), {
                txnId: notifier.noticeTxnId(s1, recipient.id),
            });
            assert.ok(sentByOld.ok);
            old.updateDeadmanReleaseNoticeIf(
                s1,
                recipient.id,
                { status: 'pending' },
                { status: 'sent', attempts: 1, sentAt: new Date().toISOString(), roomId: oldRoom }
            );
            if (staleRoom) {
                // As the old leader's notifier moves every row off a room
                // the homeserver no longer has.
                for (const row of old.listDeadmanReleaseNoticesForRecipient(recipient.id)) {
                    if (row.roomId === staleRoom) {
                        old.updateDeadmanReleaseNoticeIf(
                            row.switchId,
                            recipient.id,
                            { roomId: staleRoom },
                            { roomId: oldRoom }
                        );
                    }
                }
            }
            await old.drain();
            // The old leader is done. The new leader hears of the trigger,
            // not of the notice rows, and its own sweep fires the second.
            await tellWorker('deadmanSwitches', [s1]);
            assert.equal(worker.getDeadmanReleaseNotice(s1, recipient.id), undefined, variant);
            if (staleRoom) {
                assert.equal(worker.findDeadmanNoticeRoom(recipient.id), staleRoom, variant);
            }
            const later = new Date(at.getTime() + 5_000);
            await sweepOverdueDeadmanSwitches(later, Number.MAX_SAFE_INTEGER);
            assert.equal(worker.getDeadmanSwitch(s2)?.status, 'triggered', variant);
            const roomsBefore = roomsMadeFor(mxid);
            const s1SendsBefore = matrix.sends.filter((x) => x.txnId.includes(s1)).length;
            await runDeadmanReleaseNotifier({ now: later });
            await worker.drain();
            assert.equal(roomsMadeFor(mxid) - roomsBefore, 0, `${variant}: no second room`);
            assert.deepEqual(
                matrix.sends.filter((x) => x.txnId.includes(s2)).map((x) => x.roomId),
                [oldRoom],
                `${variant}: the new release’s notice in the room the old leader recorded`
            );
            assert.equal(
                matrix.sends.filter((x) => x.txnId.includes(s1)).length - s1SendsBefore,
                0,
                `${variant}: the old leader’s notice not sent again`
            );
            assert.equal((await committed(s2, recipient.id)).room_id, oldRoom, variant);
            assert.equal((await committed(s1, recipient.id)).status, 'sent', variant);
        } finally {
            matrix.aliasRefusal = null;
        }
    }
});

test('a room or a re-invite recorded on a pending row whose write was dropped is kept when the row is read from Postgres: the person is not invited twice for one notice, no second room is made with the alias refused, and the next write carries them into Postgres; a row ended elsewhere does not get them back', async () => {
    // Round 8 of part 2's review: the refresh put the stored row into the
    // mirror whenever this process wrote nothing to it during the read,
    // reasoning that the stored row was at least as new; a write that failed
    // twice is dropped, so it can be older. The dropped write is stood in for
    // by clearing the column in Postgres after the write was made.
    for (const variant of ['the re-invite', 'the room, alias refused'] as const) {
        const recipient = await person();
        const mxid = `@pn-${recipient.id.slice(0, 8)}:test.local`;
        if (variant === 'the re-invite') {
            const first = await release(recipient);
            await runDeadmanReleaseNotifier({ now: first.at });
            await worker.drain();
        } else {
            matrix.aliasRefusal = { status: 403, errcode: 'M_FORBIDDEN' };
        }
        const leave = () => {
            const room = worker.findDeadmanNoticeRoom(recipient.id)!;
            const state = matrix.rooms.get(room) as Array<Record<string, unknown>>;
            matrix.rooms.set(
                room,
                state.map((e) =>
                    e.type === 'm.room.member' && e.state_key === mxid
                        ? { ...e, content: { membership: 'leave' } }
                        : e
                )
            );
        };
        try {
            if (variant === 'the re-invite') leave();
            const notice = await release(recipient);
            matrix.sendStatus = 500;
            await runDeadmanReleaseNotifier({ now: notice.at });
            matrix.sendStatus = 200;
            await worker.drain();
            const row = worker.getDeadmanReleaseNotice(notice.switchId, recipient.id)!;
            assert.equal(row.status, 'pending', variant);
            const column = variant === 'the re-invite' ? 'reinvited_at' : 'room_id';
            if (variant === 'the re-invite') assert.ok(row.reinvitedAt, variant);
            const room = row.roomId!;
            assert.ok(room, variant);
            await pg.query(
                `UPDATE deadman_release_notices SET ${column} = NULL WHERE switch_id = $1 AND recipient_account_id = $2`,
                [notice.switchId, recipient.id]
            );
            // The person declined the invitation the bot sent.
            if (variant === 'the re-invite') leave();
            const invitesBefore = matrix.invites.filter((x) => x.userId === mxid).length;
            const roomsBefore = roomsMadeFor(mxid);
            await runDeadmanReleaseNotifier({ now: new Date(row.nextAttemptAt) });
            await worker.drain();
            assert.equal(
                matrix.invites.filter((x) => x.userId === mxid).length - invitesBefore,
                0,
                `${variant}: not invited a second time for this notice`
            );
            assert.equal(roomsMadeFor(mxid) - roomsBefore, 0, `${variant}: no second room`);
            assert.deepEqual(
                matrix.sends
                    .filter((x) => x.txnId.includes(notice.switchId) && x.roomId === room)
                    .map((x) => x.roomId).length,
                2,
                `${variant}: the refused send and this one, both in the room`
            );
            const after = (
                await pg.query(
                    'SELECT status, room_id, reinvited_at FROM deadman_release_notices WHERE switch_id = $1 AND recipient_account_id = $2',
                    [notice.switchId, recipient.id]
                )
            ).rows[0] as { status: string; room_id: string | null; reinvited_at: unknown };
            assert.equal(after.status, 'sent', variant);
            assert.equal(after.room_id, room, `${variant}: the room reached Postgres`);
            if (variant === 'the re-invite') {
                assert.ok(after.reinvited_at, `${variant}: the re-invite reached Postgres`);
            }
        } finally {
            matrix.aliasRefusal = null;
            matrix.sendStatus = 200;
        }
    }

    // Only on a row still pending there: one another process ended (an
    // account deletion on a second store, which forgets the room) does not
    // get the mirror's room back.
    const gone = await person();
    const ended = await release(gone);
    matrix.sendStatus = 500;
    try {
        await runDeadmanReleaseNotifier({ now: ended.at });
    } finally {
        matrix.sendStatus = 200;
    }
    await worker.drain();
    const before = worker.getDeadmanReleaseNotice(ended.switchId, gone.id)!;
    assert.equal(before.status, 'pending');
    assert.ok(before.roomId, 'the worker recorded a room');
    const other = new store.PostgresBackedDb();
    await other.init(pool as never);
    eraseReleaseCopiesAndNoticesOf(other, gone.id);
    await finishAccountDeletion(gone.id, other);
    await runDeadmanReleaseNotifier({ now: new Date(before.nextAttemptAt) });
    await worker.drain();
    const mirrored = worker.getDeadmanReleaseNotice(ended.switchId, gone.id)!;
    assert.equal(mirrored.status, 'failed', 'ended elsewhere: the mirror takes the stored row');
    assert.equal(mirrored.roomId, undefined, 'ended elsewhere: the mirror does not keep its room');
});

test('finishAccountDeletion, which the deletion route awaits before it answers, returns only once the deletion’s own writes have been attempted in Postgres, however long that takes, and waits for its last statement at most the bound: after it returns the worker makes no room, invites nobody, reads no room’s state and sends nothing for the person', async () => {
    // Round 8 of part 2's review: round 7's bound covered the drain of the
    // deletion's own writes too, so past it the route answered while
    // Postgres still held the copy and the pending row, and the worker then
    // made the person a room, invited them and sent the notice. The app's
    // connections stall on a gate: every one (the drain stalls), or the last
    // statement's alone.
    type Variant = { name: string; stall: 'drain' | 'end'; seen: boolean };
    const variants: Variant[] = [
        { name: 'the drain stalls, a row the app had seen', stall: 'drain', seen: true },
        { name: 'the last statement stalls, a row the app had seen', stall: 'end', seen: true },
        {
            name: 'the last statement stalls, a row the app had not seen',
            stall: 'end',
            seen: false,
        },
    ];
    const realConnect = pool.connect;
    for (const variant of variants) {
        const recipient = await person();
        const mxid = `@pn-${recipient.id.slice(0, 8)}:test.local`;
        // An earlier notice made the person's room, so the worker has a known
        // room whose state it could read (round 9 of part 2's review: the
        // first read's judgement stops the attempt before that, for a row
        // Postgres still has pending whose copy is blank there).
        const earlier = await release(recipient);
        await runDeadmanReleaseNotifier({ now: earlier.at });
        await worker.drain();
        const knownRoom = worker.getDeadmanReleaseNotice(earlier.switchId, recipient.id)?.roomId;
        assert.ok(knownRoom, `${variant.name}: the person has a room`);
        let open!: () => void;
        let gate: Promise<void> | null = null;
        const appPool = {
            connect: async () => {
                const client = await realConnect();
                if (variant.stall === 'drain' && gate) await gate;
                return {
                    ...client,
                    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                        if (
                            variant.stall === 'end' &&
                            gate &&
                            sql.startsWith('UPDATE deadman_release_notices SET room_id = NULL')
                        ) {
                            await gate;
                        }
                        return client.query<T>(sql, params);
                    },
                };
            },
            end: async () => {},
        };
        const app = new store.PostgresBackedDb();
        let notice: { switchId: string; at: Date };
        if (variant.seen) {
            notice = await release(recipient);
            await worker.drain();
            await app.init(appPool as never);
            assert.equal(
                app.getDeadmanReleaseNotice(notice.switchId, recipient.id)?.status,
                'pending'
            );
        } else {
            notice = await release(recipient, async () => {
                await worker.drain();
                await app.init(appPool as never);
            });
            await worker.drain();
            assert.equal(app.getDeadmanReleaseNotice(notice.switchId, recipient.id), undefined);
            assert.ok(app.getDeadmanReleaseWrap(notice.switchId, recipient.id)?.sealedKey);
        }
        const held = async () =>
            (
                (
                    await pg.query(
                        "SELECT sealed_key <> '' AS held FROM deadman_release_wraps WHERE switch_id = $1 AND recipient_account_id = $2",
                        [notice.switchId, recipient.id]
                    )
                ).rows[0] as { held: boolean }
            ).held;
        gate = new Promise<void>((resolve) => {
            open = resolve;
        });
        try {
            eraseReleaseCopiesAndNoticesOf(app, recipient.id);
            const answer = finishAccountDeletion(recipient.id, app, 100).then(() => 'answered');
            const early = await Promise.race([
                answer,
                new Promise<string>((resolve) => setTimeout(() => resolve('waiting'), 600)),
            ]);
            if (variant.stall === 'drain') {
                assert.equal(early, 'waiting', `${variant.name}: not answered before the writes`);
                assert.equal(await held(), true, `${variant.name}: the copy still held there`);
                open();
                assert.equal(await answer, 'answered', variant.name);
            } else {
                assert.equal(early, 'answered', `${variant.name}: answered at the bound`);
            }
            // At the answer: the copy blanked in Postgres, and a row the app
            // had seen ended there.
            assert.equal(await held(), false, `${variant.name}: the copy blanked by the answer`);
            assert.equal(
                (await committed(notice.switchId, recipient.id)).status,
                variant.seen ? 'failed' : 'pending',
                variant.name
            );
            const roomsBefore = roomsMadeFor(mxid);
            const invitesBefore = matrix.invites.filter((x) => x.userId === mxid).length;
            const stateReadsBefore = matrix.stateReads.filter((r) => r === knownRoom).length;
            await runDeadmanReleaseNotifier({ now: notice.at });
            await worker.drain();
            assert.equal(roomsMadeFor(mxid) - roomsBefore, 0, `${variant.name}: no room made`);
            assert.equal(
                matrix.stateReads.filter((r) => r === knownRoom).length - stateReadsBefore,
                0,
                `${variant.name}: the person's room's state not read`
            );
            assert.equal(
                matrix.invites.filter((x) => x.userId === mxid).length - invitesBefore,
                0,
                `${variant.name}: nobody invited`
            );
            assert.equal(
                matrix.sends.filter((x) => x.txnId.includes(notice.switchId)).length,
                0,
                `${variant.name}: not sent`
            );
        } finally {
            open();
        }
        await settle();
        await app.drain();
        assert.deepEqual(await committed(notice.switchId, recipient.id), {
            status: 'failed',
            last_error: 'recipient_gone',
            room_id: null,
        });
    }
});

test('a standby whose mirror has not heard of a trigger, a check-in or a cancel does not move the switch: the sweep’s write is conditional in Postgres, the first releasedAt stands, and the standby writes no notice row and sends nothing twice', async () => {
    // Round 9 of part 2's review (the operator's decision of 2026-10-31). The
    // sweep's write of a switch was a full-row upsert, so a standby whose
    // mirror still had the switch armed fired it again, Postgres took its
    // later releasedAt (moving the notice retry window and the removal date),
    // and its sweep wrote notice rows for it in its mirror. A check-in or a
    // cancel another process committed was written over the same way. A
    // second store stands in for the old leader or the API process.
    //
    // Round 10: the mirror takes nothing of the move until Postgres has
    // answered, and only what this process's own writes changed during the
    // statement is kept over Postgres's row; a label written here plainly is
    // kept over a trigger.
    //
    // Round 12 (decision 30, built): the owner's deletion no longer writes
    // the switch from this mirror. Its erase is one statement in the
    // switch's lane, decided on the row Postgres holds, so one started
    // during the sweep's statement runs after it: where the old leader had
    // fired the switch, or this process's own move fires it first, the
    // deletion finds it fired and erases it as fired (the label goes; the
    // status, the content and the first `releasedAt` stay), the release
    // stands for the person named and its notice goes. Until round 12 the
    // deletion's cancel was kept over the trigger in both cases and the
    // notice did not go.
    type Elsewhere =
        | 'fired'
        | 'firedAndSent'
        | 'firedErasedHere'
        | 'firedLabelledHere'
        | 'erasedHereOnly'
        | 'checkedIn'
        | 'cancelled'
        | 'labelled';
    const variants: Array<{ name: string; elsewhere: Elsewhere }> = [
        { name: 'fired and sent by the old leader', elsewhere: 'firedAndSent' },
        { name: 'fired by the old leader, which stopped before sending', elsewhere: 'fired' },
        {
            name: 'fired by the old leader while this process erased the switch (the owner’s deletion) during the statement: the deletion runs after the move in the switch’s lane, finds it fired and erases it as fired; the release stands and its notice goes (round 12, decision 30)',
            elsewhere: 'firedErasedHere',
        },
        {
            name: 'fired by the old leader while this process changed the label during the statement: the trigger and that label are kept',
            elsewhere: 'firedLabelledHere',
        },
        {
            name: 'fired nowhere else, and this process erased it (the owner’s deletion) while its own move ran: the move lands first, the deletion then finds it fired and erases it as fired; the notice row the move wrote is sent (round 12, decision 30)',
            elsewhere: 'erasedHereOnly',
        },
        { name: 'checked in on the API process', elsewhere: 'checkedIn' },
        { name: 'cancelled on the API process', elsewhere: 'cancelled' },
        {
            name: 'its label changed on the API process: fired, the label kept',
            elsewhere: 'labelled',
        },
    ];
    const realConnect = pool.connect;
    for (const variant of variants) {
        const firedElsewhere =
            variant.elsewhere === 'fired' ||
            variant.elsewhere === 'firedAndSent' ||
            variant.elsewhere === 'firedErasedHere' ||
            variant.elsewhere === 'firedLabelledHere';
        const writesHere =
            variant.elsewhere === 'firedErasedHere' ||
            variant.elsewhere === 'firedLabelledHere' ||
            variant.elsewhere === 'erasedHereOnly';
        const recipient = await person();
        const owner = await person();
        const envelope = await protocol.buildReleaseEnvelope({
            ownerKeySet: owner.keySet,
            recipients: [recipient.keySet.identity],
            message: 'Synthetic test text.',
        });
        const armed = await armReleaseSwitch({
            ownerId: owner.id,
            input: {
                checkInIntervalSeconds: 60,
                gracePeriodSeconds: 0,
                label: 'owner label',
                envelope,
            },
        });
        assert.equal(armed.kind, 'armed', variant.name);
        const switchId = envelope.releaseId;
        await worker.drain();
        const read = worker.getDeadmanSwitch(switchId)!;
        const other = new store.PostgresBackedDb();
        await other.init(pool as never);
        const firstAt = new Date((clock += 300_000));
        const first = firstAt.toISOString();
        if (firedElsewhere) {
            const fired = await other.advanceDeadmanSwitch(switchId, read, {
                status: 'triggered',
                releasedAt: first,
            });
            assert.equal(fired?.releasedAt, first, variant.name);
            other.createDeadmanReleaseNotice({
                switchId,
                recipientAccountId: recipient.id,
                nextAttemptAt: first,
            });
            if (variant.elsewhere === 'firedAndSent') {
                other.updateDeadmanReleaseNoticeIf(
                    switchId,
                    recipient.id,
                    { status: 'pending' },
                    { status: 'sent', attempts: 1, sentAt: first, roomId: '!old:test.local' }
                );
            }
        } else if (variant.elsewhere === 'checkedIn') {
            other.updateDeadmanSwitch(switchId, {
                status: 'armed',
                lastCheckInAt: first,
                ...computeDeadlines({
                    lastCheckInAt: first,
                    checkInIntervalSeconds: 60,
                    gracePeriodSeconds: 0,
                }),
            });
        } else if (variant.elsewhere === 'cancelled') {
            other.updateDeadmanSwitch(switchId, { status: 'cancelled', encryptedPayload: '' });
        } else if (variant.elsewhere === 'labelled') {
            other.updateDeadmanSwitch(switchId, { headline: 'changed elsewhere' });
        }
        await other.drain();
        assert.equal(worker.getDeadmanSwitch(switchId)?.status, 'armed', 'not heard of');

        // The standby's sweep, a few seconds later: the switch is overdue in
        // its mirror. In three variants this process writes the switch while
        // the sweep's statement runs.
        let erased = false;
        let statusDuring: string | undefined;
        let deletion: Promise<unknown> | undefined;
        if (writesHere) {
            pool.connect = async () => {
                const client = await realConnect();
                return {
                    ...client,
                    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                        if (!erased && sql.startsWith('UPDATE deadman_switches')) {
                            erased = true;
                            statusDuring = worker.getDeadmanSwitch(switchId)?.status;
                            if (variant.elsewhere === 'firedLabelledHere') {
                                worker.updateDeadmanSwitch(switchId, { headline: 'changed here' });
                            } else {
                                // The deletion's erase: a statement queued in
                                // the switch's lane, so it runs after this one.
                                deletion = worker.eraseDeadmanSwitchUnlessFired(switchId);
                            }
                        }
                        return client.query<T>(sql, params);
                    },
                };
            };
        }
        const later = new Date(firstAt.getTime() + 5_000);
        try {
            await sweepOverdueDeadmanSwitches(later, Number.MAX_SAFE_INTEGER);
            if (deletion) {
                assert.deepEqual(
                    ((await deletion) as { kind: string }).kind,
                    'applied',
                    `${variant.name}: the deletion's statement applied`
                );
            }
            await worker.drain();
        } finally {
            pool.connect = realConnect;
        }
        if (writesHere) {
            assert.ok(erased, variant.name);
            assert.equal(
                statusDuring,
                'armed',
                `${variant.name}: nothing of the move in the mirror yet`
            );
        }
        const stored = (
            await pg.query(
                'SELECT status, released_at, last_check_in_at, headline, encrypted_payload FROM deadman_switches WHERE id = $1',
                [switchId]
            )
        ).rows[0] as {
            status: string;
            released_at: Date | null;
            last_check_in_at: Date;
            headline: string | null;
            encrypted_payload: string;
        };
        const mirrored = worker.getDeadmanSwitch(switchId)!;
        if (variant.elsewhere === 'firedErasedHere' || variant.elsewhere === 'erasedHereOnly') {
            // Erased as fired: the deletion's statement found the switch
            // triggered in Postgres (by the old leader, or by this process's
            // own move, which landed first) and took back nothing of the
            // release; only the label went.
            assert.equal(stored.status, 'triggered', `${variant.name}: erased as fired`);
            assert.equal(
                stored.released_at?.toISOString(),
                variant.elsewhere === 'firedErasedHere' ? first : later.toISOString(),
                `${variant.name}: the first releasedAt stands`
            );
            assert.equal(stored.headline, null, `${variant.name}: the label gone`);
            assert.notEqual(stored.encrypted_payload, '', `${variant.name}: the content kept`);
            assert.equal(mirrored.status, 'triggered', `${variant.name}: the mirror as Postgres`);
            assert.equal(mirrored.releasedAt, stored.released_at?.toISOString(), variant.name);
            assert.equal(mirrored.headline, undefined, variant.name);
            assert.equal(mirrored.encryptedPayload, stored.encrypted_payload, variant.name);
            assert.equal(
                worker.getDeadmanReleaseWrap(switchId, recipient.id)?.sealedKey === '',
                false,
                `${variant.name}: the person's copy is held`
            );
        } else if (firedElsewhere) {
            assert.equal(stored.status, 'triggered', variant.name);
            assert.equal(
                stored.released_at?.toISOString(),
                first,
                `${variant.name}: the first releasedAt stands`
            );
            assert.equal(mirrored.status, 'triggered', variant.name);
            assert.equal(mirrored.releasedAt, first, `${variant.name}: the mirror took it`);
            if (variant.elsewhere === 'firedLabelledHere') {
                assert.equal(stored.headline, 'changed here', `${variant.name}: this label kept`);
                assert.equal(mirrored.headline, 'changed here', variant.name);
            } else {
                assert.equal(stored.headline, 'owner label', variant.name);
            }
        } else if (variant.elsewhere === 'checkedIn') {
            assert.equal(stored.status, 'armed', `${variant.name}: not fired`);
            assert.equal(stored.released_at, null, variant.name);
            assert.equal(stored.last_check_in_at.toISOString(), first, variant.name);
            assert.equal(mirrored.status, 'armed', variant.name);
            assert.equal(
                mirrored.lastCheckInAt,
                first,
                `${variant.name}: the mirror took the check-in`
            );
        } else if (variant.elsewhere === 'cancelled') {
            assert.equal(stored.status, 'cancelled', `${variant.name}: not fired`);
            assert.equal(stored.released_at, null, variant.name);
            assert.equal(mirrored.status, 'cancelled', variant.name);
        } else {
            assert.equal(stored.status, 'triggered', `${variant.name}: fired`);
            assert.equal(stored.released_at?.toISOString(), later.toISOString(), variant.name);
            assert.equal(
                stored.headline,
                'changed elsewhere',
                `${variant.name}: only the moved columns written`
            );
        }
        if (variant.elsewhere === 'erasedHereOnly') {
            assert.ok(
                worker.getDeadmanReleaseNotice(switchId, recipient.id),
                `${variant.name}: this process's move wrote the notice row`
            );
        } else if (variant.elsewhere !== 'labelled') {
            assert.equal(
                worker.getDeadmanReleaseNotice(switchId, recipient.id),
                undefined,
                `${variant.name}: the standby's sweep wrote no notice row`
            );
        }

        const sendsBefore = matrix.sends.filter((x) => x.txnId.includes(switchId)).length;
        await runDeadmanReleaseNotifier({ now: later });
        await worker.drain();
        const sends = matrix.sends.filter((x) => x.txnId.includes(switchId)).length - sendsBefore;
        const rows = (
            await pg.query('SELECT status FROM deadman_release_notices WHERE switch_id = $1', [
                switchId,
            ])
        ).rows as Array<{ status: string }>;
        if (variant.elsewhere === 'firedAndSent') {
            assert.equal(sends, 0, `${variant.name}: not sent again`);
            assert.deepEqual(rows, [{ status: 'sent' }], variant.name);
        } else if (
            firedElsewhere ||
            variant.elsewhere === 'labelled' ||
            variant.elsewhere === 'erasedHereOnly'
        ) {
            // Fired, and not yet sent: the notice is sent once (the two
            // deletion variants included since round 12: the release stands).
            assert.equal(sends, 1, variant.name);
            assert.deepEqual(rows, [{ status: 'sent' }], variant.name);
        } else {
            assert.equal(sends, 0, variant.name);
            assert.deepEqual(rows, [], `${variant.name}: no notice row`);
        }
        await other.drain();
    }
});

test('a retry another process records after this attempt’s first read stops the attempt at its next read of Postgres: no re-invite, no create without the alias and no send before that time', async () => {
    // Round 9 of part 2's review: `judgeCommitted` answers the not-due step at
    // every read, but only its removal from every read at once was caught.
    // The reads after the first are what keep this process from inviting,
    // creating or sending once another process has set a retry between its
    // first read and its call (since the claim, another process works on the
    // same person at once only when a claim outlived its lease). The other
    // process's write is by hand, while this one is parked on a homeserver
    // call.
    const variants = [
        { name: 'parked on the known room’s state; the person has left it', park: 'state' },
        { name: 'parked on the create with the alias, which is refused', park: 'create' },
    ] as const;
    for (const variant of variants) {
        const recipient = await person();
        const mxid = `@pn-${recipient.id.slice(0, 8)}:test.local`;
        let knownRoom: string | undefined;
        if (variant.park === 'state') {
            const earlier = await release(recipient);
            await runDeadmanReleaseNotifier({ now: earlier.at });
            await worker.drain();
            knownRoom = worker.getDeadmanReleaseNotice(earlier.switchId, recipient.id)?.roomId;
            assert.ok(knownRoom, variant.name);
            const state = matrix.rooms.get(knownRoom) as Array<{
                type: string;
                state_key?: string;
            }>;
            matrix.rooms.set(knownRoom, [
                ...(state.filter(
                    (e) => !(e.type === 'm.room.member' && e.state_key === mxid)
                ) as ReturnType<typeof memberEvent>[]),
                memberEvent(mxid, 'leave'),
            ]);
        } else {
            matrix.aliasRefusal = { status: 403, errcode: 'M_FORBIDDEN' };
        }
        const notice = await release(recipient);
        await worker.drain();
        const other = new store.PostgresBackedDb();
        await other.init(pool as never);
        const retryAt = new Date(notice.at.getTime() + 30_000).toISOString();
        let reached!: () => void;
        let open!: () => void;
        const atCall = new Promise<void>((resolve) => {
            reached = resolve;
        });
        const gate = new Promise<void>((resolve) => {
            open = resolve;
        });
        let parked = false;
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = urlOf(input);
            const hit =
                variant.park === 'state'
                    ? url.includes('/_synapse/admin/v1/rooms/') &&
                      decodeURIComponent(url).includes(`${knownRoom}/state`)
                    : /\/createRoom/.test(url) &&
                      String(init?.body ?? '').includes(mxid) &&
                      String(init?.body ?? '').includes('room_alias_name');
            if (!parked && hit) {
                parked = true;
                reached();
                await gate;
            }
            return matrix.fetch(input, init);
        }) as typeof fetch;
        const ours = () => ({
            invites: matrix.invites.filter((x) => x.userId === mxid).length,
            rooms: roomsMadeFor(mxid),
            sends: matrix.sends.filter((x) => x.txnId.includes(notice.switchId)).length,
        });
        const before = ours();
        try {
            const tick = runDeadmanReleaseNotifier({ now: notice.at });
            await atCall;
            other.updateDeadmanReleaseNoticeIf(
                notice.switchId,
                recipient.id,
                { status: 'pending' },
                { attempts: 1, lastError: 'matrix_send_status_500', nextAttemptAt: retryAt }
            );
            await other.drain();
            open();
            const result = await tick;
            await worker.drain();
            assert.ok(result.elsewhere >= 1, `${variant.name}: counted elsewhere`);
        } finally {
            globalThis.fetch = matrix.fetch;
            matrix.aliasRefusal = null;
        }
        assert.deepEqual(ours(), before, `${variant.name}: no invite, no room, no send`);
        const stored = (
            await pg.query(
                'SELECT status, attempts, next_attempt_at FROM deadman_release_notices WHERE switch_id = $1 AND recipient_account_id = $2',
                [notice.switchId, recipient.id]
            )
        ).rows[0] as { status: string; attempts: number; next_attempt_at: Date };
        assert.equal(stored.status, 'pending', variant.name);
        assert.equal(stored.attempts, 1, `${variant.name}: as the other process left it`);
        assert.equal(stored.next_attempt_at.toISOString(), retryAt, variant.name);
        if (variant.park === 'create')
            matrix.aliasRefusal = { status: 403, errcode: 'M_FORBIDDEN' };
        try {
            await runDeadmanReleaseNotifier({ now: new Date(retryAt) });
            await worker.drain();
        } finally {
            matrix.aliasRefusal = null;
        }
        assert.equal(ours().sends - before.sends, 1, `${variant.name}: sent once, at that time`);
        assert.equal((await committed(notice.switchId, recipient.id)).status, 'sent');
        await other.drain();
    }
});

/**
 * A second API process (`_fixtures/notifierProcess.ts`): a worker thread with
 * its own store, mirror and notifier on this database and the stand-in
 * homeserver. Its database statements and homeserver calls come here and are
 * answered from the same PGlite and stub; `hold` parks the first of its
 * statements that `match` accepts until `open` is called.
 */
const startSecondProcess = async () => {
    const { Worker } = await import('node:worker_threads');
    const thread = new Worker(new URL('./_fixtures/notifierProcess.ts', import.meta.url));
    type Hold = {
        match: (sql: string, params: unknown[]) => boolean;
        reached: () => void;
        gate: Promise<void>;
    };
    const holds: Hold[] = [];
    const statements: Array<{ sql: string; params: unknown[] }> = [];
    const done = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
    let seq = 0;
    const answer = (id: number, value: unknown) =>
        thread.postMessage({ type: 'answer', id, value });
    const fail = (id: number, err: unknown) =>
        thread.postMessage({ type: 'answer', id, error: String(err) });
    await new Promise<void>((resolve, reject) => {
        thread.once('error', reject);
        thread.on('message', (message: Record<string, unknown>) => {
            const id = message.id as number;
            if (message.type === 'ready') resolve();
            else if (message.type === 'failed') reject(new Error(String(message.error)));
            else if (message.type === 'done') {
                const waiter = done.get(id);
                done.delete(id);
                if (typeof message.error === 'string') waiter?.reject(new Error(message.error));
                else waiter?.resolve(message.value);
            } else if (message.type === 'query') {
                const sql = message.sql as string;
                const params = message.params as unknown[];
                void (async () => {
                    statements.push({ sql, params });
                    const hold = holds.find((h) => h.match(sql, params));
                    if (hold) {
                        holds.splice(holds.indexOf(hold), 1);
                        hold.reached();
                        await hold.gate;
                    }
                    try {
                        const client = await pool.connect();
                        answer(id, { rows: (await client.query(sql, params)).rows });
                    } catch (err) {
                        fail(id, err);
                    }
                })();
            } else if (message.type === 'fetch') {
                void (async () => {
                    try {
                        const res = await matrix.fetch(message.url as string, {
                            method: message.method as string,
                            headers: message.headers as Record<string, string>,
                            body: (message.body as string | null) ?? undefined,
                        });
                        answer(id, {
                            status: res.status,
                            headers: Object.fromEntries(res.headers.entries()),
                            body: await res.text(),
                        });
                    } catch (err) {
                        fail(id, err);
                    }
                })();
            }
        });
    });
    const command = (type: string, extra: Record<string, unknown> = {}) =>
        new Promise<unknown>((resolve, reject) => {
            seq += 1;
            done.set(seq, { resolve, reject });
            thread.postMessage({ type, id: seq, ...extra });
        });
    return {
        tick: (now: Date) =>
            command('tick', { now: now.toISOString() }) as Promise<{
                sent: number;
                elsewhere: number;
                retried: number;
                failed: number;
            }>,
        rehydrate: () => command('rehydrate'),
        statements,
        hold(match: Hold['match']) {
            let reached!: () => void;
            let open!: () => void;
            const at = new Promise<void>((resolve) => {
                reached = resolve;
            });
            const gate = new Promise<void>((resolve) => {
                open = resolve;
            });
            holds.push({ match, reached, gate });
            return { reached: at, open };
        },
        stop: () => thread.terminate(),
    };
};

test('two notifiers working on one person’s notices at the same moment make the person one room and send each notice once, with the alias refused: the person’s claim in Postgres keeps the second out until the first has written what it did', async () => {
    // Round 9 of part 2's review (the operator's decision of 2026-10-31).
    // Before the claim, two notifiers (two leaders during a handover) could
    // each read one of the person's notices pending before either had
    // recorded a room and, where the homeserver refuses the alias, each made
    // the person a room and sent there. The worker is one notifier; a worker
    // thread with its own store and notifier is the other.
    const second = await startSecondProcess();
    const realFetch = globalThis.fetch;
    const roomOf = (mxid: string): string =>
        matrix.creates.filter((x) => JSON.stringify(x.body.invite).includes(mxid)).at(-1)!.roomId;
    const claimsOf = async (accountId: string) =>
        (
            await pg.query(
                'SELECT holder FROM deadman_notice_claims WHERE recipient_account_id = $1',
                [accountId]
            )
        ).rows.length;
    /** Park the worker's own next createRoom for `mxid` (the thread's calls do not pass here). */
    const parkWorkerCreate = (mxid: string) => {
        let reached!: () => void;
        let open!: () => void;
        const at = new Promise<void>((resolve) => {
            reached = resolve;
        });
        const gate = new Promise<void>((resolve) => {
            open = resolve;
        });
        let parked = false;
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            if (
                !parked &&
                /\/createRoom/.test(urlOf(input)) &&
                String(init?.body ?? '').includes(mxid)
            ) {
                parked = true;
                reached();
                await gate;
            }
            return matrix.fetch(input, init);
        }) as typeof fetch;
        return { reached: at, open };
    };
    try {
        matrix.aliasRefusal = { status: 403, errcode: 'M_FORBIDDEN' };
        for (const notices of [1, 2]) {
            const name = `${notices} notice${notices > 1 ? 's' : ''}`;
            const recipient = await person();
            const mxid = `@pn-${recipient.id.slice(0, 8)}:test.local`;
            const fired: Array<{ switchId: string; at: Date }> = [];
            for (let i = 0; i < notices; i += 1) fired.push(await release(recipient));
            await worker.drain();
            await second.rehydrate();
            const at = fired[fired.length - 1].at;
            const roomsBefore = roomsMadeFor(mxid);

            // The worker takes the person's claim and parks on its create;
            // the other process's tick meanwhile asks nothing of the
            // homeserver for that person and writes nothing.
            const ours = () => ({
                creates: matrix.creates.filter((x) => JSON.stringify(x.body).includes(mxid)).length,
                refusals: matrix.createRefusals.filter((x) => JSON.stringify(x.body).includes(mxid))
                    .length,
                sends: matrix.sends.filter((x) => fired.some((f) => x.txnId.includes(f.switchId)))
                    .length,
                invites: matrix.invites.filter((x) => x.userId === mxid).length,
            });
            const park = parkWorkerCreate(mxid);
            const workerTick = runDeadmanReleaseNotifier({ now: at });
            await park.reached;
            assert.equal(await claimsOf(recipient.id), 1, `${name}: the worker holds the claim`);
            const callsBefore = ours();
            const elsewhere = await second.tick(at);
            assert.ok(elsewhere.elsewhere >= notices, `${name}: left to the holder`);
            assert.deepEqual(
                ours(),
                callsBefore,
                `${name}: the other process asked the homeserver nothing for the person`
            );
            park.open();
            const done = await workerTick;
            globalThis.fetch = realFetch;
            await worker.drain();
            assert.ok(done.sent >= notices, `${name}: the worker sent each`);
            assert.equal(await claimsOf(recipient.id), 0, `${name}: the claim given up`);

            // Its next tick finds every notice sent in Postgres.
            await second.tick(new Date(at.getTime() + 1_000));
            assert.equal(roomsMadeFor(mxid) - roomsBefore, 1, `${name}: one room for the person`);
            const room = roomOf(mxid);
            for (const notice of fired) {
                const sends = matrix.sends.filter((x) => x.txnId.includes(notice.switchId));
                assert.deepEqual(
                    sends.map((x) => x.roomId),
                    [room],
                    `${name}: each notice sent once, into that room`
                );
                assert.deepEqual(
                    await committed(notice.switchId, recipient.id),
                    { status: 'sent', last_error: null, room_id: room },
                    name
                );
            }
        }

        // The claim is taken before the attempt's first read of Postgres, so
        // that read sees everything the previous holder wrote. The other
        // process has a newer release for the person that the worker has not
        // heard of; its claim is parked before it runs while the worker makes
        // the person's room for an older one. Taken after the read, it would
        // have read no room for the person and made a second.
        {
            const recipient = await person();
            const mxid = `@pn-${recipient.id.slice(0, 8)}:test.local`;
            const owner = await person();
            const envelope = await protocol.buildReleaseEnvelope({
                ownerKeySet: owner.keySet,
                recipients: [recipient.keySet.identity],
                message: 'Synthetic test text.',
            });
            const armedNewer = await armReleaseSwitch({
                ownerId: owner.id,
                input: { checkInIntervalSeconds: 7 * 86_400, gracePeriodSeconds: 0, envelope },
            });
            assert.equal(armedNewer.kind, 'armed');
            const newer = envelope.releaseId;
            await worker.drain();
            const old = new store.PostgresBackedDb();
            await old.init(pool as never);
            const newerAt = new Date(clock + 1_000).toISOString();
            assert.ok(
                await old.advanceDeadmanSwitch(newer, worker.getDeadmanSwitch(newer)!, {
                    status: 'triggered',
                    releasedAt: newerAt,
                })
            );
            old.createDeadmanReleaseNotice({
                switchId: newer,
                recipientAccountId: recipient.id,
                nextAttemptAt: newerAt,
            });
            await old.drain();
            await second.rehydrate();
            const older = await release(recipient);
            await worker.drain();
            assert.equal(worker.getDeadmanReleaseNotice(newer, recipient.id), undefined);
            const roomsBefore = roomsMadeFor(mxid);
            const claim = second.hold(
                (sql, params) =>
                    sql.startsWith('INSERT INTO deadman_notice_claims') &&
                    params[0] === recipient.id
            );
            const statementsBefore = second.statements.length;
            const secondTick = second.tick(new Date(older.at.getTime() + 2_000));
            await claim.reached;
            assert.ok(
                !second.statements
                    .slice(statementsBefore, -1)
                    .some(
                        ({ sql, params }) =>
                            sql.startsWith('SELECT * FROM deadman_release_notices') &&
                            params.includes(recipient.id)
                    ),
                'nothing of the person’s notices read before the claim'
            );
            await runDeadmanReleaseNotifier({ now: older.at });
            await worker.drain();
            claim.open();
            await secondTick;
            assert.equal(roomsMadeFor(mxid) - roomsBefore, 1, 'one room for the person');
            const room = roomOf(mxid);
            for (const switchId of [older.switchId, newer]) {
                assert.deepEqual(
                    matrix.sends.filter((x) => x.txnId.includes(switchId)).map((x) => x.roomId),
                    [room],
                    'each notice once, into the one room'
                );
            }
            await old.drain();
        }

        // The claim is given up only once the holder's writes have been
        // attempted: the other process holds it until its `sent` is in
        // Postgres, so the worker, whose mirror reads the row pending, sends
        // nothing again into the room it finds there.
        {
            const recipient = await person();
            const notice = await release(recipient);
            await worker.drain();
            await second.rehydrate();
            const sentWrite = second.hold(
                (sql, params) =>
                    sql.startsWith('INSERT INTO deadman_release_notices') &&
                    params.includes(notice.switchId) &&
                    params.includes('sent')
            );
            const secondTick = second.tick(notice.at);
            await sentWrite.reached;
            assert.equal(await claimsOf(recipient.id), 1, 'still held while its write waits');
            const sendsBefore = matrix.sends.filter((x) =>
                x.txnId.includes(notice.switchId)
            ).length;
            assert.equal(sendsBefore, 1);
            const workerTick = await runDeadmanReleaseNotifier({ now: notice.at });
            assert.equal(
                matrix.sends.filter((x) => x.txnId.includes(notice.switchId)).length,
                1,
                'the worker sent nothing again'
            );
            assert.ok(workerTick.elsewhere >= 1, 'left to the holder');
            sentWrite.open();
            await secondTick;
            assert.equal(await claimsOf(recipient.id), 0, 'given up after the write');
            assert.equal((await committed(notice.switchId, recipient.id)).status, 'sent');
        }

        // A claim left by a process that stopped holds the person's notices
        // until it expires, and no longer.
        {
            const recipient = await person();
            const mxid = `@pn-${recipient.id.slice(0, 8)}:test.local`;
            const notice = await release(recipient);
            await worker.drain();
            const stopped = new store.PostgresBackedDb();
            await stopped.init(pool as never);
            assert.equal(
                await stopped.claimDeadmanNoticeRecipient(recipient.id, 'stopped-process', 400),
                true
            );
            assert.equal(
                await stopped.claimDeadmanNoticeRecipient(recipient.id, 'another', 400),
                false,
                'one holder at a time'
            );
            const held = await runDeadmanReleaseNotifier({ now: notice.at });
            assert.ok(held.elsewhere >= 1);
            assert.equal(roomsMadeFor(mxid), 0, 'no room while it is held');
            assert.equal(
                matrix.createRefusals.filter((x) => JSON.stringify(x.body).includes(mxid)).length,
                0,
                'no create asked for'
            );
            assert.equal(matrix.sends.filter((x) => x.txnId.includes(notice.switchId)).length, 0);
            await new Promise((resolve) => setTimeout(resolve, 500));
            const expired = await runDeadmanReleaseNotifier({ now: notice.at });
            await worker.drain();
            assert.ok(expired.sent >= 1, 'sent once it expired');
            assert.equal(matrix.sends.filter((x) => x.txnId.includes(notice.switchId)).length, 1);
            assert.equal(await claimsOf(recipient.id), 0);
        }
    } finally {
        globalThis.fetch = realFetch;
        matrix.aliasRefusal = null;
        await second.stop();
    }
});

test('a notifier whose claim on the person fails or is not answered in time writes nothing over the row the holder is working on: with the person’s room purged, the person gets one replacement room and the notice once', async () => {
    // Round 10 of part 2's review. A claim statement that timed out (or
    // threw) became a retry, written full-row over the row the claim's holder
    // was working on: it carried the room this process's mirror held, so
    // with the person's room purged and replaced it put the gone room back,
    // the holder stopped before its send, and the next attempt made the
    // person a second replacement room. Now such a claim is treated as held
    // elsewhere: nothing is asked or written, and the row stays due. The
    // worker is the process whose claim is slow; a worker thread with its own
    // store and notifier holds the claim.
    const second = await startSecondProcess();
    const realConnect = pool.connect;
    /** The worker's own claim statements: `slow` answers them after 1 s, `fail` throws once. */
    const claimTrouble: { slow: boolean; fail: number } = { slow: false, fail: 0 };
    pool.connect = async () => {
        const client = await realConnect();
        return {
            ...client,
            async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                if (sql.startsWith('INSERT INTO deadman_notice_claims')) {
                    if (claimTrouble.fail > 0) {
                        claimTrouble.fail -= 1;
                        throw new Error('connection reset (test)');
                    }
                    if (claimTrouble.slow) await new Promise((r) => setTimeout(r, 1_000));
                }
                return client.query<T>(sql, params);
            },
        };
    };
    const row = async (switchId: string, accountId: string) =>
        (
            await pg.query(
                'SELECT status, attempts, last_error, room_id, next_attempt_at FROM deadman_release_notices WHERE switch_id = $1 AND recipient_account_id = $2',
                [switchId, accountId]
            )
        ).rows[0] as Record<string, unknown>;
    const claimsOf = async (accountId: string) =>
        (
            await pg.query(
                'SELECT holder FROM deadman_notice_claims WHERE recipient_account_id = $1',
                [accountId]
            )
        ).rows.length;
    try {
        matrix.aliasRefusal = { status: 403, errcode: 'M_FORBIDDEN' };
        for (const trouble of ['timeout', 'failure'] as const) {
            const recipient = await person();
            const mxid = `@pn-${recipient.id.slice(0, 8)}:test.local`;
            // Notice a is sent into the person's room X; notice b records X
            // and its send is refused, so it is pending at X; then X is purged.
            const a = await release(recipient);
            await runDeadmanReleaseNotifier({ now: a.at, callTimeoutMs: 300 });
            await worker.drain();
            const X = worker.getDeadmanReleaseNotice(a.switchId, recipient.id)?.roomId;
            assert.ok(X, trouble);
            const b = await release(recipient);
            matrix.sendStatus = 500;
            await runDeadmanReleaseNotifier({ now: b.at, callTimeoutMs: 300 });
            matrix.sendStatus = 200;
            await worker.drain();
            assert.equal((await row(b.switchId, recipient.id)).room_id, X, trouble);
            matrix.purgeRoom(X!);
            await second.rehydrate();
            const due = new Date(b.at.getTime() + 60_000);
            // The refused send into X is in the stub's list too.
            const sendsBefore = matrix.sends.filter((x) => x.txnId.includes(b.switchId)).length;

            // The other process holds the claim, finds X gone, makes the
            // replacement, records it, and is held on its read right before
            // the send.
            let recorded = false;
            const preSend = second.hold((sql, params) => {
                if (
                    sql.startsWith('INSERT INTO deadman_release_notices') &&
                    params.some((p) => typeof p === 'string' && p.startsWith('!') && p !== X)
                ) {
                    recorded = true;
                }
                return (
                    recorded &&
                    sql.startsWith('SELECT * FROM deadman_release_wraps') &&
                    params.includes(recipient.id)
                );
            });
            const secondTick = second.tick(due);
            await preSend.reached;
            assert.equal(await claimsOf(recipient.id), 1, `${trouble}: the other process holds it`);
            const whileHeld = await row(b.switchId, recipient.id);
            assert.notEqual(whileHeld.room_id, X, `${trouble}: the replacement recorded`);
            const replacement = whileHeld.room_id as string;

            // The worker's tick: its claim statement is not answered within
            // its 300 ms bound, or fails.
            if (trouble === 'timeout') claimTrouble.slow = true;
            else claimTrouble.fail = 1;
            const callsBefore = matrix.creates.length + matrix.createRefusals.length;
            const ours = await runDeadmanReleaseNotifier({ now: due, callTimeoutMs: 300 });
            await worker.drain();
            claimTrouble.slow = false;
            assert.ok(ours.elsewhere >= 1, `${trouble}: counted elsewhere`);
            assert.equal(ours.retried, 0, `${trouble}: no retry written`);
            assert.equal(
                matrix.creates.length + matrix.createRefusals.length,
                callsBefore,
                `${trouble}: no room asked for`
            );
            // The late claim lands, refused, since the other holds it.
            await new Promise((r) => setTimeout(r, 1_200));
            await worker.drain();
            assert.deepEqual(
                await row(b.switchId, recipient.id),
                whileHeld,
                `${trouble}: nothing written over the holder's row`
            );

            preSend.open();
            const theirs = await secondTick;
            assert.ok(theirs.sent >= 1, `${trouble}: the holder sent it`);
            await runDeadmanReleaseNotifier({
                now: new Date(due.getTime() + 600_000),
                callTimeoutMs: 300,
            });
            await worker.drain();
            assert.deepEqual(
                matrix.sends
                    .filter((x) => x.txnId.includes(b.switchId))
                    .slice(sendsBefore)
                    .map((x) => x.roomId),
                [replacement],
                `${trouble}: the notice once, into the one replacement`
            );
            const rooms = matrix.creates
                .filter((x) => JSON.stringify(x.body.invite ?? []).includes(mxid))
                .map((x) => x.roomId);
            assert.deepEqual(rooms, [X, replacement], `${trouble}: one replacement room`);
            assert.equal((await row(b.switchId, recipient.id)).status, 'sent', trouble);
        }

        // A claim that lands after the bound with nobody else holding it is
        // given up when it lands: it does not hold the person's notices for
        // its lease, and the row, untouched, is sent at the next tick.
        {
            const recipient = await person();
            const notice = await release(recipient);
            await worker.drain();
            claimTrouble.slow = true;
            const first = await runDeadmanReleaseNotifier({ now: notice.at, callTimeoutMs: 300 });
            claimTrouble.slow = false;
            assert.ok(first.elsewhere >= 1);
            assert.equal(first.retried, 0);
            await new Promise((r) => setTimeout(r, 1_500));
            assert.equal(await claimsOf(recipient.id), 0, 'the late claim given up');
            const row0 = await row(notice.switchId, recipient.id);
            assert.equal(row0.attempts, 0, 'nothing written');
            assert.equal(row0.last_error, null);
            const next = await runDeadmanReleaseNotifier({ now: notice.at, callTimeoutMs: 300 });
            await worker.drain();
            assert.ok(next.sent >= 1, 'sent at the next tick');
        }
    } finally {
        pool.connect = realConnect;
        matrix.aliasRefusal = null;
        matrix.sendStatus = 200;
        await second.stop();
    }
});
