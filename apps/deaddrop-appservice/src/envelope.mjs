/**
 * Server-side envelope validation. Mirrors `isOpaqueEnvelope` from
 * `packages/blackout-protocol/src/deaddrop/crypto/envelope.ts`. The two
 * implementations MUST stay in lockstep — there is a parity test in
 * `test/envelope-parity.test.mjs`.
 *
 * The server's job is to reject any submission that contains fields
 * outside the published wire format, so a misbehaving / malicious client
 * cannot smuggle cleartext metadata onto the server.
 */

const ALLOWED_KEYS = new Set([
    'v',
    'suite',
    'pad',
    'dropId',
    'clue',
    'ek',
    'nonce',
    'ct',
    'expiresAt',
]);

const V2_ALLOWED_KEYS = new Set([...ALLOWED_KEYS, 'pqCt']);

const SUPPORTED_SUITES = new Set([
    'sealedbox-x25519-aes256gcm-v1',
    'sealedbox-x25519-mlkem768-aes256gcm-v2',
]);

const SUITE_ALLOWED_KEYS = {
    'sealedbox-x25519-aes256gcm-v1': ALLOWED_KEYS,
    'sealedbox-x25519-mlkem768-aes256gcm-v2': V2_ALLOWED_KEYS,
};

export const isOpaqueEnvelope = (input) => {
    if (!input || typeof input !== 'object') return false;
    if (typeof input.suite !== 'string' || !SUPPORTED_SUITES.has(input.suite)) {
        return false;
    }
    const allowedKeys = SUITE_ALLOWED_KEYS[input.suite];
    for (const key of Object.keys(input)) {
        if (!allowedKeys.has(key)) return false;
    }
    if (input.v !== 1 && input.v !== 2) return false;
    if (input.pad !== 'minimal' && input.pad !== 'bucket') return false;
    const requiredFields = ['dropId', 'clue', 'ek', 'nonce', 'ct', 'expiresAt'];
    if (input.v === 2) {
        if (typeof input.pqCt !== 'string' || input.pqCt.length === 0) return false;
    }
    for (const k of requiredFields) {
        if (typeof input[k] !== 'string' || input[k].length === 0) return false;
    }
    return true;
};
