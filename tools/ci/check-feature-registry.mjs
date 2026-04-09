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
  'presetPolicy',
  'uiTestRefs',
  'fallbackBehavior',
  'evidenceType',
  'lastVerifiedAt',
  'verifiedBy',
  'evidencePaths',
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
const VALID_EVIDENCE_TYPES = new Set(['code', 'docs', 'runtime', 'external-infra']);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function hasVerifiableInfraEvidence(paths) {
  return paths.some((pathEntry) =>
    /^ops-artifact:/.test(pathEntry)
    || pathEntry.startsWith('docs/operations/runbooks/')
    || pathEntry.startsWith('docs/operations/evidence/'),
  );
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function toCanonicalRegistry(registry) {
  if (Array.isArray(registry)) {
    return {
      features: registry,
      scopes: [
        {
          id: 'legacy-array-scope',
          sections: [
            { id: 'novel', featureIds: registry.filter((row) => row?.category === 'novel').map((row) => row.id) },
            { id: 'discord_like', featureIds: registry.filter((row) => row?.category === 'discord_like').map((row) => row.id) },
            { id: 'matrix_like', featureIds: registry.filter((row) => row?.category === 'matrix_like').map((row) => row.id) },
          ],
        },
      ],
    };
  }

  if (!registry || typeof registry !== 'object') {
    return null;
  }

  if (!Array.isArray(registry.features) || !Array.isArray(registry.scopes)) {
    return null;
  }

  return {
    features: registry.features,
    scopes: registry.scopes,
  };
}

const registryPath = path.resolve(process.cwd(), getArg('--file') ?? 'docs/features/feature_registry.json');

if (!fs.existsSync(registryPath)) {
  fail(`Feature registry not found: ${registryPath}`);
}

let parsedRegistry;
try {
  const raw = fs.readFileSync(registryPath, 'utf8');
  parsedRegistry = JSON.parse(raw);
} catch (error) {
  fail(`Invalid JSON in ${registryPath}: ${error.message}`);
}

const canonical = toCanonicalRegistry(parsedRegistry);
if (!canonical) {
  fail('Feature registry must be a JSON array or an object with "features" and "scopes" arrays.');
}

const { features, scopes } = canonical;

const featureById = new Map();
const errors = [];

for (const [index, row] of features.entries()) {
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
    if (featureById.has(row.id)) {
      errors.push(`${prefix}: duplicate id "${row.id}".`);
    }
    featureById.set(row.id, row);
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

  if (!row.presetPolicy || typeof row.presetPolicy !== 'object') {
    errors.push(`${prefix}: "presetPolicy" must be an object.`);
  } else {
    for (const preset of ['baseline_matrix', 'community_plus', 'blackout_full']) {
      if (typeof row.presetPolicy[preset] !== 'boolean') {
        errors.push(`${prefix}: presetPolicy.${preset} must be boolean.`);
      }
    }
  }

  if (!Array.isArray(row.uiTestRefs) || row.uiTestRefs.length === 0) {
    errors.push(`${prefix}: "uiTestRefs" must be a non-empty array.`);
  } else if (!row.uiTestRefs.every((ref) => typeof ref === 'string' && ref.includes('::'))) {
    errors.push(`${prefix}: each uiTestRefs entry must be a "path::token" string.`);
  }

  if (!Array.isArray(row.sourcePointers) || row.sourcePointers.length === 0) {
    errors.push(`${prefix}: "sourcePointers" must be a non-empty array.`);
  } else if (!row.sourcePointers.every((pointer) => typeof pointer === 'string' && pointer.trim().length > 0)) {
    errors.push(`${prefix}: all "sourcePointers" entries must be non-empty strings.`);
  }

  if (typeof row.evidenceType !== 'string' || !VALID_EVIDENCE_TYPES.has(row.evidenceType)) {
    errors.push(`${prefix}: evidenceType must be one of ${Array.from(VALID_EVIDENCE_TYPES).join(', ')}.`);
  }

  if (!Array.isArray(row.evidencePaths) || row.evidencePaths.length === 0) {
    errors.push(`${prefix}: "evidencePaths" must be a non-empty array.`);
  } else if (!row.evidencePaths.every((evidencePath) => typeof evidencePath === 'string' && evidencePath.trim().length > 0)) {
    errors.push(`${prefix}: all "evidencePaths" entries must be non-empty strings.`);
  }

  if (row.lastVerifiedAt != null && (typeof row.lastVerifiedAt !== 'string' || !ISO_DATE_PATTERN.test(row.lastVerifiedAt))) {
    errors.push(`${prefix}: lastVerifiedAt must be null or an ISO date string (YYYY-MM-DD).`);
  }

  if (row.verifiedBy != null && (typeof row.verifiedBy !== 'string' || row.verifiedBy.trim().length === 0)) {
    errors.push(`${prefix}: verifiedBy must be null or a non-empty string.`);
  }

  const notes = typeof row.notes === 'string' ? row.notes.toLowerCase() : '';
  const referencesInfraClaim = /\b(dl360|cloudflare|tunnel|infra|infrastructure|host|runtime)\b/.test(notes);
  if (referencesInfraClaim && row.evidenceType !== 'external-infra') {
    errors.push(`${prefix}: infra/runtime claims must set evidenceType to "external-infra".`);
  }

  if (row.evidenceType === 'external-infra') {
    const hasVerifiableEvidence = Array.isArray(row.evidencePaths) && hasVerifiableInfraEvidence(row.evidencePaths);
    if (!hasVerifiableEvidence) {
      if (row.verifiedBy !== 'unverified') {
        errors.push(`${prefix}: external-infra claims without runbook/evidence artifacts must set verifiedBy to "unverified".`);
      }
      if (row.lastVerifiedAt !== null) {
        errors.push(`${prefix}: external-infra claims without runbook/evidence artifacts must set lastVerifiedAt to null.`);
      }
    }
  }
}

for (const [scopeIndex, scope] of scopes.entries()) {
  const scopeLabel = scope?.id ?? `scope-${scopeIndex}`;

  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
    errors.push(`Scope ${scopeIndex}: must be an object.`);
    continue;
  }

  if (!Array.isArray(scope.sections)) {
    errors.push(`Scope "${scopeLabel}": "sections" must be an array.`);
    continue;
  }

  const seenSectionIds = new Set();
  const scopeUniqueIds = new Set();
  const scopeNames = new Map();

  for (const [sectionIndex, section] of scope.sections.entries()) {
    const sectionLabel = section?.id ?? `${scopeLabel}-section-${sectionIndex}`;

    if (!section || typeof section !== 'object' || Array.isArray(section)) {
      errors.push(`Scope "${scopeLabel}" section ${sectionIndex}: must be an object.`);
      continue;
    }

    if (typeof section.id === 'string') {
      if (seenSectionIds.has(section.id)) {
        errors.push(`Scope "${scopeLabel}": duplicate section id "${section.id}".`);
      }
      seenSectionIds.add(section.id);
    }

    if (!Array.isArray(section.featureIds)) {
      errors.push(`Scope "${scopeLabel}" section "${sectionLabel}": "featureIds" must be an array.`);
      continue;
    }

    const sectionUniqueIds = new Set();

    for (const featureId of section.featureIds) {
      if (typeof featureId !== 'string' || featureId.trim().length === 0) {
        errors.push(`Scope "${scopeLabel}" section "${sectionLabel}": featureIds must contain non-empty strings.`);
        continue;
      }

      if (!featureById.has(featureId)) {
        errors.push(`Scope "${scopeLabel}" section "${sectionLabel}": unknown feature id "${featureId}".`);
        continue;
      }

      sectionUniqueIds.add(featureId);
      scopeUniqueIds.add(featureId);

      const featureName = String(featureById.get(featureId).name ?? '').trim().toLowerCase();
      if (featureName.length > 0) {
        const existingFeatureId = scopeNames.get(featureName);
        if (existingFeatureId && existingFeatureId !== featureId) {
          errors.push(`Scope "${scopeLabel}": duplicate feature name "${featureById.get(featureId).name}" in scope.`);
        }
        scopeNames.set(featureName, featureId);
      }
    }

    if (typeof section.total === 'number' && section.total !== sectionUniqueIds.size) {
      errors.push(
        `Scope "${scopeLabel}" section "${sectionLabel}": total=${section.total} does not match unique featureIds=${sectionUniqueIds.size}.`,
      );
    }
  }

  if (typeof scope.globalTotal === 'number' && scope.globalTotal !== scopeUniqueIds.size) {
    errors.push(`Scope "${scopeLabel}": globalTotal=${scope.globalTotal} does not match unique scoped features=${scopeUniqueIds.size}.`);
  }
}

if (errors.length > 0) {
  fail(`Feature registry validation failed:\n- ${errors.join('\n- ')}`);
}

process.stdout.write(`Feature registry validation passed (${features.length} rows across ${scopes.length} scope(s)).\n`);
