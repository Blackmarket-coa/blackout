import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const targetFiles = [
  'packages/api/src/services/auth.ts',
  'packages/api/src/index.ts',
  'docs/deploy-fedora-tauri.md',
  'docs/deploying-blackout-fedora-tauri.md',
];

const forbiddenPatterns = [
  /JWT_SECRET\s*\?\?\s*['"]/,
  /JWT_SECRET_PRIMARY\s*\?\?\s*['"]/,
  /AUTH_COOKIE_SECURE\s*=\s*['"]false['"]/i,
  /local-dev-secret['"]\s*;$/m,
];

const failures = [];
for (const rel of targetFiles) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) continue;
  const content = fs.readFileSync(abs, 'utf8');
  forbiddenPatterns.forEach((pattern) => {
    if (pattern.test(content)) {
      failures.push(`${rel} matched forbidden pattern ${pattern}`);
    }
  });
}

if (failures.length > 0) {
  console.error('Auth secret hardening check failed:');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('Auth secret hardening check passed.');
