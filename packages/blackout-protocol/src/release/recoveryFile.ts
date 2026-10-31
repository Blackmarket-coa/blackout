/**
 * The release-key recovery file, format v1: the device's release key sets
 * and the record of whom its owner compared safety codes with, encrypted
 * under a passphrase. It is the only backup of the keys in this build:
 * Blackout keeps no copy, and a device lost without one loses its keys.
 *
 *   key        = argon2id(NFC(passphrase), salt; v 0x13, m 64 MiB, t 3, p 4) → 32 bytes
 *   aad        = "blackout-release-recovery-v1" 0x00 ‖ u32be(0x13, 65536, 3, 4) ‖ salt ‖ nonce
 *   ciphertext = AES-256-GCM(key, nonce, aad, bucket-pad(UTF-8(JSON contents)))
 *
 * The header (format, version, KDF parameters, salt, nonce) is JSON next to
 * the ciphertext, and all of it is bound as associated data. The reader takes
 * v1's parameters only, refusing anything else before it runs argon2id, so a
 * crafted file cannot make it spend unbounded memory or time. argon2id is
 * `@noble/hashes`' (RFC 9106's second recommended parameters); AES-GCM and
 * the padding buckets are the dead-drop suite's. Reasons and limits:
 * `docs/security/release-identities-2026-10-26.md` §3.
 */

import { argon2idAsync } from '@noble/hashes/argon2.js';
import { importAesGcmKey } from '../deaddrop/crypto/hkdf';
import { BUCKETS, isBucketSize, pad, unpad } from '../deaddrop/crypto/padding';
import { randomBytes } from '../deaddrop/crypto/random';
import {
    asBufferSource,
    concatBytes,
    decodeCanonicalBase64,
    fromHex,
    labelBytes,
    subtleCrypto,
    toBase64,
    u32be,
    utf8Decode,
    utf8Encode,
} from './bytes';
import { RELEASE_ACCOUNT_ID_PATTERN, RELEASE_FINGERPRINT_BYTES } from './identity';
import { checkReleaseKeySet, type ReleaseKeySet } from './keySet';

export const RECOVERY_FILE_FORMAT = 'blackout-release-recovery';
export const RECOVERY_FILE_VERSION = 1 as const;
/** Names nobody: the file says nothing about whose it is. */
export const RECOVERY_FILE_NAME = 'blackout-release-keys.json';
export const RECOVERY_AAD_LABEL = 'blackout-release-recovery-v1';

export const RECOVERY_KDF = Object.freeze({
    alg: 'argon2id',
    version: 0x13,
    memoryKiB: 65536,
    iterations: 3,
    parallelism: 4,
    saltBytes: 16,
    keyBytes: 32,
} as const);
export const RECOVERY_AEAD_ALG = 'AES-256-GCM';
export const RECOVERY_NONCE_BYTES = 12;
const GCM_TAG_BYTES = 16;

/** In characters (code points) after NFC normalisation. */
export const RECOVERY_PASSPHRASE_MIN_LENGTH = 12;
export const RECOVERY_PASSPHRASE_MAX_LENGTH = 1024;

/** The largest padded plaintext a file may hold: the 1 MiB dead-drop bucket. */
const MAX_PADDED_BYTES = BUCKETS[3];
const MAX_KEY_SETS = 64;
const MAX_COMPARISONS = 2000;

/** A safety-code comparison the person confirmed on this device. */
export type ReleaseComparison = {
    /** The other person's Blackout account. */
    accountId: string;
    /** The Matrix id they were looked up by, for display. */
    matrixId: string | null;
    /** Their identity's fingerprint, as compared. */
    fingerprint: string;
    /** This person's own fingerprint at the time. */
    ownFingerprint: string;
    comparedAt: string;
};

export type ReleaseKeySetStatus = 'current' | 'superseded';

export type StoredReleaseKeySet = ReleaseKeySet & { status: ReleaseKeySetStatus };

export type ReleaseRecoveryContents = {
    v: typeof RECOVERY_FILE_VERSION;
    accountId: string;
    savedAt: string;
    keySets: StoredReleaseKeySet[];
    comparisons: ReleaseComparison[];
};

export type ReleaseRecoveryErrorCode =
    /** The passphrase is too short (writing) or empty or too long. */
    | 'passphrase_length'
    /** Not a recovery file, or a damaged or truncated one. */
    | 'malformed'
    /** A recovery file this version does not read. */
    | 'unsupported'
    /** The passphrase is wrong, or the file was changed: AES-GCM cannot tell which. */
    | 'wrong_passphrase_or_damaged'
    /** It opened, but what it holds is not a sound set of release keys. */
    | 'contents'
    /** It holds another account's release keys. */
    | 'other_account'
    /** Too much to fit one file. */
    | 'too_large';

