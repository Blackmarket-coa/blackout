import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeSource, serverFlagIsRequired } from './check-room-encryption.mjs';

const violationsIn = (source) => analyzeSource('fixture.ts', source).violations;
const checkedIn = (source) => analyzeSource('fixture.ts', source).checked;

test('flags a createRoom literal that makes no encryption decision', () => {
    const found = violationsIn(`
    const room = await mx.createRoom({
      name: 'general',
      preset: 'private_chat',
    });
  `);
    assert.equal(found.length, 1);
    assert.match(found[0].reason, /no encryption decision/);
});

test('accepts an encryption event in initial_state', () => {
    assert.deepEqual(
        violationsIn(`
      await mx.createRoom({
        name: 'dm',
        initial_state: [createRoomEncryptionState()],
      });
    `),
        []
    );
});

test('accepts an explicit encryption field either way', () => {
    assert.deepEqual(violationsIn(`await createRoom(mx, { name: 'a', encryption: true });`), []);
    // `false` is a decision too — publicly joinable rooms are meant to be readable.
    assert.deepEqual(violationsIn(`await createRoom(mx, { name: 'a', encryption: false });`), []);
    assert.deepEqual(violationsIn(`await matrix.createRoom({ name: 'a', encrypted: false });`), []);
});

test('prose about encryption does not satisfy the guard', () => {
    // The first version of this guard matched on the raw call text, so a comment
    // mentioning encryption made a plaintext room pass. That is the exact failure
    // this guard exists to catch, so it is pinned here.
    const found = violationsIn(`
    await mx.createRoom({
      name: 'general',
      // Dens are private, so encryption matters here. See the encryption audit.
      preset: 'private_chat',
    });
  `);
    assert.equal(found.length, 1, 'a comment mentioning encryption must not count as a decision');
});

test('block comments cannot satisfy the guard either', () => {
    const found = violationsIn(`
    await mx.createRoom({
      /* initial_state and encryption are handled elsewhere */
      name: 'general',
    });
  `);
    assert.equal(found.length, 1);
});

test('spaces are exempt — they hold hierarchy state, not messages', () => {
    assert.deepEqual(
        violationsIn(
            `await mx.createRoom({ name: 'cat', creation_content: { type: 'm.space' } });`
        ),
        []
    );
    assert.deepEqual(
        violationsIn(`await createRoom(mx, { name: 'canopy', type: RoomType.Space });`),
        []
    );
});

test('an explicit allow-marker documents a deliberate exception', () => {
    assert.deepEqual(
        violationsIn(`
      await mx.createRoom({
        // e2ee-guard-allow: bot posts here and cannot hold Megolm keys
        name: 'orders',
      });
    `),
        []
    );
});

test('type declarations are not call sites', () => {
    const source = `
    export interface MatrixRoomCreator {
      createRoom(input: { name?: string; encrypted: boolean }): Promise<void>;
    }
  `;
    assert.deepEqual(violationsIn(source), []);
    assert.deepEqual(checkedIn(source), [], 'a declaration is not counted as a checked call site');
});

test('wrapper calls passing a variable are skipped, not guessed at', () => {
    // `createRoom(mx, data)` cannot be judged statically; its callers are where
    // the decision is visible, and those are checked.
    const source = `const result = await mx.createRoom(options);`;
    assert.deepEqual(violationsIn(source), []);
    assert.deepEqual(checkedIn(source), []);
});

test('nested literals are consumed whole rather than truncating the call', () => {
    assert.deepEqual(
        violationsIn(`
      await mx.createRoom({
        name: 'ann',
        power_level_content_override: { events_default: 50 },
        initial_state: [createRoomEncryptionState()],
      });
    `),
        []
    );
});

test('every call site in a file is reported, not just the first', () => {
    const found = violationsIn(`
    await mx.createRoom({ name: 'one' });
    await mx.createRoom({ name: 'two' });
  `);
    assert.equal(found.length, 2);
});

test('serverFlagIsRequired rejects an optional encrypted flag', () => {
    assert.equal(serverFlagIsRequired('    encrypted: boolean;'), true);
    assert.equal(serverFlagIsRequired('    encrypted?: boolean;'), false);
    assert.equal(serverFlagIsRequired('  name?: string;'), false);
});
