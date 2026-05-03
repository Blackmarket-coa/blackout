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
import { importRecipientPrivateKey } from './keys';

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
};

export const encryptDeadDrop = async (
    input: EncryptInput
): Promise<DeadDropEnvelopeV1> => {
    if (input.plaintext.length === 0) {
        throw new Error('plaintext must not be empty');
    }
    const dropId = input.dropId ?? randomId(16);
    const { padded } = pad(input.plaintext, input.paddingStrategy);
    const sealed = await seal(padded, input.recipientPublicKeyBase64);
    const clue = await deriveClue(input.recipientPublicKeyBase64, dropId);
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
};

export type DecryptInput = {
    envelope: DeadDropEnvelopeV1;
    recipientPrivateKeyJwk: JsonWebKey;
};

export const decryptDeadDrop = async (
    input: DecryptInput
): Promise<Uint8Array> => {
    const env = input.envelope;
    if (env.v !== 1) {
        throw new Error(`unsupported envelope version: ${env.v as number}`);
    }
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
