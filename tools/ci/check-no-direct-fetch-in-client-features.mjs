#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const scopedPaths = [
  'apps/blackout-client/src/app/features',
  'apps/blackout-client/src/app/pages',
];

const rg = spawnSync('rg', ['-n', '\\bfetch\\(', ...scopedPaths], {
  encoding: 'utf8',
});

if (rg.status !== 1 && rg.status !== 0) {
  console.error(`Direct fetch guard failed to execute ripgrep. stderr: ${rg.stderr || '<none>'}`);
  process.exit(1);
}

if (rg.status === 0) {
  console.error('Direct fetch guard failed. Direct fetch() calls found in guarded frontend feature/page paths:');
  console.error(rg.stdout.trim());
  process.exit(1);
}

console.log('Direct fetch guard passed. No direct fetch() calls found in guarded frontend feature/page paths.');
