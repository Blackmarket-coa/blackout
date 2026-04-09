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

function featureRow(overrides = {}) {
  return {
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
    ...overrides,
  };
}

test('passes with valid rows (legacy array format)', () => {
  const file = writeFixture([featureRow()]);

  const res = runScript(file);
  assert.equal(res.status, 0, res.stderr || res.stdout);
  assert.match(res.stdout, /validation passed/);
});

test('fails with duplicate ids', () => {
  const file = writeFixture([
    featureRow({ id: 'dupe', name: 'Feature A' }),
    featureRow({ id: 'dupe', name: 'Feature B', category: 'matrix_like', presetKey: 'features.b', uiEntry: 'widget_panel:feature-widget-b' }),
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
    featureRow({
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
    }),
  ]);

  const res = runScript(file);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /uiEntry must start with one of/);
});

test('fails when two features share the same name in a scope', () => {
  const file = writeFixture({
    features: [
      featureRow({ id: 'feature_a', name: 'Shared Name' }),
      featureRow({
        id: 'feature_b',
        name: 'Shared Name',
        category: 'matrix_like',
        presetKey: 'features.b',
        uiEntry: 'widget_panel:feature-widget-b',
      }),
    ],
    scopes: [
      {
        id: 'primary',
        sections: [
          { id: 'novel', featureIds: ['feature_a'], total: 1 },
          { id: 'matrix_like', featureIds: ['feature_b'], total: 1 },
        ],
        globalTotal: 2,
      },
    ],
  });

  const res = runScript(file);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /duplicate feature name/);
});

test('fails when section/global totals do not match unique scoped feature IDs', () => {
  const file = writeFixture({
    features: [featureRow({ id: 'feature_a' }), featureRow({ id: 'feature_b', name: 'Feature B', category: 'matrix_like', presetKey: 'features.b', uiEntry: 'widget_panel:feature-widget-b' })],
    scopes: [
      {
        id: 'primary',
        sections: [
          { id: 'novel', featureIds: ['feature_a', 'feature_a'], total: 2 },
          { id: 'matrix_like', featureIds: ['feature_b'], total: 1 },
        ],
        globalTotal: 5,
      },
    ],
  });

  const res = runScript(file);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /does not match unique featureIds/);
  assert.match(res.stderr, /globalTotal=/);
});
