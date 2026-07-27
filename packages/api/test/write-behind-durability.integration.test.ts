import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = 'memory';

const { WriteBehindQueue } = await import('../src/db/writeBehindQueue');
const { dbWriteBehindFailuresTotal } = await import('../src/telemetry/metrics');
const { flushRuntimeStoreWrites } = await import('../src/db/store');

test('flushRuntimeStoreWrites resolves (no-op) outside postgres mode', async () => {
    // Must neither hang nor throw when there is no write-behind queue.
    await flushRuntimeStoreWrites();
    assert.ok(true);
});

test('write-behind permanent failures are counted, not silently swallowed (H3)', async () => {
    // A pool whose every connection attempt fails — both the initial try and the
    // single retry — so the op permanently fails.
    const failingPool = {
        connect: async () => {
            throw new Error('pg unavailable');
        },
        end: async () => {},
    };
    const plans = new Map([['widgets', { descriptor: { conflictColumns: ['id'] } }]]);
    const queue = new WriteBehindQueue(
        failingPool as never,
        plans as never,
        (() => new Map()) as never
    );

    queue.enqueueUpsert('widgets', { id: 'row-1' });
    // drain() must resolve even though the write permanently failed — the queue
    // isolates failures from the event loop rather than crashing the process.
    await queue.drain();

    // ...but the failure must be observable via the metric, so alerting can catch
    // the data-loss condition the audit flagged (previously it was only logged).
    const exposed = dbWriteBehindFailuresTotal.expose();
    assert.match(exposed, /db_write_behind_failures_total\{[^}]*map="widgets"[^}]*\}\s+[1-9]/);
});
