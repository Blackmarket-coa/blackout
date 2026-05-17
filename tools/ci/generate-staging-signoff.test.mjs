import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const scriptPath = path.join(repoRoot, 'tools/ci/generate-staging-signoff.mjs');

function tmpOut() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blackout-signoff-gen-'));
  return path.join(dir, 'staging-signoff.report.json');
}

function run(args) {
  return spawnSync('node', [scriptPath, ...args], {
    encoding: 'utf8',
    cwd: repoRoot,
  });
}

test('emits a valid signoff with current HEAD SHA and current timestamp', () => {
  const out = tmpOut();
  const result = run(['--out', out, '--evidence', 'docs/operations/evidence/staging-signoff-LATEST.md']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(fs.readFileSync(out, 'utf8'));

  assert.match(report.buildSha, /^[0-9a-f]{40}$/, 'buildSha should be a real 40-char git sha');
  assert.ok(!/REPLACE_WITH_/.test(report.buildSha), 'buildSha must not be a placeholder');
  assert.equal(report.environment, 'staging');
  assert.ok(!Number.isNaN(Date.parse(report.executedAtUtc)), 'executedAtUtc must parse');
  assert.equal(report.summary.sev1, 0);
  assert.equal(report.summary.sev2, 0);
  assert.equal(report.regressions.spacing, false);
  assert.equal(report.regressions.location, false);
  assert.equal(report.regressions.functionality, false);
  assert.equal(report.manualVerification.desktopLayoutIntegrity, false);
  assert.equal(report.manualVerification.mobileLayoutIntegrity, false);
  assert.equal(report.manualVerification.entitlementTransitions, false);
  assert.equal(report.signoff.decision, 'GO');
  assert.ok(Array.isArray(report.evidence.artifacts) && report.evidence.artifacts.length >= 1);
});

test('--with-manual-verification flips the three manual flags to true and warns', () => {
  const out = tmpOut();
  const result = run(['--out', out, '--with-manual-verification']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stderr, /WARNING/);

  const report = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(report.manualVerification.desktopLayoutIntegrity, true);
  assert.equal(report.manualVerification.mobileLayoutIntegrity, true);
  assert.equal(report.manualVerification.entitlementTransitions, true);
});

test('rejects a placeholder build sha', () => {
  const out = tmpOut();
  const result = run(['--out', out, '--build-sha', 'REPLACE_WITH_RELEASE_SHA']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /placeholder buildSha/i);
});

test('rejects an invalid executed-at timestamp', () => {
  const out = tmpOut();
  const result = run(['--out', out, '--executed-at', 'not-a-date']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be a valid ISO-8601/i);
});

test('extra artifacts are appended after the evidence path', () => {
  const out = tmpOut();
  const result = run([
    '--out',
    out,
    '--evidence',
    'docs/operations/evidence/staging-signoff-LATEST.md',
    '--extra-artifacts',
    'tmp/launch-evidence/smoke.log,tmp/launch-evidence/guards.log',
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.deepEqual(report.evidence.artifacts, [
    'docs/operations/evidence/staging-signoff-LATEST.md',
    'tmp/launch-evidence/smoke.log',
    'tmp/launch-evidence/guards.log',
  ]);
});
