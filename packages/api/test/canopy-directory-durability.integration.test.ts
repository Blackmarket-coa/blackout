import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the file-backed store at an isolated temp file BEFORE importing it, so
// this exercises real persistence without touching the shared dev store.
const dir = mkdtempSync(join(tmpdir(), 'blackout-canopy-'));
const dbFile = join(dir, 'store.json');
process.env.BLACKOUT_DB_MODE = 'file';
process.env.BLACKOUT_DB_FILE = dbFile;

const { upsertCanopy, listCanopies } = await import('../src/services/canopyDirectory');

after(() => rmSync(dir, { recursive: true, force: true }));

test('canopy directory entries are written through to the backing store file', () => {
    upsertCanopy({
        canopyId: '!persist:test.local',
        name: 'Persisted',
        summary: 'durable',
        federationTier: 'zone',
    });

    // Visible to the live instance...
    assert.ok(listCanopies().some((e) => e.canopyId === '!persist:test.local'));

    // ...and durable on disk, so a fresh process hydrates it on restart (hydrate
    // maps `canopyDirectoryEntries ?? []` keyed by canopyId).
    const onDisk = JSON.parse(readFileSync(dbFile, 'utf8')) as {
        canopyDirectoryEntries?: Array<{ canopyId: string; name: string; federationTier: string }>;
    };
    const row = onDisk.canopyDirectoryEntries?.find((e) => e.canopyId === '!persist:test.local');
    assert.ok(row, 'entry should be persisted to the store file');
    assert.equal(row!.name, 'Persisted');
    assert.equal(row!.federationTier, 'zone');
});
