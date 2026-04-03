#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function readBody() {
  const file = getArg('--file');
  if (file) {
    const full = path.resolve(process.cwd(), file);
    if (!fs.existsSync(full)) fail(`PR body file not found: ${full}`);
    return fs.readFileSync(full, 'utf8');
  }

  const fromEnv = process.env.PR_BODY;
  if (fromEnv && fromEnv.trim()) return fromEnv;

  fail('Missing PR body. Provide --file <path> or PR_BODY env var.');
}

const body = readBody();

const requiredCheckedItems = [
  'Lane: A (UX) / B (Packaging) / C (Instrumentation)',
  'PR wave: Wave 1 / Wave 2 / Wave 3',
  'Before and after behavior clearly stated for users/admins.',
  'Rollback toggle(s) documented (exact feature flag/config key).',
  'Blast radius + rollback steps documented.',
  'Unit tests for touched packages.',
  'KPI target statement included (expected directional movement and band).',
  'Query links attached:',
];

const missing = [];
for (const item of requiredCheckedItems) {
  const checkedPattern = new RegExp(`-\\s*\\[x\\]\\s*${item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
  if (!checkedPattern.test(body)) {
    missing.push(item);
  }
}

if (missing.length > 0) {
  fail(`PR DoD validation failed. Missing checked checklist item(s):\n- ${missing.join('\n- ')}`);
}

const hasKpiLinks = [
  'onboarding-dropoff',
  'feature-discovery',
  'ttfv',
  'invite-completion',
].every((token) => body.toLowerCase().includes(token));

if (!hasKpiLinks) {
  fail('PR DoD validation failed. Missing one or more KPI dashboard links.');
}

process.stdout.write('PR DoD validation passed.\n');
