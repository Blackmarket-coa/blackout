/**
 * The background worker's lifecycle (src/backgroundWorker.ts) in memory mode:
 * it leads and starts the loops, stands by while another process holds the
 * lock, gives the loops up when its lock is lost, and drains on shutdown. The
 * leader lock is a stand-in here; the advisory lock itself is covered by
 * background-leader.integration.test.ts, and the postgres boot by
 * background-worker-postgres.integration.test.ts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = 'memory';

const { createBackgroundWorker, workerRuntimeProblems } = await import('../src/backgroundWorker');
const { backgroundTicksInFlight, trackBackgroundTick } = await import(
    '../src/services/backgroundTicks'
);
const { isScheduledMessageDispatcherRunning } = await import(
    '../src/services/scheduledMessageDispatcher'
);
const { isDeadmanSweepSchedulerRunning } = await import('../src/services/deadmanSweepScheduler');

type Leadership = NonNullable<Parameters<typeof createBackgroundWorker>[0]['leadership']>;

const heartbeatPath = (): string =>
    join(mkdtempSync(join(tmpdir(), 'blackout-worker-')), 'heartbeat');

const loopsRunning = (): boolean =>
    isScheduledMessageDispatcherRunning() && isDeadmanSweepSchedulerRunning();
const loopsStopped = (): boolean =>
    !isScheduledMessageDispatcherRunning() && !isDeadmanSweepSchedulerRunning();

async function waitFor(condition: () => boolean, label: string, timeoutMs = 3000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
        if (Date.now() > deadline) assert.fail(`timed out waiting for: ${label}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

/** A lock stand-in that records what the worker asks of it. */
function standInLock(initiallyFree = true) {
    const lock = {
        free: initiallyFree,
        attempts: 0,
        releases: 0,
        lose: undefined as ((reason: string) => void) | undefined,
    };
    const leadership: Leadership = {
        tryAcquire: async () => {
            lock.attempts += 1;
            return lock.free;
        },
        watch: (onLost) => {
            lock.lose = onLost;
            return () => {
                lock.lose = undefined;
            };
        },
        release: async () => {
            lock.releases += 1;
        },
    };
    return { lock, leadership };
}

test('a leader starts the loops and writes its heartbeat; on SIGTERM a running tick finishes before it exits 0', async () => {
    const exits: number[] = [];
    const path = heartbeatPath();
    const { lock, leadership } = standInLock();
    const worker = createBackgroundWorker({
        heartbeatPath: path,
        exit: (code) => exits.push(code),
        leadership,
    });
    await worker.start();
    assert.equal(worker.role(), 'leader');
    assert.ok(loopsRunning(), 'the dispatcher and the dead-man sweep run');
    assert.match(readFileSync(path, 'utf8'), /^\d+\n$/, 'the heartbeat is written');

    let tickFinished = false;
    void trackBackgroundTick(
        new Promise<void>((resolve) =>
            setTimeout(() => {
                tickFinished = true;
                resolve();
            }, 150)
        )
    );
    await worker.shutdown('SIGTERM');
    assert.ok(tickFinished, 'the in-flight tick finished before the worker exited');
    assert.deepEqual(exits, [0]);
    assert.equal(lock.releases, 1, 'the lock is released');
    assert.ok(loopsStopped(), 'no loop is left running');
    assert.equal(worker.role(), 'stopping');
});

test('a worker that does not get the lock stands by, runs nothing, and takes over once it frees', async () => {
    const exits: number[] = [];
    const { lock, leadership } = standInLock(false);
    const path = heartbeatPath();
    const worker = createBackgroundWorker({
        heartbeatPath: path,
        exit: (code) => exits.push(code),
        leadership,
        standbyRetryMs: 20,
    });
    await worker.start();
    assert.equal(worker.role(), 'standby');
    assert.ok(loopsStopped(), 'a standby runs no loop');
    assert.ok(existsSync(path), 'a standby is healthy: it has loaded the store');
    await waitFor(() => lock.attempts >= 3, 'it keeps trying for the lock');
    assert.ok(loopsStopped());

    lock.free = true;
    await waitFor(() => worker.role() === 'leader' && loopsRunning(), 'it takes over');
    const attemptsWhenLeading = lock.attempts;
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(lock.attempts, attemptsWhenLeading, 'a leader stops asking');

    await worker.shutdown('SIGTERM');
    assert.deepEqual(exits, [0]);
    assert.ok(loopsStopped());
});

