import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const scriptPath = path.join(repoRoot, 'tools/ci/check-legacy-runtime-imports.mjs');

function makeWorkspace(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-import-guard-'));
  fs.mkdirSync(path.join(dir, 'apps', 'sample'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'packages', 'sample'), { recursive: true });

  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  return dir;
}

function run(cwd) {
  return spawnSync('node', [scriptPath], { cwd, encoding: 'utf8' });
}

test('passes when imports do not target legacy namespaces', () => {
  const cwd = makeWorkspace({ 'apps/sample/ok.ts': "import { x } from './local';\n" });
  const res = run(cwd);
  assert.equal(res.status, 0, res.stderr || res.stdout);
  assert.match(res.stdout, /guard passed/);
});

test('fails when an active runtime file imports legacy namespace', () => {
  const cwd = makeWorkspace({
    'apps/sample/ok.ts': "import data from '../../legacy/element/app/config.json';\n",
  });
  const res = run(cwd);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /imports blocked legacy path/);
});

test('fails when an active runtime file imports _port namespace', () => {
  const cwd = makeWorkspace({
    'apps/sample/ok.ts': "export { thing } from '@repo/_port/src/thing';\n",
  });
  const res = run(cwd);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /imports blocked legacy path/);
});

test('fails when shell/runtime entrypoints import bmc-* modules directly', () => {
  const cwd = makeWorkspace({
    'apps/blackout-client/src/main.tsx': "import { client } from './app/hooks/bmc-useMatrixClient';\n",
  });
  const res = run(cwd);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /blocked bmc-\* shell entrypoint path/);
});

test('allows bmc-* imports outside shell/runtime entrypoint allowlist for freeze phase', () => {
  const cwd = makeWorkspace({
    'apps/blackout-client/src/app/features/demo/Widget.tsx': "import { useRoom } from '../../hooks/bmc-useRoom';\n",
  });
  const res = run(cwd);
  assert.equal(res.status, 0, res.stderr || res.stdout);
});
