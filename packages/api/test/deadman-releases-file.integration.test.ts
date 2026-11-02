import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// BLACKOUT_DB_MODE=file persists by overriding each mutator with a super-call
// plus persist(). A release-copy or notice mutator without one, or a map
// missing from the snapshot or from hydrate(), would keep a release's copies
// in memory only, and a restart would lose every recipient's copy. This
// writes through the process singleton and re-opens the file as a second
// FileBackedDb each time (a simulated restart).
// (Runs in its own process; node --test isolates files, so this env is local.)
const tmpDir = mkdtempSync(join(tmpdir(), 'deadman-releases-file-'));
process.env.BLACKOUT_DB_MODE = 'file';
process.env.BLACKOUT_DB_FILE = join(tmpDir, 'store.json');
process.env.NODE_ENV = 'development';
delete process.env.BLACKOUT_DEMO_PASSWORD;

const { db, FileBackedDb } = await import('../src/db/store');

test.after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
});

test('a release switch, its copies and its notices survive a restart of the file store, the notifier’s conditional writes included', () => {
    const owner = randomUUID();
    const bob = randomUUID();
    const sw = db.createDeadmanSwitch({
        id: randomUUID(),
        ownerId: owner,
        status: 'armed',
        checkInIntervalSeconds: 3600,
        gracePeriodSeconds: 600,
        lastCheckInAt: '2026-01-01T00:00:00.000Z',
        triggerAt: '2026-01-01T01:00:00.000Z',
        releaseAt: '2026-01-01T01:10:00.000Z',
        recipients: [bob],
        encryptedPayload: '{"header":{},"ownerIdentity":{}}',
        releaseFormat: 'release-v1',
    });
    db.putDeadmanReleaseWrap({
        switchId: sw.id,
        recipientAccountId: owner,
        recipientFingerprint: 'ab'.repeat(32),
        sealedKey: 'owner-copy',
        signature: 'owner-signature',
    });
    db.putDeadmanReleaseWrap({
        switchId: sw.id,
        recipientAccountId: bob,
        recipientFingerprint: 'cd'.repeat(32),
        sealedKey: 'bob-copy',
        signature: 'bob-signature',
    });

    const afterArming = new FileBackedDb();
    assert.equal(afterArming.getDeadmanSwitch(sw.id)?.releaseFormat, 'release-v1');
    assert.equal(afterArming.getDeadmanSwitch(sw.id)?.roomId, undefined);
    assert.equal(afterArming.getDeadmanReleaseWrap(sw.id, bob)?.sealedKey, 'bob-copy');
    assert.equal(afterArming.getDeadmanReleaseWrap(sw.id, owner)?.signature, 'owner-signature');
    assert.equal(afterArming.listDeadmanReleaseWraps(sw.id).length, 2);
    assert.deepEqual(
        afterArming.listDeadmanReleaseWrapsForRecipient(bob).map((w) => w.switchId),
        [sw.id],
        'listed by recipient after a restart'
    );
    assert.deepEqual(
        afterArming.listDeadmanSwitchesForOwner(owner).map((s) => s.id),
        [sw.id],
        'the switch is listed by owner after a restart (the arming bounds read it so)'
    );
    assert.deepEqual(afterArming.listDeadmanSwitchesForOwner(bob), []);

    // Re-sealing replaces a copy and keeps the row's createdAt.
    const first = db.getDeadmanReleaseWrap(sw.id, bob)!;
    const resealed = db.putDeadmanReleaseWrap({
        switchId: sw.id,
        recipientAccountId: bob,
        recipientFingerprint: 'ef'.repeat(32),
        sealedKey: 'bob-copy-2',
        signature: 'bob-signature-2',
    });
    assert.equal(resealed.createdAt, first.createdAt);
    assert.equal(new FileBackedDb().getDeadmanReleaseWrap(sw.id, bob)?.sealedKey, 'bob-copy-2');

    db.updateDeadmanSwitch(sw.id, { status: 'triggered', releasedAt: '2026-01-01T01:10:30.000Z' });
    assert.ok(
        db.createDeadmanReleaseNotice({
            switchId: sw.id,
            recipientAccountId: bob,
            nextAttemptAt: '2026-01-01T01:10:30.000Z',
        })
    );
    assert.equal(
        db.createDeadmanReleaseNotice({
            switchId: sw.id,
            recipientAccountId: bob,
            nextAttemptAt: '2026-01-01T01:10:31.000Z',
        }),
        undefined,
        'one notice per recipient per release'
    );
    // The notifier writes through the conditional method (round 5); its file
    // override must persist too, or a restart would forget the room, the
    // retries and the sends, and the notices would go again (round 6).
    assert.ok(
        db.updateDeadmanReleaseNoticeIf(
            sw.id,
            bob,
            { status: 'pending' },
            { roomId: '!first:test.local', attempts: 1, lastError: 'matrix_send_status_500' }
        )
    );
    const afterRetry = new FileBackedDb().getDeadmanReleaseNotice(sw.id, bob);
    assert.equal(afterRetry?.status, 'pending');
    assert.equal(afterRetry?.roomId, '!first:test.local', 'a conditional write survives a restart');
    assert.equal(afterRetry?.attempts, 1);
    db.updateDeadmanReleaseNotice(sw.id, bob, {
        roomId: '!notices:test.local',
        attempts: 1,
        status: 'sent',
        sentAt: '2026-01-01T01:11:00.000Z',
    });

    const afterRelease = new FileBackedDb();
    assert.equal(afterRelease.getDeadmanSwitch(sw.id)?.releasedAt, '2026-01-01T01:10:30.000Z');
    const notice = afterRelease.getDeadmanReleaseNotice(sw.id, bob);
    assert.equal(notice?.status, 'sent');
    assert.equal(notice?.roomId, '!notices:test.local');
    assert.equal(notice?.attempts, 1);
    assert.equal(afterRelease.findDeadmanNoticeRoom(bob), '!notices:test.local');

    // Refused by its condition (the row is sent, not pending): nothing written,
    // before or after a restart.
    assert.equal(
        db.updateDeadmanReleaseNoticeIf(
            sw.id,
            bob,
            { status: 'pending' },
            { status: 'failed', lastError: 'recipient_gone', roomId: undefined }
        ),
        undefined
    );
    const afterRefusal = new FileBackedDb().getDeadmanReleaseNotice(sw.id, bob);
    assert.equal(afterRefusal?.status, 'sent');
    assert.equal(afterRefusal?.lastError, 'matrix_send_status_500', 'not the refused write’s');
    assert.equal(afterRefusal?.roomId, '!notices:test.local');
    // Applied by room (a purged room's rows move to its replacement), and
    // found by the room lookup after a restart.
    assert.ok(
        db.updateDeadmanReleaseNoticeIf(
            sw.id,
            bob,
            { roomId: '!notices:test.local' },
            { roomId: '!moved:test.local' }
        )
    );
    const afterMove = new FileBackedDb();
    assert.equal(afterMove.getDeadmanReleaseNotice(sw.id, bob)?.roomId, '!moved:test.local');
    assert.equal(afterMove.getDeadmanReleaseNotice(sw.id, bob)?.status, 'sent');
    assert.equal(afterMove.findDeadmanNoticeRoom(bob), '!moved:test.local');
    assert.deepEqual(
        afterMove.listDeadmanReleaseNotices(sw.id).map((n) => n.recipientAccountId),
        [bob]
    );

    assert.ok(db.eraseDeadmanReleaseWrap(sw.id, bob));
    assert.equal(db.eraseDeadmanReleaseWrap(sw.id, randomUUID()), undefined);
    const afterRemoval = new FileBackedDb();
    const blank = afterRemoval.getDeadmanReleaseWrap(sw.id, bob);
    assert.ok(blank, 'the row stays, blank');
    assert.equal(blank?.sealedKey, '');
    assert.equal(blank?.signature, '');
    assert.equal(afterRemoval.getDeadmanReleaseWrap(sw.id, owner)?.sealedKey, 'owner-copy');
});

