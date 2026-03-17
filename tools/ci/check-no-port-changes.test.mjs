import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const scriptPath = path.join(repoRoot, 'tools/ci/check-no-port-changes.mjs');

function run(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed in ${cwd}\n${res.stderr || res.stdout}`);
  }
}

function runScript(args, cwd) {
  return spawnSync('node', [scriptPath, ...args], { cwd, encoding: 'utf8' });
}

function initRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'port-guard-'));
  run('git', ['init', '--initial-branch=main'], dir);
  run('git', ['config', 'user.email', 'ci@example.com'], dir);
  run('git', ['config', 'user.name', 'CI'], dir);
  fs.mkdirSync(path.join(dir, '_port'), { recursive: true });
  fs.writeFileSync(path.join(dir, '_port', 'README.md'), '# readme\n');
  fs.writeFileSync(path.join(dir, '_port', 'MIGRATION_INVENTORY.md'), '# migration\n');
  fs.writeFileSync(path.join(dir, 'x.txt'), 'x\n');
  run('git', ['add', '.'], dir);
  run('git', ['commit', '-m', 'init'], dir);
  return dir;
}

test('passes when only whitelisted _port file changes', () => {
  const dir = initRepo();
  fs.writeFileSync(path.join(dir, '_port', 'README.md'), '# updated\n');
  const res = runScript([], dir);
  assert.equal(res.status, 0, res.stderr || res.stdout);
});

test('fails when non-whitelisted _port file changes', () => {
  const dir = initRepo();
  fs.writeFileSync(path.join(dir, '_port', 'src.txt'), 'bad\n');
  const res = runScript([], dir);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /Blocked _port changes detected/);
});

test('supports --base diff checks', () => {
  const dir = initRepo();
  run('git', ['checkout', '-b', 'feature'], dir);
  fs.writeFileSync(path.join(dir, '_port', 'src.txt'), 'bad\n');
  run('git', ['add', '.'], dir);
  run('git', ['commit', '-m', 'change'], dir);
  const res = runScript(['--base', 'main'], dir);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /_port\/src.txt/);
});
