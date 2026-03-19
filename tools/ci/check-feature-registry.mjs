#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_FIELDS = [
  'id',
  'name',
  'category',
  'status',
  'presetKey',
  'uiEntry',
  'owner',
  'testCoverage',
  'notes',
  'sourcePointers',
];

const VALID_CATEGORIES = new Set(['novel', 'discord_like', 'matrix_like']);
const VALID_STATUSES = new Set(['implemented', 'partial', 'planned']);
const VALID_UI_ENTRY_PREFIXES = new Set([
  'settings_toggle',
  'composer_action',
  'room_action',
  'widget_panel',
  'admin_console',
]);

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const registryPath = path.resolve(process.cwd(), getArg('--file') ?? 'docs/features/feature_registry.json');

if (!fs.existsSync(registryPath)) {
  fail(`Feature registry not found: ${registryPath}`);
}

let registry;
try {
  const raw = fs.readFileSync(registryPath, 'utf8');
  registry = JSON.parse(raw);
} catch (error) {
  fail(`Invalid JSON in ${registryPath}: ${error.message}`);
}

if (!Array.isArray(registry)) {
  fail('Feature registry must be a JSON array.');
}

const seenIds = new Set();
const errors = [];

for (const [index, row] of registry.entries()) {
  const prefix = `Row ${index}`;

  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    errors.push(`${prefix}: must be an object.`);
    continue;
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in row)) {
      errors.push(`${prefix}: missing required field "${field}".`);
      continue;
    }

    if (typeof row[field] === 'string' && row[field].trim().length === 0) {
      errors.push(`${prefix}: required field "${field}" cannot be empty.`);
    }
  }

  if (typeof row.id === 'string') {
    if (seenIds.has(row.id)) {
      errors.push(`${prefix}: duplicate id "${row.id}".`);
    }
    seenIds.add(row.id);
  }

  if (typeof row.category === 'string' && !VALID_CATEGORIES.has(row.category)) {
    errors.push(`${prefix}: invalid category "${row.category}".`);
  }

  if (typeof row.status === 'string' && !VALID_STATUSES.has(row.status)) {
    errors.push(`${prefix}: invalid status "${row.status}".`);
  }

  if (typeof row.uiEntry === 'string') {
    const [uiPrefix, testId] = row.uiEntry.split(':');
    if (!VALID_UI_ENTRY_PREFIXES.has(uiPrefix)) {
      errors.push(`${prefix}: uiEntry must start with one of ${Array.from(VALID_UI_ENTRY_PREFIXES).join(', ')}.`);
    }
    if (!testId || testId.trim().length === 0) {
      errors.push(`${prefix}: uiEntry must include a data-testid suffix after ':'.`);
    }
  }

  if (!Array.isArray(row.sourcePointers) || row.sourcePointers.length === 0) {
    errors.push(`${prefix}: "sourcePointers" must be a non-empty array.`);
  } else if (!row.sourcePointers.every((pointer) => typeof pointer === 'string' && pointer.trim().length > 0)) {
    errors.push(`${prefix}: all "sourcePointers" entries must be non-empty strings.`);
  }
}

if (errors.length > 0) {
  fail(`Feature registry validation failed:\n- ${errors.join('\n- ')}`);
}

process.stdout.write(`Feature registry validation passed (${registry.length} rows).\n`);
