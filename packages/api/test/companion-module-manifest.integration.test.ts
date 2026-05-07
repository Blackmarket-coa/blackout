import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Static / structural assertions on the Companion module package at
 * `packages/companion-blackout/`. Companion's runtime would catch
 * malformed manifest fields at load time but we want CI to fail fast
 * (a) before a botched upstream PR lands, and (b) so renaming an
 * action id is impossible to ship — Companion configs persist action
 * ids and renaming silently breaks every saved profile.
 */

const here = dirname(fileURLToPath(import.meta.url));
const COMPANION_DIR = resolve(here, '..', '..', 'companion-blackout');

const readJson = <T = unknown>(rel: string): T =>
  JSON.parse(readFileSync(resolve(COMPANION_DIR, rel), 'utf8')) as T;

test('companion module: package.json is a Companion-shaped module', () => {
  const pkg = readJson<{
    name: string;
    main: string;
    type: string;
    peerDependencies: Record<string, string>;
    dependencies: Record<string, string>;
    keywords: string[];
  }>('package.json');
  assert.equal(pkg.name, 'companion-module-blackout');
  assert.equal(pkg.main, 'dist/main.js');
  assert.equal(pkg.type, 'module');
  assert.ok(pkg.peerDependencies['@companion-module/base']);
  assert.ok(pkg.dependencies['obs-websocket-js']);
  assert.ok(
    pkg.keywords.includes('companion-module'),
    'package.json keywords must include `companion-module` for the in-app store filter',
  );
});

test('companion module: manifest.json has the required runtime fields', () => {
  const manifest = readJson<{
    id: string;
    name: string;
    runtime: { type: string; api: string; entrypoint: string };
    products: string[];
    license: string;
  }>('companion/manifest.json');
  assert.equal(manifest.id, 'blackout');
  assert.equal(manifest.runtime.type, 'node18');
  assert.equal(manifest.runtime.api, 'nodejs-ipc');
  assert.equal(manifest.runtime.entrypoint, 'dist/main.js');
  assert.deepEqual(manifest.products, ['Blackout']);
  assert.equal(manifest.license, 'MIT');
});

test('companion module: actions.ts exposes the stable set of action ids', () => {
  // Stable set — renaming any of these silently breaks every saved
  // Companion button config. If we add NEW ids that's fine; deletion
  // or rename is a breaking change and must bump the package version.
  const text = readFileSync(resolve(COMPANION_DIR, 'src', 'actions.ts'), 'utf8');
  for (const id of [
    'start_stream',
    'stop_stream',
    'toggle_stream',
    'set_scene',
    'toggle_mute',
  ]) {
    assert.match(
      text,
      new RegExp(`\\b${id}\\s*:`),
      `actions.ts must define \`${id}\` action`,
    );
  }
});

test('companion module: actions.ts wires `toggle_mute` to OBS-WS `ToggleInputMute`', () => {
  // The shim's request matrix uses ToggleInputMute (not the
  // OBS-Studio-native InputMuteToggle). Drift here would hit
  // production as a NotImplemented response.
  const text = readFileSync(resolve(COMPANION_DIR, 'src', 'actions.ts'), 'utf8');
  assert.match(text, /'ToggleInputMute'/);
});

test('companion module: variables.ts exposes the documented set', () => {
  const text = readFileSync(resolve(COMPANION_DIR, 'src', 'variables.ts'), 'utf8');
  for (const id of [
    'is_streaming',
    'current_scene',
    'last_tip_amount',
    'last_follow_name',
  ]) {
    assert.match(text, new RegExp(`'${id}'`));
  }
});

test('companion module: feedbacks.ts exposes the `streaming` feedback', () => {
  const text = readFileSync(resolve(COMPANION_DIR, 'src', 'feedbacks.ts'), 'utf8');
  assert.match(text, /\bstreaming\s*:/);
});

test('companion module: README points readers at the OBS-WS password UI', () => {
  // The OBS-WS password is generated in the Blackout web UI; if the
  // README forgets to point at it, ops will paste the wrong thing.
  const text = readFileSync(resolve(COMPANION_DIR, 'README.md'), 'utf8');
  assert.match(text, /OBS WebSocket passwords/i);
});
