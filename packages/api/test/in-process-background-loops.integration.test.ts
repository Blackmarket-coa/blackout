/**
 * The background loops when the API runs them itself
 * (src/inProcessBackgroundLoops.ts), in memory mode with a stand-in leader
 * lock: a lost lock stops the loops and the API stays up, tries for the lock
 * again and runs the loops again once it has it. The advisory lock on a real
 * pool connection is covered by pg-pool-client-errors.integration.test.ts
 * (stand-in connections) and pg-pool-client-errors-postgres.integration.test.ts
 * (the API process against PostgreSQL).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = 'memory';

const { runBackgroundLoopsWhileLeader } = await import('../src/inProcessBackgroundLoops');
const { trackBackgroundTick } = await import('../src/services/backgroundTicks');
const { isScheduledMessageDispatcherRunning } = await import(
    '../src/services/scheduledMessageDispatcher'
);
const { isDeadmanSweepSchedulerRunning } = await import('../src/services/deadmanSweepScheduler');

type Leadership = NonNullable<Parameters<typeof runBackgroundLoopsWhileLeader>[0]>['leadership'];

const RETRY_MS = 20;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(condition: () => boolean, label: string, timeoutMs = 3000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
        if (Date.now() > deadline) assert.fail(`timed out waiting for: ${label}`);
        await sleep(5);
    }
}

const loopsRunning = (): boolean =>
    isScheduledMessageDispatcherRunning() && isDeadmanSweepSchedulerRunning();
const loopsStopped = (): boolean =>
    !isScheduledMessageDispatcherRunning() && !isDeadmanSweepSchedulerRunning();

/** A lock stand-in that records what the API asks of it. */
function standInLock(initiallyFree = true) {
    const lock = {
        free: initiallyFree,
        attempts: 0,
        watches: 0,
        lose: undefined as ((reason: string) => void) | undefined,
    };
    const leadership: Leadership = {
        tryAcquire: async () => {
            lock.attempts += 1;
            return lock.free;
        },
        watch: (onLost) => {
            lock.watches += 1;
            lock.lose = onLost;
            return () => {
                lock.lose = undefined;
            };
        },
    };
    return { lock, leadership };
}

/** Loops that only count their starts and stops. */
function countedLoops() {
    const loops = { started: 0, stopped: 0 };
    const startLoops = () => {
        loops.started += 1;
        return {
            ready: Promise.resolve(),
            stop: () => {
                loops.stopped += 1;
            },
        };
    };
    return { loops, startLoops };
}

/** console.warn and console.info lines until the test ends. */
const captureLogs = (t: { after(fn: () => void): void }): string[] => {
    const lines: string[] = [];
    const { warn, info } = console;
    console.warn = (line: unknown) => lines.push(String(line));
    console.info = (line: unknown) => lines.push(String(line));
    t.after(() => {
        console.warn = warn;
        console.info = info;
    });
    return lines;
};
const logged = (lines: string[], msg: string): Array<Record<string, unknown>> =>
    lines
        .filter((l) => l.startsWith('{'))
        .map((l) => JSON.parse(l) as Record<string, unknown>)
        .filter((e) => e.msg === msg);

test('a lost lock stops the loops; the API stays up, keeps trying, and runs the loops again once it has the lock', async (t) => {
    const lines = captureLogs(t);
    const { lock, leadership } = standInLock();
    const inProcess = runBackgroundLoopsWhileLeader({ leadership, retryMs: RETRY_MS });
    t.after(() => inProcess.stop());
    await waitFor(loopsRunning, 'the loops to start');
    assert.equal(lock.watches, 1, 'the API watches the lock it holds');

    // Another process takes the lock first, so the first retries do not get it.
    lock.free = false;
    lock.lose?.('connection_error');
    assert.ok(loopsStopped(), 'no loop runs without the lock');
    assert.equal(
        logged(lines, 'background_loops_stopped_leader_lost')[0]?.reason,
        'connection_error'
    );
    await waitFor(() => lock.attempts >= 4, 'the API to keep trying');
    assert.ok(loopsStopped(), 'still none while another process holds the lock');

    lock.free = true;
    await waitFor(loopsRunning, 'the loops to start again');
    assert.equal(lock.watches, 2, 'the new lock is watched');
    const attempts = lock.attempts;
    await sleep(RETRY_MS * 5);
    assert.equal(lock.attempts, attempts, 'no more attempts once it has the lock');

    await inProcess.stop();
    assert.ok(loopsStopped());
    assert.equal(lock.lose, undefined, 'the watch was stopped');
});

