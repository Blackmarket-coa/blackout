#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['apps', 'packages'];
const IMPORT_RE = /(?:import\s+[^'"\n]*?from\s*|import\s*\(|export\s+[^'"\n]*?from\s*)['\"]([^'\"]+)['\"]/g;
const BLOCKED_RE = /(^|\/)(legacy|_port)(\/|$)/;
const SKIP_PARTS = ['node_modules', 'dist', 'build', '.next', '.turbo', 'coverage', '.git'];
const EXT_RE = /\.(?:[cm]?[jt]sx?|mjs|cjs)$/;

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

function collectViolations(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const violations = [];

  for (const match of source.matchAll(IMPORT_RE)) {
    const specifier = match[1];
    if (!BLOCKED_RE.test(specifier)) continue;
    const start = source.lastIndexOf('\n', match.index ?? 0) + 1;
    const line = source.slice(0, start).split('\n').length;
    violations.push({ line, specifier });
  }

  return violations;
}

const files = [];
for (const root of ROOTS) walk(path.resolve(process.cwd(), root), files);

const errors = [];
for (const file of files) {
  const violations = collectViolations(file);
  if (violations.length === 0) continue;
  const relative = path.relative(process.cwd(), file);
  for (const violation of violations) {
    errors.push(`${relative}:${violation.line} imports blocked legacy path "${violation.specifier}"`);
  }
}

if (errors.length > 0) {
  process.stderr.write('Legacy runtime import guard failed:\n');
  process.stderr.write(`${errors.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(`Legacy runtime import guard passed (${files.length} files scanned).\n`);
