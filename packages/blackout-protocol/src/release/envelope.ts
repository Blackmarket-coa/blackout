/**
 * The dead-man release envelope, format v1: a message encrypted once under a
 * fresh content key K, K sealed to each recipient's release identity and to
 * the owner's own, and each sealed copy signed by the owner's release key.
 * Format, reasons and limits: `docs/security/release-envelope-2026-10-26.md`.
 *
 *   content      AES-256-GCM(K, nonce, pad(text)), associated data
 *                "blackout-release-content-v1" 0x00 ‖ lp(release id) ‖ lp(owner)
 *   commitment   SHA-256("blackout-release-key-commitment-v1" 0x00 ‖ K)
 *   transcript   "blackout-release-seal-v1" 0x00 ‖ lp(release id) ‖ lp(owner)
 *                ‖ owner fingerprint ‖ lp(recipient) ‖ recipient fingerprint
 *   sealed copy  hybridSeal(K, recipient's keys, transcript): 1180 bytes
 *   signature    Ed25519 over "blackout-release-seal-signature-v1" 0x00 ‖ the
 *                transcript's fields ‖ SHA-256(nonce ‖ ciphertext)
 *                ‖ commitment ‖ sealed copy
 *
 * lp() is a 16-bit big-endian length, then the ASCII bytes. JSON is never
 * signed: every signed, hashed or authenticated byte string is rebuilt from
 * decoded fields, and every field has one accepted form.
 *
 * The API runs `parseReleaseEnvelope` and `releaseSignatureVerifier` on
 * arming, which catches client bugs; what protects anyone against a hostile
 * server is the recipient's `openReleaseCopy` and the comparison rule in
 * `comparison.ts`.
 */

import { hybridOpen, hybridSealWith, HybridSealError } from '../deaddrop/crypto/hybridSeal';
import type { HybridSealed, HybridSealRandomness } from '../deaddrop/crypto/hybridSeal';
import { importAesGcmKey } from '../deaddrop/crypto/hkdf';
import { generateEphemeralKeyPair, importRecipientPublicKey } from '../deaddrop/crypto/keys';
import { BUCKETS, pad, unpad } from '../deaddrop/crypto/padding';
import { getKemProvider } from '../deaddrop/crypto/pqHybrid';
import { randomBytes } from '../deaddrop/crypto/random';
import {
    asBufferSource,
    bytesEqual,
    concatBytes,
    decodeCanonicalBase64,
    fromHex,
    isNotSupportedError,
    labelBytes,
    lengthPrefixed,
    sha256,
    subtleCrypto,
    toBase64,
    toHex,
    utf8Encode,
} from './bytes';
import {
    ED25519_SIGNATURE_BYTES,
    MLKEM768_PUBLIC_KEY_BYTES,
    RELEASE_ACCOUNT_ID_PATTERN,
    RELEASE_FINGERPRINT_BYTES,
    X25519_PUBLIC_KEY_BYTES,
    ed25519SignatureIsAcceptable,
    verifyReleaseIdentity,
    x25519KeyIsCanonical,
    type ReleaseIdentity,
} from './identity';
import {
    MLKEM768_SECRET_KEY_BYTES,
    checkReleaseKeySet,
    importReleaseSigningKey,
    importReleaseX25519Key,
    type ReleaseKeySet,
} from './keySet';

export const RELEASE_ENVELOPE_VERSION = 1 as const;
export const RELEASE_SEAL_LABEL = 'blackout-release-seal-v1';
export const RELEASE_SEAL_SIGNATURE_LABEL = 'blackout-release-seal-signature-v1';
export const RELEASE_KEY_COMMITMENT_LABEL = 'blackout-release-key-commitment-v1';
export const RELEASE_CONTENT_LABEL = 'blackout-release-content-v1';

/** A release id: a lowercase UUID, version 4. It is also the switch's id. */
export const RELEASE_ID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** At most this many bytes of UTF-8 text, as free dead drops are capped. */
export const RELEASE_MESSAGE_MAX_BYTES = 64 * 1024;
/** The padded lengths a message can have: the dead-drop buckets of 1, 16 and 256 KiB. */
export const RELEASE_PADDED_SIZES: readonly number[] = [BUCKETS[0], BUCKETS[1], BUCKETS[2]];
export const RELEASE_CONTENT_KEY_BYTES = 32;
export const RELEASE_NONCE_BYTES = 12;
export const RELEASE_KEY_COMMITMENT_BYTES = 32;
const GCM_TAG_BYTES = 16;
const MLKEM768_CIPHERTEXT_BYTES = 1088;
const WRAPPED_KEY_BYTES = RELEASE_CONTENT_KEY_BYTES + GCM_TAG_BYTES;
/** A sealed copy: ephemeral X25519 key ‖ ML-KEM-768 ciphertext ‖ nonce ‖ wrapped K. */
export const RELEASE_SEALED_KEY_BYTES =
    X25519_PUBLIC_KEY_BYTES + MLKEM768_CIPHERTEXT_BYTES + RELEASE_NONCE_BYTES + WRAPPED_KEY_BYTES;
/** Recipients per release, the owner not counted. */
export const RELEASE_MAX_RECIPIENTS = 64;
/** Copies per release: one for the owner and one per recipient. */
export const RELEASE_MAX_COPIES = RELEASE_MAX_RECIPIENTS + 1;

const MAX_CIPHERTEXT_BYTES = RELEASE_PADDED_SIZES[RELEASE_PADDED_SIZES.length - 1] + GCM_TAG_BYTES;
const MAX_CIPHERTEXT_BASE64 = Math.ceil(MAX_CIPHERTEXT_BYTES / 3) * 4;

/**
 * What every recipient of one release receives alike. `contentCiphertext`
 * is AES-256-GCM output (padded text plus the tag); binary fields are
 * standard padded base64, fingerprints 64 lowercase hex digits.
 */
