import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

const failures = [];
const root = readJson('package.json');
const legacyPackage = readJson('packages/web/package.json');

const expectedFilters = [
  '@blackout/contracts',
  '@blackout/core',
  '@blackout/server',
  '@blackout/blackout-web',
  'blackout-mobile',
];

function assertScriptIncludes(scriptName, token) {
  const script = root.scripts?.[scriptName];
  if (typeof script !== 'string' || !script.includes(token)) {
    failures.push(`${scriptName} is missing required target ${token}`);
  }
}

for (const scriptName of ['build:runtime', 'lint:runtime', 'test:runtime']) {
  for (const filter of expectedFilters) {
    assertScriptIncludes(scriptName, `--filter ${filter}`);
  }
}

if (!String(legacyPackage.description ?? '').includes('non-deploy')) {
  failures.push('packages/web must be explicitly marked non-deploy to avoid runtime ambiguity');
}

if (failures.length > 0) {
  console.error('Runtime script convergence check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log('Runtime script convergence check passed.');
}
