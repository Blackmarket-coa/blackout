import { readFileSync, readdirSync } from 'node:fs';

const indexSource = readFileSync('packages/api/src/index.ts', 'utf8');

// Core API domains are mounted one of two ways and both must count as covered:
//   1. Directly in index.ts, e.g. app.route(`${root}/auth`, authRoutes)
//   2. Via a feature module folded in by registerFeatureModules(), declared as
//      `mountPath: '/governance'` in packages/api/src/modules/<name>.ts
// We deliberately match the *mount* form (a template-literal `/<domain>` route
// in index.ts, or a module mountPath) rather than any `/domain` substring, so
// an incidental path like stego's internal `/channels` route can't mask a
// missing top-level mount.
const moduleDir = 'packages/api/src/modules';
const moduleMountPaths = readdirSync(moduleDir)
  .filter((file) => file.endsWith('.ts'))
  .flatMap((file) => {
    const source = readFileSync(`${moduleDir}/${file}`, 'utf8');
    return [...source.matchAll(/mountPath:\s*(["'`])(\/[^"'`]+)\1/g)].map((match) => match[2]);
  });

const domains = ['auth', 'messages', 'governance', 'federation', 'channels'];

const isMounted = (domain) =>
  indexSource.includes(`/${domain}\``) || moduleMountPaths.includes(`/${domain}`);

const missing = domains.filter((domain) => !isMounted(domain));

if (missing.length) {
  console.error(`Missing route domain mounts: ${missing.join(', ')}`);
  process.exit(1);
}

if (!indexSource.includes('legacyAliasEnabled ? [API_ROOTS.v1, API_ROOTS.legacyApiAlias] : [API_ROOTS.v1]')) {
  console.error('Expected v1 + conditional /api alias mount logic not found.');
  process.exit(1);
}

console.log('Route namespace coverage checks passed for v1 + conditional /api alias domains.');
