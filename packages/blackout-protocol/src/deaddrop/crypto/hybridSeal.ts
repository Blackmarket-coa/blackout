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
 * Both shared secrets are cleared when the seal, or the open, returns or
 * throws, whichever comes first: the key is derived, or the X25519 output
 * was all zeros, or the decapsulation threw, or the nonce was wrong, and
 * the secrets that existed by then are filled with zeros either way (a
 * `finally`). The concatenation of them the KDF is fed is cleared by
 * `deriveHybridAeadKey` once the KDF has run, and the derived key's bytes
 * once WebCrypto has imported them. That is best effort: nothing in
 * JavaScript says what an engine copied (the envelope review, P3-L3), and
 * the plaintext and the opened bytes are the caller's to clear.
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
 * The randomness one seal consumes. `hybridSeal` draws it fresh, for dead
 * drops; `hybridSealWith` takes it as a parameter, for release copies, whose
 * `sealReleaseCopy` draws it (`release/envelope.ts`), and for the fixed test
 * vectors, which supply it.
 */
export type HybridSealRandomness = {
    ephemeral: { privateKey: CryptoKey; publicKeyBytes: Uint8Array };
    /**
     * An ML-KEM-768 encapsulation to the recipient's key. The seal fills its
     * shared secret with zeros whether it succeeds or throws (best effort).
     */
    encapsulation: KemEncapsulation;
    nonce: Uint8Array;
};

/**
 * Derive the AEAD key and import it, clearing the key's bytes once imported
 * (best effort). The two secrets are the caller's to clear, in the `finally`
 * that also covers the paths which throw before this is reached.
 */
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

/**
 * Seal with the randomness given. Dead drops call `hybridSeal`, which draws
 * it; release copies call this through `sealReleaseCopy`, which draws it
 * itself; the fixed test vectors supply it.
 */
export const hybridSealWith = async (
    input: {
        plaintext: Uint8Array;
        recipientX25519PublicKey: CryptoKey;
        transcript?: Uint8Array;
    },
    randomness: HybridSealRandomness
): Promise<HybridSealed> => {
    const pqSecret = randomness.encapsulation.sharedSecret;
    let ecSecret: Uint8Array | undefined;
    try {
        if (randomness.nonce.length !== HYBRID_SEAL_NONCE_BYTES) {
            throw new Error(`hybrid seal: the nonce must be ${HYBRID_SEAL_NONCE_BYTES} bytes`);
        }
        ecSecret = await deriveSharedSecret(
            randomness.ephemeral.privateKey,
            input.recipientX25519PublicKey
        );
        refuseZero(ecSecret);
        const key = await importDerivedKey({
            ecSecret,
            pqSecret,
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
    } finally {
        // Both shared secrets, on every path: the key derived, or a bad
        // nonce or an all-zero X25519 output thrown before it (best effort,
        // P3-L3). The ML-KEM secret is the caller's buffer.
        ecSecret?.fill(0);
        pqSecret.fill(0);
    }
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
    let ecSecret: Uint8Array | undefined;
    let pqSecret: Uint8Array | undefined;
    try {
        ecSecret = await deriveSharedSecret(input.recipientPrivateKey, ephemeral);
        refuseZero(ecSecret);
        pqSecret = await kem.decapsulate(input.sealed.kemCiphertext, input.recipientPqSecretKey);
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
    } finally {
        // Whichever secrets exist by now, on every path: the key derived, or
        // an all-zero X25519 output refused or the decapsulation thrown
        // before it (best effort, P3-L3).
        ecSecret?.fill(0);
        pqSecret?.fill(0);
    }
};