export type ReleaseHeader = {
    v: typeof RELEASE_ENVELOPE_VERSION;
    releaseId: string;
    ownerAccountId: string;
    ownerFingerprint: string;
    contentNonce: string;
    contentCiphertext: string;
    keyCommitment: string;
};

/** K sealed to one identity, and the owner's signature over it. */
export type ReleaseCopy = {
    recipientAccountId: string;
    recipientFingerprint: string;
    /** 1180 bytes, base64: see `RELEASE_SEALED_KEY_BYTES`. */
    sealedKey: string;
    /** Ed25519, 64 bytes, base64, over `releaseCopySignedBytes`. */
    signature: string;
};

/** What the owner's device sends to arm: the header, the owner's copy and one per recipient. */
export type ReleaseEnvelope = ReleaseHeader & { copies: ReleaseCopy[] };

/** Why an envelope, a header or a copy was refused. */
export type ReleaseEnvelopeProblem =
    | 'shape'
    | 'version'
    | 'release_id'
    | 'account_id'
    | 'fingerprint'
    | 'content_nonce'
    | 'content_ciphertext'
    | 'key_commitment'
    | 'copies'
    | 'owner_copy'
    | 'duplicate_recipient'
    | 'sealed_key'
    | 'signature';

export type ReleaseParse<T> =
    | { ok: true; value: T }
    | { ok: false; problem: ReleaseEnvelopeProblem };

export type ReleaseEnvelopeErrorCode =
    | 'owner_key_set'
    | 'recipient_identity'
    | 'recipients'
    | 'message'
    | 'owner_key_changed'
    | 'own_copy'
    /** Re-sealing: the header given is not the release the owner is acting on. */
    | 'release_mismatch'
    | 'kem_provider';

/** Thrown by the functions that make envelopes and copies, when an input cannot be used. */
export class ReleaseEnvelopeError extends Error {
    readonly code: ReleaseEnvelopeErrorCode;

    constructor(code: ReleaseEnvelopeErrorCode, message: string) {
        super(message);
        this.code = code;
        this.name = 'ReleaseEnvelopeError';
    }
}

function fail(code: ReleaseEnvelopeErrorCode, message: string): never {
    throw new ReleaseEnvelopeError(code, message);
}

const HEADER_FIELDS: readonly (keyof ReleaseHeader)[] = [
    'v',
    'releaseId',
    'ownerAccountId',
    'ownerFingerprint',
    'contentNonce',
    'contentCiphertext',
    'keyCommitment',
];
const COPY_FIELDS: readonly (keyof ReleaseCopy)[] = [
    'recipientAccountId',
    'recipientFingerprint',
    'sealedKey',
    'signature',
];
const ENVELOPE_FIELDS: readonly string[] = [...HEADER_FIELDS, 'copies'];

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};

const hasExactly = (value: Record<string, unknown>, fields: readonly string[]): boolean => {
    const keys = Object.keys(value);
    return (
        keys.length === fields.length &&
        fields.every((field) => Object.prototype.hasOwnProperty.call(value, field))
    );
};

const refuse = <T>(problem: ReleaseEnvelopeProblem): ReleaseParse<T> => ({ ok: false, problem });

const isAccountId = (value: unknown): value is string =>
    typeof value === 'string' && RELEASE_ACCOUNT_ID_PATTERN.test(value);

const isFingerprint = (value: unknown): value is string =>
    fromHex(value, RELEASE_FINGERPRINT_BYTES) !== null;