export class ReleaseRecoveryError extends Error {
    readonly code: ReleaseRecoveryErrorCode;

    constructor(code: ReleaseRecoveryErrorCode, message: string) {
        super(message);
        this.code = code;
        this.name = 'ReleaseRecoveryError';
    }
}

function fail(code: ReleaseRecoveryErrorCode, message: string): never {
    throw new ReleaseRecoveryError(code, message);
}

/** NFC, then UTF-8. Never trimmed: spaces are part of a passphrase. */
export const encodeRecoveryPassphrase = (passphrase: string, minLength = 1): Uint8Array => {
    if (typeof passphrase !== 'string') fail('passphrase_length', 'A passphrase is required.');
    const normalised = passphrase.normalize('NFC');
    const characters = Array.from(normalised).length;
    if (characters < minLength || characters > RECOVERY_PASSPHRASE_MAX_LENGTH) {
        fail(
            'passphrase_length',
            `A recovery passphrase has ${minLength} to ${RECOVERY_PASSPHRASE_MAX_LENGTH} characters.`
        );
    }
    return utf8Encode(normalised);
};

/** argon2id with v1's parameters. `onProgress` gets a fraction from 0 to 1. */
export const deriveRecoveryKey = async (
    passphrase: string,
    salt: Uint8Array,
    onProgress?: (fraction: number) => void
): Promise<Uint8Array> => {
    if (salt.length !== RECOVERY_KDF.saltBytes) {
        fail('malformed', 'The recovery file salt has the wrong length.');
    }
    const password = encodeRecoveryPassphrase(passphrase);
    return argon2idAsync(password, salt, {
        t: RECOVERY_KDF.iterations,
        m: RECOVERY_KDF.memoryKiB,
        p: RECOVERY_KDF.parallelism,
        version: RECOVERY_KDF.version,
        dkLen: RECOVERY_KDF.keyBytes,
        // 64 MiB of blocks; the cap refuses anything larger outright.
        maxmem: 2 ** 27,
        onProgress,
    });
};

/** The associated data: the label, the KDF parameters, the salt and the nonce. */
export const recoveryAssociatedData = (salt: Uint8Array, nonce: Uint8Array): Uint8Array =>
    concatBytes(
        labelBytes(RECOVERY_AAD_LABEL),
        u32be(RECOVERY_KDF.version),
        u32be(RECOVERY_KDF.memoryKiB),
        u32be(RECOVERY_KDF.iterations),
        u32be(RECOVERY_KDF.parallelism),
        salt,
        nonce
    );

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactly = (value: Record<string, unknown>, fields: readonly string[]): boolean => {
    const keys = Object.keys(value);
    return keys.length === fields.length && fields.every((field) => keys.includes(field));
};

const KEY_SET_FIELDS = [
    'identity',
    'fingerprint',
    'signingPrivateJwk',
    'x25519PrivateJwk',
    'mlkem768SecretKey',
    'createdAt',
    'status',
] as const;
const JWK_MEMBERS = ['kty', 'crv', 'd', 'x'] as const;

const isIsoTime = (value: unknown): value is string =>
    typeof value === 'string' && value.length <= 64 && !Number.isNaN(Date.parse(value));

const isFingerprint = (value: unknown): value is string =>
    fromHex(value, RELEASE_FINGERPRINT_BYTES) !== null;

/**
 * The contents' shape. The keys themselves are checked by `readRecoveryFile`
 * (`checkReleaseKeySet`), which needs WebCrypto and the KEM provider.
 */
const assertContentsShape = (value: unknown): ReleaseRecoveryContents => {
    const bad = (why: string): never => fail('contents', `The recovery file ${why}.`);
    if (!isRecord(value)) return bad('holds no release keys');
    if (!hasExactly(value, ['v', 'accountId', 'savedAt', 'keySets', 'comparisons'])) {
        return bad('holds unexpected fields');
    }
    if (value.v !== RECOVERY_FILE_VERSION) return bad('has an unknown contents version');
    if (typeof value.accountId !== 'string' || !RELEASE_ACCOUNT_ID_PATTERN.test(value.accountId)) {
        return bad('names no valid account');
    }
    if (!isIsoTime(value.savedAt)) return bad('has no valid save time');
    const { keySets, comparisons } = value;
    if (!Array.isArray(keySets) || keySets.length === 0 || keySets.length > MAX_KEY_SETS) {
        return bad('holds no usable key sets');
    }
    let current = 0;
    for (const keySet of keySets) {
        if (
            !isRecord(keySet) ||
            !hasExactly(keySet, KEY_SET_FIELDS) ||
            !isRecord(keySet.signingPrivateJwk) ||
            !hasExactly(keySet.signingPrivateJwk, JWK_MEMBERS) ||
            !isRecord(keySet.x25519PrivateJwk) ||
            !hasExactly(keySet.x25519PrivateJwk, JWK_MEMBERS)
        ) {
            return bad('holds a damaged key set');
        }
        if (keySet.status !== 'current' && keySet.status !== 'superseded') {
            return bad('holds a key set with no status');
        }
        if (keySet.status === 'current') current += 1;
    }
    if (current !== 1) return bad('does not hold exactly one current key set');
    if (!Array.isArray(comparisons) || comparisons.length > MAX_COMPARISONS) {
        return bad('holds a damaged list of comparisons');
    }
    for (const comparison of comparisons) {
        if (
            !isRecord(comparison) ||
            !hasExactly(comparison, [
                'accountId',
                'matrixId',
                'fingerprint',
                'ownFingerprint',
                'comparedAt',
            ]) ||
            typeof comparison.accountId !== 'string' ||
            !RELEASE_ACCOUNT_ID_PATTERN.test(comparison.accountId) ||
            !(comparison.matrixId === null || typeof comparison.matrixId === 'string') ||
            (typeof comparison.matrixId === 'string' && comparison.matrixId.length > 255) ||
            !isFingerprint(comparison.fingerprint) ||
            !isFingerprint(comparison.ownFingerprint) ||
            !isIsoTime(comparison.comparedAt)
        ) {
            return bad('holds a damaged comparison');
        }
    }
    return value as unknown as ReleaseRecoveryContents;
};

