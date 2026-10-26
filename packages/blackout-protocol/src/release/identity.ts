/**
 * Release identities, format v1: an Ed25519 signing key, an X25519 key and
 * an ML-KEM-768 encapsulation key, bound to one Blackout account and signed
 * with the first. People publish them to the API's release-identity
 * directory and compare a safety code over two of them (`safetyCode.ts`);
 * the dead-man release design seals to them (PR 3).
 *
 * The signed bytes, never the JSON, are what the signature covers:
 *
 *   "blackout-release-identity-v1" 0x00
 *   u16be(account id length) || account id (ASCII)
 *   Ed25519 public key (32) || X25519 public key (32)
 *   ML-KEM-768 encapsulation key (1184)
 *
 * The fingerprint is SHA-256 of those bytes. The API and the client run the
 * same `verifyReleaseIdentity`. Format, reasons and limits:
 * `docs/security/release-identities-2026-10-26.md` §1.
 */

import {
    deriveSharedSecret,
    generateEphemeralKeyPair,
    importRecipientPublicKey,
} from '../deaddrop/crypto/keys';
import {
    asBufferSource,
    concatBytes,
    decodeCanonicalBase64,
    isNotSupportedError,
    labelBytes,
    lengthPrefixed,
    sha256,
    subtleCrypto,
    toBase64,
    toHex,
    utf8Encode,
} from './bytes';

export const RELEASE_IDENTITY_VERSION = 1 as const;
export const RELEASE_IDENTITY_LABEL = 'blackout-release-identity-v1';

/** Account ids are UUIDs in practice; this keeps their bytes the same everywhere. */
export const RELEASE_ACCOUNT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export const ED25519_PUBLIC_KEY_BYTES = 32;
export const ED25519_SIGNATURE_BYTES = 64;
export const X25519_PUBLIC_KEY_BYTES = 32;
export const MLKEM768_PUBLIC_KEY_BYTES = 1184;
export const RELEASE_FINGERPRINT_BYTES = 32;

/** The identity as published and fetched. Binary fields are standard padded base64. */
export type ReleaseIdentity = {
    v: typeof RELEASE_IDENTITY_VERSION;
    /** The Blackout account (session `sub`) the identity belongs to. */
    accountId: string;
    /** Ed25519 public key, 32 bytes. Signs release statements only. */
    signingKey: string;
    /** X25519 public key, 32 bytes. */
    x25519Key: string;
    /** ML-KEM-768 encapsulation key, 1184 bytes. */
    mlkem768Key: string;
    /** Ed25519 signature, 64 bytes, over `releaseIdentitySignedBytes`. */
    signature: string;
};

export type UnsignedReleaseIdentity = Omit<ReleaseIdentity, 'signature'>;

/** Why an identity was refused. */
export type ReleaseIdentityProblem =
    | 'shape'
    | 'version'
    | 'account_id'
    | 'account_mismatch'
    | 'signing_key'
    | 'x25519_key'
    | 'mlkem768_key'
    | 'signature'
    | 'unsupported';

export type ReleaseIdentityCheck =
    | { ok: true; identity: ReleaseIdentity; fingerprint: string }
    | { ok: false; problem: ReleaseIdentityProblem };

const IDENTITY_FIELDS: readonly (keyof ReleaseIdentity)[] = [
    'v',
    'accountId',
    'signingKey',
    'x25519Key',
    'mlkem768Key',
    'signature',
];

/**
 * Exactly the six public fields of `identity`, whatever else the object
 * carries. Anything sent to the API goes through this, so a key set or any
 * other object holding private keys cannot be sent by passing it here.
 */
export const publicReleaseIdentity = (identity: ReleaseIdentity): ReleaseIdentity => ({
    v: identity.v,
    accountId: identity.accountId,
    signingKey: identity.signingKey,
    x25519Key: identity.x25519Key,
    mlkem768Key: identity.mlkem768Key,
    signature: identity.signature,
});

export type ReleaseIdentityKeyBytes = {
    accountId: string;
    signingKey: Uint8Array;
    x25519Key: Uint8Array;
    mlkem768Key: Uint8Array;
};

