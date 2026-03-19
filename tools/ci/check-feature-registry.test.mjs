import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const scriptPath = path.join(repoRoot, 'tools/ci/check-feature-registry.mjs');

function runScript(filePath) {
  return spawnSync('node', [scriptPath, '--file', filePath], { encoding: 'utf8' });
}

function writeFixture(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-registry-'));
  const file = path.join(dir, 'feature_registry.json');
  fs.writeFileSync(file, JSON.stringify(content, null, 2));
  return file;
}

test('passes with valid rows', () => {
  const file = writeFixture([
    {
      id: 'feature_a',
      name: 'Feature A',
      category: 'novel',
      status: 'implemented',
      presetKey: 'features.a',
      uiEntry: 'settings_toggle:feature-toggle-a',
      owner: 'team-a',
      testCoverage: 'unit',
      notes: 'ok',
      sourcePointers: ['docs/a.md'],
      presetPolicy: { baseline_matrix: true, community_plus: true, blackout_full: true },
      uiTestRefs: ['apps/blackout-web/tests/integration/app.test.ts::feature-toggle-a'],
      fallbackBehavior: 'shows unavailable state',
    },
  ]);

  const res = runScript(file);
  assert.equal(res.status, 0, res.stderr || res.stdout);
  assert.match(res.stdout, /validation passed/);
});

test('fails with duplicate ids', () => {
  const file = writeFixture([
    {
      id: 'dupe',
      name: 'Feature A',
      category: 'novel',
      status: 'implemented',
      presetKey: 'features.a',
      uiEntry: 'settings_toggle:feature-toggle-a',
      owner: 'team-a',
      testCoverage: 'unit',
      notes: 'ok',
      sourcePointers: ['docs/a.md'],
      presetPolicy: { baseline_matrix: true, community_plus: true, blackout_full: true },
      uiTestRefs: ['apps/blackout-web/tests/integration/app.test.ts::feature-toggle-a'],
      fallbackBehavior: 'shows unavailable state',
    },
    {
      id: 'dupe',
      name: 'Feature B',
      category: 'matrix_like',
      status: 'partial',
      presetKey: 'features.b',
      uiEntry: 'widget_panel:feature-widget-b',
      owner: 'team-b',
      testCoverage: 'integration',
      notes: 'ok',
      sourcePointers: ['docs/b.md'],
      presetPolicy: { baseline_matrix: false, community_plus: true, blackout_full: true },
      uiTestRefs: ['apps/blackout-web/tests/integration/app.test.ts::feature-widget-b'],
      fallbackBehavior: 'shows unavailable state',
    },
  ]);

  const res = runScript(file);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /duplicate id/);
});

test('fails with missing required fields', () => {
  const file = writeFixture([
    {
      id: 'missing_fields',
      name: 'Feature C',
      category: 'discord_like',
      status: 'planned',
    },
  ]);

  const res = runScript(file);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /missing required field/);
});

test('fails with invalid uiEntry mapping', () => {
  const file = writeFixture([
    {
      id: 'bad_ui_entry',
      name: 'Feature D',
      category: 'novel',
      status: 'partial',
      presetKey: 'features.d',
      uiEntry: 'component:legacy',
      owner: 'team-d',
      testCoverage: 'none',
      notes: 'bad ui entry',
      sourcePointers: ['docs/d.md'],
      presetPolicy: { baseline_matrix: false, community_plus: false, blackout_full: true },
      uiTestRefs: ['apps/blackout-web/tests/integration/app.test.ts::feature-toggle-d'],
      fallbackBehavior: 'shows unavailable state',
    },
  ]);

  const res = runScript(file);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /uiEntry must start with one of/);
});
