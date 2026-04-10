#!/usr/bin/env node
import { spawn } from 'node:child_process';

const userArgs = process.argv.slice(2);
const hasUserFilter = userArgs.some((arg, index) => arg === '--filter' || arg.startsWith('--filter='));

const defaultFilters = ['--filter', '@blackout/client', '--filter', '@blackout/server'];
const turboArgs = ['run', 'dev', ...(hasUserFilter ? userArgs : defaultFilters)];

const child = spawn('turbo', turboArgs, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
