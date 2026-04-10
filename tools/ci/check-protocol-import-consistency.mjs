#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const checks = [
  {
    scope: 'client governance feature',
    args: ['-n', '@blackout/protocol', 'apps/blackout-client/src/app/features/governance'],
  },
  {
    scope: 'server API package',
    args: ['-n', '@blackout/protocol', 'packages/api/src'],
  },
];

const failures = [];

for (const check of checks) {
  const result = spawnSync('rg', check.args, { encoding: 'utf8' });

  if (result.status === 1) {
    failures.push(`No @blackout/protocol imports found in ${check.scope}.`);
    continue;
  }

  if (result.status !== 0) {
    failures.push(`Failed to inspect ${check.scope}. stderr: ${result.stderr || '<none>'}`);
  }
}

if (failures.length > 0) {
  console.error('Protocol import consistency check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log('Protocol import consistency check passed.');
}
