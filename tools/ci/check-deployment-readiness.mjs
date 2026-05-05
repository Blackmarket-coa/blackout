import { existsSync, readFileSync } from 'node:fs';

const requiredPaths = [
  'apps/blackout-client/package.json',
  'apps/blackout-client/.env.example',
  'apps/blackout-client/README.md',
  'apps/blackout-client/src',
  'apps/blackout-client/public',
  'apps/blackout-client/tsconfig.json',
  'apps/blackout-client/vite.config.ts',
  'apps/blackout-server/package.json',
  'apps/blackout-server/.env.example',
  'apps/blackout-server/Dockerfile',
  'apps/blackout-server/README.md',
  'apps/blackout-server/src',
  'apps/blackout-server/tsconfig.json',
  'packages/blackout-protocol/package.json',
  'packages/blackout-protocol/src/index.ts',
  'packages/blackout-sdk/package.json',
  'packages/blackout-sdk/src/index.ts',
  'infra/cloudflare/README.md',
  'infra/railway/README.md',
  'infra/docker',
  'infra/env',
  '.github/workflows/ci.yml',
  'docs/architecture/overview.md',
  'docs/deployment/local.md',
  'docs/deployment/production.md',
  'pnpm-workspace.yaml',
  'turbo.json',
  '.gitignore',
  'README.md',
];

const missingPaths = requiredPaths.filter((file) => !existsSync(file));

const requiredWorkspaceEntries = ['apps/*', 'packages/*', 'blackout-desktop', 'blackout-mobile'];
const workspaceFile = readFileSync('pnpm-workspace.yaml', 'utf8');
const missingWorkspaceEntries = requiredWorkspaceEntries.filter((entry) => !workspaceFile.includes(`- "${entry}"`) && !workspaceFile.includes(`- '${entry}'`) && !workspaceFile.includes(`- ${entry}`));

const rootPackageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const requiredRootScripts = {
  dev: 'turbo run dev --parallel',
  build: 'turbo run build',
  test: 'turbo run test',
  lint: 'turbo run lint',
};

const missingScripts = Object.entries(requiredRootScripts)
  .filter(([script]) => !rootPackageJson.scripts?.[script])
  .map(([script]) => script);

const scriptMismatches = Object.entries(requiredRootScripts)
  .filter(([script, command]) => rootPackageJson.scripts?.[script] && rootPackageJson.scripts[script] !== command)
  .map(([script, command]) => `${script} -> expected "${command}" but found "${rootPackageJson.scripts[script]}"`);

const requiredGitignoreEntries = ['node_modules', 'dist', 'build', '.next', 'coverage', '.env', '.env.*', '!.env.example', '.turbo', '.pnpm-store'];
const gitignoreFile = readFileSync('.gitignore', 'utf8');
const missingGitignoreEntries = requiredGitignoreEntries.filter((entry) => !gitignoreFile.includes(entry));

const errors = [];

if (missingPaths.length > 0) {
  errors.push('Missing required deployment paths:\n' + missingPaths.map((file) => `- ${file}`).join('\n'));
}

if (missingWorkspaceEntries.length > 0) {
  errors.push('pnpm-workspace.yaml is missing required workspace entries:\n' + missingWorkspaceEntries.map((entry) => `- ${entry}`).join('\n'));
}

if (missingScripts.length > 0) {
  errors.push('Root package.json is missing required scripts:\n' + missingScripts.map((name) => `- ${name}`).join('\n'));
}

if (scriptMismatches.length > 0) {
  errors.push('Root package.json script values differ from the deployment baseline:\n' + scriptMismatches.map((value) => `- ${value}`).join('\n'));
}

if (missingGitignoreEntries.length > 0) {
  errors.push('.gitignore is missing baseline entries:\n' + missingGitignoreEntries.map((entry) => `- ${entry}`).join('\n'));
}

if (errors.length > 0) {
  console.error('Deployment readiness check failed.');
  for (const error of errors) {
    console.error(`\n${error}`);
  }
  process.exit(1);
}

console.log('Deployment readiness assertions passed against the Blackout baseline checklist.');
