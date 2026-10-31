// Not a test file: test/test-runner-flush.test.ts runs it in a test runner of
// its own. 400 quick tests that each log 2 KiB give the runner more to read
// than a pipe holds while the process is already finishing.
import { test } from 'node:test';

const line = 'x'.repeat(2048);

for (let i = 0; i < 400; i += 1) {
    test(`result ${i}`, () => {
        console.log(line);
    });
}