/** A new release id: 16 random bytes written as a version 4 UUID. */
export const newReleaseId = (): string => {
    const bytes = randomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = toHex(bytes);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
        16,
        20
    )}-${hex.slice(20)}`;
};

/** The content ciphertext lengths a release may have: each padded size plus the GCM tag. */
export const releaseContentCiphertextIsPadded = (length: number): boolean =>
    RELEASE_PADDED_SIZES.some((size) => size + GCM_TAG_BYTES === length);

/** Check a header as received; returns a new object built from the checked values. */
export const parseReleaseHeader = (input: unknown): ReleaseParse<ReleaseHeader> => {
    if (!isPlainObject(input) || !hasExactly(input, HEADER_FIELDS)) return refuse('shape');
    const raw = {
        v: input.v,
        releaseId: input.releaseId,
        ownerAccountId: input.ownerAccountId,
        ownerFingerprint: input.ownerFingerprint,
        contentNonce: input.contentNonce,
        contentCiphertext: input.contentCiphertext,
        keyCommitment: input.keyCommitment,
    };
    if (raw.v !== RELEASE_ENVELOPE_VERSION) return refuse('version');
    if (typeof raw.releaseId !== 'string' || !RELEASE_ID_PATTERN.test(raw.releaseId)) {
        return refuse('release_id');
    }
    if (!isAccountId(raw.ownerAccountId)) return refuse('account_id');
    if (!isFingerprint(raw.ownerFingerprint)) return refuse('fingerprint');
    if (!decodeCanonicalBase64(raw.contentNonce, RELEASE_NONCE_BYTES))
        return refuse('content_nonce');
    if (
        typeof raw.contentCiphertext !== 'string' ||
        raw.contentCiphertext.length > MAX_CIPHERTEXT_BASE64
    ) {
        return refuse('content_ciphertext');
    }
    const ciphertext = decodeCanonicalBase64(raw.contentCiphertext);
    if (!ciphertext || !releaseContentCiphertextIsPadded(ciphertext.length)) {
        return refuse('content_ciphertext');
    }
    if (!decodeCanonicalBase64(raw.keyCommitment, RELEASE_KEY_COMMITMENT_BYTES)) {
        return refuse('key_commitment');
    }
    return {
        ok: true,
        value: {
            v: RELEASE_ENVELOPE_VERSION,
            releaseId: raw.releaseId,
            ownerAccountId: raw.ownerAccountId,
            ownerFingerprint: raw.ownerFingerprint as string,
            contentNonce: raw.contentNonce as string,
            contentCiphertext: raw.contentCiphertext,
            keyCommitment: raw.keyCommitment as string,
        },
    };
};

/**
 * Check one copy as received: the shape, the account id and fingerprint, a
 * sealed copy of exactly 1180 bytes whose ephemeral X25519 key is in its one
 * canonical form, and a signature of acceptable form (R not of small order, S
 * below L). Whether the signature verifies is `releaseSignatureVerifier`'s.
 */
export const parseReleaseCopy = (input: unknown): ReleaseParse<ReleaseCopy> => {
    if (!isPlainObject(input) || !hasExactly(input, COPY_FIELDS)) return refuse('shape');
    const raw = {
        recipientAccountId: input.recipientAccountId,
        recipientFingerprint: input.recipientFingerprint,
        sealedKey: input.sealedKey,
        signature: input.signature,
    };
    if (!isAccountId(raw.recipientAccountId)) return refuse('account_id');
    if (!isFingerprint(raw.recipientFingerprint)) return refuse('fingerprint');
    const sealedKey = decodeCanonicalBase64(raw.sealedKey, RELEASE_SEALED_KEY_BYTES);
    if (!sealedKey || !x25519KeyIsCanonical(sealedKey.subarray(0, X25519_PUBLIC_KEY_BYTES))) {
        return refuse('sealed_key');
    }
    const signature = decodeCanonicalBase64(raw.signature, ED25519_SIGNATURE_BYTES);
    if (!signature || !ed25519SignatureIsAcceptable(signature)) return refuse('signature');
    return {
        ok: true,
        value: {
            recipientAccountId: raw.recipientAccountId,
            recipientFingerprint: raw.recipientFingerprint as string,
            sealedKey: raw.sealedKey as string,
            signature: raw.signature as string,
        },
    };
};

/**
 * Check a whole envelope as received, before anything is verified or
 * stored: the header, 2 to 65 copies, exactly one of them the owner's (the
 * owner's account and fingerprint), and no account twice. Any field the
 * format does not list, anywhere, refuses the whole envelope.
 */
export const parseReleaseEnvelope = (input: unknown): ReleaseParse<ReleaseEnvelope> => {
    if (!isPlainObject(input) || !hasExactly(input, ENVELOPE_FIELDS)) return refuse('shape');
    const headerInput: Record<string, unknown> = {};
    for (const field of HEADER_FIELDS) headerInput[field] = input[field];
    const header = parseReleaseHeader(headerInput);
    if (!header.ok) return header;
    const copiesInput = input.copies;
    if (
        !Array.isArray(copiesInput) ||
        copiesInput.length < 2 ||
        copiesInput.length > RELEASE_MAX_COPIES
    ) {
        return refuse('copies');
    }
    const copies: ReleaseCopy[] = [];
    const seen = new Set<string>();
    let ownerCopies = 0;
    for (const entry of copiesInput) {
        const copy = parseReleaseCopy(entry);
        if (!copy.ok) return copy;
        if (seen.has(copy.value.recipientAccountId)) return refuse('duplicate_recipient');
        seen.add(copy.value.recipientAccountId);
        if (copy.value.recipientAccountId === header.value.ownerAccountId) {
            if (copy.value.recipientFingerprint !== header.value.ownerFingerprint) {
                return refuse('owner_copy');
            }
            ownerCopies += 1;
        }
        copies.push(copy.value);
    }
    if (ownerCopies !== 1) return refuse('owner_copy');
    return { ok: true, value: { ...header.value, copies } };
};

/** The header part of an envelope, as every recipient receives it. */
export const releaseHeaderOf = (envelope: ReleaseEnvelope): ReleaseHeader => ({
    v: envelope.v,
    releaseId: envelope.releaseId,
    ownerAccountId: envelope.ownerAccountId,
    ownerFingerprint: envelope.ownerFingerprint,
    contentNonce: envelope.contentNonce,
    contentCiphertext: envelope.contentCiphertext,
    keyCommitment: envelope.keyCommitment,
});

/** The ids and fingerprints one copy binds. */
export type ReleaseCopyContext = {
    releaseId: string;
    ownerAccountId: string;
    /** 64 lowercase hex digits. */
    ownerFingerprint: string;
    recipientAccountId: string;
    /** 64 lowercase hex digits. */
    recipientFingerprint: string;
};

const asciiField = (value: string, pattern: RegExp, name: string): Uint8Array => {
    if (!pattern.test(value))
        throw new Error(`release envelope: ${name} is not in the allowed form`);
    return lengthPrefixed(utf8Encode(value));
};

const fingerprintField = (value: string, name: string): Uint8Array => {
    const bytes = fromHex(value, RELEASE_FINGERPRINT_BYTES);
    if (!bytes) throw new Error(`release envelope: ${name} must be 64 lowercase hex digits`);
    return bytes;
};

// The transcript's fields, which the seal transcript and the signed bytes share.
const contextBytes = (context: ReleaseCopyContext): Uint8Array =>
    concatBytes(
        asciiField(context.releaseId, RELEASE_ID_PATTERN, 'the release id'),
        asciiField(context.ownerAccountId, RELEASE_ACCOUNT_ID_PATTERN, "the owner's account id"),
        fingerprintField(context.ownerFingerprint, "the owner's fingerprint"),
        asciiField(
            context.recipientAccountId,
            RELEASE_ACCOUNT_ID_PATTERN,
            "the recipient's account id"
        ),
        fingerprintField(context.recipientFingerprint, "the recipient's fingerprint")
    );

/** The seal transcript: the `info` suffix of the copy's wrap key (envelope record §3). */
export const releaseSealTranscript = (context: ReleaseCopyContext): Uint8Array =>
    concatBytes(labelBytes(RELEASE_SEAL_LABEL), contextBytes(context));

/** The bytes the owner signs for one copy (envelope record §5). */
export const releaseCopySignedBytes = (
    context: ReleaseCopyContext,
    contentHash: Uint8Array,
    keyCommitment: Uint8Array,
    sealedKey: Uint8Array
): Uint8Array => {
    if (
        contentHash.length !== 32 ||
        keyCommitment.length !== RELEASE_KEY_COMMITMENT_BYTES ||
        sealedKey.length !== RELEASE_SEALED_KEY_BYTES
    ) {
        throw new Error('release envelope: a signed field has the wrong length');
    }
    return concatBytes(
        labelBytes(RELEASE_SEAL_SIGNATURE_LABEL),
        contextBytes(context),
        contentHash,
        keyCommitment,
        sealedKey
    );
};

/** The content's AES-GCM associated data (envelope record §6). */
export const releaseContentAssociatedData = (fields: {
    releaseId: string;
    ownerAccountId: string;
}): Uint8Array =>
    concatBytes(
        labelBytes(RELEASE_CONTENT_LABEL),
        asciiField(fields.releaseId, RELEASE_ID_PATTERN, 'the release id'),
        asciiField(fields.ownerAccountId, RELEASE_ACCOUNT_ID_PATTERN, "the owner's account id")
    );

/**
 * C = SHA-256("blackout-release-key-commitment-v1" 0x00 ‖ K). The copy of K
 * made for the digest's input is cleared afterwards, best effort: JavaScript
 * gives no guarantee about what an engine has copied (review, P3-L3).
 */
export const releaseKeyCommitment = (contentKey: Uint8Array): Promise<Uint8Array> => {
    if (contentKey.length !== RELEASE_CONTENT_KEY_BYTES) {
        throw new Error('release envelope: the content key must be 32 bytes');
    }
    const input = concatBytes(labelBytes(RELEASE_KEY_COMMITMENT_LABEL), contentKey);
    return sha256(input).finally(() => input.fill(0));
};

/** SHA-256 of the content nonce, then the content ciphertext. */
export const releaseContentHash = (
    nonce: Uint8Array,
    ciphertext: Uint8Array
): Promise<Uint8Array> => sha256(concatBytes(nonce, ciphertext));

/** A sealed copy's 1180 bytes from its four parts. */
export const encodeSealedKey = (sealed: HybridSealed): Uint8Array => {
    if (
        sealed.ephemeralPublicKey.length !== X25519_PUBLIC_KEY_BYTES ||
        sealed.kemCiphertext.length !== MLKEM768_CIPHERTEXT_BYTES ||
        sealed.nonce.length !== RELEASE_NONCE_BYTES ||
        sealed.ciphertext.length !== WRAPPED_KEY_BYTES
    ) {
        throw new Error('release envelope: a sealed copy part has the wrong length');
    }
    return concatBytes(
        sealed.ephemeralPublicKey,
        sealed.kemCiphertext,
        sealed.nonce,
        sealed.ciphertext
    );
};

/** A sealed copy's four parts from its 1180 bytes. */
export const decodeSealedKey = (bytes: Uint8Array): HybridSealed => {
    if (bytes.length !== RELEASE_SEALED_KEY_BYTES) {
        throw new Error('release envelope: a sealed copy must be 1180 bytes');
    }
    let at = 0;
    const take = (length: number): Uint8Array => {
        const part = bytes.slice(at, at + length);
        at += length;
        return part;
    };
    return {
        ephemeralPublicKey: take(X25519_PUBLIC_KEY_BYTES),
        kemCiphertext: take(MLKEM768_CIPHERTEXT_BYTES),
        nonce: take(RELEASE_NONCE_BYTES),
        ciphertext: take(WRAPPED_KEY_BYTES),
    };
};

/** A message as the bytes that are padded and encrypted: 1 to 65,536 bytes of UTF-8. */
export const encodeReleaseMessage = (text: string): Uint8Array => {
    if (typeof text !== 'string' || text.length === 0) fail('message', 'the message is empty');
    const bytes = utf8Encode(text);
    if (bytes.length > RELEASE_MESSAGE_MAX_BYTES) {
        fail('message', `the message is longer than ${RELEASE_MESSAGE_MAX_BYTES} bytes`);
    }
    return bytes;
};

/**
 * Encrypt a message under `contentKey` and `nonce`. Production code reaches
 * this through `buildReleaseEnvelope`, which draws both fresh; they are
 * parameters so that fixed test vectors can be made.
 */
export const encryptReleaseContentWith = async (
    fields: { text: string; releaseId: string; ownerAccountId: string },
    randomness: { contentKey: Uint8Array; nonce: Uint8Array }
): Promise<{ nonce: Uint8Array; ciphertext: Uint8Array }> => {
    if (
        randomness.contentKey.length !== RELEASE_CONTENT_KEY_BYTES ||
        randomness.nonce.length !== RELEASE_NONCE_BYTES
    ) {
        throw new Error('release envelope: wrong content key or nonce length');
    }
    const { padded } = pad(encodeReleaseMessage(fields.text), 'bucket');
    const key = await importAesGcmKey(randomness.contentKey);
    try {
        const ciphertext = new Uint8Array(
            await subtleCrypto().encrypt(
                {
                    name: 'AES-GCM',
                    iv: asBufferSource(randomness.nonce),
                    additionalData: asBufferSource(releaseContentAssociatedData(fields)),
                } as unknown as AlgorithmIdentifier,
                key,
                asBufferSource(padded)
            )
        );
        return { nonce: randomness.nonce, ciphertext };
    } finally {
        // The padded text, best effort (P3-L3); the caller's `text` is a
        // string and cannot be cleared.
        padded.fill(0);
    }
};

const fatalUtf8 = new TextDecoder('utf-8', { fatal: true });

/**
 * Decrypt a release's content with K, checking the padding and that the
 * text is UTF-8 within the cap. Throws on any failure. The padded plaintext
 * and the unpadded copy are cleared once the text is a string, best effort
 * (P3-L3); the string itself cannot be, whether it is shown or, when the
 * owner's device checks the content before re-sealing (P3-L2), dropped.
 */
export const decryptReleaseContent = async (
    input: ReleaseHeader,
    contentKey: Uint8Array
): Promise<string> => {
    // The header's form, and so a ciphertext of one of the padded lengths,
    // is parseReleaseHeader's.
    const parsed = parseReleaseHeader(input);
    if (!parsed.ok)
        throw new Error(`release envelope: the header is malformed (${parsed.problem})`);
    const header = parsed.value;
    const nonce = decodeCanonicalBase64(header.contentNonce, RELEASE_NONCE_BYTES);
    const ciphertext = decodeCanonicalBase64(header.contentCiphertext);
    if (!nonce || !ciphertext) throw new Error('release envelope: the content is malformed');
    const key = await importAesGcmKey(contentKey);
    const padded = new Uint8Array(
        await subtleCrypto().decrypt(
            {
                name: 'AES-GCM',
                iv: asBufferSource(nonce),
                additionalData: asBufferSource(releaseContentAssociatedData(header)),
            } as unknown as AlgorithmIdentifier,
            key,
            asBufferSource(ciphertext)
        )
    );
    let bytes: Uint8Array | undefined;
    try {
        bytes = unpad(padded);
        if (bytes.length === 0 || bytes.length > RELEASE_MESSAGE_MAX_BYTES) {
            throw new Error('release envelope: the message is empty or over the cap');
        }
        return fatalUtf8.decode(bytes);
    } finally {
        padded.fill(0);
        bytes?.fill(0);
    }
};

const assertMlKem768 = (): void => {
    const kem = getKemProvider();
    if (
        kem.publicKeyLength !== MLKEM768_PUBLIC_KEY_BYTES ||
        kem.ciphertextLength !== MLKEM768_CIPHERTEXT_BYTES ||
        kem.secretKeyLength !== MLKEM768_SECRET_KEY_BYTES
    ) {
        fail('kem_provider', 'release copies need an ML-KEM-768 KEM provider');
    }
};

/** The header's values a copy's signature covers, decoded. */
type HeaderBytes = { contentHash: Uint8Array; keyCommitment: Uint8Array };

const headerBytes = async (header: ReleaseHeader): Promise<HeaderBytes> => {
    const nonce = decodeCanonicalBase64(header.contentNonce, RELEASE_NONCE_BYTES);
    const ciphertext = decodeCanonicalBase64(header.contentCiphertext);
    const keyCommitment = decodeCanonicalBase64(header.keyCommitment, RELEASE_KEY_COMMITMENT_BYTES);
    if (!nonce || !ciphertext || !keyCommitment) {
        throw new Error('release envelope: the header is malformed');
    }
    return { contentHash: await releaseContentHash(nonce, ciphertext), keyCommitment };
};

const contextFor = (
    header: ReleaseHeader,
    recipientAccountId: string,
    recipientFingerprint: string
): ReleaseCopyContext => ({
    releaseId: header.releaseId,
    ownerAccountId: header.ownerAccountId,
    ownerFingerprint: header.ownerFingerprint,
    recipientAccountId,
    recipientFingerprint,
});

/** The inputs of one copy: the header it belongs to, K, and whom to seal it to. */
export type SealReleaseCopyInput = {
    header: ReleaseHeader;
    contentKey: Uint8Array;
    /** The recipient's identity (or the owner's own); it is verified here. */
    recipient: ReleaseIdentity;
    /** The owner's Ed25519 private key (`importReleaseSigningKey`). */
    ownerSigningKey: CryptoKey;
};

type VerifiedIdentity = { identity: ReleaseIdentity; fingerprint: string };

const verifiedRecipient = async (identity: ReleaseIdentity): Promise<VerifiedIdentity> => {
    const check = await verifyReleaseIdentity(identity);
    if (!check.ok) {
        fail('recipient_identity', `a recipient identity failed its check (${check.problem})`);
    }
    return { identity: check.identity, fingerprint: check.fingerprint };
};

// Both keys used below are the verified identity's, never the input's.
const sealVerified = async (
    input: SealReleaseCopyInput,
    recipient: VerifiedIdentity,
    randomness: HybridSealRandomness
): Promise<ReleaseCopy> => {
    if (input.contentKey.length !== RELEASE_CONTENT_KEY_BYTES) {
        throw new Error('release envelope: the content key must be 32 bytes');
    }
    const context = contextFor(input.header, recipient.identity.accountId, recipient.fingerprint);
    const recipientKey = await importRecipientPublicKey(recipient.identity.x25519Key);
    const sealed = await hybridSealWith(
        {
            plaintext: input.contentKey,
            recipientX25519PublicKey: recipientKey,
            transcript: releaseSealTranscript(context),
        },
        randomness
    );
    const sealedKey = encodeSealedKey(sealed);
    const { contentHash, keyCommitment } = await headerBytes(input.header);
    const signature = new Uint8Array(
        await subtleCrypto().sign(
            { name: 'Ed25519' } as unknown as AlgorithmIdentifier,
            input.ownerSigningKey,
            asBufferSource(releaseCopySignedBytes(context, contentHash, keyCommitment, sealedKey))
        )
    );
    return {
        recipientAccountId: context.recipientAccountId,
        recipientFingerprint: context.recipientFingerprint,
        sealedKey: toBase64(sealedKey),
        signature: toBase64(signature),
    };
};

/**
 * Seal K to one identity and sign the copy, with the randomness given.
 * Production code calls `sealReleaseCopy`; this takes the randomness only so
 * that fixed test vectors can be made. The encapsulation given must be to
 * the identity's own ML-KEM key, or the copy will not open.
 */
export const sealReleaseCopyWith = async (
    input: SealReleaseCopyInput,
    randomness: HybridSealRandomness
): Promise<ReleaseCopy> =>
    sealVerified(input, await verifiedRecipient(input.recipient), randomness);

/** Seal K to one identity and sign the copy, with fresh randomness. */
export const sealReleaseCopy = async (input: SealReleaseCopyInput): Promise<ReleaseCopy> => {
    assertMlKem768();
    const recipient = await verifiedRecipient(input.recipient);
    const mlkemKey = decodeCanonicalBase64(
        recipient.identity.mlkem768Key,
        MLKEM768_PUBLIC_KEY_BYTES
    );
    if (!mlkemKey) fail('recipient_identity', 'a recipient ML-KEM key is malformed');
    const ephemeral = await generateEphemeralKeyPair();
    const encapsulation = await getKemProvider().encapsulate(mlkemKey);
    return sealVerified(input, recipient, {
        ephemeral,
        encapsulation,
        nonce: randomBytes(RELEASE_NONCE_BYTES),
    });
};

export type BuildReleaseEnvelopeInput = {
    /** The owner's key set on this device; its identity must be the owner's current one. */
    ownerKeySet: ReleaseKeySet;
    /** Each recipient's identity: the one their comparison with the owner is for. */
    recipients: readonly ReleaseIdentity[];
    message: string;
    /** For tests only; otherwise a new one. */
    releaseId?: string;
};

/**
 * Make a whole envelope: a fresh K and nonce, the content, the commitment,
 * and a signed copy for the owner and for each recipient. K is not returned:
 * the owner's own copy is how the owner's device gets it back to re-seal.
 */
export const buildReleaseEnvelope = async (
    input: BuildReleaseEnvelopeInput
): Promise<ReleaseEnvelope> => {
    assertMlKem768();
    const ownerAccountId = input.ownerKeySet.identity.accountId;
    const keySetProblem = await checkReleaseKeySet(input.ownerKeySet, {
        accountId: ownerAccountId,
    });
    if (keySetProblem === 'kem_provider') fail('kem_provider', 'no ML-KEM provider is configured');
    if (keySetProblem)
        fail('owner_key_set', `the owner's key set failed its check (${keySetProblem})`);
    if (input.recipients.length < 1 || input.recipients.length > RELEASE_MAX_RECIPIENTS) {
        fail('recipients', `a release names 1 to ${RELEASE_MAX_RECIPIENTS} recipients`);
    }
    const accounts = new Set(input.recipients.map((identity) => identity.accountId));
    if (accounts.size !== input.recipients.length || accounts.has(ownerAccountId)) {
        fail('recipients', 'a recipient is named twice, or is the owner');
    }
    const releaseId = input.releaseId ?? newReleaseId();
    const contentKey = randomBytes(RELEASE_CONTENT_KEY_BYTES);
    try {
        const content = await encryptReleaseContentWith(
            { text: input.message, releaseId, ownerAccountId },
            { contentKey, nonce: randomBytes(RELEASE_NONCE_BYTES) }
        );
        const header: ReleaseHeader = {
            v: RELEASE_ENVELOPE_VERSION,
            releaseId,
            ownerAccountId,
            ownerFingerprint: input.ownerKeySet.fingerprint,
            contentNonce: toBase64(content.nonce),
            contentCiphertext: toBase64(content.ciphertext),
            keyCommitment: toBase64(await releaseKeyCommitment(contentKey)),
        };
        const ownerSigningKey = await importReleaseSigningKey(input.ownerKeySet);
        const copies: ReleaseCopy[] = [];
        for (const recipient of [input.ownerKeySet.identity, ...input.recipients]) {
            copies.push(await sealReleaseCopy({ header, contentKey, recipient, ownerSigningKey }));
        }
        const envelope = parseReleaseEnvelope({ ...header, copies });
        if (!envelope.ok)
            throw new Error(`release envelope: built one that fails (${envelope.problem})`);
        return envelope.value;
    } finally {
        contentKey.fill(0);
    }
};

