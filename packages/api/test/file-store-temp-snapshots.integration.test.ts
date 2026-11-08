// FileBackedDb writes each snapshot to `<file>.tmp-<pid>` and renames it over
// the store file. A process that dies between the two leaves its temp file;
// the next boot removes it, unless the process that wrote it is still running.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'blackout-file-store-'));
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.BLACKOUT_DB_FILE = join(dir, 'store.json');

const { FileBackedDb } = await import('../src/db/store');

test("a file store's boot removes the temp snapshots dead processes left, and keeps a running writer's", () => {
    const file = process.env.BLACKOUT_DB_FILE!;
    try {
        const dead = spawnSync(process.execPath, ['-e', '0']).pid;
        assert.ok(dead && dead !== process.pid);
        const live = process.ppid;
        const left = {
            dead: `${file}.tmp-${dead}`,
            legacy: `${file}.tmp`,
            own: `${file}.tmp-${process.pid}`,
            live: `${file}.tmp-${live}`,
            other: `${file}.tmp-backup`,
        };
        for (const p of Object.values(left)) writeFileSync(p, '{"users":[]}\n');

        new FileBackedDb();

        assert.equal(existsSync(left.dead), false, 'a dead process left it');
        assert.equal(existsSync(left.legacy), false, 'the fixed name used before the pid');
        assert.equal(existsSync(left.own), false, 'this process is not writing yet');
        assert.equal(existsSync(left.live), true, 'a running process may be writing it');
        assert.equal(existsSync(left.other), true, 'not a temp snapshot name');
        assert.ok(existsSync(file), 'the first boot still writes the store');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
