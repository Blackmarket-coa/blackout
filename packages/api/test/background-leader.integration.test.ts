import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

// Single-process runtimes (file/memory) are always the background leader, so
// the loops run without a Postgres advisory lock. The postgres-mode lock below
// runs against a stand-in for a pg pool client; contention between two real
// sessions needs a real server (PGlite is a single session).
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = 'memory';

const {
    acquireBackgroundLeaderLock,
    isBackgroundLeader,
    releaseBackgroundLeader,
    tryBecomeBackgroundLeader,
    watchBackgroundLeadership,
} = await import('../src/services/backgroundLeader');

test('memory mode is always the background leader (no advisory lock held)', async () => {
    const leader = await tryBecomeBackgroundLeader();
    assert.equal(leader, true);
    // No Postgres connection/lock is held in single-process mode.
    assert.equal(isBackgroundLeader(), false);
});

/**
 * A pool client as pg hands one out: an EventEmitter with query(), and a
 * release() that destroys the connection when it is given an error.
 */
class FakeLeaderClient extends EventEmitter {
    queries: string[] = [];
    released: Array<'pooled' | Error> = [];
    granted = true;
    held = true;
    checkHangs = false;
    unlockFails = false;

    async query(sql: string): Promise<{ rows: unknown[] }> {
        this.queries.push(sql);
        if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: this.granted }] };
        if (sql.includes('pg_locks')) {
            if (this.checkHangs) return new Promise(() => undefined);
            return { rows: [{ held: this.held }] };
        }
        if (sql.includes('pg_advisory_unlock') && this.unlockFails) {
            throw new Error('Connection terminated unexpectedly');
        }
        return { rows: [] };
    }

    release(destroy?: Error): void {
        this.released.push(destroy ?? 'pooled');
    }
}

const poolOf = (client: FakeLeaderClient) =>
    ({ connect: async () => client, end: async () => undefined } as never);

const waitFor = async (condition: () => boolean, label: string): Promise<void> => {
    const deadline = Date.now() + 2000;
    while (!condition()) {
        if (Date.now() > deadline) assert.fail(`timed out waiting for: ${label}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
};

test('a lock that is not granted is not held, and its connection goes back to the pool', async () => {
    const client = new FakeLeaderClient();
    client.granted = false;
    assert.equal(await acquireBackgroundLeaderLock(poolOf(client)), false);
    assert.equal(isBackgroundLeader(), false);
    assert.deepEqual(client.released, ['pooled']);
});

test('a dropped lock connection is reported once, destroyed, and leaves no leader', async () => {
    const client = new FakeLeaderClient();
    assert.equal(await acquireBackgroundLeaderLock(poolOf(client)), true);
    assert.equal(isBackgroundLeader(), true);
    assert.equal(client.released.length, 0, 'the lock connection stays checked out');

    const losses: string[] = [];
    watchBackgroundLeadership((reason) => losses.push(reason), { checkIntervalMs: 60_000 });
    client.emit('error', new Error('terminating connection due to administrator command'));
    assert.deepEqual(losses, ['connection_error']);
    assert.equal(isBackgroundLeader(), false);
    assert.equal(client.released.length, 1);
    assert.ok(client.released[0] instanceof Error, 'destroyed, not returned to the pool');

    // Later events on the dead connection neither crash nor report again.
    assert.doesNotThrow(() => client.emit('error', new Error('again')));
    client.emit('end');
    assert.deepEqual(losses, ['connection_error']);
    await releaseBackgroundLeader();
    assert.equal(client.released.length, 1, 'nothing left to release');
});

test('a check that finds the lock gone, or gets no answer in time, is a loss', async () => {
    const gone = new FakeLeaderClient();
    await acquireBackgroundLeaderLock(poolOf(gone));
    const losses: string[] = [];
    watchBackgroundLeadership((reason) => losses.push(reason), { checkIntervalMs: 10 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(losses, [], 'still held: nothing to report');
    assert.ok(gone.queries.some((sql) => sql.includes('pg_backend_pid()')));
    gone.held = false;
    await waitFor(() => losses.length > 0, 'the not-held check to report');
    assert.deepEqual(losses, ['lock_not_held']);
    assert.equal(isBackgroundLeader(), false);

    const silent = new FakeLeaderClient();
    await acquireBackgroundLeaderLock(poolOf(silent));
    silent.checkHangs = true;
    const silentLosses: string[] = [];
    watchBackgroundLeadership((reason) => silentLosses.push(reason), {
        checkIntervalMs: 10,
        checkTimeoutMs: 20,
    });
    await waitFor(() => silentLosses.length > 0, 'the unanswered check to time out');
    assert.deepEqual(silentLosses, ['lock_check_failed']);
    assert.equal(isBackgroundLeader(), false);
    assert.ok(silent.released[0] instanceof Error);
});

test('releasing unlocks and pools the connection; a failed unlock destroys it instead', async () => {
    const client = new FakeLeaderClient();
    await acquireBackgroundLeaderLock(poolOf(client));
    const stop = watchBackgroundLeadership(() => assert.fail('no loss expected'), {
        checkIntervalMs: 60_000,
    });
    stop();
    await releaseBackgroundLeader();
    assert.ok(client.queries.some((sql) => sql.includes('pg_advisory_unlock')));
    assert.deepEqual(client.released, ['pooled']);
    assert.equal(isBackgroundLeader(), false);
    // A stopped watch reports nothing, and a late error does not crash.
    assert.doesNotThrow(() => client.emit('error', new Error('late')));

    const failing = new FakeLeaderClient();
    failing.unlockFails = true;
    await acquireBackgroundLeaderLock(poolOf(failing));
    await releaseBackgroundLeader();
    assert.equal(failing.released.length, 1);
    assert.ok(
        failing.released[0] instanceof Error,
        'a connection whose unlock failed is destroyed'
    );
    assert.equal(isBackgroundLeader(), false);
});