/** Checks a copy's signature: one per copy, under the owner identity the verifier was made for. */
export type ReleaseSignatureVerifier = (copy: ReleaseCopy) => Promise<boolean>;

/**
 * Prepare to check the copies of one release: the owner's identity must pass
 * `verifyReleaseIdentity`, name the header's owner account, and have the
 * header's fingerprint (computed here, never taken from anyone). The verifier
 * then parses each copy it is handed (`parseReleaseCopy`, which also refuses
 * a signature with a small-order R or an S of L or more) and checks its
 * signature over `releaseCopySignedBytes`.
 */
export const releaseSignatureVerifier = async (
    header: ReleaseHeader,
    ownerIdentity: unknown
): Promise<
    | { ok: true; verify: ReleaseSignatureVerifier }
    | { ok: false; problem: 'owner_identity' | 'unsupported' }
> => {
    const check = await verifyReleaseIdentity(ownerIdentity, { accountId: header.ownerAccountId });
    if (!check.ok) {
        return {
            ok: false,
            problem: check.problem === 'unsupported' ? 'unsupported' : 'owner_identity',
        };
    }
    if (check.fingerprint !== header.ownerFingerprint)
        return { ok: false, problem: 'owner_identity' };
    const signingKey = decodeCanonicalBase64(check.identity.signingKey, 32);
    if (!signingKey) return { ok: false, problem: 'owner_identity' };
    let publicKey: CryptoKey;
    try {
        publicKey = await subtleCrypto().importKey(
            'raw',
            asBufferSource(signingKey),
            { name: 'Ed25519' } as unknown as AlgorithmIdentifier,
            false,
            ['verify']
        );
    } catch (cause) {
        return {
            ok: false,
            problem: isNotSupportedError(cause) ? 'unsupported' : 'owner_identity',
        };
    }
    const { contentHash, keyCommitment } = await headerBytes(header);
    return {
        ok: true,
        verify: async (input: ReleaseCopy): Promise<boolean> => {
            // The copy's form (and the signature's: R not of small order, S
            // below L) is parseReleaseCopy's, so a copy nobody parsed is
            // checked here too.
            const parsed = parseReleaseCopy(input);
            if (!parsed.ok) return false;
            const copy = parsed.value;
            const sealedKey = decodeCanonicalBase64(copy.sealedKey, RELEASE_SEALED_KEY_BYTES);
            const signature = decodeCanonicalBase64(copy.signature, ED25519_SIGNATURE_BYTES);
            if (!sealedKey || !signature) return false;
            const signed = releaseCopySignedBytes(
                contextFor(header, copy.recipientAccountId, copy.recipientFingerprint),
                contentHash,
                keyCommitment,
                sealedKey
            );
            try {
                return await subtleCrypto().verify(
                    { name: 'Ed25519' } as unknown as AlgorithmIdentifier,
                    publicKey,
                    asBufferSource(signature),
                    asBufferSource(signed)
                );
            } catch {
                return false;
            }
        },
    };
};

