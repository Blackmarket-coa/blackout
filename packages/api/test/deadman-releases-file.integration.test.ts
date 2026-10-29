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

test('a release switch, its copies and its notices survive a restart of the file store', () => {
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

    assert.ok(db.eraseDeadmanReleaseWrap(sw.id, bob));
    assert.equal(db.eraseDeadmanReleaseWrap(sw.id, randomUUID()), undefined);
    const afterRemoval = new FileBackedDb();
    const blank = afterRemoval.getDeadmanReleaseWrap(sw.id, bob);
    assert.ok(blank, 'the row stays, blank');
    assert.equal(blank?.sealedKey, '');
    assert.equal(blank?.signature, '');
    assert.equal(afterRemoval.getDeadmanReleaseWrap(sw.id, owner)?.sealedKey, 'owner-copy');
});
