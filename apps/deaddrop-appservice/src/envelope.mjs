/**
 * Server-side envelope validation. Mirrors `isOpaqueEnvelope` from
 * `packages/blackout-protocol/src/deaddrop/crypto/envelope.ts`. The two
 * implementations MUST stay in lockstep — there is a parity test in
 * `test/envelope-parity.test.mjs`.
 *
 * The server's job is to reject any submission that contains fields
 * outside the published wire format, so a misbehaving / malicious client
 * cannot smuggle cleartext metadata onto the server.
 *
 * Accepts BOTH the v1 (X25519 sealed-box) and v2 (X25519 + ML-KEM-768
 * post-quantum hybrid) envelope shapes, exactly as the protocol library does.
 */

const V1_ALLOWED_KEYS = new Set([
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

const V2_ALLOWED_KEYS = new Set([
    'v',
    'suite',
    'pad',
    'dropId',
    'clue',
    'ek',
    'pqCt',
    'nonce',
    'ct',
    'expiresAt',
]);

const V1_SUITE = 'sealedbox-x25519-aes256gcm-v1';
const V2_SUITE = 'sealedbox-x25519-mlkem768-aes256gcm-v2';

const padIsValid = (pad) => pad === 'minimal' || pad === 'bucket';

const nonEmptyStrings = (input, keys) => {
    for (const k of keys) {
        if (typeof input[k] !== 'string' || input[k].length === 0) return false;
    }
    return true;
};

export const isOpaqueEnvelopeV1 = (input) => {
    if (!input || typeof input !== 'object') return false;
    for (const key of Object.keys(input)) {
        if (!V1_ALLOWED_KEYS.has(key)) return false;
    }
    if (input.v !== 1) return false;
    if (input.suite !== V1_SUITE) return false;
    if (!padIsValid(input.pad)) return false;
    return nonEmptyStrings(input, ['dropId', 'clue', 'ek', 'nonce', 'ct', 'expiresAt']);
};

export const isOpaqueEnvelopeV2 = (input) => {
    if (!input || typeof input !== 'object') return false;
    for (const key of Object.keys(input)) {
        if (!V2_ALLOWED_KEYS.has(key)) return false;
    }
    if (input.v !== 2) return false;
    if (input.suite !== V2_SUITE) return false;
    if (!padIsValid(input.pad)) return false;
    return nonEmptyStrings(input, ['dropId', 'clue', 'ek', 'pqCt', 'nonce', 'ct', 'expiresAt']);
};

/** Accept either a v1 or v2 envelope. */
export const isOpaqueEnvelope = (input) => isOpaqueEnvelopeV1(input) || isOpaqueEnvelopeV2(input);