/** Why a copy did not open; nothing of the message is shown for any of them. */
export type ReleaseOpenProblem =
    | ReleaseEnvelopeProblem
    | 'not_for_you'
    | 'no_key'
    | 'owner_identity'
    | 'signature'
    | 'zero_shared_secret'
    | 'wrap'
    | 'commitment'
    | 'content'
    | 'unsupported'
    | 'kem_provider';

type Unwrapped = { ok: true; contentKey: Uint8Array } | { ok: false; problem: ReleaseOpenProblem };

/**
 * Every check on one copy up to K: the owner's identity and the signature,
 * the X25519 output, the wrap, and K against the commitment.
 */
const unwrapCopy = async (
    header: ReleaseHeader,
    copy: ReleaseCopy,
    ownerIdentity: unknown,
    keySet: ReleaseKeySet
): Promise<Unwrapped> => {
    const verifier = await releaseSignatureVerifier(header, ownerIdentity);
    if (!verifier.ok) return verifier;
    if (!(await verifier.verify(copy))) return { ok: false, problem: 'signature' };
    const sealedKey = decodeCanonicalBase64(copy.sealedKey, RELEASE_SEALED_KEY_BYTES);
    const secretKey = decodeCanonicalBase64(keySet.mlkem768SecretKey, MLKEM768_SECRET_KEY_BYTES);
    if (!sealedKey || !secretKey) return { ok: false, problem: 'wrap' };
    let contentKey: Uint8Array;
    try {
        const privateKey = await importReleaseX25519Key(keySet);
        contentKey = await hybridOpen({
            sealed: decodeSealedKey(sealedKey),
            recipientPrivateKey: privateKey,
            recipientPqSecretKey: secretKey,
            transcript: releaseSealTranscript(
                contextFor(header, copy.recipientAccountId, copy.recipientFingerprint)
            ),
        });
    } catch (cause) {
        if (cause instanceof HybridSealError) return { ok: false, problem: 'zero_shared_secret' };
        if (isNotSupportedError(cause)) return { ok: false, problem: 'unsupported' };
        return { ok: false, problem: 'wrap' };
    }
    const commitment = decodeCanonicalBase64(header.keyCommitment, RELEASE_KEY_COMMITMENT_BYTES);
    if (!commitment || !bytesEqual(await releaseKeyCommitment(contentKey), commitment)) {
        contentKey.fill(0);
        return { ok: false, problem: 'commitment' };
    }
    return { ok: true, contentKey };
};

