#!/usr/bin/env node
/**
 * Lint shape-checks for ops artifacts:
 *   - docs/operations/alerts/*-rules.yaml  : valid YAML; each rule has alert,
 *                                            expr, for, labels.severity, annotations.summary
 *   - docs/operations/dashboards/*.json    : valid JSON object with title and a
 *                                            non-empty panels[]. Two panel
 *                                            shapes are tolerated:
 *                                              - { id, metric }      (simple shape used by SFU + payments dashboards)
 *                                              - { title, targets: [{ expr }] }  (Grafana export shape)
 *
 * Exit non-zero on any structural failure. Intentionally permissive about
 * the *content* of each rule — we want a fast CI gate that catches a
 * malformed YAML or a missing required field, not a full PromQL validator.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const repoRoot = process.cwd();
const SEVERITY_VOCAB = new Set(['critical', 'warning', 'info']);

const errors = [];

// pnpm's hoisted runtime dir; load the `yaml` package from there so this
// script doesn't require adding a root-level devDependency.
const pnpmRequire = createRequire(
  path.join(repoRoot, 'node_modules/.pnpm/node_modules/package.json'),
);
let yamlLib;
try {
  yamlLib = pnpmRequire('yaml');
} catch (err) {
  try {
    yamlLib = pnpmRequire('js-yaml');
  } catch (err2) {
    console.error(
      `check-ops-artifacts: no YAML parser available (tried yaml, js-yaml from ${path.join(
        repoRoot,
        'node_modules/.pnpm/node_modules',
      )}). Install one of them.`,
    );
    process.exit(2);
  }
}
const parseYaml = (raw) => (yamlLib.parse ? yamlLib.parse(raw) : yamlLib.load(raw));

const requireKey = (obj, key, ctx) => {
  if (obj == null || typeof obj !== 'object' || !(key in obj)) {
    errors.push(`${ctx}: missing required key "${key}"`);
    return undefined;
  }
  return obj[key];
};

const validateRule = (rule, ctx) => {
  const alert = requireKey(rule, 'alert', ctx);
  if (alert && typeof alert !== 'string') errors.push(`${ctx}: alert must be a string`);

  const expr = requireKey(rule, 'expr', ctx);
  if (expr && typeof expr !== 'string') errors.push(`${ctx}: expr must be a string`);

  if (!('for' in rule)) {
    errors.push(`${ctx}: missing required key "for"`);
  } else if (typeof rule.for !== 'string' || !/^\d+[smhd]$/.test(rule.for.trim())) {
    errors.push(`${ctx}: for must look like "10m"/"30s"/"1h", got ${JSON.stringify(rule.for)}`);
  }

  const labels = requireKey(rule, 'labels', ctx);
  if (labels && typeof labels === 'object') {
    const severity = labels.severity;
    if (!severity || !SEVERITY_VOCAB.has(severity)) {
      errors.push(`${ctx}: labels.severity must be one of ${[...SEVERITY_VOCAB].join('|')}`);
    }
  }

  const annotations = requireKey(rule, 'annotations', ctx);
  if (annotations && typeof annotations === 'object') {
    const summary = annotations.summary;
    if (!summary || typeof summary !== 'string') {
      errors.push(`${ctx}: annotations.summary must be a non-empty string`);
    }
  }
};

const validateAlertFile = (relPath) => {
  let raw;
  try {
    raw = fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
  } catch (err) {
    errors.push(`${relPath}: cannot read file (${err.message})`);
    return;
  }
  let parsed;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    errors.push(`${relPath}: YAML parse failed (${err.message})`);
    return;
  }
  const groups = parsed?.groups;
  if (!Array.isArray(groups) || groups.length === 0) {
    errors.push(`${relPath}: top-level "groups" must be a non-empty array`);
    return;
  }
  for (const [gi, group] of groups.entries()) {
    if (!group?.name || typeof group.name !== 'string') {
      errors.push(`${relPath}: group[${gi}] missing string "name"`);
      continue;
    }
    const rules = group.rules;
    if (!Array.isArray(rules) || rules.length === 0) {
      errors.push(`${relPath}: group "${group.name}" must declare at least one rule`);
      continue;
    }
    for (const [ri, rule] of rules.entries()) {
      validateRule(rule, `${relPath}#${group.name}[${ri}]`);
    }
  }
};

const validatePanelSimple = (panel, ctx) => {
  if (typeof panel?.id !== 'string' || panel.id.length === 0) {
    errors.push(`${ctx}: simple-shape panel missing string id`);
  }
  if (typeof panel?.metric !== 'string' || panel.metric.length === 0) {
    errors.push(`${ctx}: simple-shape panel missing string metric`);
  }
};

const validatePanelGrafana = (panel, ctx) => {
  if (typeof panel?.title !== 'string' || panel.title.length === 0) {
    errors.push(`${ctx}: grafana-shape panel missing string title`);
  }
  if (!Array.isArray(panel?.targets) || panel.targets.length === 0) {
    errors.push(`${ctx}: grafana-shape panel must declare at least one target`);
    return;
  }
  for (const [ti, target] of panel.targets.entries()) {
    if (typeof target?.expr !== 'string' || target.expr.length === 0) {
      errors.push(`${ctx}.targets[${ti}]: missing string expr`);
    }
  }
};

const validateDashboard = (relPath) => {
  let raw;
  try {
    raw = fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
  } catch (err) {
    errors.push(`${relPath}: cannot read file (${err.message})`);
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    errors.push(`${relPath}: JSON parse failed (${err.message})`);
    return;
  }
  if (!parsed || typeof parsed !== 'object') {
    errors.push(`${relPath}: top-level must be an object`);
    return;
  }
  if (typeof parsed.title !== 'string' || parsed.title.length === 0) {
    errors.push(`${relPath}: title must be a non-empty string`);
  }
  if (!Array.isArray(parsed.panels) || parsed.panels.length === 0) {
    errors.push(`${relPath}: panels must be a non-empty array`);
    return;
  }
  for (const [i, panel] of parsed.panels.entries()) {
    const ctx = `${relPath}#panels[${i}]`;
    // Pick the shape by which keys the panel has — simple shape uses
    // {id, metric}; Grafana export uses {title, targets[]}. Mixed panels
    // are reported against the shape that matches more of the keys present.
    const looksSimple = 'id' in panel || 'metric' in panel;
    const looksGrafana = 'title' in panel || 'targets' in panel;
    if (looksSimple && !looksGrafana) {
      validatePanelSimple(panel, ctx);
    } else if (looksGrafana) {
      validatePanelGrafana(panel, ctx);
    } else {
      errors.push(
        `${ctx}: unrecognized panel shape — needs either {id, metric} or {title, targets[]}`,
      );
    }
  }
};

const alertsDir = path.join(repoRoot, 'docs/operations/alerts');
const dashboardsDir = path.join(repoRoot, 'docs/operations/dashboards');

const alertFiles = fs.existsSync(alertsDir)
  ? fs.readdirSync(alertsDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
  : [];
const dashboardFiles = fs.existsSync(dashboardsDir)
  ? fs.readdirSync(dashboardsDir).filter((f) => f.endsWith('.json'))
  : [];

if (alertFiles.length === 0) {
  errors.push('docs/operations/alerts: no *.yaml files found');
}
if (dashboardFiles.length === 0) {
  errors.push('docs/operations/dashboards: no *.json files found');
}

for (const file of alertFiles) {
  validateAlertFile(path.join('docs/operations/alerts', file));
}
for (const file of dashboardFiles) {
  validateDashboard(path.join('docs/operations/dashboards', file));
}

if (errors.length > 0) {
  console.error('Ops artifact checks failed:');
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}

console.log(
  `Ops artifact checks passed (${alertFiles.length} alert files, ${dashboardFiles.length} dashboards).`,
);
