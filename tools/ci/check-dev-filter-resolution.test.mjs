import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const result = spawnSync(process.execPath, ['tools/ci/check-dev-filter-resolution.mjs'], {
  cwd: repoRoot,
  encoding: 'utf8',
});

assert.equal(result.status, 0, `Expected dev filter resolution check to pass. stderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
assert.match(result.stdout, /Dev filter resolution check passed\./);
