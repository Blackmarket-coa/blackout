/**
 * The one hybrid sealing construction: an ephemeral X25519 key and an
 * ML-KEM-768 encapsulation, combined in one HKDF-SHA-256 with a transcript
 * (`deriveHybridAeadKey`), then AES-256-GCM under the derived key with a
 * random nonce and no associated data.
 *
 *   ssX   = X25519(ephemeral, recipient)          refused if all zero
 *   ssM   = ML-KEM-768 shared secret
 *   key   = HKDF-SHA-256(ssX ‖ ssM, salt = ephemeral ‖ ML-KEM ciphertext,
 *                        info = "blackout-deaddrop-v2-hybrid" ‖ transcript)
 *   ct    = AES-256-GCM(key, nonce, plaintext)
 *
 * Dead-drop v2 envelopes seal with an empty transcript, so their keys are
 * the ones they always were; dead-man release copies seal with the release
 * seal transcript, which binds the release, both accounts and both
 * fingerprints (`release/envelope.ts`). One function, so there is one
 * construction to review: `docs/security/release-envelope-2026-10-26.md` §2,
 * and `docs/security/release-identities-2026-10-26.md` §5, item 1.
 *
 * An all-zero X25519 output is refused on both sides (RFC 9180 §7.1.4): a
 * small-order key makes every shared secret zero, and the hybrid would then
 * rest on ML-KEM alone without anyone knowing. Node's WebCrypto refuses such
 * keys itself, by throwing; the check covers an engine that returns zeros.
 *
 * Both shared secrets, and the concatenation of them the KDF is fed
 * (`deriveHybridAeadKey`), are cleared once the key is derived, and the
 * derived key's bytes once WebCrypto has imported them. That is best effort:
 * nothing in JavaScript says what an engine copied (the envelope review,
 * P3-L3), and the plaintext and the opened bytes are the caller's to clear.
 */

import { toBase64 } from './encoding';
import { importAesGcmKey } from './hkdf';
import { deriveSharedSecret, generateEphemeralKeyPair, importRecipientPublicKey } from './keys';
import { deriveHybridAeadKey, getKemProvider, type KemEncapsulation } from './pqHybrid';
import { randomBytes } from './random';

export const HYBRID_SEAL_NONCE_BYTES = 12;

/** What a hybrid seal produces; every field travels with the ciphertext. */
export type HybridSealed = {
    /** The sender's ephemeral X25519 public key, 32 bytes. */
    ephemeralPublicKey: Uint8Array;
    /** The ML-KEM-768 ciphertext, 1088 bytes. */
    kemCiphertext: Uint8Array;
    /** The AES-GCM nonce, 12 bytes. */
    nonce: Uint8Array;
    /** AES-256-GCM ciphertext and tag: the plaintext's length plus 16. */
    ciphertext: Uint8Array;
};

/**
 * The randomness one seal consumes. `hybridSeal` draws it fresh; it is a
 * parameter of `hybridSealWith` only so that fixed test vectors can be made.
 */
export type HybridSealRandomness = {
    ephemeral: { privateKey: CryptoKey; publicKeyBytes: Uint8Array };
    /** An ML-KEM-768 encapsulation to the recipient's key; its shared secret is cleared by the seal. */
    encapsulation: KemEncapsulation;
    nonce: Uint8Array;
};

/** Derive the AEAD key and import it, clearing the secrets and the key bytes (best effort). */
const importDerivedKey = async (input: {
    ecSecret: Uint8Array;
    pqSecret: Uint8Array;
    ephemeralX25519Pub: Uint8Array;
    pqCiphertext: Uint8Array;
    transcript?: Uint8Array;
}): Promise<CryptoKey> => {
    let keyBytes: Uint8Array | undefined;
    try {
        keyBytes = await deriveHybridAeadKey(input);
        return await importAesGcmKey(keyBytes);
    } finally {
        input.ecSecret.fill(0);
        input.pqSecret.fill(0);
        keyBytes?.fill(0);
    }
};

export type HybridSealErrorCode = 'zero_shared_secret';

export class HybridSealError extends Error {
    readonly code: HybridSealErrorCode;

    constructor(code: HybridSealErrorCode, message: string) {
        super(message);
        this.code = code;
        this.name = 'HybridSealError';
    }
}

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;

const isAllZero = (bytes: Uint8Array): boolean => {
    let acc = 0;
    for (const byte of bytes) acc |= byte;
    return acc === 0;
};

