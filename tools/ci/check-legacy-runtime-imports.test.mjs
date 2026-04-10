import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const scriptPath = path.join(repoRoot, 'tools/ci/check-legacy-runtime-imports.mjs');

function makeWorkspace(fileContent) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-import-guard-'));
  fs.mkdirSync(path.join(dir, 'apps', 'sample'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'packages', 'sample'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'apps', 'sample', 'ok.ts'), fileContent);
  return dir;
}

function run(cwd) {
  return spawnSync('node', [scriptPath], { cwd, encoding: 'utf8' });
}

test('passes when imports do not target legacy namespaces', () => {
  const cwd = makeWorkspace("import { x } from './local';\n");
  const res = run(cwd);
  assert.equal(res.status, 0, res.stderr || res.stdout);
  assert.match(res.stdout, /guard passed/);
});

test('fails when an active runtime file imports legacy namespace', () => {
  const cwd = makeWorkspace("import data from '../../legacy/element/app/config.json';\n");
  const res = run(cwd);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /imports blocked legacy path/);
});

test('fails when an active runtime file imports _port namespace', () => {
  const cwd = makeWorkspace("export { thing } from '@repo/_port/src/thing';\n");
  const res = run(cwd);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /imports blocked legacy path/);
});
