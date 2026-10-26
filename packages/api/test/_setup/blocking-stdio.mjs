// Loaded with --import by the `test` script, so it runs in the test runner and
// in every file's process (the runner hands its execArgv to each one).
//
// That script runs with --test-force-exit, which ends a file's process as soon
// as its tests finish. Each file reports its results to the runner over a pipe,
// and on Linux a pipe write is asynchronous: whatever is still queued when the
// process exits is lost. The runner then never hears of the file's last tests,
// counts no failure for them, and the suite reports fail 0. Blocking writes are
// finished before the next line runs, so nothing is left queued at exit.
// test/test-runner-flush.test.ts holds this in place.
for (const stream of [process.stdout, process.stderr]) {
    stream?._handle?.setBlocking?.(true);
}
