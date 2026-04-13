#!/usr/bin/env node
import { spawn } from 'node:child_process';

const TEST_FILE = 'tests/smoke/pluginModeSmoke.test.ts';

const MODES = [
  { id: 'plugin-disabled baseline', env: { BLACKOUT_FEATURE_MODE: 'baseline' } },
  { id: 'full-feature mode', env: { BLACKOUT_FEATURE_MODE: 'full' } },
];

const SCENARIOS = [
  { label: 'auth (login/logout/session restore)', pattern: 'SMOKE_AUTH' },
  { label: 'timeline (load/paginate/send/edit/redact/reply/react)', pattern: 'SMOKE_TIMELINE' },
  { label: 'navigation/layout (home/direct/space switching, right panel toggle)', pattern: 'SMOKE_NAV' },
  { label: 'settings (theme/notification persistence)', pattern: 'SMOKE_SETTINGS' },
  { label: 'media/calls (send preview + call setup availability indicators)', pattern: 'SMOKE_MEDIA_CALLS' },
];

const runScenario = (scenario, mode) =>
  new Promise((resolve) => {
    process.stdout.write(`\n==> [${mode.id}] ${scenario.label}\n`);

    const child = spawn(
      'pnpm',
      ['--filter', '@blackout/client', 'exec', 'vitest', 'run', TEST_FILE, '-t', scenario.pattern],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          ...mode.env,
        },
      }
    );

    child.on('exit', (code, signal) => {
      if (signal) {
        resolve({ status: 'FAIL', detail: `terminated by ${signal}` });
        return;
      }

      resolve({ status: code === 0 ? 'PASS' : 'FAIL', detail: code === 0 ? '' : `exit ${code}` });
    });

    child.on('error', (error) => {
      resolve({ status: 'FAIL', detail: error.message });
    });
  });

const matrix = [];

for (const scenario of SCENARIOS) {
  const row = { scenario: scenario.label };

  for (const mode of MODES) {
    // eslint-disable-next-line no-await-in-loop
    row[mode.id] = await runScenario(scenario, mode);
  }

  matrix.push(row);
}

process.stdout.write('\nSmoke matrix summary\n');
process.stdout.write('| Scenario | plugin-disabled baseline | full-feature mode |\n');
process.stdout.write('| --- | --- | --- |\n');

for (const row of matrix) {
  const baseline = row['plugin-disabled baseline'];
  const full = row['full-feature mode'];
  const baselineCell = baseline.detail ? `${baseline.status} (${baseline.detail})` : baseline.status;
  const fullCell = full.detail ? `${full.status} (${full.detail})` : full.status;
  process.stdout.write(`| ${row.scenario} | ${baselineCell} | ${fullCell} |\n`);
}

if (matrix.some((row) => MODES.some((mode) => row[mode.id].status !== 'PASS'))) {
  process.exitCode = 1;
}
