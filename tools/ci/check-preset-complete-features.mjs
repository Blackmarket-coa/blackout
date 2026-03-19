#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const registryPath = path.join(repoRoot, 'docs/features/feature_registry.json');

if (!fs.existsSync(registryPath)) {
  process.stderr.write(`Missing registry: ${registryPath}\n`);
  process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
if (!Array.isArray(registry)) {
  process.stderr.write('Registry must be an array.\n');
  process.exit(1);
}

const integrationDir = path.join(repoRoot, 'apps/blackout-web/tests/integration');
const integrationText = fs.readdirSync(integrationDir)
  .filter((name) => name.endsWith('.ts'))
  .map((name) => fs.readFileSync(path.join(integrationDir, name), 'utf8'))
  .join('\n');

const errors = [];
for (const row of registry) {
  const id = row?.id ?? '<missing-id>';

  if (!row.presetPolicy || typeof row.presetPolicy !== 'object') {
    errors.push(`${id}: missing presetPolicy object.`);
  } else {
    for (const preset of ['baseline_matrix', 'community_plus', 'blackout_full']) {
      if (typeof row.presetPolicy[preset] !== 'boolean') {
        errors.push(`${id}: presetPolicy.${preset} must be boolean.`);
      }
    }
  }

  if (!Array.isArray(row.uiTestRefs) || row.uiTestRefs.length === 0) {
    errors.push(`${id}: must declare at least one uiTestRefs path.`);
  } else {
    for (const ref of row.uiTestRefs) {
      const [filePath, testId] = String(ref).split('::');
      if (!filePath || !testId) {
        errors.push(`${id}: invalid uiTestRefs entry "${ref}".`);
        continue;
      }
      const absolute = path.join(repoRoot, filePath);
      if (!fs.existsSync(absolute)) {
        errors.push(`${id}: ui test file does not exist: ${filePath}.`);
      }
      if (!integrationText.includes(testId)) {
        errors.push(`${id}: test token not found in integration tests: ${testId}.`);
      }
    }
  }

  if (typeof row.fallbackBehavior !== 'string' || row.fallbackBehavior.trim().length === 0) {
    errors.push(`${id}: fallbackBehavior must be documented.`);
  }

  const [, uiTestId] = String(row.uiEntry ?? '').split(':');
  if (!uiTestId) {
    errors.push(`${id}: uiEntry missing test id.`);
  }
}

if (errors.length > 0) {
  process.stderr.write('Preset-complete gate failed:\n');
  for (const error of errors) {
    process.stderr.write(` - ${error}\n`);
  }
  process.exit(1);
}

process.stdout.write(`Preset-complete gate passed for ${registry.length} features.\n`);