test('the API does not try for the lock again while a tick from before the loss is still running', async () => {
    const { lock, leadership } = standInLock();
    const { loops, startLoops } = countedLoops();
    const inProcess = runBackgroundLoopsWhileLeader({ leadership, startLoops, retryMs: RETRY_MS });
    try {
        await waitFor(() => loops.started === 1, 'the loops to start');
        let finish!: () => void;
        void trackBackgroundTick(new Promise<void>((resolve) => (finish = resolve)));

        lock.lose?.('lock_not_held');
        assert.equal(loops.stopped, 1);
        await sleep(RETRY_MS * 6);
        assert.equal(lock.attempts, 1, 'no attempt while that tick runs');

        finish();
        await waitFor(() => loops.started === 2, 'the loops to start again once it has finished');
        assert.equal(lock.attempts, 2);
    } finally {
        await inProcess.stop();
    }
});

test('an API that does not get the lock at boot does not try again', async (t) => {
    const lines = captureLogs(t);
    const { lock, leadership } = standInLock(false);
    const { loops, startLoops } = countedLoops();
    const inProcess = runBackgroundLoopsWhileLeader({ leadership, startLoops, retryMs: RETRY_MS });
    try {
        await waitFor(
            () => logged(lines, 'background_loops_skipped_not_leader').length === 1,
            'the boot attempt'
        );
        lock.free = true;
        await sleep(RETRY_MS * 6);
        assert.equal(lock.attempts, 1);
        assert.equal(loops.started, 0);
    } finally {
        await inProcess.stop();
    }
});

test('stop() while standing by ends the retries', async () => {
    const { lock, leadership } = standInLock();
    const { loops, startLoops } = countedLoops();
    const inProcess = runBackgroundLoopsWhileLeader({ leadership, startLoops, retryMs: RETRY_MS });
    await waitFor(() => loops.started === 1, 'the loops to start');
    lock.free = false;
    lock.lose?.('connection_ended');
    await waitFor(() => lock.attempts >= 2, 'a retry');

    await inProcess.stop();
    const attempts = lock.attempts;
    lock.free = true;
    await sleep(RETRY_MS * 6);
    assert.equal(lock.attempts, attempts, 'no attempt after stop()');
    assert.equal(loops.started, 1, 'no loop after stop()');
});

test('stop() during a lock attempt waits for it and starts nothing', async () => {
    let grant!: (granted: boolean) => void;
    let watches = 0;
    const { loops, startLoops } = countedLoops();
    const inProcess = runBackgroundLoopsWhileLeader({
        leadership: {
            tryAcquire: () =>
                new Promise<boolean>((resolve) => {
                    grant = resolve;
                }),
            watch: () => {
                watches += 1;
                return () => undefined;
            },
        },
        startLoops,
        retryMs: RETRY_MS,
    });
    let stopped = false;
    const stopping = inProcess.stop().then(() => (stopped = true));
    await sleep(RETRY_MS);
    assert.equal(stopped, false, 'stop() waits for the attempt under way');

    // Granted after the stop: the shutdown's releaseBackgroundLeader gives it back.
    grant(true);
    await stopping;
    assert.equal(watches, 0, 'nothing watched');
    assert.equal(loops.started, 0, 'no loop started');
});
