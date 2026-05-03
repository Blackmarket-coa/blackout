/**
 * One-way sealed-box: anonymous sender → known recipient.
 *
 * Equivalent in spirit to libsodium's `crypto_box_seal`, but built from
 * standardised, separately-audited primitives in WebCrypto:
 *   - X25519 ECDH (RFC 7748)
 *   - HKDF-SHA-256 (RFC 5869)
 *   - AES-256-GCM (NIST SP 800-38D)
 *
 * Wire format produced by `seal` and consumed by `open`:
 *   { ek: <32-byte ephemeral pubkey>, nonce: <12 bytes>, ct: <ciphertext+tag> }
 *
 * The ephemeral keypair is generated fresh per drop and never reused, so
 * each drop has its own forward-secrecy boundary.
 */

import { hkdfSha256, importAesGcmKey } from './hkdf';
import {
    deriveSharedSecret,
    generateEphemeralKeyPair,
    importRecipientPublicKey,
} from './keys';
import { randomBytes } from './random';
import { toBase64, utf8Encode } from './encoding';

const HKDF_INFO = utf8Encode('blackout-deaddrop-v1');

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;

export type SealedPayload = {
    ephemeralPubKey: Uint8Array;
    nonce: Uint8Array;
    ciphertext: Uint8Array;
};

export const seal = async (
    plaintext: Uint8Array,
    recipientPublicKeyBase64: string
): Promise<SealedPayload> => {
    const recipient = await importRecipientPublicKey(recipientPublicKeyBase64);
    const ephemeral = await generateEphemeralKeyPair();
    const shared = await deriveSharedSecret(ephemeral.privateKey, recipient);
    const aesKeyBytes = await hkdfSha256(shared, ephemeral.publicKeyBytes, HKDF_INFO, 32);
    const aesKey = await importAesGcmKey(aesKeyBytes);
    const nonce = randomBytes(12);
    const ciphertext = new Uint8Array(
        await subtle().encrypt(
            { name: 'AES-GCM', iv: nonce as unknown as BufferSource },
            aesKey,
            plaintext as unknown as BufferSource
        )
    );
    return { ephemeralPubKey: ephemeral.publicKeyBytes, nonce, ciphertext };
};

export const open = async (
    sealed: SealedPayload,
    recipientPrivateKey: CryptoKey
): Promise<Uint8Array> => {
    const ephemeralPub = await importRecipientPublicKey(
        toBase64(sealed.ephemeralPubKey)
    );
    const shared = await deriveSharedSecret(recipientPrivateKey, ephemeralPub);
    const aesKeyBytes = await hkdfSha256(shared, sealed.ephemeralPubKey, HKDF_INFO, 32);
    const aesKey = await importAesGcmKey(aesKeyBytes);
    const plaintext = new Uint8Array(
        await subtle().decrypt(
            { name: 'AES-GCM', iv: sealed.nonce as unknown as BufferSource },
            aesKey,
            sealed.ciphertext as unknown as BufferSource
        )
    );
    return plaintext;
};
