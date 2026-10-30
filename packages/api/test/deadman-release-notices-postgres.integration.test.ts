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
 * review, `release-envelope-2026-10-26.md`).
 *
 * The worker is this process's store singleton (`BLACKOUT_DB_MODE=postgres`)
 * on an in-process PGlite with every migration applied, running the real
 * notifier against the stand-in homeserver; the app is a second
 * PostgresBackedDb on the same database, making the account deletion's
 * notice and copy writes (`accountLifecycle.ts`; the user row is left, since
 * the notifier reads it from the worker's mirror, which has it until the
 * notification arrives either way). Change notifications are delivered by
 * hand, so the only variable is when the app's reaches the worker.
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
/** The app's change notification for one person's notice and copy, as the transport would deliver it. */
const deliverToWorker = (switchId: string, accountId: string) => {
    const peer = worker as unknown as { applyPeerChange(payload: PeerChange): void };
    peer.applyPeerChange({
        src: 'app',
        m: 'deadmanReleaseNotices',
        op: 'u',
        kv: [switchId, accountId],
    });
    peer.applyPeerChange({
        src: 'app',
        m: 'deadmanReleaseWraps',
        op: 'u',
        kv: [switchId, accountId],
    });
};
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
const release = async (recipient: { keySet: ReleaseKeySet }) => {
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
    const at = new Date((clock += 300_000));
    sweepOverdueDeadmanSwitches(at, Number.MAX_SAFE_INTEGER);
    return { switchId: envelope.releaseId, at };
};

/** The account deletion's writes for a recipient's copies and notices, on the app (`accountLifecycle.ts`). */
const deleteOnApp = (app: InstanceType<typeof store.PostgresBackedDb>, accountId: string) => {
    for (const wrap of app.listDeadmanReleaseWrapsForRecipient(accountId)) {
        app.eraseDeadmanReleaseWrap(wrap.switchId, wrap.recipientAccountId);
    }
    const goneAt = new Date().toISOString();
    for (const notice of app.listDeadmanReleaseNoticesForRecipient(accountId)) {
        app.updateDeadmanReleaseNotice(notice.switchId, notice.recipientAccountId, {
            roomId: undefined,
            ...(notice.status === 'pending'
                ? { status: 'failed', failedAt: goneAt, lastError: 'recipient_gone' }
                : {}),
        });
    }
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

test('an account deletion the API process committed while the worker had a notice in hand stands in Postgres, whenever its change notification reaches the worker', async () => {
    type Variant = {
        name: string;
        /**
         * An earlier notice made the person's room (`known`); the homeserver
         * has since lost it (`purged`); or the person has left it (`left`).
         */
        room: 'none' | 'known' | 'purged' | 'left';
        /** The homeserver call the deletion lands during; `none`: before the tick. */
        park: 'send' | 'create' | 'invite' | 'none';
        /** The notification reaches the worker while that call is in flight, not after. */
        early?: boolean;
        /** The parked send is refused, so the worker records a retry. */
        refused?: boolean;
        /** The tick comes after the retry window, so the worker ends the row itself. */
        late?: boolean;
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
    ];
    for (const variant of variants) {
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
        const notice = await release(recipient);
        await worker.drain();
        const app = new store.PostgresBackedDb();
        await app.init(pool as never);

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
            for (const row of app.listDeadmanReleaseNoticesForRecipient(recipient.id)) {
                deliverToWorker(row.switchId, recipient.id);
            }
        };
        const deleteAndCheck = async () => {
            deleteOnApp(app, recipient.id);
            await app.drain();
            assert.deepEqual(
                await committed(notice.switchId, recipient.id),
                { status: 'failed', last_error: 'recipient_gone', room_id: null },
                `${variant.name}: the app committed the deletion`
            );
        };
        try {
            if (variant.park === 'none') {
                await deleteAndCheck();
                const after = new Date(notice.at.getTime() + NOTICE_RETRY_WINDOW_MS + 1000);
                assert.equal((await runDeadmanReleaseNotifier({ now: after })).failed, 1);
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
            { status: 'failed', last_error: 'recipient_gone', room_id: null },
            `${variant.name}: Postgres keeps the deletion's row`
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
        assert.equal(mirrored.status, 'failed', `${variant.name}: the worker's mirror, once told`);
        assert.equal(mirrored.roomId, undefined, variant.name);
        const booted = new store.PostgresBackedDb();
        await booted.init(pool as never);
        const fresh = booted.getDeadmanReleaseNotice(notice.switchId, recipient.id)!;
        assert.equal(fresh.status, 'failed', `${variant.name}: a replica booting now`);
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
