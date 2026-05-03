import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeadDropStore } from '../src/storage.mjs';

const envelope = (overrides = {}) => ({
    v: 1,
    suite: 'sealedbox-x25519-aes256gcm-v1',
    pad: 'minimal',
    dropId: 'd-1',
    clue: 'CLUE-1',
    ek: 'EK',
    nonce: 'NONCE',
    ct: 'CT',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
});

test('insertDrop + fetchByClue returns the stored envelope', () => {
    const store = new DeadDropStore({ mode: 'memory' });
    const env = envelope();
    store.insertDrop(env);
    const fetched = store.fetchByClue(env.clue);
    assert.equal(fetched.length, 1);
    assert.equal(fetched[0].dropId, 'd-1');
});

test('insertDrop rejects duplicate clues', () => {
    const store = new DeadDropStore({ mode: 'memory' });
    const env = envelope();
    store.insertDrop(env);
    assert.throws(() => store.insertDrop(env), /already exists/);
});

test('expired drops are not returned and are evicted', () => {
    const store = new DeadDropStore({ mode: 'memory' });
    store.insertDrop(envelope({ clue: 'X', expiresAt: '2000-01-01T00:00:00.000Z' }));
    const fetched = store.fetchByClue('X');
    assert.equal(fetched.length, 0);
    assert.equal(store.snapshot().dropCount, 0);
});

test('deleteByClue removes the drop', () => {
    const store = new DeadDropStore({ mode: 'memory' });
    store.insertDrop(envelope({ clue: 'gone' }));
    assert.equal(store.deleteByClue('gone'), true);
    assert.equal(store.deleteByClue('gone'), false);
});

test('decoy seeds are stable across calls for the same room', () => {
    const store = new DeadDropStore({ mode: 'memory' });
    const seed1 = store.getOrCreateDecoySeed('!room:srv');
    const seed2 = store.getOrCreateDecoySeed('!room:srv');
    assert.deepEqual(Array.from(seed1), Array.from(seed2));
    const seed3 = store.getOrCreateDecoySeed('!other:srv');
    assert.notDeepEqual(Array.from(seed1), Array.from(seed3));
});

test('sweepExpired drops only expired entries', () => {
    const store = new DeadDropStore({ mode: 'memory' });
    store.insertDrop(envelope({ clue: 'live' }));
    store.insertDrop(envelope({ clue: 'dead', expiresAt: '2000-01-01T00:00:00.000Z' }));
    const removed = store.sweepExpired();
    assert.equal(removed, 1);
    assert.equal(store.fetchByClue('live').length, 1);
    assert.equal(store.fetchByClue('dead').length, 0);
});
