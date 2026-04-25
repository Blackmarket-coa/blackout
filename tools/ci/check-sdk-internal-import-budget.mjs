#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const INTERNAL_IMPORT_PATTERN = 'matrix-js-sdk/src/';
const BASELINE_PATH = path.resolve('tools/ci/baselines/sdk-internal-import-budget.json');
const DEBT_REGISTER_PATH = path.resolve('docs/sdk/internal-import-debt-register.md');
const SCAN_ROOTS = ['_port'];
const FILE_GLOBS = ['*.{js,cjs,mjs,ts,tsx}'];

function fail(message) {
  console.error(`SDK internal import budget check failed: ${message}`);
  process.exit(1);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`could not parse JSON file ${filePath}. ${(error && error.message) || error}`);
  }
}

function parseDebtRegister(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const rows = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && line.endsWith('|'));

  const dataRows = rows
    .filter((line) => !line.includes('---'))
    .map((line) => line.slice(1, -1).split('|').map((cell) => cell.trim()));

  if (dataRows.length < 2) {
    fail(`debt register table was not found or is empty in ${filePath}`);
  }

  const [header, ...entries] = dataRows;
  const expectedColumns = ['Category', 'Owner', 'Current Count', 'Approved Budget', 'Update Reference', 'Notes'];
  if (header.length < expectedColumns.length) {
    fail(`debt register header is invalid in ${filePath}`);
  }

  const columnIndex = Object.fromEntries(header.map((value, idx) => [value, idx]));
  for (const columnName of expectedColumns) {
    if (!(columnName in columnIndex)) {
      fail(`debt register is missing required column '${columnName}' in ${filePath}`);
    }
  }

  const categories = new Map();
  for (const entry of entries) {
    const category = entry[columnIndex['Category']];
    if (!category) {
      continue;
    }

    const owner = entry[columnIndex['Owner']];
    const currentCountRaw = entry[columnIndex['Current Count']];
    const approvedBudgetRaw = entry[columnIndex['Approved Budget']];
    const updateReference = entry[columnIndex['Update Reference']];

    const currentCount = Number.parseInt(currentCountRaw, 10);
    const approvedBudget = Number.parseInt(approvedBudgetRaw, 10);

    if (!owner) {
      fail(`category '${category}' in ${filePath} is missing an owner`);
    }
    if (!Number.isFinite(currentCount) || currentCount < 0) {
      fail(`category '${category}' in ${filePath} has invalid Current Count '${currentCountRaw}'`);
    }
    if (!Number.isFinite(approvedBudget) || approvedBudget < 0) {
      fail(`category '${category}' in ${filePath} has invalid Approved Budget '${approvedBudgetRaw}'`);
    }
    if (!updateReference) {
      fail(`category '${category}' in ${filePath} must include Update Reference`);
    }

    categories.set(category, {
      owner,
      currentCount,
      approvedBudget,
      updateReference,
    });
  }

  return categories;
}

function scanInternalImports() {
  const rg = spawnSync(
    'rg',
    [
      '-n',
      '--no-heading',
      '--color',
      'never',
      INTERNAL_IMPORT_PATTERN,
      ...SCAN_ROOTS,
      '-g',
      ...FILE_GLOBS,
    ],
    { encoding: 'utf8' },
  );

  if (rg.status !== 0 && rg.status !== 1) {
    fail(`ripgrep exited with code ${rg.status}. stderr: ${rg.stderr || '<none>'}`);
  }

  const hitLines = rg.status === 0
    ? rg.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    : [];

  const hits = [];
  for (const line of hitLines) {
    const firstColon = line.indexOf(':');
    const secondColon = line.indexOf(':', firstColon + 1);
    const filePath = line.slice(0, firstColon);
    const lineNumber = Number.parseInt(line.slice(firstColon + 1, secondColon), 10);
    const source = line.slice(secondColon + 1);
    const matches = [...source.matchAll(/matrix-js-sdk\/src\/([^"'`\s;)]+)/g)];

    for (const match of matches) {
      const internalModule = match[1];
      const category = internalModule.split('/')[0];
      hits.push({
        filePath,
        lineNumber,
        internalModule,
        category,
      });
    }
  }

  const byCategory = new Map();
  const byModule = new Set();
  for (const hit of hits) {
    byCategory.set(hit.category, (byCategory.get(hit.category) || 0) + 1);
    byModule.add(hit.internalModule);
  }

  return {
    hits,
    byCategory,
    byModule,
  };
}

if (!fs.existsSync(BASELINE_PATH)) {
  fail(`baseline file missing: ${BASELINE_PATH}`);
}
if (!fs.existsSync(DEBT_REGISTER_PATH)) {
  fail(`debt register file missing: ${DEBT_REGISTER_PATH}`);
}

const baseline = readJson(BASELINE_PATH);
const debtRegister = parseDebtRegister(DEBT_REGISTER_PATH);
const { hits, byCategory, byModule } = scanInternalImports();

const allowedModules = new Set(baseline.allowlistedInternalModules || []);
const baselineCategories = baseline.categories || {};

const violations = [];

for (const internalModule of [...byModule].sort()) {
  if (!allowedModules.has(internalModule)) {
    violations.push(`new internal module import not in baseline allowlist: ${internalModule}`);
  }
}

for (const [category, currentCount] of [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const baselineCount = baselineCategories[category];
  const debtEntry = debtRegister.get(category);

  if (typeof baselineCount !== 'number') {
    violations.push(`new internal import category not in baseline: ${category}`);
    continue;
  }

  if (!debtEntry) {
    violations.push(`category '${category}' is missing from debt register (${DEBT_REGISTER_PATH})`);
    continue;
  }

  const allowedCount = Math.max(baselineCount, debtEntry.approvedBudget);
  if (currentCount > allowedCount) {
    violations.push(
      `category '${category}' regressed to ${currentCount} usages (baseline ${baselineCount}, approved budget ${debtEntry.approvedBudget}, owner ${debtEntry.owner})`,
    );
  }

  if (debtEntry.currentCount !== currentCount) {
    violations.push(
      `category '${category}' current count mismatch: debt register=${debtEntry.currentCount}, actual=${currentCount}. Update ${DEBT_REGISTER_PATH}.`,
    );
  }
}

for (const baselineCategory of Object.keys(baselineCategories).sort()) {
  if (!byCategory.has(baselineCategory)) {
    const debtEntry = debtRegister.get(baselineCategory);
    if (!debtEntry) {
      violations.push(`baseline category '${baselineCategory}' missing from debt register`);
      continue;
    }
    if (debtEntry.currentCount !== 0) {
      violations.push(
        `category '${baselineCategory}' has 0 actual usages but debt register current count is ${debtEntry.currentCount}.`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error('SDK internal import budget check failed.');
  console.error(`Pattern: ${INTERNAL_IMPORT_PATTERN}`);
  console.error(`Scanned roots: ${SCAN_ROOTS.join(', ')}`);
  console.error(`Baseline: ${path.relative(process.cwd(), BASELINE_PATH)}`);
  console.error(`Debt register: ${path.relative(process.cwd(), DEBT_REGISTER_PATH)}`);
  console.error('Violations:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log(
  `SDK internal import budget check passed. Found ${hits.length} matches across ${byCategory.size} categories and ${byModule.size} allowlisted internal modules.`,
);
