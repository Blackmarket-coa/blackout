/**
 * Post-quantum hybrid key derivation for the dead-drop sealed box.
 *
 * Combines the existing X25519 ECDH shared secret with an ML-KEM-768
 * KEM shared secret, mixing them in a transcript-bound HKDF following
 * the construction recommended by draft-irtf-cfrg-hpke (HPKE hybrid)
 * and draft-ietf-tls-hybrid-design:
 *
 *   ikm     = ec_secret || pq_secret
 *   salt    = ek_x25519 || ek_kyber_ct
 *   info    = "blackout-deaddrop-v2-hybrid" || transcript_hash
 *   key     = HKDF-SHA-256(ikm, salt, info, 32)
 *
 * The construction is "harvest-now-decrypt-later" safe: an attacker
 * needs to break BOTH X25519 AND ML-KEM-768 to derive the AEAD key, so
 * deploying the hybrid is strictly stronger than either primitive
 * alone.
 *
 * The ML-KEM primitive itself is intentionally provided through a
 * `KemProvider` interface rather than implemented inline. ML-KEM-768
 * is not yet in WebCrypto and we must not roll our own; the production
 * provider should be backed by a vetted library
 * (e.g. `@noble/post-quantum`) wired in a follow-up dependency PR.
 */

import { hkdfSha256 } from './hkdf';
import { utf8Encode } from './encoding';

export const PQ_HYBRID_INFO = utf8Encode('blackout-deaddrop-v2-hybrid');

export interface KemEncapsulation {
    /** The KEM ciphertext that the sender includes in the envelope. */
    ciphertext: Uint8Array;
    /** The shared secret derived on the sender side. */
    sharedSecret: Uint8Array;
}

export interface KemProvider {
    /** ML-KEM-768 public key length: 1184 bytes. */
    readonly publicKeyLength: number;
    /** ML-KEM-768 secret key length: 2400 bytes. */
    readonly secretKeyLength: number;
    /** ML-KEM-768 ciphertext length: 1088 bytes. */
    readonly ciphertextLength: number;
    /** ML-KEM-768 shared-secret length: 32 bytes. */
    readonly sharedSecretLength: number;

    /** Generate a new (publicKey, secretKey) pair. */
    generateKeyPair(): Promise<{ publicKey: Uint8Array; secretKey: Uint8Array }>;
    /** Sender side: encapsulate to a recipient public key. */
    encapsulate(recipientPublicKey: Uint8Array): Promise<KemEncapsulation>;
    /** Recipient side: decapsulate the received ciphertext. */
    decapsulate(ciphertext: Uint8Array, secretKey: Uint8Array): Promise<Uint8Array>;
}

/**
 * Default provider stub. It throws on every operation so that nothing in
 * production accidentally encrypts with a zero-strength KEM. A real
 * provider must be injected at runtime via `setKemProvider`.
 */
export const NULL_KEM_PROVIDER: KemProvider = {
    publicKeyLength: 1184,
    secretKeyLength: 2400,
    ciphertextLength: 1088,
    sharedSecretLength: 32,
    generateKeyPair: async () => {
        throw new Error('ML-KEM provider not configured (call setKemProvider first)');
    },
    encapsulate: async () => {
        throw new Error('ML-KEM provider not configured (call setKemProvider first)');
    },
    decapsulate: async () => {
        throw new Error('ML-KEM provider not configured (call setKemProvider first)');
    },
};

let activeProvider: KemProvider = NULL_KEM_PROVIDER;

export const setKemProvider = (provider: KemProvider): void => {
    activeProvider = provider;
};

export const getKemProvider = (): KemProvider => activeProvider;

const concat = (...parts: Uint8Array[]): Uint8Array => {
    let total = 0;
    for (const p of parts) total += p.length;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const p of parts) {
        out.set(p, offset);
        offset += p.length;
    }
    return out;
};

export interface DeriveHybridKeyInput {
    /** Shared secret from the X25519 ECDH leg. */
    ecSecret: Uint8Array;
    /** Shared secret from the ML-KEM leg. */
    pqSecret: Uint8Array;
    /** Sender's ephemeral X25519 public key (32 bytes). */
    ephemeralX25519Pub: Uint8Array;
    /** ML-KEM ciphertext as it will appear on the wire. */
    pqCiphertext: Uint8Array;
    /**
     * Optional transcript hash binding more context (e.g. recipient pubkey
     * fingerprint, dropId) — defaults to an empty string.
     */
    transcript?: Uint8Array;
}

/**
 * The KDF combiner. Pure function over byte slices so it can be tested
 * without any PQ implementation. Mixing the X25519 and PQ secrets via
 * HKDF gives the canonical hybrid security guarantee:
 *
 *   AEAD-key strong  iff  (X25519 strong  OR  ML-KEM strong)
 *
 * That is, breaking the AEAD requires breaking both legs.
 */
export const deriveHybridAeadKey = async (
    input: DeriveHybridKeyInput,
): Promise<Uint8Array> => {
    if (input.ecSecret.length === 0) throw new Error('ecSecret must not be empty');
    if (input.pqSecret.length === 0) throw new Error('pqSecret must not be empty');
    const ikm = concat(input.ecSecret, input.pqSecret);
    const salt = concat(input.ephemeralX25519Pub, input.pqCiphertext);
    const info = input.transcript && input.transcript.length > 0
        ? concat(PQ_HYBRID_INFO, input.transcript)
        : PQ_HYBRID_INFO;
    return hkdfSha256(ikm, salt, info, 32);
};

/** Fixed 1-byte domain tag distinguishing v1 (classical) from v2 (hybrid). */
export const SUITE_DOMAIN_TAG = {
    classicalV1: new Uint8Array([0x01]),
    hybridV2: new Uint8Array([0x02]),
} as const;
