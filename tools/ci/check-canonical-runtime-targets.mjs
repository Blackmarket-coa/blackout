import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const failures = [];

function readJson(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function assertIncludes(actual, expectedSubstring, message) {
  if (typeof actual !== 'string' || !actual.includes(expectedSubstring)) {
    failures.push(`${message} (expected to include: ${expectedSubstring}, actual: ${actual ?? '<missing>'})`);
  }
}

const rootPackage = readJson('package.json');
const mobilePackage = readJson('blackout-mobile/package.json');
const blackoutWebPackage = readJson('apps/blackout-web/package.json');
const legacyWebPackage = readJson('apps/web/package.json');

assertIncludes(rootPackage.scripts?.['web:dev'], '@blackout/blackout-web dev', 'Root web:dev must target canonical web app');
assertIncludes(rootPackage.scripts?.['web:build'], '@blackout/blackout-web build:web', 'Root web:build must target canonical web app');
assertIncludes(rootPackage.scripts?.['web:test'], '@blackout/blackout-web test', 'Root web:test must target canonical web app');
assertIncludes(rootPackage.scripts?.['mobile:build'], 'blackout-mobile build', 'Root mobile:build must target canonical mobile wrapper package');

assertIncludes(mobilePackage.scripts?.['build:web'], '@blackout/blackout-web build:web', 'blackout-mobile build:web must consume canonical blackout-web bundle');
assertIncludes(legacyWebPackage.description, 'canonical frontend is @blackout/blackout-web', 'Legacy apps/web package must remain explicitly marked as non-deploy');

if (!blackoutWebPackage.dependencies?.['@blackout/contracts']) {
  failures.push('apps/blackout-web must directly depend on @blackout/contracts for shared API root/type contracts');
}

if (failures.length > 0) {
  console.error('Canonical runtime target check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log('Canonical runtime targets are aligned.');
}
