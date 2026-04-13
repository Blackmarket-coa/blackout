#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const matrixPath = path.join(repoRoot, 'docs/architecture/frontend-consolidation-parity-matrix.md');
const dispositionPath = path.join(repoRoot, 'docs/architecture/frontend-consolidation-disposition.md');
const backlogPath = path.join(repoRoot, 'docs/architecture/frontend-consolidation-migration-backlog.md');

const requiredSurfaces = new Set([
  'apps/blackout-client',
  'apps/blackout-web',
  'apps/web',
  'apps/blackout-gov',
  '_port',
  'legacy/element',
]);


const pluginPolicyDoc = path.join(repoRoot, 'apps/blackout-client/docs/plugin-only-customization-policy.md');
const pluginExtensionPointsDoc = path.join(repoRoot, 'apps/blackout-client/docs/plugin-extension-points.md');
const migrationInventoryDoc = path.join(repoRoot, 'apps/blackout-client/docs/migration-inventory.md');
const featureManifestTs = path.join(repoRoot, 'apps/blackout-client/src/app/core/features/manifest.ts');

const requiredPluginPolicyAnchors = [
  'named feature modules or plugin boundaries',
  'Shell extension points stay minimal',
  'check-feature-registry.mjs',
  'check-legacy-runtime-imports.mjs',
];

const legacyCanonicalRoutePairs = [
  { legacy: '/blackout/governance', canonical: '/governance' },
  { legacy: '/blackout/education', canonical: '/forum' },
  { legacy: '/blackout/mutual-aid', canonical: '/deaddrop' },
];

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function parseTableRows(markdown, expectedColumns) {
  const lines = markdown.split(/\r?\n/);
  const rows = [];
  let inTable = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.startsWith('|')) {
      inTable = false;
      continue;
    }
    if (!inTable) {
      const headers = line.slice(1, -1).split(' | ').map((v) => v.trim());
      if (headers.length === expectedColumns && headers[0] === 'feature_id') {
        inTable = true;
      }
      continue;
    }
    if (/^\|---/.test(line)) continue;
    const cols = line.slice(1, -1).split(' | ').map((v) => v.trim());
    if (cols.length !== expectedColumns) continue;
    rows.push({ cols, line: i + 1 });
  }
  return rows;
}

function parseBacklogTraceability(markdown) {
  const lines = markdown.split(/\r?\n/);
  const rows = [];
  let inTable = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!inTable && line.trim() === '| feature_id | backlog_id |') {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (!line.startsWith('|')) break;
    if (/^\|---/.test(line)) continue;
    const cols = line.slice(1, -1).split(' | ').map((v) => v.trim());
    if (cols.length < 2) continue;
    rows.push({ featureId: cols[0], backlogId: cols[1], line: i + 1 });
  }
  return rows;
}

function fail(errors) {
  if (errors.length === 0) return;
  console.error('Frontend consolidation safety gates failed:');
  for (const err of errors) console.error(`- ${err}`);
  process.exit(1);
}

const errors = [];

const matrixRows = parseTableRows(read(matrixPath), 6).map((r) => ({
  feature_id: r.cols[0],
  source_surface: r.cols[1],
  route_or_entry: r.cols[2],
  family: r.cols[3],
  status_seed: r.cols[4],
  notes: r.cols[5],
  line: r.line,
}));

const dispositionRows = parseTableRows(read(dispositionPath), 9).map((r) => ({
  feature_id: r.cols[0],
  source_surface: r.cols[1],
  route_or_entry: r.cols[2],
  family: r.cols[3],
  status_seed: r.cols[4],
  disposition: r.cols[5],
  disposition_rationale: r.cols[6],
  target_module: r.cols[7],
  owner: r.cols[8],
  line: r.line,
}));

if (matrixRows.length === 0) errors.push('matrix table parse failed (no rows found).');
if (dispositionRows.length === 0) errors.push('disposition table parse failed (no rows found).');

// Surface representation gate
const seenSurfaces = new Set(matrixRows.map((r) => r.source_surface));
for (const surface of requiredSurfaces) {
  if (!seenSurfaces.has(surface)) {
    errors.push(`matrix missing source_surface=${surface}; add explicit row(s) in ${path.relative(repoRoot, matrixPath)}.`);
  }
}

