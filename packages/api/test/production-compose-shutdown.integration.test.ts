/**
 * `docker stop` must reach the API in the production `app` containers, and
 * leave the API's drain time to finish.
 *
 * The API shuts down on SIGTERM (src/index.ts: it stops accepting, and once
 * its connections have closed it flushes the write-behind store and exits 0).
 * Docker signals PID 1 only, and PID 1 never gets a signal it has no handler
 * for. `app` ran `/bin/sh -lc './bin/migrate && ./bin/start-app'`, and
 * start-app ran `pnpm --filter @blackout/api start`, so the signal had to pass
 * the shell, pnpm, pnpm's script shell and the tsx CLI. Under dash it stopped
 * at the first shell, and Docker SIGKILLed the API 10 s later. Under busybox
 * ash, the image's /bin/sh, the tsx CLI passed it on, then SIGKILLed the API
 * when the API had not acknowledged it within 30 ms, as an API busy with
 * requests does not. These read the compose files, the image's CMD and
 * start-app; production-app-sigterm runs start-app and signals it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const repoRoot = new URL('../../../', import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, repoRoot), 'utf8');

interface ComposeService {
    command?: string | string[];
    stop_grace_period?: string;
}

const service = (file: string, name: string): ComposeService => {
    const compose = parse(read(`deploy/docker/production/${file}`)) as {
        services: Record<string, ComposeService>;
    };
    const found = compose.services[name];
    assert.ok(found, `${file} defines ${name}`);
    return found;
};

/** A compose duration ("20s", "1m30s", "1500ms") in milliseconds. */
const durationMs = (value: string): number => {
    const unitMs: Record<string, number> = { h: 3_600_000, m: 60_000, s: 1000, ms: 1 };
    const parts = [...value.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)];
    assert.equal(parts.map((p) => p[0]).join(''), value, `a duration compose accepts: ${value}`);
    return parts.reduce((total, [, amount, unit]) => total + Number(amount) * unitMs[unit], 0);
};

/** SHUTDOWN_TIMEOUT_MS's default in src/index.ts: the API's whole drain budget. */
const apiShutdownBudgetMs = (): number => {
    const match = read('packages/api/src/index.ts').match(
        /SHUTDOWN_TIMEOUT_MS = parseInt\(process\.env\.SHUTDOWN_TIMEOUT_MS \?\? '(\d+)', 10\)/
    );
    assert.ok(match, 'src/index.ts reads SHUTDOWN_TIMEOUT_MS with a default');
    return Number(match[1]);
};

test('the app command runs the migrations, then execs start-app in place of the shell', () => {
    // `exec`, not a last command the shell may or may not exec itself:
    // busybox ash does, dash does not, and then /bin/sh stays PID 1.
    assert.deepEqual(service('docker-compose.yml', 'app').command, [
        '/bin/sh',
        '-lc',
        './bin/migrate && exec ./bin/start-app',
    ]);
});

test("start-app, which app_canary runs as the image CMD, execs node on the API's start entry", () => {
    // The canary overrides no command, so the image's exec-form CMD runs.
    assert.equal(service('docker-compose.canary.yml', 'app_canary').command, undefined);
    const cmd = read('apps/blackout-server/Dockerfile').match(/^CMD (.+)$/m);
    assert.ok(cmd, 'the backend Dockerfile sets a CMD');
    assert.deepEqual(JSON.parse(cmd[1]), ['./bin/start-app']);

    // Not pnpm: start-app execs node itself, on the file the package's own
    // start script runs.
    const { start } = (
        JSON.parse(read('packages/api/package.json')) as { scripts: Record<string, string> }
    ).scripts;
    const entry = start.match(/^tsx (\S+)$/)?.[1];
    assert.ok(entry, `the API's start script runs one file through tsx: ${start}`);
    const commands = read('deploy/docker/backend/bin/start-app')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '' && !line.startsWith('#'));
    assert.deepEqual(commands.slice(-2), ['cd packages/api', `exec node --import tsx ${entry}`]);
});

test('app and app_canary give the API twice its drain budget before Docker SIGKILLs it', () => {
    const budgetMs = apiShutdownBudgetMs();
    for (const [file, name] of [
        ['docker-compose.yml', 'app'],
        ['docker-compose.canary.yml', 'app_canary'],
    ]) {
        const grace = service(file, name).stop_grace_period;
        // Without it Docker waits 10 s, the API's whole default budget.
        assert.ok(grace, `${file} sets a stop_grace_period for ${name}`);
        assert.ok(
            durationMs(grace) >= 2 * budgetMs,
            `${name}: stop_grace_period ${grace} is at least twice SHUTDOWN_TIMEOUT_MS's ${budgetMs} ms`
        );
    }
});
