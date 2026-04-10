import { spawnSync } from 'node:child_process';

const targets = ['@blackout/client', '@blackout/server'];
const failures = [];

for (const target of targets) {
  const result = spawnSync('pnpm', ['--filter', target, 'exec', 'node', '-e', 'process.stdout.write("ok")'], {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    failures.push(`${target} did not resolve via pnpm --filter. stderr: ${result.stderr || '<none>'}`);
  }
}

if (failures.length > 0) {
  console.error('Dev filter resolution check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log('Dev filter resolution check passed.');
}
