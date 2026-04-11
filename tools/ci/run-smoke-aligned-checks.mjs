#!/usr/bin/env node
import { spawn } from 'node:child_process';

const commands = [
  {
    label: 'Guardrail: block unintended _port changes',
    cmd: 'pnpm',
    args: ['guard:port'],
  },
  {
    label: 'Workspace smoke-aligned test pipeline',
    cmd: 'pnpm',
    args: ['test'],
  },
  {
    label: 'Feature failure-budget guard',
    cmd: 'pnpm',
    args: ['guard:feature-budget'],
  },
  {
    label: 'Dev filter resolution guard',
    cmd: 'pnpm',
    args: ['guard:dev-filters'],
  },
  {
    label: 'Preset-complete definition-of-done guard',
    cmd: 'pnpm',
    args: ['guard:preset-complete'],
  },
  {
    label: 'Web shell build smoke gate',
    cmd: 'pnpm',
    args: ['--filter', '@blackout/blackout-web', 'build'],
  },
];

function runStep({ label, cmd, args }) {
  return new Promise((resolve, reject) => {
    process.stdout.write(`\n==> ${label}\n$ ${cmd} ${args.join(' ')}\n`);
    const child = spawn(cmd, args, { stdio: 'inherit', shell: false });
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${label} terminated by signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`${label} failed with exit code ${code}`));
        return;
      }
      resolve();
    });
    child.on('error', reject);
  });
}

for (const step of commands) {
  await runStep(step);
}

process.stdout.write('\nSmoke-aligned checks completed successfully.\n');
