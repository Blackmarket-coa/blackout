#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['apps', 'packages'];
const IMPORT_RE = /(?:import\s+[^'"\n]*?from\s*|import\s*\(|export\s+[^'"\n]*?from\s*)['\"]([^'\"]+)['\"]/g;
const BLOCKED_LEGACY_RE = /(^|\/)(legacy|_port)(\/|$)/;
const BLOCKED_BMC_RE = /(^|\/)bmc-[^/]+/;
const SKIP_PARTS = ['node_modules', 'dist', 'build', '.next', '.turbo', 'coverage', '.git'];
const EXT_RE = /\.(?:[cm]?[jt]sx?|mjs|cjs)$/;

const SHELL_RUNTIME_ENTRYPOINTS = new Set([
  'apps/blackout-client/src/main.tsx',
  'apps/blackout-client/src/index.tsx',
  'apps/blackout-client/src/app/core/features/registry.ts',
  'apps/blackout-client/src/app/core/features/plugins.ts',
  'apps/blackout-client/src/app/core/features/composition.ts',
]);

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

function collectViolations(filePath, cwd) {
  const source = fs.readFileSync(filePath, 'utf8');
  const violations = [];
  const relativePath = path.relative(cwd, filePath);
  const isShellEntrypoint = SHELL_RUNTIME_ENTRYPOINTS.has(relativePath.replace(/\\/g, '/'));

  for (const match of source.matchAll(IMPORT_RE)) {
    const specifier = match[1];
    const isLegacyViolation = BLOCKED_LEGACY_RE.test(specifier);
    const isBmcViolation = isShellEntrypoint && BLOCKED_BMC_RE.test(specifier);
    if (!isLegacyViolation && !isBmcViolation) continue;

    const start = source.lastIndexOf('\n', match.index ?? 0) + 1;
    const line = source.slice(0, start).split('\n').length;
    const reason = isLegacyViolation ? 'blocked legacy path' : 'blocked bmc-* shell entrypoint path';
    violations.push({ line, specifier, reason });
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
