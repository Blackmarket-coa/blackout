#!/usr/bin/env node
/**
 * Production-readiness guard: prevent the API from re-introducing a wide-open
 * CORS policy. The Hono `cors()` helper, when called with no arguments, allows
 * every origin — that is fine for a private dev box but a critical exposure in
 * production. This guard scans the API server source for `cors()` invocations
 * with no `origin` configuration and fails the build if any are found.
 */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ROOT = 'packages/api/src';

let files;
try {
  const out = execSync(`git ls-files ${ROOT}`, { encoding: 'utf8' });
  files = out.split('\n').filter((line) => line.endsWith('.ts'));
} catch (err) {
  console.error('check-cors-allowlist: failed to enumerate files:', err.message);
  process.exit(2);
}

const violations = [];
const CALL_RE = /\bcors\s*\(\s*([^)]*)\)/g;

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  let match;
  while ((match = CALL_RE.exec(text)) !== null) {
    const args = match[1].trim();
    // Allow:
    //  - cors({ origin: ... })  — explicit origin handler
    //  - cors({ ... origin: ... })
    if (args.length === 0) {
      violations.push({ file, snippet: match[0], reason: 'cors() called with no arguments — allows any origin' });
      continue;
    }
    if (!args.includes('origin')) {
      violations.push({
        file,
        snippet: match[0],
        reason: 'cors(...) call has no `origin` field — must explicitly allow or deny',
      });
    }
  }
}

if (violations.length > 0) {
  console.error('check-cors-allowlist: FAIL');
  for (const v of violations) {
    console.error(`  ${v.file}: ${v.reason}`);
    console.error(`    ${v.snippet}`);
  }
  console.error(
    '\nFix: pass an explicit `origin` callback driven by readCorsRuntimeConfig (see packages/api/src/config/cors.ts).',
  );
  process.exit(1);
}

console.log(`check-cors-allowlist: OK (${files.length} file(s) scanned)`);
