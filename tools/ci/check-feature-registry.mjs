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

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

function parseStringListConst(source, constName) {
  const pattern = new RegExp(`${constName}\\s*=\\s*\\[([\\s\\S]*?)\\]`, 'm');
  const match = source.match(pattern);
  if (!match) return null;

  const ids = [];
  for (const literal of match[1].matchAll(/'([^']+)'/g)) {
    ids.push(literal[1]);
  }

  return ids;
}

function parseFlagIdsFromCoreModules(source) {
  // Each core module entry binds `feature: <CamelCase>Feature`. The
  // canonical feature id is the kebab-case form of that binding minus
  // the trailing `Feature` suffix (matches the directory layout under
  // `apps/blackout-client/src/app/features/`). Camel→kebab via inserting
  // `-` before each uppercase run, then lowercasing — so
  // `platformOpsFeature` → `platform-ops`, `mediaCallFeature` →
  // `media-call`, `governanceFeature` → `governance`.
  const ids = [];
  const featureBindingRe = /feature\s*:\s*([A-Za-z][A-Za-z0-9]*)Feature\b/g;
  for (const match of source.matchAll(featureBindingRe)) {
    const camel = match[1];
    const kebab = camel
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
      .toLowerCase();
    ids.push(kebab);
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


function parseRuntimePluginIdsFromManifest(source) {
  const ids = [];
  const idRe = /id\s*:\s*'([^']+)'/g;
  for (const match of source.matchAll(idRe)) {
    ids.push(match[1]);
  }
  return ids;
}

function parseFeatureModulePluginIds(source) {
  const ids = [];
  const pluginIdRe = /id\s*:\s*'([^']+)'/g;
  for (const match of source.matchAll(pluginIdRe)) {
    ids.push(match[1]);
  }
  return ids;
}

