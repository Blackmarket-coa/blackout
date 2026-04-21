#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_PACKAGES = [
  '@blackout/client',
  '@blackout/server',
  '@blackout/core',
  '@blackout/protocol',
  '@blackout/sdk',
];

const workspaceRoots = ['apps', 'packages'];
const packageNames = new Set();

for (const root of workspaceRoots) {
  const rootDir = path.resolve(process.cwd(), root);
  if (!fs.existsSync(rootDir)) continue;

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const packageJsonPath = path.join(rootDir, entry.name, 'package.json');
    if (!fs.existsSync(packageJsonPath)) continue;

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    if (typeof packageJson.name === 'string') {
      packageNames.add(packageJson.name);
    }
  }
}

const missing = REQUIRED_PACKAGES.filter((name) => !packageNames.has(name));

if (missing.length > 0) {
  console.error('Workspace package assertion check failed. Missing required package names:');
  for (const name of missing) {
    console.error(`- ${name}`);
  }
  process.exitCode = 1;
} else {
  console.log('Workspace package assertion check passed.');
}