export type ParsedRecoveryFile = {
    salt: Uint8Array;
    nonce: Uint8Array;
    ciphertext: Uint8Array;
};

/**
 * Read the header and ciphertext, without the passphrase. Anything but a
 * well-formed v1 file is refused here, before argon2id runs.
 */
export const parseRecoveryFile = (text: string): ParsedRecoveryFile => {
    const maxChars = Math.ceil(((MAX_PADDED_BYTES + GCM_TAG_BYTES) * 4) / 3) + 4096;
    if (typeof text !== 'string' || text.length === 0 || text.length > maxChars) {
        fail('malformed', 'This is not a Blackout recovery file.');
    }
    let header: unknown;
    try {
        header = JSON.parse(text);
    } catch {
        return fail('malformed', 'This is not a Blackout recovery file, or it is damaged.');
    }
    if (!isRecord(header) || header.format !== RECOVERY_FILE_FORMAT) {
        return fail('malformed', 'This is not a Blackout recovery file.');
    }
    if (header.v !== RECOVERY_FILE_VERSION) {
        return fail('unsupported', 'This recovery file is from another version of Blackout.');
    }
    const { kdf, aead } = header;
    if (
        !hasExactly(header, ['format', 'v', 'kdf', 'aead', 'ciphertext']) ||
        !isRecord(kdf) ||
        !isRecord(aead) ||
        !hasExactly(kdf, ['alg', 'version', 'memoryKiB', 'iterations', 'parallelism', 'salt']) ||
        !hasExactly(aead, ['alg', 'nonce'])
    ) {
        return fail('malformed', 'This recovery file is damaged.');
    }
    if (
        kdf.alg !== RECOVERY_KDF.alg ||
        kdf.version !== RECOVERY_KDF.version ||
        kdf.memoryKiB !== RECOVERY_KDF.memoryKiB ||
        kdf.iterations !== RECOVERY_KDF.iterations ||
        kdf.parallelism !== RECOVERY_KDF.parallelism ||
        aead.alg !== RECOVERY_AEAD_ALG
    ) {
        return fail('unsupported', 'This recovery file uses settings this version does not read.');
    }
    const salt = decodeCanonicalBase64(kdf.salt, RECOVERY_KDF.saltBytes);
    const nonce = decodeCanonicalBase64(aead.nonce, RECOVERY_NONCE_BYTES);
    const ciphertext = decodeCanonicalBase64(header.ciphertext);
    if (
        !salt ||
        !nonce ||
        !ciphertext ||
        ciphertext.length > MAX_PADDED_BYTES + GCM_TAG_BYTES ||
        !isBucketSize(ciphertext.length - GCM_TAG_BYTES)
    ) {
        return fail('malformed', 'This recovery file is damaged or incomplete.');
    }
    return { salt, nonce, ciphertext };
};

/** Decrypt with a derived key and check the contents' shape. */
export const openRecoveryFile = async (
    parsed: ParsedRecoveryFile,
    key: Uint8Array
): Promise<ReleaseRecoveryContents> => {
    const aesKey = await importAesGcmKey(key);
    let padded: Uint8Array;
    try {
        padded = new Uint8Array(
            await subtleCrypto().decrypt(
                {
                    name: 'AES-GCM',
                    iv: asBufferSource(parsed.nonce),
                    additionalData: asBufferSource(
                        recoveryAssociatedData(parsed.salt, parsed.nonce)
                    ),
                } as unknown as AlgorithmIdentifier,
                aesKey,
                asBufferSource(parsed.ciphertext)
            )
        );
    } catch {
        return fail(
            'wrong_passphrase_or_damaged',
            'The passphrase is wrong, or the file was changed or damaged.'
        );
    }
    let contents: unknown;
    try {
        contents = JSON.parse(utf8Decode(unpad(padded)));
    } catch {
        return fail('contents', 'The recovery file opened, but what it holds is damaged.');
    }
    return assertContentsShape(contents);
};

