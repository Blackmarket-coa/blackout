#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const scopedPaths = [
  'apps/blackout-client/src/app/features',
  'apps/blackout-client/src/app/pages',
  'apps/blackout-client/src/app/components',
  'apps/blackout-client/src/platform',
];

// Files allowed to call fetch() directly. Each entry must have a documented
// rationale in apps/blackout-client/src/app/sdk/NETWORK_BOUNDARY_INVENTORY.md.
const exemptFiles = new Set([
  // Runtime client-config bootstrap loader.
  'apps/blackout-client/src/app/components/bmc/auth/homeserver.ts',
  // Capacitor camera bridge: fetch() against a data: URI to convert to Blob.
  'apps/blackout-client/src/platform/nativeMediaBridge.ts',
]);

const rg = spawnSync('rg', ['-n', '\\bfetch\\(', ...scopedPaths], {
  encoding: 'utf8',
});

if (rg.status !== 1 && rg.status !== 0) {
  console.error(`Direct fetch guard failed to execute ripgrep. stderr: ${rg.stderr || '<none>'}`);
  process.exit(1);
}

if (rg.status === 1) {
  console.log('Direct fetch guard passed. No direct fetch() calls found in guarded frontend paths.');
  process.exit(0);
}

const violations = rg.stdout
  .trim()
  .split('\n')
  .filter((line) => {
    const filePath = line.split(':', 1)[0];
    return !exemptFiles.has(filePath);
  });

if (violations.length === 0) {
  console.log('Direct fetch guard passed (only documented exemptions matched).');
  process.exit(0);
}

console.error('Direct fetch guard failed. Direct fetch() calls found in guarded frontend paths:');
console.error(violations.join('\n'));
console.error('\nIf this is intentional, add a documented exemption to:');
console.error('  - tools/ci/check-no-direct-fetch-in-client-features.mjs (exemptFiles)');
console.error('  - apps/blackout-client/eslint.config.js (no-restricted-syntax ignores block)');
console.error('  - apps/blackout-client/src/app/sdk/NETWORK_BOUNDARY_INVENTORY.md (rationale)');
process.exit(1);
