import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// BLACKOUT_DB_MODE=file persists by overriding each mutator with a super-call
// plus persist(). A release-identity mutator without one, or a map missing
// from the snapshot or from hydrate(), would keep identities in memory only.
// This publishes, replaces and deletes through the process singleton and
// re-opens the file as a second FileBackedDb each time (a simulated restart).
// (Runs in its own process; node --test isolates files, so this env is local.)
const tmpDir = mkdtempSync(join(tmpdir(), 'release-identities-file-'));
process.env.BLACKOUT_DB_MODE = 'file';
process.env.BLACKOUT_DB_FILE = join(tmpDir, 'store.json');
process.env.NODE_ENV = 'development';
delete process.env.BLACKOUT_DEMO_PASSWORD;

const { db, FileBackedDb } = await import('../src/db/store');

test.after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
});

const identity = (accountId: string, fingerprint: string) => ({
    id: randomUUID(),
    accountId,
    formatVersion: 1,
    signingKey: 'public-signing-key',
    x25519Key: 'public-agreement-key',
    mlkem768Key: 'public-kem-key',
    signature: 'signature',
    fingerprint,
});

test('published, replaced and deleted identities survive a restart of the file store', () => {
    const accountId = randomUUID();
    const other = randomUUID();
    const first = db.publishReleaseIdentity(identity(accountId, 'a'.repeat(64)));
    const second = db.publishReleaseIdentity(identity(accountId, 'b'.repeat(64)));
    db.publishReleaseIdentity(identity(other, 'c'.repeat(64)));

    const reopened = new FileBackedDb();
    assert.equal(reopened.getCurrentReleaseIdentity(accountId)?.id, second.id);
    const replaced = reopened
        .listReleaseIdentitiesForAccount(accountId)
        .find((record) => record.id === first.id);
    assert.ok(replaced?.supersededAt, 'the replaced identity keeps superseded_at');

    assert.equal(db.deleteReleaseIdentitiesForAccount(accountId), 2);
    const afterDeletion = new FileBackedDb();
    assert.equal(afterDeletion.listReleaseIdentitiesForAccount(accountId).length, 0);
    assert.equal(afterDeletion.getCurrentReleaseIdentity(other)?.fingerprint, 'c'.repeat(64));
});