/** The bytes an identity's signature covers and its fingerprint hashes. */
export const releaseIdentitySignedBytes = (fields: ReleaseIdentityKeyBytes): Uint8Array => {
    if (!RELEASE_ACCOUNT_ID_PATTERN.test(fields.accountId)) {
        throw new Error('release identity: the account id is not in the allowed form');
    }
    if (
        fields.signingKey.length !== ED25519_PUBLIC_KEY_BYTES ||
        fields.x25519Key.length !== X25519_PUBLIC_KEY_BYTES ||
        fields.mlkem768Key.length !== MLKEM768_PUBLIC_KEY_BYTES
    ) {
        throw new Error('release identity: a public key has the wrong length');
    }
    return concatBytes(
        labelBytes(RELEASE_IDENTITY_LABEL),
        lengthPrefixed(utf8Encode(fields.accountId)),
        fields.signingKey,
        fields.x25519Key,
        fields.mlkem768Key
    );
};

/** SHA-256 of the signed bytes, as 64 lowercase hex digits. */
export const releaseIdentityFingerprint = async (signedBytes: Uint8Array): Promise<string> =>
    toHex(await sha256(signedBytes));

/** Fingerprint hex in groups of four, for display. */
export const formatReleaseFingerprint = (fingerprint: string): string =>
    (fingerprint.match(/.{1,4}/g) ?? []).join(' ');

/**
 * FIPS 203 §7.2 encapsulation-key check ("modulus check"): every 12-bit
 * coefficient in the first 384·k = 1152 bytes, decoded as ByteDecode₁₂ does
 * (little-endian bits), must be below q = 3329, which is exactly when
 * ByteEncode₁₂(ByteDecode₁₂(key)) gives the key back. The last 32 bytes are
 * the public seed ρ and are not constrained. `@noble/post-quantum` runs the
 * same check inside `encapsulate`; it is done here too so that the API, which
 * configures no KEM provider, refuses a malformed key on publish.
 */
export const mlKem768EncapsulationKeyIsWellFormed = (key: Uint8Array): boolean => {
    if (key.length !== MLKEM768_PUBLIC_KEY_BYTES) return false;
    for (let i = 0; i < 1152; i += 3) {
        const low = key[i] | ((key[i + 1] & 0x0f) << 8);
        const high = (key[i + 1] >> 4) | (key[i + 2] << 4);
        if (low >= 3329 || high >= 3329) return false;
    }
    return true;
};

type KeyContribution = 'yes' | 'no' | 'unsupported';

/**
 * Whether an X25519 public key contributes to a shared secret. A small-order
 * key makes every X25519 output zero (RFC 7748 §6.1). Node's WebCrypto refuses
 * such keys itself (`OperationError`); the zero check covers an engine that
 * returns zeros instead.
 */
export const x25519KeyContributes = async (key: Uint8Array): Promise<KeyContribution> => {
    if (key.length !== X25519_PUBLIC_KEY_BYTES) return 'no';
    try {
        const peer = await importRecipientPublicKey(toBase64(key));
        const ephemeral = await generateEphemeralKeyPair();
        const shared = await deriveSharedSecret(ephemeral.privateKey, peer);
        return shared.some((byte) => byte !== 0) ? 'yes' : 'no';
    } catch (cause) {
        return isNotSupportedError(cause) ? 'unsupported' : 'no';
    }
};

const refuse = (problem: ReleaseIdentityProblem): ReleaseIdentityCheck => ({ ok: false, problem });

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};

export type VerifyReleaseIdentityOptions = {
    /** Refuse the identity unless it names this account. */
    accountId?: string;
};

/**
 * Check an identity as received, from the network or from storage: exactly
 * the six fields; version 1; an account id in the allowed form (and the
 * expected one, when given); each key and the signature in canonical base64
 * at its exact length; an ML-KEM key that passes the modulus check; an X25519
 * key that contributes; and an Ed25519 signature that verifies. On success
 * the fingerprint is computed here, never taken from the sender, and the
 * identity returned is a new object built from the values that were checked.
 */
