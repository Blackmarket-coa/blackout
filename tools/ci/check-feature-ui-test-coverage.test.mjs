import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const scriptPath = path.join(repoRoot, 'tools/ci/check-feature-ui-test-coverage.mjs');

function runScript(cwd) {
  return spawnSync('node', [scriptPath], { cwd, encoding: 'utf8' });
}

function initFixture({ registryRows, tests }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-ui-budget-'));
  fs.mkdirSync(path.join(dir, 'docs/features'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'legacy/blackout-web/tests/integration'), { recursive: true });

  fs.writeFileSync(path.join(dir, 'docs/features/feature_registry.json'), JSON.stringify(registryRows, null, 2));
  fs.writeFileSync(path.join(dir, 'legacy/blackout-web/tests/integration/app.test.ts'), tests);

  return dir;
}

test('passes when each feature has ui coverage token', () => {
  const dir = initFixture({
    registryRows: [
      { id: 'a', uiEntry: 'settings_toggle:feature-a' },
      { id: 'b', uiEntry: 'widget_panel:feature-b' },
    ],
    tests: 'expect("feature-a");\nexpect("feature-b-unavailable");',
  });

  const res = runScript(dir);
  assert.equal(res.status, 0, res.stderr || res.stdout);
});

test('fails when a feature has no ui coverage token', () => {
  const dir = initFixture({
    registryRows: [{ id: 'a', uiEntry: 'settings_toggle:feature-a' }],
    tests: 'expect("other-test-id");',
  });

  const res = runScript(dir);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /missing UI integration coverage/);
});
