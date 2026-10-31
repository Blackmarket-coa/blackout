import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The `test` script runs with --test-force-exit, which on its own lets a file's
// last results go unreported while the suite says fail 0 (see
// test/_setup/blocking-stdio.mjs). These tests hold the script to the preload
// that prevents it, and check that the preload does.

const packageDir = fileURLToPath(new URL('..', import.meta.url));
const preload = './test/_setup/blocking-stdio.mjs';
const fixture = './test/_fixtures/many-results.fixture.mjs';
const FIXTURE_TESTS = 400;

const testScript = (): string => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    return manifest.scripts.test as string;
};

const runFixture = () => {
    // A runner of its own: the outer runner's NODE_TEST_CONTEXT would make this
    // one report to it instead of printing its summary.
    const env = { ...process.env };
    delete env.NODE_OPTIONS;
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(
        process.execPath,
        ['--import', preload, '--test', '--test-force-exit', '--test-concurrency=1', fixture],
        { cwd: packageDir, encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 }
    );
    const count = (name: string) => {
        const match = result.stdout.match(new RegExp(`^# ${name} (\\d+)$`, 'm'));
        return match ? Number(match[1]) : undefined;
    };
    return { status: result.status, tests: count('tests'), pass: count('pass') };
};

test('the test script loads the stdio preload whenever it force-exits', () => {
    const script = testScript();
    if (!script.includes('--test-force-exit')) return;
    assert.ok(
        script.includes(`--import ${preload}`),
        `the test script force-exits without --import ${preload}`
    );
});

test('with the preload, a force-exited file reports every one of its tests', () => {
    for (let run = 1; run <= 3; run += 1) {
        assert.deepEqual(
            runFixture(),
            { status: 0, tests: FIXTURE_TESTS, pass: FIXTURE_TESTS },
            `run ${run}`
        );
    }
});