export const verifyReleaseIdentity = async (
    input: unknown,
    options: VerifyReleaseIdentityOptions = {}
): Promise<ReleaseIdentityCheck> => {
    if (!isPlainObject(input)) return refuse('shape');
    const fields = Object.keys(input);
    if (
        fields.length !== IDENTITY_FIELDS.length ||
        !IDENTITY_FIELDS.every((field) => Object.prototype.hasOwnProperty.call(input, field))
    ) {
        return refuse('shape');
    }
    // Each field is read once, so what is checked is what is returned.
    const raw = {
        v: input.v,
        accountId: input.accountId,
        signingKey: input.signingKey,
        x25519Key: input.x25519Key,
        mlkem768Key: input.mlkem768Key,
        signature: input.signature,
    };
    if (raw.v !== RELEASE_IDENTITY_VERSION) return refuse('version');
    const accountId = raw.accountId;
    if (typeof accountId !== 'string' || !RELEASE_ACCOUNT_ID_PATTERN.test(accountId)) {
        return refuse('account_id');
    }
    if (options.accountId !== undefined && accountId !== options.accountId) {
        return refuse('account_mismatch');
    }
    const signingKey = decodeCanonicalBase64(raw.signingKey, ED25519_PUBLIC_KEY_BYTES);
    if (!signingKey) return refuse('signing_key');
    const x25519Key = decodeCanonicalBase64(raw.x25519Key, X25519_PUBLIC_KEY_BYTES);
    if (!x25519Key) return refuse('x25519_key');
    const mlkem768Key = decodeCanonicalBase64(raw.mlkem768Key, MLKEM768_PUBLIC_KEY_BYTES);
    if (!mlkem768Key || !mlKem768EncapsulationKeyIsWellFormed(mlkem768Key)) {
        return refuse('mlkem768_key');
    }
    const signature = decodeCanonicalBase64(raw.signature, ED25519_SIGNATURE_BYTES);
    if (!signature) return refuse('signature');

    const contribution = await x25519KeyContributes(x25519Key);
    if (contribution === 'unsupported') return refuse('unsupported');
    if (contribution === 'no') return refuse('x25519_key');

    const signedBytes = releaseIdentitySignedBytes({
        accountId,
        signingKey,
        x25519Key,
        mlkem768Key,
    });
    let valid: boolean;
    try {
        const publicKey = await subtleCrypto().importKey(
            'raw',
            asBufferSource(signingKey),
            { name: 'Ed25519' } as unknown as AlgorithmIdentifier,
            false,
            ['verify']
        );
        valid = await subtleCrypto().verify(
            { name: 'Ed25519' } as unknown as AlgorithmIdentifier,
            publicKey,
            asBufferSource(signature),
            asBufferSource(signedBytes)
        );
    } catch (cause) {
        return refuse(isNotSupportedError(cause) ? 'unsupported' : 'signing_key');
    }
    if (!valid) return refuse('signature');

    // `raw` holds exactly the six fields, each now checked to be a string.
    const identity = { ...raw, v: RELEASE_IDENTITY_VERSION, accountId } as ReleaseIdentity;
    return {
        ok: true,
        identity,
        fingerprint: await releaseIdentityFingerprint(signedBytes),
    };
};

/** Sign an identity's fields with its own Ed25519 private key. */
export const signReleaseIdentity = async (
    unsigned: UnsignedReleaseIdentity,
    signingPrivateKey: CryptoKey
): Promise<ReleaseIdentity> => {
    const signingKey = decodeCanonicalBase64(unsigned.signingKey, ED25519_PUBLIC_KEY_BYTES);
    const x25519Key = decodeCanonicalBase64(unsigned.x25519Key, X25519_PUBLIC_KEY_BYTES);
    const mlkem768Key = decodeCanonicalBase64(unsigned.mlkem768Key, MLKEM768_PUBLIC_KEY_BYTES);
    if (!signingKey || !x25519Key || !mlkem768Key) {
        throw new Error('release identity: a public key is not canonical base64 of its length');
    }
    const signedBytes = releaseIdentitySignedBytes({
        accountId: unsigned.accountId,
        signingKey,
        x25519Key,
        mlkem768Key,
    });
    const signature = new Uint8Array(
        await subtleCrypto().sign(
            { name: 'Ed25519' } as unknown as AlgorithmIdentifier,
            signingPrivateKey,
            asBufferSource(signedBytes)
        )
    );
    return {
        v: RELEASE_IDENTITY_VERSION,
        accountId: unsigned.accountId,
        signingKey: unsigned.signingKey,
        x25519Key: unsigned.x25519Key,
        mlkem768Key: unsigned.mlkem768Key,
        signature: toBase64(signature),
    };
};
