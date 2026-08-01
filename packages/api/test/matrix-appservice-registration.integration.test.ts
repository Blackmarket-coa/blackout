import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Integration test for the Synapse appservice registration stub at
 * `deploy/matrix-appservice/registration.yaml`.
 *
 * The test treats the YAML as text (no full parser dep) and checks
 * structural invariants the operator-facing config must hold so that
 * Synapse will accept it and route traffic to our route at
 * `packages/api/src/routes/matrixAppservice.ts`.
 */

const here = dirname(fileURLToPath(import.meta.url));
const REGISTRATION_PATH = resolve(
    here,
    '..',
    '..',
    '..',
    'deploy',
    'matrix-appservice',
    'registration.yaml'
);

const text = readFileSync(REGISTRATION_PATH, 'utf8');

// Tiny extractor for top-level `key: value` pairs in our subset of YAML.
const topLevelScalar = (key: string): string | undefined => {
    const re = new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm');
    const m = text.match(re);
    return m ? m[1].trim() : undefined;
};

test('appservice registration: required scalar fields are set', () => {
    assert.equal(topLevelScalar('id'), 'blackout');
    assert.equal(topLevelScalar('sender_localpart'), 'blackout');
    assert.equal(topLevelScalar('rate_limited'), 'false');
});

test('appservice registration: `url` points at the api service', () => {
    const url = topLevelScalar('url');
    assert.ok(url, 'url must be set');
    assert.match(
        url!,
        /^https?:\/\/[^/]+(:\d+)?(\/.*)?$/,
        'url should be a syntactically valid http(s) URL — operators substitute the host at deploy time'
    );
});

test('appservice registration: tokens are env placeholders, never literals', () => {
    const asToken = topLevelScalar('as_token');
    const hsToken = topLevelScalar('hs_token');
    assert.ok(asToken, 'as_token must be present');
    assert.ok(hsToken, 'hs_token must be present');
    assert.match(asToken!, /^\$\{MATRIX_APPSERVICE_AS_TOKEN\}$/);
    assert.match(hsToken!, /^\$\{MATRIX_APPSERVICE_HS_TOKEN\}$/);
});

test('appservice registration: user namespace regex matches `@blackout_*` users', () => {
    // The regex appears as `regex: '@blackout_.*'` (or doublequoted) under
    // `namespaces.users`. Pull the first regex and apply it.
    const userBlock = text.match(/users:[\s\S]*?regex:\s*['"]?(@[^'"\n]+)['"]?/);
    assert.ok(userBlock, 'users namespace regex must be present');
    const re = new RegExp(userBlock![1]);
    assert.ok(re.test('@blackout_alice:example.org'));
    assert.ok(!re.test('@evil_alice:example.org'));
});

test('appservice registration: alias namespace regex matches `#blackout_*` aliases', () => {
    const aliasBlock = text.match(/aliases:[\s\S]*?regex:\s*['"]?(#[^'"\n]+)['"]?/);
    assert.ok(aliasBlock, 'aliases namespace regex must be present');
    const re = new RegExp(aliasBlock![1]);
    assert.ok(re.test('#blackout_room:example.org'));
    assert.ok(!re.test('#general:example.org'));
});

test('appservice registration: rooms namespace observes all rooms non-exclusively (Den greeter needs m.room.member delivery)', () => {
    // Widened from `rooms: []` so Synapse delivers ordinary members' joins to the
    // transactions endpoint (BLACKOUT_DEN_GREETER). Must stay non-exclusive so we
    // claim ownership of no room id.
    const roomsBlock = text.match(/rooms:\s*\n((?:\s+-[\s\S]*?)+?)(?:\n\S|\n?$)/);
    assert.ok(roomsBlock, 'rooms namespace must be a list, not empty');
    assert.match(roomsBlock![1], /exclusive:\s*false/, 'rooms interest must be non-exclusive');
    assert.match(roomsBlock![1], /regex:\s*['"]?\.\*['"]?/, 'rooms regex must match all rooms');
});

test('appservice registration: ephemeral push is disabled (we do not consume typing/presence)', () => {
    assert.match(text, /de\.sorunome\.msc2409\.push_ephemeral:\s*false/);
});
