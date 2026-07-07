/**
 * Parity test — keeps the appservice envelope validator in lockstep with the
 * protocol library's `isOpaqueEnvelope`
 * (`packages/blackout-protocol/src/deaddrop/crypto/envelope.ts`).
 *
 * The protocol library is TypeScript and has no published build the appservice
 * can import, so this test pins the appservice validator to the SAME published
 * wire contract the library accepts: it MUST accept both a canonical v1
 * (X25519 sealed-box) and a canonical v2 (X25519 + ML-KEM-768 hybrid) envelope,
 * and reject drift. This is what catches a regression like the appservice
 * silently dropping back to v1-only and rejecting valid post-quantum envelopes.
 *
 * If the library's wire format changes, update BOTH implementations and the
 * fixtures below together.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOpaqueEnvelope, isOpaqueEnvelopeV1, isOpaqueEnvelopeV2 } from '../src/envelope.mjs';

// Canonical fixtures mirroring the protocol library's accept-set.
const v1Envelope = () => ({
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

const v2Envelope = () => ({
    v: 2,
    suite: 'sealedbox-x25519-mlkem768-aes256gcm-v2',
    pad: 'bucket',
    dropId: 'b'.repeat(32),
    clue: 'AAAA',
    ek: 'BBBB',
    pqCt: 'EEEE',
    nonce: 'CCCC',
    ct: 'DDDD',
    expiresAt: '2030-01-01T00:00:00.000Z',
});

test('accepts a canonical v1 envelope (both aggregate and v1 predicate)', () => {
    assert.equal(isOpaqueEnvelope(v1Envelope()), true);
    assert.equal(isOpaqueEnvelopeV1(v1Envelope()), true);
    assert.equal(isOpaqueEnvelopeV2(v1Envelope()), false);
});

test('accepts a canonical v2 post-quantum hybrid envelope (parity with protocol lib)', () => {
    assert.equal(isOpaqueEnvelope(v2Envelope()), true);
    assert.equal(isOpaqueEnvelopeV2(v2Envelope()), true);
    assert.equal(isOpaqueEnvelopeV1(v2Envelope()), false);
});

test('v2 without pqCt is rejected (it is the defining hybrid field)', () => {
    const env = v2Envelope();
    delete env.pqCt;
    assert.equal(isOpaqueEnvelope(env), false);
});

test('v1 must not carry pqCt (extra-field anti-cleartext-leak guard)', () => {
    assert.equal(isOpaqueEnvelope({ ...v1Envelope(), pqCt: 'EEEE' }), false);
});

test('mismatched version/suite pairings are rejected', () => {
    // v2 version with the v1 suite, and vice-versa.
    assert.equal(
        isOpaqueEnvelope({ ...v2Envelope(), suite: 'sealedbox-x25519-aes256gcm-v1' }),
        false
    );
    assert.equal(isOpaqueEnvelope({ ...v1Envelope(), v: 2 }), false);
});

test('extra fields are rejected on both versions (no smuggled cleartext metadata)', () => {
    for (const base of [v1Envelope, v2Envelope]) {
        for (const extra of ['sender', 'recipient', 'plaintext', 'bodyHint']) {
            assert.equal(
                isOpaqueEnvelope({ ...base(), [extra]: 'oops' }),
                false,
                `should reject ${extra} on v${base().v}`
            );
        }
    }
});

test('missing required fields are rejected on both versions', () => {
    const v1Required = ['dropId', 'clue', 'ek', 'nonce', 'ct', 'expiresAt', 'pad'];
    for (const k of v1Required) {
        const env = v1Envelope();
        delete env[k];
        assert.equal(isOpaqueEnvelope(env), false, `v1 should reject missing ${k}`);
    }
    const v2Required = ['dropId', 'clue', 'ek', 'pqCt', 'nonce', 'ct', 'expiresAt', 'pad'];
    for (const k of v2Required) {
        const env = v2Envelope();
        delete env[k];
        assert.equal(isOpaqueEnvelope(env), false, `v2 should reject missing ${k}`);
    }
});

test('rejects null / non-object input', () => {
    for (const bad of [null, undefined, 'nope', 42, []]) {
        assert.equal(isOpaqueEnvelope(bad), false);
    }
});