const refuseZero = (sharedSecret: Uint8Array): void => {
    if (isAllZero(sharedSecret)) {
        throw new HybridSealError(
            'zero_shared_secret',
            'the X25519 shared secret is all zeros: the key contributes nothing'
        );
    }
};

/** Seal with the randomness given. Production code calls `hybridSeal`. */
export const hybridSealWith = async (
    input: {
        plaintext: Uint8Array;
        recipientX25519PublicKey: CryptoKey;
        transcript?: Uint8Array;
    },
    randomness: HybridSealRandomness
): Promise<HybridSealed> => {
    if (randomness.nonce.length !== HYBRID_SEAL_NONCE_BYTES) {
        throw new Error(`hybrid seal: the nonce must be ${HYBRID_SEAL_NONCE_BYTES} bytes`);
    }
    const ecSecret = await deriveSharedSecret(
        randomness.ephemeral.privateKey,
        input.recipientX25519PublicKey
    );
    refuseZero(ecSecret);
    const key = await importDerivedKey({
        ecSecret,
        pqSecret: randomness.encapsulation.sharedSecret,
        ephemeralX25519Pub: randomness.ephemeral.publicKeyBytes,
        pqCiphertext: randomness.encapsulation.ciphertext,
        transcript: input.transcript,
    });
    const ciphertext = new Uint8Array(
        await subtle().encrypt(
            { name: 'AES-GCM', iv: randomness.nonce as unknown as BufferSource },
            key,
            input.plaintext as unknown as BufferSource
        )
    );
    return {
        ephemeralPublicKey: randomness.ephemeral.publicKeyBytes,
        kemCiphertext: randomness.encapsulation.ciphertext,
        nonce: randomness.nonce,
        ciphertext,
    };
};

/**
 * Seal `plaintext` to a recipient's X25519 key (standard base64) and
 * ML-KEM-768 encapsulation key (raw bytes), with fresh randomness. Needs an
 * ML-KEM provider (`setKemProvider`); the default one refuses.
 */
export const hybridSeal = async (input: {
    plaintext: Uint8Array;
    recipientX25519PublicKeyBase64: string;
    recipientPqPublicKey: Uint8Array;
    transcript?: Uint8Array;
}): Promise<HybridSealed> => {
    const kem = getKemProvider();
    if (input.recipientPqPublicKey.length !== kem.publicKeyLength) {
        throw new Error(
            `recipientPqPublicKey must be ${kem.publicKeyLength} bytes, got ${input.recipientPqPublicKey.length}`
        );
    }
    const recipient = await importRecipientPublicKey(input.recipientX25519PublicKeyBase64);
    const ephemeral = await generateEphemeralKeyPair();
    const encapsulation = await kem.encapsulate(input.recipientPqPublicKey);
    return hybridSealWith(
        {
            plaintext: input.plaintext,
            recipientX25519PublicKey: recipient,
            transcript: input.transcript,
        },
        { ephemeral, encapsulation, nonce: randomBytes(HYBRID_SEAL_NONCE_BYTES) }
    );
};

/**
 * Open a hybrid seal with the recipient's X25519 private key and ML-KEM-768
 * decapsulation key, and the same transcript the sender used. Throws if the
 * X25519 output is all zeros (`HybridSealError`) or if the AES-GCM tag does
 * not verify (WebCrypto's `OperationError`): a changed field, another
 * transcript and the wrong keys all fail the same way.
 */
export const hybridOpen = async (input: {
    sealed: HybridSealed;
    recipientPrivateKey: CryptoKey;
    recipientPqSecretKey: Uint8Array;
    transcript?: Uint8Array;
}): Promise<Uint8Array> => {
    const kem = getKemProvider();
    const ephemeral = await importRecipientPublicKey(toBase64(input.sealed.ephemeralPublicKey));
    const ecSecret = await deriveSharedSecret(input.recipientPrivateKey, ephemeral);
    refuseZero(ecSecret);
    const pqSecret = await kem.decapsulate(input.sealed.kemCiphertext, input.recipientPqSecretKey);
    const key = await importDerivedKey({
        ecSecret,
        pqSecret,
        ephemeralX25519Pub: input.sealed.ephemeralPublicKey,
        pqCiphertext: input.sealed.kemCiphertext,
        transcript: input.transcript,
    });
    return new Uint8Array(
        await subtle().decrypt(
            { name: 'AES-GCM', iv: input.sealed.nonce as unknown as BufferSource },
            key,
            input.sealed.ciphertext as unknown as BufferSource
        )
    );
};
