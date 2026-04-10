#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const result = spawnSync(
  'rg',
  ['-n', "from ['\\\"].*(legacy|_port)|import\\(['\\\"].*(legacy|_port)", 'apps', 'packages'],
  { encoding: 'utf8' },
);

if (result.status !== 1 && result.status !== 0) {
  console.error(`Legacy isolation check failed to execute ripgrep. stderr: ${result.stderr || '<none>'}`);
  process.exit(1);
}

if (result.status === 0) {
  console.error('Legacy isolation check failed. Runtime imports from legacy paths were found:');
  console.error(result.stdout.trim());
  process.exit(1);
}

console.log('Legacy isolation check passed. No runtime imports from legacy/_port paths in apps/ or packages/.');
