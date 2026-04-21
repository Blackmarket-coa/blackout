#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

function hasArg(flag) {
  return process.argv.includes(flag);
}

function getArgValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function runCommand(label, cmd, args) {
  return new Promise((resolve, reject) => {
    process.stdout.write(`\n==> ${label}\n$ ${cmd} ${args.join(' ')}\n`);
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      shell: false,
      env: process.env,
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${label} terminated by signal ${signal}`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`${label} failed with exit code ${code}`));
        return;
      }

      resolve();
    });
  });
}

function readJson(filePath) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!existsSync(resolvedPath)) {
    fail(`Staging signoff report not found: ${resolvedPath}`);
  }

  try {
    return JSON.parse(readFileSync(resolvedPath, 'utf8'));
  } catch (error) {
    fail(`Unable to parse staging signoff report ${resolvedPath}: ${error.message}`);
  }
}

function validateSignoff(report, sourcePath) {
  const sev1 = Number(report?.summary?.sev1 ?? 0);
  const sev2 = Number(report?.summary?.sev2 ?? 0);
  const buildSha = String(report?.buildSha ?? '').trim();
  const executedAtUtc = String(report?.executedAtUtc ?? '').trim();
  const decision = String(report?.signoff?.decision ?? '').trim().toUpperCase();
  const artifacts = Array.isArray(report?.evidence?.artifacts) ? report.evidence.artifacts : [];

  const regressions = {
    spacing: Boolean(report?.regressions?.spacing),
    location: Boolean(report?.regressions?.location),
    functionality: Boolean(report?.regressions?.functionality),
  };
  const manualVerification = {
    desktopLayoutIntegrity: report?.manualVerification?.desktopLayoutIntegrity === true,
    mobileLayoutIntegrity: report?.manualVerification?.mobileLayoutIntegrity === true,
    entitlementTransitions: report?.manualVerification?.entitlementTransitions === true,
  };

  const errors = [];

  if (sev1 > 0) errors.push(`Sev-1 count must be 0 (found ${sev1}).`);
  if (sev2 > 0) errors.push(`Sev-2 count must be 0 (found ${sev2}).`);
  if (!buildSha || /REPLACE_WITH_/i.test(buildSha)) {
    errors.push('buildSha must be a real release-candidate SHA (placeholder values are not allowed).');
  }
  if (!executedAtUtc || Number.isNaN(Date.parse(executedAtUtc))) {
    errors.push('executedAtUtc must be a valid ISO-8601 UTC timestamp.');
  }
  if (decision !== 'GO') {
    errors.push(`signoff.decision must be "GO" (found "${report?.signoff?.decision ?? ''}").`);
  }
  if (artifacts.length === 0) {
    errors.push('evidence.artifacts must include at least one staging evidence link/path.');
  }

  for (const [key, value] of Object.entries(regressions)) {
    if (value) {
      errors.push(`Regression flag "${key}" must be false in staging signoff.`);
    }
  }

  for (const [key, value] of Object.entries(manualVerification)) {
    if (!value) {
      errors.push(`Manual verification "${key}" must be true in staging signoff.`);
    }
  }

  if (errors.length > 0) {
    fail(`Release gate staging signoff validation failed for ${sourcePath}:\n- ${errors.join('\n- ')}`);
  }

  process.stdout.write(`\nStaging signoff OK (${sourcePath}): sev1=${sev1}, sev2=${sev2}, decision=${decision}.\n`);
}

const defaultSignoffPath = 'apps/blackout-client/docs/release/staging-signoff.report.json';
const signoffPath = getArgValue('--staging-signoff', defaultSignoffPath);
const skipSmoke = hasArg('--skip-smoke');
const skipBoundary = hasArg('--skip-boundary');

if (!skipSmoke) {
  await runCommand('Smoke suite in baseline and full-feature modes', 'pnpm', ['ci:smoke:blackout-client']);
}

if (!skipBoundary) {
  await runCommand('Boundary/registry check: feature registry allowlist', 'pnpm', ['guard:feature-registry']);
  await runCommand('Boundary/registry check: legacy runtime import guard', 'pnpm', ['guard:legacy-runtime-imports']);
}

const signoff = readJson(signoffPath);
validateSignoff(signoff, signoffPath);

process.stdout.write('\nBlackout client release gate passed.\n');