/** Encrypt contents under a derived key, with the given salt and nonce. */
export const sealRecoveryFile = async (
    contents: ReleaseRecoveryContents,
    key: Uint8Array,
    salt: Uint8Array,
    nonce: Uint8Array
): Promise<string> => {
    assertContentsShape(contents);
    if (salt.length !== RECOVERY_KDF.saltBytes || nonce.length !== RECOVERY_NONCE_BYTES) {
        throw new Error('recovery file: wrong salt or nonce length');
    }
    const plaintext = utf8Encode(JSON.stringify(contents));
    if (plaintext.length + GCM_TAG_BYTES > MAX_PADDED_BYTES) {
        fail('too_large', 'There is too much to fit in one recovery file.');
    }
    const { padded } = pad(plaintext, 'bucket');
    const aesKey = await importAesGcmKey(key);
    const ciphertext = new Uint8Array(
        await subtleCrypto().encrypt(
            {
                name: 'AES-GCM',
                iv: asBufferSource(nonce),
                additionalData: asBufferSource(recoveryAssociatedData(salt, nonce)),
            } as unknown as AlgorithmIdentifier,
            aesKey,
            asBufferSource(padded)
        )
    );
    const header = {
        format: RECOVERY_FILE_FORMAT,
        v: RECOVERY_FILE_VERSION,
        kdf: {
            alg: RECOVERY_KDF.alg,
            version: RECOVERY_KDF.version,
            memoryKiB: RECOVERY_KDF.memoryKiB,
            iterations: RECOVERY_KDF.iterations,
            parallelism: RECOVERY_KDF.parallelism,
            salt: toBase64(salt),
        },
        aead: { alg: RECOVERY_AEAD_ALG, nonce: toBase64(nonce) },
        ciphertext: toBase64(ciphertext),
    };
    return `${JSON.stringify(header, null, 2)}\n`;
};

export type RecoveryProgress = { onProgress?: (fraction: number) => void };

/** Write a recovery file with a fresh salt and nonce. */
export const writeRecoveryFile = async (
    contents: ReleaseRecoveryContents,
    passphrase: string,
    options: RecoveryProgress = {}
): Promise<string> => {
    encodeRecoveryPassphrase(passphrase, RECOVERY_PASSPHRASE_MIN_LENGTH);
    assertContentsShape(contents);
    const salt = randomBytes(RECOVERY_KDF.saltBytes);
    const nonce = randomBytes(RECOVERY_NONCE_BYTES);
    const key = await deriveRecoveryKey(passphrase, salt, options.onProgress);
    return sealRecoveryFile(contents, key, salt, nonce);
};

export type CheckRecoveryContentsOptions = {
    /** Refuse contents that hold another account's keys. */
    accountId?: string;
};

/**
 * Check what a recovery file held before keeping any of it: it belongs to the
 * expected account, and every key set's identity verifies, has its stated
 * fingerprint, names the file's account, and owns its private keys.
 */
export const checkRecoveryContents = async (
    contents: ReleaseRecoveryContents,
    options: CheckRecoveryContentsOptions = {}
): Promise<void> => {
    assertContentsShape(contents);
    if (options.accountId !== undefined && contents.accountId !== options.accountId) {
        fail('other_account', 'This recovery file holds another account’s release keys.');
    }
    for (const keySet of contents.keySets) {
        const problem = await checkReleaseKeySet(keySet, { accountId: contents.accountId });
        if (problem === 'kem_provider') {
            throw new Error('release keys: no ML-KEM-768 provider is configured');
        }
        if (problem) {
            fail('contents', `The keys in this recovery file do not fit together (${problem}).`);
        }
    }
};

export type ReadRecoveryFileOptions = RecoveryProgress & CheckRecoveryContentsOptions;

/**
 * Read a recovery file: parse it (refusing anything but v1 before argon2id
 * runs), derive the key, decrypt, and check the contents
 * (`checkRecoveryContents`) before returning anything.
 */
export const readRecoveryFile = async (
    text: string,
    passphrase: string,
    options: ReadRecoveryFileOptions = {}
): Promise<ReleaseRecoveryContents> => {
    const parsed = parseRecoveryFile(text);
    const key = await deriveRecoveryKey(passphrase, parsed.salt, options.onProgress);
    const contents = await openRecoveryFile(parsed, key);
    await checkRecoveryContents(contents, { accountId: options.accountId });
    return contents;
};
