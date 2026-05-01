import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const scriptPath = path.join(repoRoot, 'tools/ci/check-preset-complete-features.mjs');

function fixture({ registry, tests }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preset-complete-'));
  fs.mkdirSync(path.join(dir, 'docs/features'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'legacy/blackout-web/tests/integration'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs/features/feature_registry.json'), JSON.stringify(registry, null, 2));
  fs.writeFileSync(path.join(dir, 'legacy/blackout-web/tests/integration/app.test.ts'), tests);
  return dir;
}

test('passes with complete feature metadata', () => {
  const dir = fixture({
    registry: [{
      id: 'feature_a',
      uiEntry: 'settings_toggle:feature-a',
      presetPolicy: { baseline_matrix: true, community_plus: true, blackout_full: true },
      uiTestRefs: ['legacy/blackout-web/tests/integration/app.test.ts::feature-a'],
      fallbackBehavior: 'shows unavailable',
    }],
    tests: 'expect("feature-a");',
  });

  const res = spawnSync('node', [scriptPath], { cwd: dir, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr || res.stdout);
});

test('fails when fallback behavior is missing', () => {
  const dir = fixture({
    registry: [{
      id: 'feature_a',
      uiEntry: 'settings_toggle:feature-a',
      presetPolicy: { baseline_matrix: true, community_plus: true, blackout_full: true },
      uiTestRefs: ['legacy/blackout-web/tests/integration/app.test.ts::feature-a'],
      fallbackBehavior: '',
    }],
    tests: 'expect("feature-a");',
  });

  const res = spawnSync('node', [scriptPath], { cwd: dir, encoding: 'utf8' });
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /fallbackBehavior/);
});
