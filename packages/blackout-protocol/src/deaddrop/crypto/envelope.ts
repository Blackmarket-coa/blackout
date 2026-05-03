/**
 * Versioned wire envelope for a dead drop.
 *
 * The envelope is the only thing the server ever sees. Server-side fields:
 *   - clue, ek, nonce, ct, pad: opaque ciphertext + routing tokens
 *   - expiresAt: server-enforced TTL
 *
 * The recipient identity, sender identity, plaintext, and any quorum
 * structure are entirely client-side.
 *
 * ALG identifier: `sealedbox-x25519-aes256gcm-v1` — the *suite* of
 * primitives used. New suites bump the suite tag, not the envelope
 * version.
 */

import { fromBase64, toBase64 } from './encoding';
import { pad, unpad, type PaddingStrategy } from './padding';
import { open, seal } from './sealedBox';
import { deriveClue } from './clue';
import { randomId } from './random';
import {
    deriveSharedSecret,
    generateEphemeralKeyPair,
    importRecipientPrivateKey,
    importRecipientPublicKey,
} from './keys';
import { importAesGcmKey } from './hkdf';
import { deriveHybridAeadKey, getKemProvider } from './pqHybrid';
import { randomBytes } from './random';

export const ENVELOPE_VERSION = 1;
export const SUPPORTED_SUITES = [
    'sealedbox-x25519-aes256gcm-v1',
    'sealedbox-x25519-mlkem768-aes256gcm-v2',
] as const;
export type EnvelopeSuite = (typeof SUPPORTED_SUITES)[number];

export type DeadDropEnvelopeV1 = {
    v: 1;
    suite: 'sealedbox-x25519-aes256gcm-v1';
    pad: PaddingStrategy;
    /** opaque drop id, server-issued at create time can override */
    dropId: string;
    /** base64, 16 bytes — recipient pickup token */
    clue: string;
    /** base64, 32 bytes — ephemeral X25519 public key */
    ek: string;
    /** base64, 12 bytes */
    nonce: string;
    /** base64 — AES-GCM ciphertext+tag */
    ct: string;
    /** ISO 8601 server-enforced expiry */
    expiresAt: string;
};

/**
 * Post-quantum hybrid envelope. Adds an ML-KEM-768 ciphertext leg next
 * to the existing X25519 ephemeral public key. Recipients combine both
 * shared secrets through HKDF (see `pqHybrid.ts`), so an attacker must
 * break both X25519 AND ML-KEM-768 to recover the AEAD key.
 *
 * Field naming preserves wire-compat with v1 where it makes sense
 * (`ek`, `nonce`, `ct`, `clue`, `pad`, `dropId`, `expiresAt`) and adds
 * the new leg (`pqCt`).
 */
export type DeadDropEnvelopeV2 = {
    v: 2;
    suite: 'sealedbox-x25519-mlkem768-aes256gcm-v2';
    pad: PaddingStrategy;
    dropId: string;
    clue: string;
    /** base64, 32 bytes — sender's ephemeral X25519 public key. */
    ek: string;
    /** base64, 1088 bytes — ML-KEM-768 KEM ciphertext. */
    pqCt: string;
    /** base64, 12 bytes. */
    nonce: string;
    /** base64 — AES-GCM ciphertext+tag. */
    ct: string;
    expiresAt: string;
};

export type AnyDeadDropEnvelope = DeadDropEnvelopeV1 | DeadDropEnvelopeV2;

export type EncryptInput = {
    plaintext: Uint8Array;
    recipientPublicKeyBase64: string;
    paddingStrategy: PaddingStrategy;
    expiresAt: string;
    /** Optional caller-supplied id; otherwise a 16-byte random hex id is generated. */
    dropId?: string;
    /**
     * Suite selector. Defaults to v1 for compatibility. Pick v2 for the
     * post-quantum hybrid envelope; this requires an ML-KEM provider to
     * have been wired via `setKemProvider` (see `mlkem768Provider`) and a
     * recipient PQ public key (`recipientPqPublicKey`, raw 1184 bytes).
     */
    suite?: EnvelopeSuite;
    /**
     * Recipient ML-KEM-768 raw public key (1184 bytes). Required when
     * `suite === 'sealedbox-x25519-mlkem768-aes256gcm-v2'`.
     */
    recipientPqPublicKey?: Uint8Array;
};

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;

