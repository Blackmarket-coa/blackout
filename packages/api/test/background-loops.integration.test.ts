/**
 * startBackgroundLoops hands back what it started, so the background worker can
 * stop it on shutdown, and the tick registry lets that shutdown wait for work
 * already running. Memory mode, default env: the loops that are on by default
 * are the scheduled-message and creator-content dispatchers, the external-reply
 * retention sweep and the dead-man sweep.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = 'memory';

const { startBackgroundLoops } = await import('../src/backgroundLoops');
const { backgroundTicksInFlight, trackBackgroundTick, waitForBackgroundTicks } = await import(
    '../src/services/backgroundTicks'
);
const { isScheduledMessageDispatcherRunning } = await import(
    '../src/services/scheduledMessageDispatcher'
);
const { isScheduledContentDispatcherRunning } = await import(
    '../src/services/scheduledContentDispatcher'
);
const { isCoalitionExternalRetentionSchedulerRunning } = await import(
    '../src/services/coalitionExternalRetentionScheduler'
);
const { isDeadmanSweepSchedulerRunning } = await import('../src/services/deadmanSweepScheduler');

const running = () => ({
    scheduledMessages: isScheduledMessageDispatcherRunning(),
    scheduledContent: isScheduledContentDispatcherRunning(),
    externalRetention: isCoalitionExternalRetentionSchedulerRunning(),
    deadmanSweep: isDeadmanSweepSchedulerRunning(),
});
const all = (value: boolean) => ({
    scheduledMessages: value,
    scheduledContent: value,
    externalRetention: value,
    deadmanSweep: value,
});

test('the loops handle starts the default loops and stops every one of them', async () => {
    const loops = startBackgroundLoops();
    await loops.ready;
    assert.deepEqual(running(), all(true));
    loops.stop();
    assert.deepEqual(running(), all(false));
});

test('a stop that lands while the loop modules load starts nothing', async () => {
    const loops = startBackgroundLoops();
    loops.stop();
    await loops.ready;
    assert.deepEqual(running(), all(false));
});

test('waiting for ticks returns once they settle, failures included, and gives up at its bound', async () => {
    assert.equal(backgroundTicksInFlight(), 0);
    assert.equal(await waitForBackgroundTicks(10), true, 'nothing in flight');

    let settled = false;
    void trackBackgroundTick(
        new Promise<void>((resolve) =>
            setTimeout(() => {
                settled = true;
                resolve();
            }, 50)
        )
    );
    void trackBackgroundTick(Promise.reject(new Error('a failed tick'))).catch(() => undefined);
    assert.equal(backgroundTicksInFlight(), 2);
    assert.equal(await waitForBackgroundTicks(5000), true);
    assert.ok(settled);
    assert.equal(backgroundTicksInFlight(), 0);

    let finish!: () => void;
    void trackBackgroundTick(
        new Promise<void>((resolve) => {
            finish = resolve;
        })
    );
    const started = Date.now();
    assert.equal(await waitForBackgroundTicks(60), false, 'a tick that will not finish in time');
    assert.ok(Date.now() - started >= 50, 'it waited for its bound');
    assert.equal(backgroundTicksInFlight(), 1);
    finish();
    assert.equal(await waitForBackgroundTicks(1000), true);
});
