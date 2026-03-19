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
      uiEntry: 'component:A',
      owner: 'team-a',
      testCoverage: 'unit',
      notes: 'ok',
      sourcePointers: ['docs/a.md'],
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
      uiEntry: 'component:A',
      owner: 'team-a',
      testCoverage: 'unit',
      notes: 'ok',
      sourcePointers: ['docs/a.md'],
    },
    {
      id: 'dupe',
      name: 'Feature B',
      category: 'matrix_like',
      status: 'partial',
      presetKey: 'features.b',
      uiEntry: 'component:B',
      owner: 'team-b',
      testCoverage: 'integration',
      notes: 'ok',
      sourcePointers: ['docs/b.md'],
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