export type OpenReleaseCopyInput = {
    header: unknown;
    copy: unknown;
    /** The owner's identity as the release carries it; it is verified here. */
    ownerIdentity: unknown;
    /** The account opening it, which the copy must name. */
    recipientAccountId: string;
    /** This device's key sets for that account, current and replaced. */
    keySets: readonly ReleaseKeySet[];
};

export type ReleaseOpenResult =
    | {
          ok: true;
          text: string;
          /**
           * The release id and the owner's account id from the signed header,
           * which are the only ones to show (review, P3-M2): a server's
           * response carries unsigned duplicates of both next to the header.
           */
          releaseId: string;
          ownerAccountId: string;
          /** The owner's fingerprint, computed from the identity that verified. */
          ownerFingerprint: string;
          /** The fingerprint of this device's key set that opened it. */
          keySetFingerprint: string;
      }
    | { ok: false; problem: ReleaseOpenProblem };

/**
 * A recipient's checks, all of them before anything is shown (envelope
 * record §8): the header and copy are well formed; the copy names this
 * account and one of its key sets; the owner's identity verifies and is the
 * header's; the signature verifies; the X25519 output is not zero; the wrap
 * opens; K matches the commitment; the content opens, is padded and is
 * UTF-8. Whether the owner's key is one this device compared, and the
 * comparison still counts, is `releaseComparisonState`'s, and the caller's.
 */
