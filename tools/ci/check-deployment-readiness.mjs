import { existsSync, readFileSync } from 'node:fs';

const requiredPaths = [
  'apps/blackout-client/package.json',
  'apps/blackout-client/.env.example',
  'apps/blackout-server/package.json',
  'apps/blackout-server/.env.example',
  'apps/blackout-server/Dockerfile',
  'packages/blackout-protocol/package.json',
  'packages/blackout-sdk/package.json',
  'infra/README.md',
  'infra/cloudflare/.gitkeep',
  'infra/docker/.gitkeep',
  'infra/env/.gitkeep',
  'infra/nginx/.gitkeep',
  'infra/railway/.gitkeep',
  'pnpm-workspace.yaml',
  'turbo.json',
  'README.md',
];

const missing = requiredPaths.filter((file) => !existsSync(file));
if (missing.length > 0) {
  console.error('Deployment readiness check failed. Missing required files:');
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}

const rootPackageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const requiredRootScripts = ['build', 'test', 'dev'];
const missingScripts = requiredRootScripts.filter((name) => !rootPackageJson.scripts?.[name]);
if (missingScripts.length > 0) {
  console.error(`Deployment readiness check failed. Missing root scripts: ${missingScripts.join(', ')}`);
  process.exit(1);
}

console.log('Deployment readiness file/script assertions passed.');
