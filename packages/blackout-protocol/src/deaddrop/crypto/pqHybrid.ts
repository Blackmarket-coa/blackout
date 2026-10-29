/**
 * Post-quantum hybrid key derivation for the dead-drop sealed box.
 *
 * Combines the existing X25519 ECDH shared secret with an ML-KEM-768
 * KEM shared secret, mixing them in a transcript-bound HKDF, a
 * concatenate-then-KDF combiner in the style of
 * draft-ietf-tls-hybrid-design. It is HPKE-shaped but is not HPKE
 * (RFC 9180): it is not wire-compatible, has none of HPKE's labeled
 * derivations, and does not bind the recipient's public key into the
 * key, which HPKE's DHKEM and X-Wing do
 * (`docs/security/release-identities-2026-10-26.md` §5, C5 and C6):
 *
 *   ikm     = ec_secret || pq_secret
 *   salt    = ek_x25519 || ek_kyber_ct
 *   info    = "blackout-deaddrop-v2-hybrid" || transcript
 *   key     = HKDF-SHA-256(ikm, salt, info, 32)
 *
 * The transcript is appended raw, not hashed, and the label before it has no
 * terminator and no length prefix. A dead drop today has no transcript, and
 * a release copy's transcript starts with its own NUL-terminated label, so
 * the two `info` values cannot meet. The constraint that keeps it so: a
 * dead-drop transcript, if one is added, must start with its own
 * NUL-terminated label that is none of the release labels (envelope record
 * §3), or this derivation moves to a v3 label with a terminator and a length
 * prefix on the transcript (the envelope review, P3-L1).
 *
 * The construction is "harvest-now-decrypt-later" safe: an attacker
 * needs to break BOTH X25519 AND ML-KEM-768 to derive the AEAD key, so
 * deploying the hybrid is strictly stronger than either primitive
 * alone.
 *
 * The ML-KEM primitive itself is intentionally provided through a
 * `KemProvider` interface rather than implemented inline. ML-KEM-768
 * is not yet in WebCrypto and we must not roll our own. The provider is
 * `mlKem768Provider` (`mlkem768Provider.ts`, `@noble/post-quantum`);
 * until `setKemProvider` installs it, the default provider refuses every
 * call. The client installs it at startup (`installReleaseKemProvider`).
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
     * Optional transcript, appended raw to the `info` label (not hashed):
     * for a release copy the 203-byte seal transcript of structured fields
     * (`release/envelope.ts`); a dead drop passes none, which leaves `info`
     * the label alone.
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
export const deriveHybridAeadKey = async (input: DeriveHybridKeyInput): Promise<Uint8Array> => {
    if (input.ecSecret.length === 0) throw new Error('ecSecret must not be empty');
    if (input.pqSecret.length === 0) throw new Error('pqSecret must not be empty');
    const ikm = concat(input.ecSecret, input.pqSecret);
    const salt = concat(input.ephemeralX25519Pub, input.pqCiphertext);
    const info =
        input.transcript && input.transcript.length > 0
            ? concat(PQ_HYBRID_INFO, input.transcript)
            : PQ_HYBRID_INFO;
    return hkdfSha256(ikm, salt, info, 32);
};

/** Fixed 1-byte domain tag distinguishing v1 (classical) from v2 (hybrid). */
export const SUITE_DOMAIN_TAG = {
    classicalV1: new Uint8Array([0x01]),
    hybridV2: new Uint8Array([0x02]),
} as const;
