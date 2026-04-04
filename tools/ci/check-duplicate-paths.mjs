#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const textExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function getTrackedFiles() {
  const out = execFileSync('git', ['ls-files'], { encoding: 'utf8' });
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function checkCaseInsensitivePathCollisions(files) {
  const byLower = new Map();
  for (const file of files) {
    const key = file.toLowerCase();
    const bucket = byLower.get(key) ?? [];
    bucket.push(file);
    byLower.set(key, bucket);
  }

  return [...byLower.values()].filter((group) => group.length > 1);
}


function isTestLikeFile(file) {
  return (
    file.includes('/tests/') ||
    file.includes('/test/') ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)
  );
}

function collectRoutePathLiterals(files) {
  const routeLiterals = new Map();

  const patterns = [
    /\bpath\s*:\s*(["'`])([^"'`]+)\1/g,
    /\bpath\s*=\s*(["'])([^"']+)\1/g,
  ];

  for (const file of files) {
    if (!textExtensions.has(extname(file)) || isTestLikeFile(file)) continue;

    const content = readFileSync(file, 'utf8');
    for (const pattern of patterns) {
      for (const match of content.matchAll(pattern)) {
        const value = match[2]?.trim();
        if (!value || !value.startsWith('/')) continue;

        const occurrences = routeLiterals.get(value) ?? [];
        occurrences.push(file);
        routeLiterals.set(value, occurrences);
      }
    }
  }

  return [...routeLiterals.entries()]
    .map(([path, occurrences]) => ({ path, occurrences }))
    .filter(({ occurrences }) => occurrences.length > 1);
}

function printError(message) {
  console.error(`❌ ${message}`);
}

function printOk(message) {
  console.log(`✅ ${message}`);
}

const files = getTrackedFiles();

const pathCollisions = checkCaseInsensitivePathCollisions(files);
const duplicateRoutePaths = collectRoutePathLiterals(files);

if (pathCollisions.length === 0) {
  printOk('No case-insensitive file path collisions found.');
} else {
  printError('Case-insensitive file path collisions found:');
  for (const group of pathCollisions) {
    console.error(`  - ${group.join('  <->  ')}`);
  }
}

if (duplicateRoutePaths.length === 0) {
  printOk('No duplicate absolute route path literals found.');
} else {
  printError('Duplicate absolute route path literals found:');
  for (const { path, occurrences } of duplicateRoutePaths) {
    console.error(`  - ${path}`);
    for (const file of occurrences) {
      console.error(`      • ${file}`);
    }
  }
}

if (pathCollisions.length > 0 || duplicateRoutePaths.length > 0) {
  process.exit(1);
}
