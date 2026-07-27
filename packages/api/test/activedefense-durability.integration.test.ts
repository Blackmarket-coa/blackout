/**
 * File-mode durability test for the active-defense canary tokens (M16): they
 * used to live only in process memory and were wiped on every restart. This
 * mirrors canopy-directory-durability.integration.test.ts — mint + trip a
 * canary, confirm it's live, and confirm it's written through to the on-disk
 * store snapshot that a fresh process would hydrate on restart.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const dir = mkdtempSync(join(tmpdir(), 'blackout-canary-'));
const dbFile = join(dir, 'store.json');
process.env.BLACKOUT_DB_MODE = 'file';
process.env.BLACKOUT_DB_FILE = dbFile;

const { mintCanary, tripCanary, listCanaries } = await import('../src/services/activeDefense');

after(() => rmSync(dir, { recursive: true, force: true }));

test('canary tokens are written through to the backing store file and survive reload', () => {
    const owner = randomUUID();
    const minted = mintCanary(owner, 'db-honeypot');
    assert.equal(minted.kind, 'ok');
    const token = minted.kind === 'ok' ? minted.record.token : '';

    // Trip it so lastTrippedAt/tripCount mutate through the store too.
    const tripped = tripCanary(token, { userAgent: 'EvilCrawler/9.9' });
    assert.ok(tripped);
    assert.equal(tripped!.tripCount, 1);

    // Visible to the live instance...
    assert.ok(listCanaries(owner).some((c) => c.token === token));

    // ...and durable on disk, so a fresh process hydrates it on restart.
    const onDisk = JSON.parse(readFileSync(dbFile, 'utf8')) as {
        canaryTokens?: Array<{
            id: string;
            token: string;
            tripCount: number;
            lastTrippedAt: string | null;
            ownerUserId: string;
        }>;
    };
    const row = onDisk.canaryTokens?.find((c) => c.token === token);
    assert.ok(row, 'canary should be persisted to the store file');
    assert.equal(row!.ownerUserId, owner);
    assert.equal(row!.tripCount, 1);
    assert.ok(row!.lastTrippedAt);
});
