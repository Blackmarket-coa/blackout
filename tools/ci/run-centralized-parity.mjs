#!/usr/bin/env node
import { spawn } from 'node:child_process';

const commands = [
  ['pnpm', ['lint']],
  ['pnpm', ['test']],
  ['pnpm', ['build']],
  ['node', ['tools/ci/run-smoke-aligned-checks.mjs']],
];

const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    process.stdout.write(`\n$ ${cmd} ${args.join(' ')}\n`);
    const child = spawn(cmd, args, { stdio: 'inherit', shell: false });
    child.on('exit', (code, signal) => {
      if (signal) return reject(new Error(`${cmd} terminated with ${signal}`));
      if (code !== 0) return reject(new Error(`${cmd} ${args.join(' ')} failed with ${code}`));
      resolve();
    });
    child.on('error', reject);
  });

for (const [cmd, args] of commands) {
  await run(cmd, args);
}

process.stdout.write('\nCentralized parity pipeline completed successfully.\n');