export const openReleaseCopy = async (input: OpenReleaseCopyInput): Promise<ReleaseOpenResult> => {
    const header = parseReleaseHeader(input.header);
    if (!header.ok) return header;
    const copy = parseReleaseCopy(input.copy);
    if (!copy.ok) return copy;
    if (copy.value.recipientAccountId !== input.recipientAccountId) {
        return { ok: false, problem: 'not_for_you' };
    }
    // A fingerprint names one account (it hashes the account id), and
    // checkReleaseKeySet below checks the key set against this account.
    const keySet = input.keySets.find(
        (candidate) => candidate.fingerprint === copy.value.recipientFingerprint
    );
    if (!keySet) return { ok: false, problem: 'no_key' };
    try {
        assertMlKem768();
    } catch {
        return { ok: false, problem: 'kem_provider' };
    }
    // The default provider has ML-KEM-768's lengths and refuses every call,
    // so a missing provider shows here, as the key set's own round trip.
    const keySetProblem = await checkReleaseKeySet(keySet, { accountId: input.recipientAccountId });
    if (keySetProblem === 'kem_provider') return { ok: false, problem: 'kem_provider' };
    if (keySetProblem) return { ok: false, problem: 'no_key' };
    const unwrapped = await unwrapCopy(header.value, copy.value, input.ownerIdentity, keySet);
    if (!unwrapped.ok) return unwrapped;
    try {
        const text = await decryptReleaseContent(header.value, unwrapped.contentKey);
        return {
            ok: true,
            text,
            releaseId: header.value.releaseId,
            ownerAccountId: header.value.ownerAccountId,
            ownerFingerprint: header.value.ownerFingerprint,
            keySetFingerprint: keySet.fingerprint,
        };
    } catch {
        return { ok: false, problem: 'content' };
    } finally {
        unwrapped.contentKey.fill(0);
    }
};

