import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const scriptPath = path.join(repoRoot, 'tools/ci/check-blackout-client-release-gate.mjs');

function writeSignoff(payload) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blackout-release-gate-'));
  const file = path.join(dir, 'staging-signoff.json');
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

function run(signoffPath) {
  return spawnSync('node', [scriptPath, '--skip-smoke', '--skip-boundary', '--staging-signoff', signoffPath], {
    encoding: 'utf8',
    cwd: repoRoot,
  });
}

test('passes when signoff has no Sev-1/Sev-2 and no regressions', () => {
  const report = {
    summary: { sev1: 0, sev2: 0 },
    regressions: { spacing: false, location: false, functionality: false },
  };

  const signoffPath = writeSignoff(report);
  const result = run(signoffPath);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Blackout client release gate passed\./i);
});

test('fails when Sev-1 is present', () => {
  const report = {
    summary: { sev1: 1, sev2: 0 },
    regressions: { spacing: false, location: false, functionality: false },
  };

  const signoffPath = writeSignoff(report);
  const result = run(signoffPath);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Sev-1 count must be 0/i);
});

test('fails when spacing/location/functionality regression is reported', () => {
  const report = {
    summary: { sev1: 0, sev2: 0 },
    regressions: { spacing: true, location: false, functionality: false },
  };

  const signoffPath = writeSignoff(report);
  const result = run(signoffPath);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Regression flag "spacing" must be false/i);
});
