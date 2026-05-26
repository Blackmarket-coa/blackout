import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Reproduces a dev/test restart: BLACKOUT_DB_MODE=file with a non-production
// NODE_ENV, so the InMemoryDb constructor seeds a demo user. Before the fix the
// demo-seed write persisted an empty snapshot during construction, clobbering
// the file before hydrate() could load it — so a restart wiped real data.
// (Runs in its own process; node --test isolates files, so this env is local.)
const tmpDir = mkdtempSync(join(tmpdir(), 'db-dev-restart-'));
process.env.BLACKOUT_DB_MODE = 'file';
process.env.BLACKOUT_DB_FILE = join(tmpDir, 'store.json');
process.env.NODE_ENV = 'development';
delete process.env.BLACKOUT_DEMO_PASSWORD;

const { db, FileBackedDb } = await import('../src/db/store');

test.after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
});

test('dev-mode writes survive a restart; demo seeding does not clobber the file', () => {
    db.upsertColiseumTopic({
        id: 'restart-topic',
        title: 'Survives a dev restart',
        newsAnchor: {
            sourceUrl: 'https://news.example/restart',
            headline: 'Restart durability',
            publishedAt: '2026-05-02T08:00:00Z',
        },
        createdAt: '2026-05-02T09:00:00Z',
        tags: [],
        category: 'tech',
        status: 'active',
        recencyScore: 0.5,
        velocityScore: 0.2,
        debateHeat: 0.4,
    });

    // Simulate a process restart: a fresh instance hydrates from the same file.
    // Its constructor re-runs the demo seed, which must NOT overwrite the data.
    const reloaded = new FileBackedDb();

    // Pre-fix this was undefined (the seed write clobbered the file pre-hydrate).
    assert.equal(reloaded.getColiseumTopic('restart-topic')?.title, 'Survives a dev restart');
    // The demo seed still loads too, so seeding and persisted data coexist.
    assert.ok(reloaded.findUserByUsername('demo'));
});
