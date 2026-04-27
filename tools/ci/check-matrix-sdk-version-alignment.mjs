#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASELINE_MATRIX_JS_SDK_VERSION = '^40.0.0';
const EXPLICIT_IN_SCOPE_MANIFESTS = [
  'apps/blackout-client/package.json',
];
const DISCOVERY_ROOTS = ['apps', 'packages'];
const MANIFEST_FILE = 'package.json';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function discoverRuntimeManifests(rootDir) {
  const manifests = [];
  const absoluteRoot = path.join(repoRoot, rootDir);
  if (!fs.existsSync(absoluteRoot)) {
    return manifests;
  }

  const stack = [absoluteRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
          continue;
        }
        stack.push(path.join(current, entry.name));
        continue;
      }

      if (!entry.isFile() || entry.name !== MANIFEST_FILE) {
        continue;
      }

      const absolutePath = path.join(current, entry.name);
      manifests.push(normalizePath(path.relative(repoRoot, absolutePath)));
    }
  }

  return manifests;
}

function resolveDeclaredVersion(packageJson) {
  return (
    packageJson.dependencies?.['matrix-js-sdk']
    ?? packageJson.optionalDependencies?.['matrix-js-sdk']
    ?? packageJson.peerDependencies?.['matrix-js-sdk']
    ?? null
  );
}

const discovered = DISCOVERY_ROOTS.flatMap(discoverRuntimeManifests);
const candidateManifests = [...new Set([...EXPLICIT_IN_SCOPE_MANIFESTS, ...discovered])];

const inspected = [];
const failures = [];

for (const manifestPath of candidateManifests) {
  const packageJson = readJson(manifestPath);
  const declaredVersion = resolveDeclaredVersion(packageJson);

  if (declaredVersion === null) {
    continue;
  }

  inspected.push({
    manifestPath,
    packageName: packageJson.name ?? '<unknown>',
    declaredVersion,
  });

  if (declaredVersion !== BASELINE_MATRIX_JS_SDK_VERSION) {
    failures.push(`${manifestPath} (${packageJson.name ?? '<unknown>'}) declares ${declaredVersion}`);
  }
}

if (inspected.length === 0) {
  console.error('No runtime manifests with matrix-js-sdk found; check in-scope configuration.');
  process.exitCode = 1;
} else if (failures.length > 0) {
  console.error('matrix-js-sdk baseline alignment check failed.');
  console.error(`Approved baseline: ${BASELINE_MATRIX_JS_SDK_VERSION}`);
  console.error('Mismatched manifests:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error('Inspected manifests:');
  for (const item of inspected) {
    console.error(`- ${item.manifestPath} (${item.packageName}) => ${item.declaredVersion}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `matrix-js-sdk baseline alignment check passed for ${inspected.length} manifest(s) at ${BASELINE_MATRIX_JS_SDK_VERSION}.`,
  );
}
