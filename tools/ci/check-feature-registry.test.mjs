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
    evidenceType: 'docs',
    lastVerifiedAt: '2026-04-09',
    verifiedBy: 'blackout-ci',
    evidencePaths: ['docs/a.md'],
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

test('fails infra/runtime claims that are not tagged as external-infra', () => {
  const file = writeFixture([
    featureRow({
      notes: 'Cloudflare tunnel count claim pending confirmation.',
      evidenceType: 'docs',
    }),
  ]);

  const res = runScript(file);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /infra\/runtime claims must set evidenceType to "external-infra"/);
});

test('fails external-infra claims without verifiable evidence when marked verified', () => {
  const file = writeFixture([
    featureRow({
      evidenceType: 'external-infra',
      evidencePaths: ['docs/misc/non-verifiable.md'],
      verifiedBy: 'ops-user',
      lastVerifiedAt: '2026-04-09',
    }),
  ]);

  const res = runScript(file);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /must set verifiedBy to "unverified"/);
  assert.match(res.stderr, /must set lastVerifiedAt to null/);
});

test('passes external-infra claims with verifiable runbook evidence', () => {
  const file = writeFixture([
    featureRow({
      evidenceType: 'external-infra',
      notes: 'DL360 host inventory validated through runbook.',
      evidencePaths: ['docs/operations/runbooks/townhall-observability-runbook.md'],
      verifiedBy: 'rtc-platform-ops',
      lastVerifiedAt: '2026-03-16',
    }),
  ]);

  const res = runScript(file);
  assert.equal(res.status, 0, res.stderr || res.stdout);
});


function writeFile(dir, relativePath, content) {
  const filePath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

test('fails when plugin module injects an unregistered feature id', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-registry-client-'));
  const file = writeFixture([featureRow()]);

  const registryTs = writeFile(
    dir,
    'registry.ts',
    "export const registeredFeatureModuleIds = ['governance', 'forum'] as const;\n"
  );
  const coreModulesTs = writeFile(
    dir,
    'coreModules.ts',
    "export const coreFeatureModules = [{ feature: {}, flag: 'governance' }];\n"
  );
  const pluginsTs = writeFile(
    dir,
    'plugins.ts',
    "export const featurePlugins = [{ id: 'demo', modules: [{ feature: { id: 'rogue-module' } }] }];\n"
  );

  const res = spawnSync(
    'node',
    [
      scriptPath,
      '--file', file,
      '--registry-ts', registryTs,
      '--core-modules-ts', coreModulesTs,
      '--plugins-ts', pluginsTs,
    ],
    { encoding: 'utf8' }
  );

  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /Plugin injects unregistered feature id "rogue-module"/);
});

test('fails when core module flag is missing from registration allowlist', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-registry-client-core-'));
  const file = writeFixture([featureRow()]);

  const registryTs = writeFile(
    dir,
    'registry.ts',
    "export const registeredFeatureModuleIds = ['governance'] as const;\n"
  );
  const coreModulesTs = writeFile(
    dir,
    'coreModules.ts',
    "export const coreFeatureModules = [{ feature: {}, flag: 'deaddrop' }];\n"
  );
  const pluginsTs = writeFile(dir, 'plugins.ts', 'export const featurePlugins = [];\n');

  const res = spawnSync(
    'node',
    [
      scriptPath,
      '--file', file,
      '--registry-ts', registryTs,
      '--core-modules-ts', coreModulesTs,
      '--plugins-ts', pluginsTs,
    ],
    { encoding: 'utf8' }
  );

  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /Core feature module flag "deaddrop" is not in registeredFeatureModuleIds/);
});