test('the owner’s check-in and cancel through the conditional write, the second cancel’s blanking, and arming through the store’s arm method persist across a restart of the file store', async () => {
    // Round 10 of part 2's review's verifiers: no file-mode test ran a
    // check-in or a cancel through `updateDeadmanSwitchIf`, so the route's
    // persistence rested on virtual dispatch alone. Round 11 adds the arm
    // (`armDeadmanSwitch`), which the file store answers from its own memory.
    const owner = randomUUID();
    const bob = randomUUID();
    const id = randomUUID();
    const armed = await db.armDeadmanSwitch(
        {
            id,
            ownerId: owner,
            status: 'armed',
            checkInIntervalSeconds: 3600,
            gracePeriodSeconds: 0,
            lastCheckInAt: '2026-01-01T00:00:00.000Z',
            triggerAt: '2026-01-01T01:00:00.000Z',
            releaseAt: '2026-01-01T01:00:00.000Z',
            recipients: [bob],
            encryptedPayload: '{"header":{},"ownerIdentity":{}}',
            releaseFormat: 'release-v1',
        },
        [
            {
                switchId: id,
                recipientAccountId: owner,
                recipientFingerprint: 'ab'.repeat(32),
                sealedKey: 'owner-copy',
                signature: 'owner-signature',
            },
            {
                switchId: id,
                recipientAccountId: bob,
                recipientFingerprint: 'cd'.repeat(32),
                sealedKey: 'bob-copy',
                signature: 'bob-signature',
            },
        ]
    );
    assert.equal(armed.kind, 'armed');
    assert.equal(
        armed.kind === 'armed' && (await db.armDeadmanSwitch({ ...armed.record }, [])).kind,
        'id_taken'
    );
    {
        const reopened = new FileBackedDb();
        assert.equal(reopened.getDeadmanSwitch(id)?.status, 'armed', 'the arm persisted');
        assert.equal(reopened.listDeadmanReleaseWraps(id).length, 2, 'its copies too');
    }

    // The check-in, as the route makes it.
    const sw = db.getDeadmanSwitch(id)!;
    const checkedIn = await db.updateDeadmanSwitchIf(id, sw, {
        status: 'armed',
        lastCheckInAt: '2026-01-01T00:30:00.000Z',
        triggerAt: '2026-01-01T01:30:00.000Z',
        releaseAt: '2026-01-01T01:30:00.000Z',
        backlogGraceStartedAt: undefined,
    });
    assert.equal(checkedIn.kind, 'applied');
    {
        const reopened = new FileBackedDb().getDeadmanSwitch(id);
        assert.equal(reopened?.status, 'armed');
        assert.equal(reopened?.lastCheckInAt, '2026-01-01T00:30:00.000Z', 'the check-in persisted');
        assert.equal(reopened?.triggerAt, '2026-01-01T01:30:00.000Z');
    }
    // A stale read is refused against the file store's own memory.
    const stale = await db.updateDeadmanSwitchIf(id, sw, {
        lastCheckInAt: '2026-01-01T00:45:00.000Z',
    });
    assert.equal(stale.kind, 'refused');

    // The cancel, as the route makes it, and the copies' blanking.
    const cancelled = await db.updateDeadmanSwitchIf(id, db.getDeadmanSwitch(id)!, {
        status: 'cancelled',
        encryptedPayload: '',
    });
    assert.equal(cancelled.kind, 'applied');
    db.eraseDeadmanReleaseWrap(id, owner);
    db.eraseDeadmanReleaseWrap(id, bob);
    {
        const reopened = new FileBackedDb();
        assert.equal(reopened.getDeadmanSwitch(id)?.status, 'cancelled', 'the cancel persisted');
        assert.equal(reopened.getDeadmanSwitch(id)?.encryptedPayload, '');
        assert.deepEqual(
            reopened.listDeadmanReleaseWraps(id).map((w) => w.sealedKey),
            ['', ''],
            'the copies blanked'
        );
    }
    // A cancelled switch that kept its payload (a cancel before this code):
    // the second cancel's conditional write of the content persists too.
    db.updateDeadmanSwitch(id, { encryptedPayload: 'kept' });
    const second = await db.updateDeadmanSwitchIf(id, db.getDeadmanSwitch(id)!, {
        encryptedPayload: '',
    });
    assert.equal(second.kind, 'applied');
    assert.equal(new FileBackedDb().getDeadmanSwitch(id)?.encryptedPayload, '');
});