export type EncryptInputV1 = Omit<EncryptInput, 'suite' | 'recipientPqPublicKey'> & {
    suite?: 'sealedbox-x25519-aes256gcm-v1';
};

export type EncryptInputV2 = EncryptInput & {
    suite: 'sealedbox-x25519-mlkem768-aes256gcm-v2';
    recipientPqPublicKey: Uint8Array;
};

export function encryptDeadDrop(input: EncryptInputV1): Promise<DeadDropEnvelopeV1>;
export function encryptDeadDrop(input: EncryptInputV2): Promise<DeadDropEnvelopeV2>;
export function encryptDeadDrop(input: EncryptInput): Promise<AnyDeadDropEnvelope>;
export async function encryptDeadDrop(
    input: EncryptInput
): Promise<AnyDeadDropEnvelope> {
    if (input.plaintext.length === 0) {
        throw new Error('plaintext must not be empty');
    }
    const dropId = input.dropId ?? randomId(16);
    const suite = input.suite ?? 'sealedbox-x25519-aes256gcm-v1';
    const { padded } = pad(input.plaintext, input.paddingStrategy);
    const clue = await deriveClue(input.recipientPublicKeyBase64, dropId);

    if (suite === 'sealedbox-x25519-aes256gcm-v1') {
        const sealed = await seal(padded, input.recipientPublicKeyBase64);
        return {
            v: 1,
            suite: 'sealedbox-x25519-aes256gcm-v1',
            pad: input.paddingStrategy,
            dropId,
            clue: toBase64(clue),
            ek: toBase64(sealed.ephemeralPubKey),
            nonce: toBase64(sealed.nonce),
            ct: toBase64(sealed.ciphertext),
            expiresAt: input.expiresAt,
        };
    }

    if (suite === 'sealedbox-x25519-mlkem768-aes256gcm-v2') {
        if (!input.recipientPqPublicKey) {
            throw new Error('recipientPqPublicKey is required for v2 suite');
        }
        const kem = getKemProvider();
        if (input.recipientPqPublicKey.length !== kem.publicKeyLength) {
            throw new Error(
                `recipientPqPublicKey must be ${kem.publicKeyLength} bytes, got ${input.recipientPqPublicKey.length}`,
            );
        }
        const recipientEcPub = await importRecipientPublicKey(input.recipientPublicKeyBase64);
        const ephemeral = await generateEphemeralKeyPair();
        const ecSecret = await deriveSharedSecret(ephemeral.privateKey, recipientEcPub);
        const { ciphertext: pqCiphertext, sharedSecret: pqSecret } = await kem.encapsulate(
            input.recipientPqPublicKey,
        );
        const aeadKeyBytes = await deriveHybridAeadKey({
            ecSecret,
            pqSecret,
            ephemeralX25519Pub: ephemeral.publicKeyBytes,
            pqCiphertext,
        });
        const aeadKey = await importAesGcmKey(aeadKeyBytes);
        const nonce = randomBytes(12);
        const ct = new Uint8Array(
            await subtle().encrypt(
                { name: 'AES-GCM', iv: nonce as unknown as BufferSource },
                aeadKey,
                padded as unknown as BufferSource,
            ),
        );
        return {
            v: 2,
            suite: 'sealedbox-x25519-mlkem768-aes256gcm-v2',
            pad: input.paddingStrategy,
            dropId,
            clue: toBase64(clue),
            ek: toBase64(ephemeral.publicKeyBytes),
            pqCt: toBase64(pqCiphertext),
            nonce: toBase64(nonce),
            ct: toBase64(ct),
            expiresAt: input.expiresAt,
        };
    }

    throw new Error(`unsupported suite: ${suite as string}`);
}

export type DecryptInput = {
    envelope: AnyDeadDropEnvelope;
    recipientPrivateKeyJwk: JsonWebKey;
    /**
     * Recipient ML-KEM-768 raw secret key (2400 bytes). Required when
     * decrypting a v2 envelope.
     */
    recipientPqSecretKey?: Uint8Array;
};

