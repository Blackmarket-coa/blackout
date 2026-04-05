import { readFileSync } from 'node:fs';

const source = readFileSync('packages/api/src/index.ts', 'utf8');
const domains = ['auth', 'messages', 'governance', 'federation', 'channels'];

const missing = domains.filter((domain) => !source.includes(`/${domain}`));

if (missing.length) {
  console.error(`Missing route domain mounts: ${missing.join(', ')}`);
  process.exit(1);
}

if (!source.includes('for (const root of [API_ROOTS.v1, API_ROOTS.legacyApiAlias])')) {
  console.error('Expected dual namespace mount loop not found.');
  process.exit(1);
}

console.log('Route namespace coverage checks passed for v1 + /api alias domains.');
