#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function arg(flag, fallback) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function gitHeadSha(cwd) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  } catch (error) {
    fail(`Failed to read git HEAD: ${error.message}`);
  }
}

const cwd = process.cwd();
const out = resolve(cwd, arg('--out', 'apps/blackout-client/docs/release/staging-signoff.report.json'));
const evidence = arg('--evidence', 'docs/operations/evidence/staging-signoff-LATEST.md');
const sev1 = Number(arg('--sev1', '0'));
const sev2 = Number(arg('--sev2', '0'));
const sev3 = Number(arg('--sev3', '0'));
const sev4 = Number(arg('--sev4', '0'));
const buildSha = arg('--build-sha', gitHeadSha(cwd));
const executedAtUtc = arg('--executed-at', new Date().toISOString());
const owner = arg('--owner', 'release-manager');
const decision = arg('--decision', 'GO').toUpperCase();
const extraArtifacts = (arg('--extra-artifacts', '') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const withManual = hasFlag('--with-manual-verification');

if (!buildSha || /REPLACE_WITH_/i.test(buildSha)) {
  fail('Refusing to emit signoff with a placeholder buildSha. Pass --build-sha <sha> or run inside a git checkout.');
}

if (Number.isNaN(Date.parse(executedAtUtc))) {
  fail(`--executed-at must be a valid ISO-8601 timestamp (got "${executedAtUtc}").`);
}

const artifacts = [evidence, ...extraArtifacts];

const report = {
  buildSha,
  environment: 'staging',
  executedAtUtc,
  summary: { sev1, sev2, sev3, sev4 },
  regressions: { spacing: false, location: false, functionality: false },
  manualVerification: {
    desktopLayoutIntegrity: withManual,
    mobileLayoutIntegrity: withManual,
    entitlementTransitions: withManual,
  },
  evidence: {
    report: 'docs/launch-smoke-suite.md',
    artifacts,
  },
  signoff: { decision, owner },
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

if (withManual) {
  process.stderr.write(
    'WARNING: --with-manual-verification was passed. You are attesting that desktop (Tauri), mobile (Capacitor iOS+Android), and entitlement-transition flows have been exercised on real builds. Do not use this flag unless you have evidence in hand.\n'
  );
}

process.stdout.write(`Wrote signoff report: ${out}\n`);
process.stdout.write(
  `  buildSha=${buildSha} executedAtUtc=${executedAtUtc} decision=${decision} ` +
    `sev1=${sev1} sev2=${sev2} manualVerification=${withManual}\n`
);

if (!existsSync(resolve(cwd, evidence))) {
  process.stdout.write(
    `Note: evidence artifact "${evidence}" does not exist on disk yet — create it before running the release gate.\n`
  );
}

if (existsSync(out)) {
  const written = JSON.parse(readFileSync(out, 'utf8'));
  if (written.buildSha !== buildSha) {
    fail('Post-write verification failed: buildSha mismatch.');
  }
}
