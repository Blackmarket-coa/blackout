import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOpaqueEnvelope } from '../src/envelope.mjs';

const validEnvelope = () => ({
    v: 1,
    suite: 'sealedbox-x25519-aes256gcm-v1',
    pad: 'minimal',
    dropId: 'a'.repeat(32),
    clue: 'AAAA',
    ek: 'BBBB',
    nonce: 'CCCC',
    ct: 'DDDD',
    expiresAt: '2030-01-01T00:00:00.000Z',
});

test('accepts a well-formed envelope', () => {
    assert.equal(isOpaqueEnvelope(validEnvelope()), true);
});

test('rejects envelopes with extra fields (anti-cleartext-leak)', () => {
    const cases = [
        { ...validEnvelope(), sender: '@me:srv' },
        { ...validEnvelope(), recipient: '@you:srv' },
        { ...validEnvelope(), plaintext: 'oops' },
        { ...validEnvelope(), bodyHint: 'meet at midnight' },
    ];
    for (const env of cases) {
        assert.equal(isOpaqueEnvelope(env), false, `should reject: ${Object.keys(env)}`);
    }
});

test('rejects unsupported version + suite', () => {
    assert.equal(isOpaqueEnvelope({ ...validEnvelope(), v: 2 }), false);
    assert.equal(
        isOpaqueEnvelope({ ...validEnvelope(), suite: 'made-up-cipher-v2' }),
        false
    );
});

test('rejects missing required fields', () => {
    for (const k of ['dropId', 'clue', 'ek', 'nonce', 'ct', 'expiresAt', 'pad']) {
        const env = validEnvelope();
        delete env[k];
        assert.equal(isOpaqueEnvelope(env), false, `should reject when missing ${k}`);
    }
});

test('rejects null / non-object input', () => {
    assert.equal(isOpaqueEnvelope(null), false);
    assert.equal(isOpaqueEnvelope(undefined), false);
    assert.equal(isOpaqueEnvelope('not-an-object'), false);
    assert.equal(isOpaqueEnvelope(42), false);
});
