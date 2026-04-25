#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const checks = [
  { name: 'workspace-package-assertion', command: ['pnpm', 'guard:workspace-packages'] },
  { name: 'canonical-dev-filter-resolution', command: ['pnpm', 'guard:dev-filters'] },
  { name: 'sdk-boundary', command: ['pnpm', 'guard:sdk-boundary'] },
  { name: 'protocol-import-consistency', command: ['pnpm', 'guard:protocol-import-consistency'] },
  { name: 'legacy-isolation', command: ['pnpm', 'guard:legacy-isolation'] },
  { name: 'legacy-runtime-imports', command: ['pnpm', 'guard:legacy-runtime-imports'] },
  { name: 'matrix-sdk-baseline', command: ['pnpm', 'guard:matrix-sdk-baseline'] },
];

const outputDir = path.resolve(process.cwd(), 'artifacts', 'qa-monorepo');
fs.mkdirSync(outputDir, { recursive: true });

const summary = [];
let failed = false;

for (const check of checks) {
  const [cmd, ...args] = check.command;
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  const log = [
    `# ${check.name}`,
    `Command: ${check.command.join(' ')}`,
    `Exit code: ${result.status ?? 'null'}`,
    '',
    '## stdout',
    result.stdout || '<empty>',
    '',
    '## stderr',
    result.stderr || '<empty>',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(outputDir, `${check.name}.log`), log, 'utf8');

  const passed = result.status === 0;
  summary.push({ check: check.name, status: passed ? 'passed' : 'failed' });

  if (!passed) {
    failed = true;
  }
}

const summaryMarkdown = [
  '# qa:monorepo summary',
  '',
  '| Check | Status |',
  '| --- | --- |',
  ...summary.map((item) => `| ${item.check} | ${item.status} |`),
  '',
].join('\n');

fs.writeFileSync(path.join(outputDir, 'summary.md'), summaryMarkdown, 'utf8');

if (failed) {
  console.error('qa:monorepo failed. See artifacts/qa-monorepo for details.');
  process.exitCode = 1;
} else {
  console.log('qa:monorepo passed. Artifacts written to artifacts/qa-monorepo.');
}
