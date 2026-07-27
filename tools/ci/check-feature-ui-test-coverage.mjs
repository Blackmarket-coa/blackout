#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const registryPath = path.join(repoRoot, 'docs/features/feature_registry.json');

// LEGACY SCOPE (audit finding L6): the feature registry's UI markers currently
// live only in the ARCHIVED `legacy/blackout-web` integration suite; the
// canonical client (`apps/blackout-client`) does not yet carry them. Until they
// are colocated into the client's own test suite, this guard necessarily
// measures the legacy package. The path is overridable via FEATURE_UI_TESTS_DIR
// so the guard can be repointed at the client without a code change once the
// markers move. This guard is intentionally NOT wired into CI while it is
// legacy-scoped.
const DEFAULT_TESTS_DIR = 'legacy/blackout-web/tests/integration';
const integrationTestsRel = process.env.FEATURE_UI_TESTS_DIR ?? DEFAULT_TESTS_DIR;
const integrationTestsPath = path.join(repoRoot, integrationTestsRel);

if (integrationTestsRel === DEFAULT_TESTS_DIR) {
    process.stderr.write(
        `[feature-budget] NOTE: measuring UI coverage against the archived ${DEFAULT_TESTS_DIR}. ` +
            'Repoint via FEATURE_UI_TESTS_DIR once feature markers are colocated into apps/blackout-client.\n'
    );
}

if (!fs.existsSync(registryPath)) {
    process.stderr.write(`Missing feature registry: ${registryPath}\n`);
    process.exit(1);
}

const parsedRegistry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const registry = Array.isArray(parsedRegistry) ? parsedRegistry : parsedRegistry?.features;
if (!Array.isArray(registry)) {
    process.stderr.write('Feature registry must be an array or object with a features array.\n');
    process.exit(1);
}

if (!fs.existsSync(integrationTestsPath)) {
    process.stderr.write(`Missing integration test folder: ${integrationTestsPath}\n`);
    process.exit(1);
}

const integrationText = fs
    .readdirSync(integrationTestsPath)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => fs.readFileSync(path.join(integrationTestsPath, name), 'utf8'))
    .join('\n');

const missing = [];
for (const row of registry) {
    if (!row?.id || !row?.uiEntry) continue;
    const [, testId] = String(row.uiEntry).split(':');
    if (!testId) {
        missing.push(`${row.id} (missing uiEntry test id)`);
        continue;
    }

    const hasPrimary = integrationText.includes(testId);
    const hasUnavailable = integrationText.includes(`${testId}-unavailable`);

    if (!hasPrimary && !hasUnavailable) {
        missing.push(`${row.id} (${testId})`);
    }
}

if (missing.length > 0) {
    process.stderr.write(
        'Failure budget policy violated: feature(s) missing UI integration coverage:\n'
    );
    for (const item of missing) {
        process.stderr.write(` - ${item}\n`);
    }
    process.exit(1);
}

process.stdout.write(
    `Feature/UI test coverage check passed for ${registry.length} registry rows.\n`
);
