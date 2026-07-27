import test from 'node:test';
import assert from 'node:assert/strict';

// Single-process runtimes (file/memory) are always the background leader, so
// the loops run without a Postgres advisory lock. The postgres-mode election is
// covered by the deployment integration lane (needs a real database).
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = 'memory';

const { tryBecomeBackgroundLeader, isBackgroundLeader } = await import(
    '../src/services/backgroundLeader'
);

test('memory mode is always the background leader (no advisory lock held)', async () => {
    const leader = await tryBecomeBackgroundLeader();
    assert.equal(leader, true);
    // No Postgres connection/lock is held in single-process mode.
    assert.equal(isBackgroundLeader(), false);
});
