/**
 * The background loops when the API runs them itself
 * (src/inProcessBackgroundLoops.ts), in memory mode with a stand-in leader
 * lock: a lost lock stops the loops and the API stays up, tries for the lock
 * again and runs the loops again once it has it. The advisory lock on a real
 * pool connection is covered by pg-pool-client-errors.integration.test.ts
 * (stand-in connections) and pg-pool-client-errors-postgres.integration.test.ts
 * (the API process against PostgreSQL).
 *
 * The last test here starts the API process itself (src/index.ts), in memory
 * mode, and sends it SIGTERM: its shutdown stops the loops before it waits
 * for anything.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer as createHttpServer } from 'node:http';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { generateTestJwtSecret } from './_fixtures/secrets';

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

// Until 2026-11-16 an API that did not get the lock at boot never tried again,
// so once the process holding it was gone the loops ran nowhere, unless a
// worker was on standby. It now stands by as it does after losing the lock.
test('an API that does not get the lock at boot keeps trying, and runs the loops once it has the lock', async (t) => {
    const lines = captureLogs(t);
    const { lock, leadership } = standInLock(false);
    const { loops, startLoops } = countedLoops();
    const inProcess = runBackgroundLoopsWhileLeader({ leadership, startLoops, retryMs: RETRY_MS });
    try {
        await waitFor(
            () => logged(lines, 'background_loops_skipped_not_leader').length === 1,
            'the boot attempt'
        );
        await waitFor(() => lock.attempts >= 3, 'the API to keep trying');
        assert.equal(loops.started, 0, 'no loop while another process holds the lock');

        lock.free = true;
        await waitFor(() => loops.started === 1, 'the loops to start once it has the lock');
        assert.equal(lock.watches, 1, 'the lock it took is watched');
        const attempts = lock.attempts;
        await sleep(RETRY_MS * 5);
        assert.equal(lock.attempts, attempts, 'no more attempts once it has the lock');
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

test('stop() during the boot attempt, which then fails, leaves no retries behind', async () => {
    let refuse!: (granted: boolean) => void;
    let attempts = 0;
    const { loops, startLoops } = countedLoops();
    const inProcess = runBackgroundLoopsWhileLeader({
        leadership: {
            tryAcquire: () => {
                attempts += 1;
                return new Promise<boolean>((resolve) => {
                    refuse = resolve;
                });
            },
            watch: () => () => undefined,
        },
        startLoops,
        retryMs: RETRY_MS,
    });
    const stopping = inProcess.stop();
    refuse(false);
    await stopping;

    await sleep(RETRY_MS * 6);
    assert.equal(attempts, 1, 'no attempt after stop()');
    assert.equal(loops.started, 0);
});

/**
 * A port nothing listens on right now. The test needs the port before the API
 * starts. With PORT=0 the API would listen on a port the OS picks: outside a
 * production boot its env check only warns about the value.
 */
const freePort = async (): Promise<number> => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1');
    await once(probe, 'listening');
    const { port } = probe.address() as net.AddressInfo;
    probe.close();
    await once(probe, 'close');
    return port;
};

test(
    'the API process stops its loops when SIGTERM arrives, before it waits for anything: no tick starts while a request in flight holds the shutdown open',
    { skip: process.platform === 'win32' ? 'POSIX signals' : false, timeout: 120_000 },
    async (t) => {
        // A loop whose ticks show from outside: the Owncast metrics poll asks
        // the origin for /api/status once per tick. With no analytics
        // warehouse configured it does nothing more.
        const polls: number[] = [];
        const owncast = createHttpServer((req, res) => {
            if (req.url === '/api/status') polls.push(Date.now());
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end('{"online":false,"viewerCount":0}');
        });
        owncast.listen(0, '127.0.0.1');
        await once(owncast, 'listening');
        t.after(() => {
            owncast.closeAllConnections();
            owncast.close();
        });

        const port = await freePort();
        const env: NodeJS.ProcessEnv = {
            ...process.env,
            // Not `test`, or the API does not listen (src/index.ts shouldListen).
            NODE_ENV: 'development',
            // In memory mode the one process is always the leader.
            BLACKOUT_DB_MODE: 'memory',
            PORT: String(port),
            JWT_SECRET_PRIMARY: generateTestJwtSecret(),
            BLACKOUT_OWNCAST_METRICS: '1',
            BLACKOUT_OWNCAST_METRICS_INTERVAL_SECONDS: '1',
            OWNCAST_BASE_URL: `http://127.0.0.1:${(owncast.address() as net.AddressInfo).port}`,
            // Past this the shutdown exits whatever it is waiting for.
            SHUTDOWN_TIMEOUT_MS: '60000',
        };
        for (const key of [
            // Set, the API leaves the loops to a worker and runs none.
            'BLACKOUT_BACKGROUND_WORKERS_DISABLED',
            'BLACKOUT_API_SKIP_LISTEN',
            'DATABASE_URL',
            'REDIS_URL',
        ]) {
            delete env[key];
        }
        const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
            cwd: fileURLToPath(new URL('../', import.meta.url)),
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        t.after(() => {
            if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        });
        let output = '';
        child.stdout.on('data', (d) => (output += d));
        child.stderr.on('data', (d) => (output += d));
        const exited = new Promise<number | null>((r) => child.once('exit', (code) => r(code)));
        const logged = (msg: string): boolean => output.includes(`"msg":"${msg}"`);

        await waitFor(
            () =>
                (logged('blackout-server listening') &&
                    logged('background_loops_started') &&
                    polls.length >= 2) ||
                child.exitCode !== null,
            'the API to listen and its Owncast loop to tick twice',
            90_000
        );
        assert.equal(child.exitCode, null, `the API exited early:\n${output}`);

        // A request in flight: its headers have arrived, its body has not.
        // The server's close() waits for it, so the shutdown stays where it
        // waits for the server to close, and the process stays up. Without
        // that the process would be gone before the next tick came due, and
        // this test would pass whatever the shutdown did about the loops.
        const pending = net.connect(port, '127.0.0.1');
        t.after(() => pending.destroy());
        pending.on('error', () => undefined);
        await once(pending, 'connect');
        pending.write(
            'POST /v1/auth/register HTTP/1.1\r\nHost: 127.0.0.1\r\n' +
                'Content-Type: application/json\r\nContent-Length: 64\r\n\r\n{'
        );
        await sleep(300);

        child.kill('SIGTERM');
        await waitFor(
            () => logged('shutdown_signal_received') || child.exitCode !== null,
            'the API to take the signal',
            10_000
        );
        const atSignal = polls.length;
        // Five of the loop's intervals.
        await sleep(5_000);
        assert.equal(
            child.exitCode,
            null,
            `the request in flight no longer holds the shutdown open:\n${output}`
        );
        // One poll may still arrive: a tick that came due just before the
        // signal. Loops left running would have polled about five times.
        const afterSignal = polls.length - atSignal;
        assert.ok(
            afterSignal <= 1,
            `no tick started after SIGTERM, with the process still up (${afterSignal} polls)`
        );

        // The request ends, the server closes, and the shutdown finishes.
        pending.destroy();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const code = await Promise.race([
            exited,
            new Promise<'still running'>(
                (r) => (timer = setTimeout(() => r('still running'), 30_000))
            ),
        ]);
        clearTimeout(timer);
        assert.equal(code, 0, output);
        assert.ok(logged('runtime_store_drained'), 'the store was drained before the exit');
    }
);