test('a leader that loses its lock stops its loops and exits 1', async () => {
    const exits: number[] = [];
    const { lock, leadership } = standInLock();
    const worker = createBackgroundWorker({
        heartbeatPath: heartbeatPath(),
        exit: (code) => exits.push(code),
        leadership,
    });
    await worker.start();
    assert.ok(loopsRunning());
    assert.ok(lock.lose, 'the worker watches the lock it holds');

    lock.lose('connection_error');
    await waitFor(() => exits.length > 0, 'the worker to exit');
    assert.deepEqual(exits, [1], 'non-zero, so the restart policy boots it again');
    assert.ok(loopsStopped(), 'no loop runs without the lock');
    assert.equal(lock.lose, undefined, 'the watch was stopped');
});

test('a signal that arrives while the worker is still taking the lock starts nothing', async () => {
    const exits: number[] = [];
    let grant!: (granted: boolean) => void;
    let releases = 0;
    const worker = createBackgroundWorker({
        heartbeatPath: heartbeatPath(),
        exit: (code) => exits.push(code),
        leadership: {
            tryAcquire: () =>
                new Promise<boolean>((resolve) => {
                    grant = resolve;
                }),
            watch: () => assert.fail('a stopping worker must not start watching'),
            release: async () => {
                releases += 1;
            },
        },
    });
    const started = worker.start();
    const stopping = worker.shutdown('SIGTERM');
    grant(true);
    await started;
    await stopping;
    assert.deepEqual(exits, [0]);
    assert.ok(loopsStopped(), 'no loop ever started');
    assert.equal(releases, 1, 'the lock it was granted is released');
});

test('shutdown waits for running ticks only up to half its budget, and is forced past the whole', async () => {
    const exits: number[] = [];
    const worker = createBackgroundWorker({
        heartbeatPath: heartbeatPath(),
        exit: (code) => exits.push(code),
        leadership: standInLock().leadership,
        shutdownTimeoutMs: 200,
    });
    await worker.start();
    let finishTick!: () => void;
    void trackBackgroundTick(
        new Promise<void>((resolve) => {
            finishTick = resolve;
        })
    );
    const startedAt = Date.now();
    await worker.shutdown('SIGTERM');
    const took = Date.now() - startedAt;
    assert.ok(took >= 90 && took < 1000, `gave up on the tick after ~100 ms (took ${took} ms)`);
    assert.deepEqual(exits, [0]);
    finishTick();
    await waitFor(() => backgroundTicksInFlight() === 0, 'the tick to settle');

    // A drain that never finishes: the hard bound exits 1.
    const forcedExits: number[] = [];
    const stuck = createBackgroundWorker({
        heartbeatPath: heartbeatPath(),
        exit: (code) => forcedExits.push(code),
        leadership: { ...standInLock().leadership, release: () => new Promise<void>(() => {}) },
        shutdownTimeoutMs: 100,
    });
    await stuck.start();
    void stuck.shutdown('SIGTERM');
    await waitFor(() => forcedExits.length > 0, 'the forced exit');
    assert.deepEqual(forcedExits, [1]);
    assert.ok(loopsStopped());
});

test('the worker refuses production without the shared store, the log salt or the change feed', async () => {
    assert.deepEqual(workerRuntimeProblems({ NODE_ENV: 'test' }, 'memory'), []);
    assert.deepEqual(
        workerRuntimeProblems({ NODE_ENV: 'production', LOG_HASH_SALT: 'salt' }, 'postgres'),
        []
    );
    const [memoryInProduction] = workerRuntimeProblems(
        { NODE_ENV: 'production', LOG_HASH_SALT: 'salt' },
        'memory'
    );
    assert.match(memoryInProduction, /BLACKOUT_DB_MODE=memory is not permitted/);
    const [noSalt] = workerRuntimeProblems({ NODE_ENV: 'production' }, 'postgres');
    assert.match(noSalt, /LOG_HASH_SALT/);
    const [noFeed] = workerRuntimeProblems({ BLACKOUT_DB_PG_NOTIFY: '0' }, 'postgres');
    assert.match(noFeed, /BLACKOUT_DB_PG_NOTIFY=0/);

    // And start() acts on it before it loads, leads or reports healthy.
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const path = heartbeatPath();
    const { lock, leadership } = standInLock();
    try {
        const worker = createBackgroundWorker({ heartbeatPath: path, exit: () => {}, leadership });
        await assert.rejects(worker.start(), /BLACKOUT_DB_MODE=memory is not permitted/);
    } finally {
        process.env.NODE_ENV = previous;
    }
    assert.equal(lock.attempts, 0, 'never tried for the lock');
    assert.ok(!existsSync(path), 'never wrote a heartbeat');
    assert.ok(loopsStopped());
});
