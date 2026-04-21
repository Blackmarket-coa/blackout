import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const scriptPath = path.join(repoRoot, 'tools/ci/check-pr-dod.mjs');

function runFile(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-dod-'));
  const file = path.join(dir, 'pr-body.md');
  fs.writeFileSync(file, content);
  return spawnSync('node', [scriptPath, '--file', file], { encoding: 'utf8' });
}

const validBody = `
## Scope
- [x] Lane: A (UX) / B (Packaging) / C (Instrumentation)
- [x] PR wave: Wave 1 / Wave 2 / Wave 3

## User-facing before/after
- [x] Before and after behavior clearly stated for users/admins.

## Risk and rollback
- [x] Rollback toggle(s) documented (exact feature flag/config key).
- [x] Blast radius + rollback steps documented.

## Tests
- [x] Unit tests for touched packages.
- [x] Integration/e2e checks (if applicable).
- [x] Targeted PR checks executed for touched paths:
  - [x] \`pnpm --filter @blackout/client lint\`
  - [x] \`pnpm --filter @blackout/client test:unit\`
  - [x] \`pnpm --filter @blackout/client test:integration\`
  - [x] \`pnpm --filter @blackout/client build\`

## Architecture/review checklist
- [x] Entitlement path review completed (state fetch, gating, and transition behavior validated for changed flows).
- [x] Panel placement review completed (new or changed panel entry points/layout placements validated on intended surfaces).

## KPI impact statement
- [x] KPI target statement included (expected directional movement and band).
- [x] Query links attached:
  - Onboarding drop-off: https://analytics.blackout.local/dashboards/onboarding-dropoff
  - Feature discovery: https://analytics.blackout.local/dashboards/feature-discovery
  - TTFV: https://analytics.blackout.local/dashboards/ttfv
  - Invite completion: https://analytics.blackout.local/dashboards/invite-completion
`;

test('passes with fully checked DoD body', () => {
  const res = runFile(validBody);
  assert.equal(res.status, 0, res.stderr || res.stdout);
  assert.match(res.stdout, /validation passed/i);
});

test('fails when required checkbox is unchecked', () => {
  const res = runFile(validBody.replace('- [x] Unit tests for touched packages.', '- [ ] Unit tests for touched packages.'));
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /missing checked checklist item/i);
});

test('fails when KPI links are missing', () => {
  const res = runFile(validBody.replace(/https:\/\/analytics\.blackout\.local\/dashboards\/[a-z-]+/g, 'https://example.com'));
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /Missing one or more KPI dashboard links/i);
});