function listFeatureManifestFiles(featuresRoot) {
  if (!fs.existsSync(featuresRoot)) return [];

  const files = [];
  const stack = [featuresRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name === 'manifest.ts') {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function parseFeatureObjectTopLevelProps(source) {
  const props = [];
  const marker = 'BlackoutFeature';
  let markerIndex = source.indexOf(marker);
  while (markerIndex !== -1) {
    const objectStart = source.indexOf('{', markerIndex);
    if (objectStart === -1) break;

    let depth = 0;
    let currentToken = '';
    let captureProperty = false;
    for (let i = objectStart; i < source.length; i += 1) {
      const char = source[i];
      const prev = source[i - 1];
      const escaped = prev === '\\';

      if (char === "'" || char === '"' || char === '`') {
        const quote = char;
        i += 1;
        while (i < source.length) {
          if (source[i] === quote && source[i - 1] !== '\\') break;
          i += 1;
        }
        continue;
      }

      if (char === '{') {
        depth += 1;
        captureProperty = depth === 1;
        currentToken = '';
        continue;
      }

      if (char === '}') {
        if (depth === 1) {
          markerIndex = source.indexOf(marker, i);
          return props;
        }
        depth -= 1;
        continue;
      }

      if (depth !== 1) continue;

      if (char === ':' && captureProperty) {
        const prop = currentToken.trim().replace(/^[,\s]+/, '');
        if (prop) props.push(prop);
        captureProperty = false;
        currentToken = '';
        continue;
      }

      if (char === ',') {
        captureProperty = true;
        currentToken = '';
        continue;
      }

      if (captureProperty) {
        if (!escaped) currentToken += char;
      }
    }
    break;
  }
  return props;
}

function validateClientFeatureRegistration(errors) {
  const manifestTs = path.resolve(process.cwd(), getArg('--manifest-ts') ?? 'apps/blackout-client/src/app/core/features/manifest.ts');
  const coreModulesTs = path.resolve(process.cwd(), getArg('--core-modules-ts') ?? 'apps/blackout-client/src/app/core/features/coreModules.ts');
  const featurePluginsTs = path.resolve(process.cwd(), getArg('--plugins-ts') ?? 'apps/blackout-client/src/app/core/features/plugins.ts');
  const runtimePluginsTs = path.resolve(process.cwd(), getArg('--runtime-plugins-ts') ?? 'apps/blackout-client/src/app/plugins/manifest.ts');
  const capabilityGateTs = path.resolve(process.cwd(), getArg('--capability-gate-ts') ?? 'apps/blackout-client/src/app/core/features/capabilityGate.ts');
  const featuresRoot = path.resolve(process.cwd(), getArg('--features-root') ?? 'apps/blackout-client/src/app/features');

  const manifestSource = readIfExists(manifestTs);
  const coreSource = readIfExists(coreModulesTs);
  const featurePluginsSource = readIfExists(featurePluginsTs);
  const runtimePluginsSource = readIfExists(runtimePluginsTs);

  if (!manifestSource || !coreSource || !featurePluginsSource || !runtimePluginsSource) {
    return;
  }

  const registeredFeatureIds = parseStringListConst(manifestSource, 'featureModuleManifest');
  if (!registeredFeatureIds || registeredFeatureIds.length === 0) {
    errors.push(`Client feature registry missing featureModuleManifest allowlist in ${path.relative(process.cwd(), manifestTs)}.`);
    return;
  }

  const registeredSet = new Set(registeredFeatureIds);

  const coreFlagIds = parseFlagIdsFromCoreModules(coreSource);
  for (const flagId of coreFlagIds) {
    if (!registeredSet.has(flagId)) {
      errors.push(`Core feature module flag "${flagId}" is not in featureModuleManifest.`);
    }
  }

  const pluginFeatureIds = parseFeatureIdsFromPlugins(featurePluginsSource);
  for (const featureId of pluginFeatureIds) {
    if (!registeredSet.has(featureId)) {
      errors.push(`Plugin injects unregistered feature id "${featureId}" in ${path.relative(process.cwd(), featurePluginsTs)}.`);
    }
  }

  const allowedFeatureModulePluginIds = parseStringListConst(manifestSource, 'featureModulePluginManifest');
  const declaredFeatureModulePluginIds = parseFeatureModulePluginIds(featurePluginsSource);
  if (!allowedFeatureModulePluginIds || allowedFeatureModulePluginIds.length === 0) {
    errors.push(`Feature module plugin allowlist missing featureModulePluginManifest in ${path.relative(process.cwd(), manifestTs)}.`);
  } else {
    const allowedFeatureModulePluginSet = new Set(allowedFeatureModulePluginIds);
    for (const pluginId of declaredFeatureModulePluginIds) {
      if (!allowedFeatureModulePluginSet.has(pluginId)) {
        errors.push(`Unknown feature module plugin id "${pluginId}" in ${path.relative(process.cwd(), featurePluginsTs)}.`);
      }
    }
  }

  const allowedRuntimePluginIds = parseStringListConst(manifestSource, 'runtimePluginManifest');
  const declaredRuntimePluginIds = parseRuntimePluginIdsFromManifest(runtimePluginsSource);

  if (!allowedRuntimePluginIds || allowedRuntimePluginIds.length === 0) {
    errors.push(`Runtime plugin allowlist missing runtimePluginManifest in ${path.relative(process.cwd(), manifestTs)}.`);
    return;
  }

  if (!declaredRuntimePluginIds || declaredRuntimePluginIds.length === 0) {
    errors.push(`Runtime plugin declarations missing runtimePluginEntries in ${path.relative(process.cwd(), runtimePluginsTs)}.`);
    return;
  }

  const allowedRuntimeSet = new Set(allowedRuntimePluginIds);
  for (const pluginId of declaredRuntimePluginIds) {
    if (!allowedRuntimeSet.has(pluginId)) {
      errors.push(`Unknown runtime plugin id "${pluginId}" declared in ${path.relative(process.cwd(), runtimePluginsTs)}.`);
    }
  }

  for (const pluginId of allowedRuntimePluginIds) {
    if (!declaredRuntimePluginIds.includes(pluginId)) {
      errors.push(`Allowlisted runtime plugin id "${pluginId}" is missing in ${path.relative(process.cwd(), runtimePluginsTs)}.`);
    }
  }

  const capabilityGateSource = readIfExists(capabilityGateTs);
  if (capabilityGateSource) {
    const forbiddenFallbackAnchors = ['-legacy', 'routes: feature.routes', 'navItems: feature.navItems', 'settings: feature.settings'];
    for (const anchor of forbiddenFallbackAnchors) {
      if (capabilityGateSource.includes(anchor)) {
        errors.push(`Plugin-only customization violation in ${path.relative(process.cwd(), capabilityGateTs)}: remove legacy fallback anchor "${anchor}".`);
      }
    }
  }

  for (const featureManifestFile of listFeatureManifestFiles(featuresRoot)) {
    const source = readIfExists(featureManifestFile);
    if (!source) continue;

    const topLevelProps = new Set(parseFeatureObjectTopLevelProps(source));
    if (topLevelProps.size === 0) continue;

    if (!topLevelProps.has('customizations')) {
      errors.push(`Plugin-only customization violation in ${path.relative(process.cwd(), featureManifestFile)}: feature manifest must declare "customizations".`);
    }

    for (const forbiddenProp of ['routes', 'navItems', 'settings']) {
      if (topLevelProps.has(forbiddenProp)) {
        errors.push(`Plugin-only customization violation in ${path.relative(process.cwd(), featureManifestFile)}: top-level "${forbiddenProp}" must move into plugin customizations.`);
      }
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