export type ResealReleaseCopyInput = {
    /**
     * The switch the owner is re-sealing, which is its release's id. The
     * header must be that release's, or nothing is opened (review, P3-H1).
     */
    releaseId: string;
    /** The release's header, as the owner's view of the switch carries it. */
    header: unknown;
    /** The owner's own copy, from the same view. */
    ownCopy: unknown;
    /** The owner's key set on this device: the one the header names. */
    ownerKeySet: ReleaseKeySet;
    /** The recipient's new identity, the one a current comparison is for. */
    recipient: ReleaseIdentity;
};

/**
 * Seal a release's K again, to a recipient's new identity. The header must
 * carry the release id of the switch the owner is acting on, which is in the
 * owner's own signature and in every transcript: without that binding a
 * server could answer the owner's view of one switch with another release's
 * header and own copy, both genuine, and have the owner's device seal that
 * release's key to a person named only on the first (review, P3-H1). K then
 * comes from the owner's own copy, opened with the owner's key set after
 * every check a recipient makes, the content's decryption included (its
 * signature under the owner's own identity, the wrap, the commitment, the
 * content's padding and UTF-8), so a server cannot make the owner re-seal
 * another key, and a release whose content it corrupted in storage is not
 * re-sealed as if it could be read. Refused when the owner's key set is not
 * the one the header names: an owner who replaced their keys arms again.
 * Nothing on the device says who was named on a release (E7): that the
 * recipient is one of them is the API's check, and PR 4's own record.
 */
export const resealReleaseCopy = async (input: ResealReleaseCopyInput): Promise<ReleaseCopy> => {
    assertMlKem768();
    const header = parseReleaseHeader(input.header);
    if (!header.ok) fail('own_copy', `the release header is malformed (${header.problem})`);
    if (header.value.releaseId !== input.releaseId) {
        fail('release_mismatch', 'the header is not the release being re-sealed');
    }
    const ownCopy = parseReleaseCopy(input.ownCopy);
    if (!ownCopy.ok) fail('own_copy', `the owner's copy is malformed (${ownCopy.problem})`);
    const parsedHeader = header.value;
    const parsedCopy = ownCopy.value;
    const owner = input.ownerKeySet;
    if (
        owner.identity.accountId !== parsedHeader.ownerAccountId ||
        owner.fingerprint !== parsedHeader.ownerFingerprint
    ) {
        fail(
            'owner_key_changed',
            "this device's release key is not the one the release was armed with"
        );
    }
    if (
        parsedCopy.recipientAccountId !== parsedHeader.ownerAccountId ||
        parsedCopy.recipientFingerprint !== parsedHeader.ownerFingerprint
    ) {
        fail('own_copy', "the copy given is not the owner's own");
    }
    if (input.recipient.accountId === parsedHeader.ownerAccountId) {
        fail('recipients', "the owner's own copy is not re-sealed");
    }
    const keySetProblem = await checkReleaseKeySet(owner, {
        accountId: parsedHeader.ownerAccountId,
    });
    if (keySetProblem === 'kem_provider') fail('kem_provider', 'no ML-KEM provider is configured');
    if (keySetProblem)
        fail('owner_key_set', `the owner's key set failed its check (${keySetProblem})`);
    const unwrapped = await unwrapCopy(parsedHeader, parsedCopy, owner.identity, owner);
    if (!unwrapped.ok) {
        fail('own_copy', `the owner's own copy did not open (${unwrapped.problem})`);
    }
    const contentKey = unwrapped.contentKey;
    try {
        // The content must open under K too (P3-L2): otherwise the device
        // would seal, to a new key, a release nobody can read, and say nothing.
        // The decryptor clears its buffers; the text it returns is a string,
        // dropped here, which nothing can clear (P3-L3).
        try {
            await decryptReleaseContent(parsedHeader, contentKey);
        } catch {
            fail('own_copy', "the owner's own copy did not open (content)");
        }
        return await sealReleaseCopy({
            header: parsedHeader,
            contentKey,
            recipient: input.recipient,
            ownerSigningKey: await importReleaseSigningKey(owner),
        });
    } finally {
        contentKey.fill(0);
    }
};
