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
const STRING_LITERAL_RE = /'([^']+)'/g;

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

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

function parseRegisteredFeatureIds(source) {
  const match = source.match(/registeredFeatureModuleIds\s*=\s*\[([\s\S]*?)\]/m);
  if (!match) return null;

  const ids = [];
  for (const literal of match[1].matchAll(STRING_LITERAL_RE)) {
    ids.push(literal[1]);
  }

  return ids;
}

function parseFlagIdsFromCoreModules(source) {
  const ids = [];
  const flagRe = /flag\s*:\s*'([^']+)'/g;
  for (const match of source.matchAll(flagRe)) {
    ids.push(match[1]);
  }
  return ids;
}

function parseFeatureIdsFromPlugins(source) {
  const ids = [];
  const moduleIdRe = /feature\s*:\s*\{[\s\S]*?id\s*:\s*'([^']+)'[\s\S]*?\}/g;
  for (const match of source.matchAll(moduleIdRe)) {
    ids.push(match[1]);
  }
  return ids;
}

function validateClientFeatureRegistration(errors) {
  const registryTs = path.resolve(process.cwd(), getArg('--registry-ts') ?? 'apps/blackout-client/src/app/core/features/registry.ts');
  const coreModulesTs = path.resolve(process.cwd(), getArg('--core-modules-ts') ?? 'apps/blackout-client/src/app/core/features/coreModules.ts');
  const pluginsTs = path.resolve(process.cwd(), getArg('--plugins-ts') ?? 'apps/blackout-client/src/app/core/features/plugins.ts');

  const registrySource = readIfExists(registryTs);
  const coreSource = readIfExists(coreModulesTs);
  const pluginsSource = readIfExists(pluginsTs);

  if (!registrySource || !coreSource || !pluginsSource) {
    return;
  }

  const registeredFeatureIds = parseRegisteredFeatureIds(registrySource);
  if (!registeredFeatureIds || registeredFeatureIds.length === 0) {
    errors.push(`Client feature registry missing registeredFeatureModuleIds allowlist in ${path.relative(process.cwd(), registryTs)}.`);
    return;
  }

  const registeredSet = new Set(registeredFeatureIds);

  const coreFlagIds = parseFlagIdsFromCoreModules(coreSource);
  for (const flagId of coreFlagIds) {
    if (!registeredSet.has(flagId)) {
      errors.push(`Core feature module flag "${flagId}" is not in registeredFeatureModuleIds.`);
    }
  }

  const pluginFeatureIds = parseFeatureIdsFromPlugins(pluginsSource);
  for (const featureId of pluginFeatureIds) {
    if (!registeredSet.has(featureId)) {
      errors.push(`Plugin injects unregistered feature id "${featureId}" in ${path.relative(process.cwd(), pluginsTs)}.`);
    }
  }
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

      if (sectionUniqueIds.has(featureId)) {
        errors.push(`Scope "${scopeLabel}" section "${sectionLabel}": duplicate feature id "${featureId}".`);
      }
      sectionUniqueIds.add(featureId);
      scopeUniqueIds.add(featureId);

      const featureName = featureById.get(featureId)?.name;
      if (typeof featureName === 'string') {
        const existingForName = scopeNames.get(featureName.toLowerCase());
        if (existingForName && existingForName !== featureId) {
          errors.push(`Scope "${scopeLabel}": duplicate feature name "${featureName}" across feature ids "${existingForName}" and "${featureId}".`);
        } else {
          scopeNames.set(featureName.toLowerCase(), featureId);
        }
      }
    }

    if ('total' in section && section.total !== sectionUniqueIds.size) {
      errors.push(`Scope "${scopeLabel}" section "${sectionLabel}": total=${section.total} does not match unique featureIds=${sectionUniqueIds.size}.`);
    }
  }

  if ('globalTotal' in scope && scope.globalTotal !== scopeUniqueIds.size) {
    errors.push(`Scope "${scopeLabel}": globalTotal=${scope.globalTotal} does not match unique featureIds=${scopeUniqueIds.size}.`);
  }
}

validateClientFeatureRegistration(errors);

if (errors.length > 0) {
  process.stderr.write(`Feature registry validation failed (${errors.length} issue${errors.length === 1 ? '' : 's'}):\n`);
  errors.forEach((error) => process.stderr.write(`- ${error}\n`));
  process.exit(1);
}

process.stdout.write(`Feature registry validation passed: ${features.length} features across ${scopes.length} scope(s).\n`);
