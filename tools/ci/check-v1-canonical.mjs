import { readFileSync } from 'node:fs';

const webApiClient = readFileSync(new URL('../../packages/web/src/lib/api.ts', import.meta.url), 'utf8');
const apiServer = readFileSync(new URL('../../packages/api/src/index.ts', import.meta.url), 'utf8');

const errors = [];

if (webApiClient.includes('/api')) {
  errors.push('Web API client still contains hardcoded /api paths.');
}

if (!webApiClient.includes("@blackout/contracts")) {
  errors.push('Web API client is not importing shared contract bindings.');
}

if (!apiServer.includes('API_ROOTS.v1')) {
  errors.push('Backend is not mounting /v1 routes.');
}

if (errors.length) {
  console.error('v1 canonical API checks failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('v1 canonical API checks passed.');
