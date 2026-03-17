#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const WHITELIST = new Set([
  '_port/README.md',
  '_port/MIGRATION_INVENTORY.md',
]);

function runGit(args) {
  const res = spawnSync('git', args, { encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${res.stderr || res.stdout}`);
  }
  return res.stdout.trim();
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

function listChangedFiles() {
  const explicitRange = getArg('--range');
  const baseRef = getArg('--base');

  if (explicitRange) {
    const output = runGit(['diff', '--name-only', explicitRange]);
    return output ? output.split('\n').filter(Boolean) : [];
  }

  if (baseRef) {
    const output = runGit(['diff', '--name-only', `${baseRef}...HEAD`]);
    return output ? output.split('\n').filter(Boolean) : [];
  }

  const staged = runGit(['diff', '--cached', '--name-only']);
  const unstaged = runGit(['diff', '--name-only']);
  const untracked = runGit(['ls-files', '--others', '--exclude-standard']);
  return [
    ...new Set(
      [
        ...(staged ? staged.split('\n') : []),
        ...(unstaged ? unstaged.split('\n') : []),
        ...(untracked ? untracked.split('\n') : []),
      ].filter(Boolean),
    ),
  ];
}

const files = listChangedFiles();
const blocked = files.filter((file) => file.startsWith('_port/') && !WHITELIST.has(file));

if (blocked.length > 0) {
  process.stderr.write('Blocked _port changes detected:\n');
  for (const file of blocked) {
    process.stderr.write(` - ${file}\n`);
  }
  process.stderr.write('\n_port is parked source/reference-only. Move implementation into packages/ or apps/.\n');
  process.exit(1);
}

process.stdout.write('No blocked _port changes detected.\n');
