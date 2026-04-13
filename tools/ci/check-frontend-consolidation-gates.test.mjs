import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const scriptPath = path.join(process.cwd(), 'tools/ci/check-frontend-consolidation-gates.mjs');

function writeFile(root, relativePath, content) {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function minimalWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-consolidation-'));

  const matrix = [
    '| feature_id | source_surface | route_or_entry | family | status_seed | notes |',
    '|---|---|---|---|---|---|',
    '| apps-client-governance | apps/blackout-client | /governance | governance | implemented | ok |',
    '| legacy-governance | legacy/element | /blackout/governance | governance | partial | legacy |',
    '| apps-client-forum | apps/blackout-client | /forum | forum | implemented | ok |',
    '| legacy-forum | legacy/element | /blackout/education | forum | partial | legacy |',
    '| apps-client-deaddrop | apps/blackout-client | /deaddrop | deaddrop | implemented | ok |',
    '| legacy-deaddrop | legacy/element | /blackout/mutual-aid | deaddrop | partial | legacy |',
    '| surface-blackout-web | apps/blackout-web | / | misc | planned | ok |',
    '| surface-web | apps/web | / | misc | planned | ok |',
    '| surface-gov | apps/blackout-gov | / | misc | planned | ok |',
    '| surface-port | _port | /legacy-port | misc | partial | ok |',
  ].join('\n');

  const disposition = [
    '| feature_id | source_surface | route_or_entry | family | status_seed | disposition | disposition_rationale | target_module | owner |',
    '|---|---|---|---|---|---|---|---|---|',
    '| apps-client-governance | apps/blackout-client | /governance | governance | implemented | ported | baseline done | features/governance | team |',
    '| legacy-governance | legacy/element | /blackout/governance | governance | partial | deprecated | legacy retained for reference | legacy | team |',
    '| apps-client-forum | apps/blackout-client | /forum | forum | implemented | ported | baseline done | features/forum | team |',
    '| legacy-forum | legacy/element | /blackout/education | forum | partial | deprecated | legacy retained for reference | legacy | team |',
    '| apps-client-deaddrop | apps/blackout-client | /deaddrop | deaddrop | implemented | ported | baseline done | features/deaddrop | team |',
    '| legacy-deaddrop | legacy/element | /blackout/mutual-aid | deaddrop | partial | deprecated | legacy retained for reference | legacy | team |',
    '| surface-blackout-web | apps/blackout-web | / | misc | planned | planned | tracked | misc | team |',
    '| surface-web | apps/web | / | misc | planned | planned | tracked | misc | team |',
    '| surface-gov | apps/blackout-gov | / | misc | planned | planned | tracked | misc | team |',
    '| surface-port | _port | /legacy-port | misc | partial | deprecated | tracked | misc | team |',
  ].join('\n');

  const backlog = [
    '| feature_id | backlog_id |',
    '|---|---|',
    '| apps-client-governance | B-1 |',
    '| apps-client-forum | B-2 |',
    '| apps-client-deaddrop | B-3 |',
  ].join('\n');

  writeFile(dir, 'docs/architecture/frontend-consolidation-parity-matrix.md', matrix);
  writeFile(dir, 'docs/architecture/frontend-consolidation-disposition.md', disposition);
  writeFile(dir, 'docs/architecture/frontend-consolidation-migration-backlog.md', backlog);

  writeFile(
    dir,
    'apps/blackout-client/docs/plugin-only-customization-policy.md',
    [
      'named feature modules or plugin boundaries',
      'Shell extension points stay minimal',
      'check-feature-registry.mjs',
      'check-legacy-runtime-imports.mjs',
    ].join('\n')
  );
  writeFile(
    dir,
    'apps/blackout-client/docs/plugin-extension-points.md',
    ['bootstrapFeatures(manifest)', 'src/app/core/features/manifest.ts', 'src/app/plugins/manifest.ts'].join('\n')
  );
  writeFile(
    dir,
    'apps/blackout-client/docs/migration-inventory.md',
    ['Deprecated bridge shim', 'bmc-useNotifications.ts', 'bmc-event.ts'].join('\n')
  );

  writeFile(
    dir,
    'apps/blackout-client/src/app/core/features/manifest.ts',
    [
      "export const featureModulePluginManifest = ['plugin.alpha'] as const;",
      "export const runtimePluginManifest = ['runtime.alpha'] as const;",
    ].join('\n')
  );
  writeFile(dir, 'apps/blackout-client/src/app/core/features/plugins.ts', "export const featurePlugins = [{ id: 'plugin.alpha', modules: [] }];\n");
  writeFile(dir, 'apps/blackout-client/src/app/core/features/capabilityGate.ts', 'export const resolveFeatureCustomizations = () => [];\n');

  return dir;
}

function run(cwd) {
  return spawnSync('node', [scriptPath], { cwd, encoding: 'utf8' });
}

test('passes when required consolidation artifacts and plugin manifests are aligned', () => {
  const cwd = minimalWorkspace();
  const res = run(cwd);
  assert.equal(res.status, 0, res.stderr || res.stdout);
  assert.match(res.stdout, /Frontend consolidation gates OK/);
});

test('fails when feature plugin id is not allowlisted', () => {
  const cwd = minimalWorkspace();
  writeFile(cwd, 'apps/blackout-client/src/app/core/features/plugins.ts', "export const featurePlugins = [{ id: 'plugin.rogue', modules: [] }];\n");

  const res = run(cwd);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /Unknown plugin id "plugin.rogue"/);
});
