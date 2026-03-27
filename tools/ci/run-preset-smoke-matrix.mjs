#!/usr/bin/env node
import { spawn } from 'node:child_process';

const PRESETS = ['baseline_matrix', 'community_plus', 'blackout_full'];

function runPresetSmoke(preset) {
  return new Promise((resolve, reject) => {
    process.stdout.write(`\n==> Running preset smoke flow for ${preset}\n`);
    const child = spawn(
      'pnpm',
      ['--filter', '@blackout/blackout-web', 'exec', 'vitest', 'run', 'tests/integration/preset-smoke.test.ts'],
      {
        stdio: 'inherit',
        shell: false,
        env: {
          ...process.env,
          BLACKOUT_SMOKE_PRESET: preset,
        },
      },
    );

    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Preset ${preset} run was terminated by signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`Preset ${preset} smoke failed with exit code ${code}`));
        return;
      }
      resolve();
    });
    child.on('error', reject);
  });
}

for (const preset of PRESETS) {
  await runPresetSmoke(preset);
}

process.stdout.write('\nPreset smoke matrix completed successfully.\n');
