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

const SUPPORTED_SUITES = new Set(['sealedbox-x25519-aes256gcm-v1']);

export const isOpaqueEnvelope = (input) => {
    if (!input || typeof input !== 'object') return false;
    for (const key of Object.keys(input)) {
        if (!ALLOWED_KEYS.has(key)) return false;
    }
    if (input.v !== 1) return false;
    if (typeof input.suite !== 'string' || !SUPPORTED_SUITES.has(input.suite)) {
        return false;
    }
    if (input.pad !== 'minimal' && input.pad !== 'bucket') return false;
    for (const k of ['dropId', 'clue', 'ek', 'nonce', 'ct', 'expiresAt']) {
        if (typeof input[k] !== 'string' || input[k].length === 0) return false;
    }
    return true;
};