export const decryptDeadDrop = async (
    input: DecryptInput
): Promise<Uint8Array> => {
    const env = input.envelope;
    if (env.v === 1) {
        if (!SUPPORTED_SUITES.includes(env.suite)) {
            throw new Error(`unsupported suite: ${env.suite as string}`);
        }
        const privateKey = await importRecipientPrivateKey(input.recipientPrivateKeyJwk);
        const padded = await open(
            {
                ephemeralPubKey: fromBase64(env.ek),
                nonce: fromBase64(env.nonce),
                ciphertext: fromBase64(env.ct),
            },
            privateKey
        );
        return unpad(padded);
    }

    if (env.v === 2) {
        if (!input.recipientPqSecretKey) {
            throw new Error('recipientPqSecretKey is required to decrypt a v2 envelope');
        }
        const kem = getKemProvider();
        const ephemeralPubBytes = fromBase64(env.ek);
        const pqCiphertext = fromBase64(env.pqCt);
        const ephemeralPub = await importRecipientPublicKey(env.ek);
        const privateKey = await importRecipientPrivateKey(input.recipientPrivateKeyJwk);
        const ecSecret = await deriveSharedSecret(privateKey, ephemeralPub);
        const pqSecret = await kem.decapsulate(pqCiphertext, input.recipientPqSecretKey);
        const aeadKeyBytes = await deriveHybridAeadKey({
            ecSecret,
            pqSecret,
            ephemeralX25519Pub: ephemeralPubBytes,
            pqCiphertext,
        });
        const aeadKey = await importAesGcmKey(aeadKeyBytes);
        const nonce = fromBase64(env.nonce);
        const ct = fromBase64(env.ct);
        const padded = new Uint8Array(
            await subtle().decrypt(
                { name: 'AES-GCM', iv: nonce as unknown as BufferSource },
                aeadKey,
                ct as unknown as BufferSource,
            ),
        );
        return unpad(padded);
    }

    throw new Error(`unsupported envelope version: ${(env as { v: number }).v}`);
};

/**
 * Server-side validation: confirms the envelope shape is well-formed
 * and contains no fields outside the published wire format. Used by the
 * appservice to reject any cleartext-leaking submissions.
 */
const V1_ALLOWED_KEYS: ReadonlySet<string> = new Set([
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

const V2_ALLOWED_KEYS: ReadonlySet<string> = new Set([
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

const padIsValid = (pad: unknown): boolean => pad === 'minimal' || pad === 'bucket';

export const isOpaqueEnvelopeV1 = (input: unknown): input is DeadDropEnvelopeV1 => {
    if (!input || typeof input !== 'object') return false;
    const obj = input as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
        if (!V1_ALLOWED_KEYS.has(key)) return false;
    }
    if (obj.v !== 1) return false;
    if (obj.suite !== 'sealedbox-x25519-aes256gcm-v1') return false;
    if (!padIsValid(obj.pad)) return false;
    for (const k of ['dropId', 'clue', 'ek', 'nonce', 'ct', 'expiresAt']) {
        if (typeof obj[k] !== 'string' || (obj[k] as string).length === 0) return false;
    }
    return true;
};

export const isOpaqueEnvelopeV2 = (input: unknown): input is DeadDropEnvelopeV2 => {
    if (!input || typeof input !== 'object') return false;
    const obj = input as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
        if (!V2_ALLOWED_KEYS.has(key)) return false;
    }
    if (obj.v !== 2) return false;
    if (obj.suite !== 'sealedbox-x25519-mlkem768-aes256gcm-v2') return false;
    if (!padIsValid(obj.pad)) return false;
    for (const k of ['dropId', 'clue', 'ek', 'pqCt', 'nonce', 'ct', 'expiresAt']) {
        if (typeof obj[k] !== 'string' || (obj[k] as string).length === 0) return false;
    }
    return true;
};

/** Accept either a v1 or v2 envelope. */
export const isOpaqueEnvelope = (input: unknown): input is AnyDeadDropEnvelope =>
    isOpaqueEnvelopeV1(input) || isOpaqueEnvelopeV2(input);