// Route/registry drift anchors across legacy vs canonical
for (const pair of legacyCanonicalRoutePairs) {
  const legacyRow = matrixRows.find((r) => r.route_or_entry.includes(pair.legacy));
  const canonicalRow = matrixRows.find((r) => r.source_surface === 'apps/blackout-client' && r.route_or_entry.includes(pair.canonical));
  if (!legacyRow) {
    errors.push(`route drift anchor missing legacy route ${pair.legacy} in parity matrix.`);
  }
  if (!canonicalRow) {
    errors.push(`route drift anchor missing canonical route ${pair.canonical} in parity matrix.`);
  }
}

// Matrix/disposition freshness + exact row traceability
const matrixById = new Map(matrixRows.map((r) => [r.feature_id, r]));
for (const d of dispositionRows) {
  const m = matrixById.get(d.feature_id);
  if (!m) {
    errors.push(`${path.relative(repoRoot, dispositionPath)}:${d.line} feature_id=${d.feature_id} not found in parity matrix.`);
    continue;
  }
  if (m.status_seed !== d.status_seed) {
    errors.push(`${path.relative(repoRoot, dispositionPath)}:${d.line} status_seed drift for feature_id=${d.feature_id} (matrix=${m.status_seed}, disposition=${d.status_seed}).`);
  }
  if (!d.disposition_rationale) {
    errors.push(`${path.relative(repoRoot, dispositionPath)}:${d.line} missing disposition_rationale for feature_id=${d.feature_id}.`);
  }
  if (d.disposition === 'ported' && (!d.owner || d.owner.toLowerCase() === 'tbd')) {
    errors.push(`${path.relative(repoRoot, dispositionPath)}:${d.line} missing owner for ported feature_id=${d.feature_id}.`);
  }
}

for (const m of matrixRows) {
  if (!dispositionRows.find((d) => d.feature_id === m.feature_id)) {
    errors.push(`${path.relative(repoRoot, matrixPath)}:${m.line} feature_id=${m.feature_id} missing in disposition table.`);
  }
}

// Backlog traceability for all ported items
const traceability = parseBacklogTraceability(read(backlogPath));
const tracedFeatureIds = new Map(traceability.map((r) => [r.featureId, r]));
const portedIds = dispositionRows.filter((r) => r.disposition === 'ported').map((r) => r.feature_id);
for (const featureId of portedIds) {
  const row = tracedFeatureIds.get(featureId);
  if (!row) {
    const d = dispositionRows.find((r) => r.feature_id === featureId);
    errors.push(`${path.relative(repoRoot, dispositionPath)}:${d?.line ?? '?'} ported feature_id=${featureId} missing from backlog traceability table.`);
  }
}


for (const requiredDoc of [pluginPolicyDoc, pluginExtensionPointsDoc, migrationInventoryDoc, featureManifestTs]) {
  if (!fs.existsSync(requiredDoc)) {
    errors.push(`required plugin hardening artifact missing: ${path.relative(repoRoot, requiredDoc)}.`);
  }
}

if (fs.existsSync(pluginPolicyDoc)) {
  const policy = read(pluginPolicyDoc);
  for (const anchor of requiredPluginPolicyAnchors) {
    if (!policy.includes(anchor)) {
      errors.push(`${path.relative(repoRoot, pluginPolicyDoc)} missing policy anchor: "${anchor}".`);
    }
  }
}

if (fs.existsSync(pluginExtensionPointsDoc)) {
  const extensionDoc = read(pluginExtensionPointsDoc);
  for (const requiredSlot of ['bootstrapFeatures(manifest)', 'src/app/core/features/manifest.ts', 'src/app/plugins/manifest.ts']) {
    if (!extensionDoc.includes(requiredSlot)) {
      errors.push(`${path.relative(repoRoot, pluginExtensionPointsDoc)} missing extension-point anchor: "${requiredSlot}".`);
    }
  }
}

if (fs.existsSync(migrationInventoryDoc)) {
  const inventory = read(migrationInventoryDoc);
  for (const anchor of ['Deprecated bridge shim', 'bmc-useNotifications.ts', 'bmc-event.ts']) {
    if (!inventory.includes(anchor)) {
      errors.push(`${path.relative(repoRoot, migrationInventoryDoc)} missing migration inventory anchor: "${anchor}".`);
    }
  }
}

console.log(`Frontend consolidation gates OK: matrix=${matrixRows.length} rows, disposition=${dispositionRows.length} rows, ported=${portedIds.length}, traced=${traceability.length}.`);
fail(errors);
