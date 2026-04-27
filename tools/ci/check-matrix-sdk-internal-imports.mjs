#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const INTERNAL_IMPORT_PATTERN = 'matrix-js-sdk/src/';
const scanRoots = ['apps', 'packages'];
const usagePolicies = [
  {
    name: 'blackout-client',
    description: 'Client application code should not import matrix-js-sdk internals directly.',
    pathPrefixes: ['apps/blackout-client/'],
    budget: 0,
  },
  {
    name: 'blackout-runtime',
    description: 'Runtime packages should use public matrix-js-sdk exports only.',
    pathPrefixes: ['packages/'],
    budget: 0,
  },
];

const rg = spawnSync(
  'rg',
  [
    '-n',
    '--no-heading',
    '--color',
    'never',
    INTERNAL_IMPORT_PATTERN,
    ...scanRoots,
    '-g',
    '*.{js,cjs,mjs,ts,tsx}',
  ],
  { encoding: 'utf8' },
);

if (rg.status !== 1 && rg.status !== 0) {
  console.error(`Matrix SDK internal imports check failed to execute ripgrep. stderr: ${rg.stderr || '<none>'}`);
  process.exit(1);
}

const hits = rg.status === 0
  ? rg.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  : [];

const policyResults = usagePolicies.map((policy) => {
  const matches = hits.filter((hit) => policy.pathPrefixes.some((prefix) => hit.startsWith(prefix)));
  return { ...policy, matches };
});

const violations = policyResults.filter((result) => result.matches.length > result.budget);

if (violations.length > 0) {
  console.error('Matrix SDK internal imports policy check failed.');
  console.error(`Pattern checked: ${INTERNAL_IMPORT_PATTERN}*`);
  for (const violation of violations) {
    console.error(
      `- ${violation.name}: found ${violation.matches.length} usage(s), budget ${violation.budget}. ${violation.description}`,
    );
    for (const match of violation.matches) {
      console.error(`  - ${match}`);
    }
  }
  process.exit(1);
}

const totalHits = policyResults.reduce((sum, result) => sum + result.matches.length, 0);
console.log(`Matrix SDK internal imports policy check passed. Matched usage count: ${totalHits}.`);
