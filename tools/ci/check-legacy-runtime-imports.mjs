#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['apps', 'packages'];
const IMPORT_RE = /(?:import\s+[^'"\n]*?from\s*|import\s*\(|export\s+[^'"\n]*?from\s*)['\"]([^'\"]+)['\"]/g;
const BLOCKED_LEGACY_RE = /(^|\/)(legacy|_port)(\/|$)/;
const SKIP_PARTS = ['node_modules', 'dist', 'build', '.next', '.turbo', 'coverage', '.git'];
const EXT_RE = /\.(?:[cm]?[jt]sx?|mjs|cjs)$/;

const CORE_RUNTIME_PATH_PREFIXES = [
  'apps/blackout-client/src/main.tsx',
  'apps/blackout-client/src/index.tsx',
  'apps/blackout-client/src/app/pages/Router.tsx',
  'apps/blackout-client/src/app/pages/client/ClientLayout.tsx',
  'apps/blackout-client/src/app/core/',
];

const BLOCKED_CORE_RUNTIME_IMPORT_PATTERNS = [
  { re: /(^|\/)bmc-[^/]+/, reason: 'blocked bmc-* shell entrypoint path' },
  { re: /(^|\/)hooks\/bmc-[^/]+/, reason: 'legacy hook bridge import' },
  { re: /(^|\/)state\/bmc-[^/]+/, reason: 'legacy state bridge import' },
  { re: /(^|\/)utils\/bmc-[^/]+/, reason: 'legacy utility bridge import' },
  { re: /(^|\/)lib\/bmc-core(\/|$)/, reason: 'legacy bmc-core import' },
];

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_PARTS.some((part) => full.includes(`${path.sep}${part}${path.sep}`) || full.endsWith(`${path.sep}${part}`))) {
        continue;
      }
      walk(full, out);
      continue;
    }
    if (EXT_RE.test(entry.name)) out.push(full);
  }
}

function isCoreRuntimePath(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/');
  return CORE_RUNTIME_PATH_PREFIXES.some((prefix) =>
    prefix.endsWith('.ts') || prefix.endsWith('.tsx')
      ? normalized === prefix
      : normalized.startsWith(prefix)
  );
}

function collectViolations(filePath, cwd) {
  const source = fs.readFileSync(filePath, 'utf8');
  const violations = [];
  const relativePath = path.relative(cwd, filePath).replace(/\\/g, '/');
  const checkCoreRuntime = isCoreRuntimePath(relativePath);

  for (const match of source.matchAll(IMPORT_RE)) {
    const specifier = match[1];
    const matchedReasons = [];

    if (BLOCKED_LEGACY_RE.test(specifier)) {
      matchedReasons.push('blocked legacy path');
    }

    if (checkCoreRuntime) {
      for (const rule of BLOCKED_CORE_RUNTIME_IMPORT_PATTERNS) {
        if (rule.re.test(specifier)) {
          matchedReasons.push(rule.reason);
        }
      }
    }

    if (matchedReasons.length === 0) continue;

    const start = source.lastIndexOf('\n', match.index ?? 0) + 1;
    const line = source.slice(0, start).split('\n').length;
    violations.push({ line, specifier, reason: matchedReasons.join(', ') });
  }

  return violations;
}

const cwd = process.cwd();
const files = [];
for (const root of ROOTS) walk(path.resolve(cwd, root), files);

const errors = [];
for (const file of files) {
  const violations = collectViolations(file, cwd);
  if (violations.length === 0) continue;
  const relative = path.relative(cwd, file);
  for (const violation of violations) {
    errors.push(`${relative}:${violation.line} imports ${violation.reason} "${violation.specifier}"`);
  }
}

if (errors.length > 0) {
  process.stderr.write('Legacy runtime import guard failed:\n');
  process.stderr.write(`${errors.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(`Legacy runtime import guard passed (${files.length} files scanned).\n`);
