import { execFileSync } from 'node:child_process';

const ALLOWED = new Set([
  'packages/api/src/index.ts',
  'docs/api/versioning.md',
  'docs/api/v1-migration-evidence.md',
  'docs/api/operations/api-alias-freeze-plan.md',
]);

const scanPaths = ['packages/api/src', 'packages/web/src', 'packages/contracts/src', 'docs/api'];
const output = execFileSync('rg', ['-n', '/api/', ...scanPaths], { encoding: 'utf8' });
const lines = output.split('\n').filter(Boolean);

const violations = lines.filter((line) => {
  const file = line.split(':', 1)[0];
  return !ALLOWED.has(file);
});

if (violations.length) {
  console.error('API freeze violation: new /api references found outside allowlist.');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('API freeze check passed.');
