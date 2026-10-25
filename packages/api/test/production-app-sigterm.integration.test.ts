/**
 * bin/start-app hands `docker stop`'s SIGTERM to the API itself.
 *
 * Runs deploy/docker/backend/bin/start-app from the repository root, as the
 * image runs it from /app, with the API in memory mode on a free port. The
 * process it starts must be the API: the script execs node, which replaces
 * it. A SIGTERM sent to that process must run the API's shutdown through its
 * store drain and end in exit 0. In memory mode the drain has nothing to
 * flush, so this shows that it ran, not a Postgres write.
 *
 * When start-app ran `pnpm --filter @blackout/api start`, the process it left
 * was pnpm. The signal then had to pass pnpm's script shell and the tsx CLI:
 * dash, CI's /bin/sh, does not exec the command, so it stopped there and pnpm
 * died of it. See production-compose-shutdown for the container side.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer, type AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { generateTestJwtSecret } from './_fixtures/secrets';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

interface LogLine {
    msg?: string;
}

/** A port nothing listens on right now (the API's env check refuses PORT=0). */
const freePort = (): Promise<number> =>
    new Promise((resolve, reject) => {
        const probe = createServer();
        probe.once('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const { port } = probe.address() as AddressInfo;
            probe.close(() => resolve(port));
        });
    });

test(
    'start-app execs the API, which drains on SIGTERM and exits 0',
    { skip: process.platform === 'win32' ? 'POSIX signals and /bin/sh' : false, timeout: 120_000 },
    async (t) => {
        const port = await freePort();
        const env: NodeJS.ProcessEnv = {
            ...process.env,
            // Not `test`, or the API does not listen (src/index.ts shouldListen).
            NODE_ENV: 'development',
            BLACKOUT_DB_MODE: 'memory',
            PORT: String(port),
            BLACKOUT_BACKGROUND_WORKERS_DISABLED: '1',
            JWT_SECRET_PRIMARY: generateTestJwtSecret(),
        };
        for (const key of [
            'BLACKOUT_API_SKIP_LISTEN',
            'APP_PORT',
            'DATABASE_URL',
            'DB_HOST',
            'REDIS_URL',
            'CACHE_PASSWORD',
            'CACHE_PASSWORD_FILE',
        ]) {
            delete env[key];
        }

        // Its own process group, so cleanup reaches anything it left behind.
        const child = spawn('./deploy/docker/backend/bin/start-app', [], {
            cwd: repoRoot,
            env,
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        t.after(() => {
            try {
                process.kill(-(child.pid as number), 'SIGKILL');
            } catch {
                // Already gone.
            }
        });

        const messages: string[] = [];
        const output: string[] = [];
        let onListening: () => void = () => undefined;
        const listening = new Promise<void>((resolve) => {
            onListening = resolve;
        });
        let partial = '';
        const consume = (chunk: Buffer): void => {
            partial += chunk.toString('utf8');
            const lines = partial.split('\n');
            partial = lines.pop() ?? '';
            for (const line of lines) {
                output.push(line);
                if (!line.startsWith('{')) continue;
                let parsed: LogLine;
                try {
                    parsed = JSON.parse(line) as LogLine;
                } catch {
                    continue;
                }
                if (!parsed.msg) continue;
                messages.push(parsed.msg);
                if (parsed.msg === 'blackout-server listening') onListening();
            }
        };
        child.stdout.on('data', consume);
        child.stderr.on('data', consume);
        const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
            (resolve) => child.once('exit', (code, signal) => resolve({ code, signal }))
        );

        const within = <T>(promise: Promise<T>, ms: number, what: string): Promise<T> =>
            Promise.race([
                promise,
                new Promise<T>((_, reject) =>
                    setTimeout(
                        () =>
                            reject(
                                new Error(`${what} within ${ms} ms; output:\n${output.join('\n')}`)
                            ),
                        ms
                    ).unref()
                ),
            ]);

        await within(
            Promise.race([
                listening,
                exited.then(({ code, signal }) => {
                    throw new Error(
                        `start-app exited (${code ?? signal}) before listening:\n${output.join(
                            '\n'
                        )}`
                    );
                }),
            ]),
            90_000,
            'the API listening'
        );

        // The process start-app started is now node running the API: the
        // script, and the shell running it, were replaced by exec.
        const args = execFileSync('ps', ['-o', 'args=', '-p', String(child.pid)], {
            encoding: 'utf8',
        }).trim();
        assert.equal(args, 'node --import tsx src/index.ts');
        const health = await fetch(`http://127.0.0.1:${port}/health`);
        assert.equal(health.status, 200);

        assert.ok(child.kill('SIGTERM'));
        const { code, signal } = await within(exited, 20_000, 'exit after SIGTERM');
        assert.deepEqual({ code, signal }, { code: 0, signal: null });
        const received = messages.indexOf('shutdown_signal_received');
        const drained = messages.indexOf('runtime_store_drained');
        assert.ok(received >= 0, 'the API received the SIGTERM');
        assert.ok(drained > received, 'and drained the store after it');
        assert.equal(messages.includes('shutdown_forced_after_timeout'), false);
    }
);
