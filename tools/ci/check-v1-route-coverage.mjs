import { readFileSync } from 'node:fs';

const source = readFileSync('packages/api/src/index.ts', 'utf8');
const domains = ['auth', 'messages', 'governance', 'federation', 'channels'];

const missing = domains.filter((domain) => !source.includes(`/${domain}`));

if (missing.length) {
  console.error(`Missing route domain mounts: ${missing.join(', ')}`);
  process.exit(1);
}

if (!source.includes('legacyAliasEnabled ? [API_ROOTS.v1, API_ROOTS.legacyApiAlias] : [API_ROOTS.v1]')) {
  console.error('Expected v1 + conditional /api alias mount logic not found.');
  process.exit(1);
}

console.log('Route namespace coverage checks passed for v1 + conditional /api alias domains.');
