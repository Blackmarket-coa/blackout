/**
 * ML-KEM-768 KemProvider backed by @noble/post-quantum.
 *
 * The pure HKDF combiner in `pqHybrid.ts` is independent of any PQ
 * implementation. This file plugs the FIPS 203 ML-KEM-768 primitive into
 * the `KemProvider` interface so callers that opt-in get a real hybrid
 * envelope (X25519 + ML-KEM-768) instead of the safety-stop NULL provider.
 *
 * FIPS 203 Table 3 sizes (ML-KEM-768):
 *   publicKey:      1184 bytes
 *   secretKey:      2400 bytes
 *   ciphertext:     1088 bytes
 *   sharedSecret:     32 bytes
 */

import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import type { KemEncapsulation, KemProvider } from './pqHybrid';

const PUBLIC_KEY_LENGTH = 1184;
const SECRET_KEY_LENGTH = 2400;
const CIPHERTEXT_LENGTH = 1088;
const SHARED_SECRET_LENGTH = 32;

const assertLength = (label: string, actual: number, expected: number): void => {
    if (actual !== expected) {
        throw new Error(`${label}: expected ${expected} bytes, got ${actual}`);
    }
};

export const mlKem768Provider: KemProvider = {
    publicKeyLength: PUBLIC_KEY_LENGTH,
    secretKeyLength: SECRET_KEY_LENGTH,
    ciphertextLength: CIPHERTEXT_LENGTH,
    sharedSecretLength: SHARED_SECRET_LENGTH,

    generateKeyPair: async () => {
        const { publicKey, secretKey } = ml_kem768.keygen();
        return {
            publicKey: new Uint8Array(publicKey),
            secretKey: new Uint8Array(secretKey),
        };
    },

    encapsulate: async (recipientPublicKey: Uint8Array): Promise<KemEncapsulation> => {
        assertLength('ML-KEM-768 publicKey', recipientPublicKey.length, PUBLIC_KEY_LENGTH);
        const result = ml_kem768.encapsulate(recipientPublicKey);
        return {
            ciphertext: new Uint8Array(result.cipherText),
            sharedSecret: new Uint8Array(result.sharedSecret),
        };
    },

    decapsulate: async (
        ciphertext: Uint8Array,
        secretKey: Uint8Array,
    ): Promise<Uint8Array> => {
        assertLength('ML-KEM-768 ciphertext', ciphertext.length, CIPHERTEXT_LENGTH);
        assertLength('ML-KEM-768 secretKey', secretKey.length, SECRET_KEY_LENGTH);
        const shared = ml_kem768.decapsulate(ciphertext, secretKey);
        return new Uint8Array(shared);
    },
};
