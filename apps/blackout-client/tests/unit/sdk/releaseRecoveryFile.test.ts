/**
 * The release-key recovery file, format v1
 * (`packages/blackout-protocol/src/release/recoveryFile.ts`): argon2id
 * against RFC 9106, the fixed recovery vector (and an independent decryption
 * of it from the record's layout), a round trip, and every refusal: a wrong
 * passphrase, truncated, edited and foreign files, parameters it does not
 * read, keys that do not fit. Each argon2id run takes about three seconds, so
 * the edits that need no passphrase use the vector's derived key directly.
 * Format and reasons: docs/security/release-identities-2026-10-26.md §3.
 */
import { createDecipheriv } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    checkRecoveryContents,
    createReleaseKeySet,
    deriveRecoveryKey,
    mlKem768Provider,
    NULL_KEM_PROVIDER,
    openRecoveryFile,
    parseRecoveryFile,
    readRecoveryFile,
    RECOVERY_FILE_NAME,
    ReleaseRecoveryError,
    sealRecoveryFile,
    setKemProvider,
    writeRecoveryFile,
    type ReleaseRecoveryContents,
    type ReleaseRecoveryErrorCode,
} from '@blackout/protocol';
import { argon2id } from '../../../../../packages/blackout-protocol/node_modules/@noble/hashes/argon2.js';
import {
    ALICE,
    BOB,
    RECOVERY_FILE_ALICE,
    RFC9106_ARGON2ID,
} from '../../../../../packages/blackout-protocol/src/release/testVectors';

const SLOW = 60_000;
const fromHexString = (value: string): Uint8Array => Uint8Array.from(Buffer.from(value, 'hex'));
const vector = RECOVERY_FILE_ALICE;
const vectorContents = vector.contents as unknown as ReleaseRecoveryContents;
const vectorKey = fromHexString(vector.derivedKey);
const salt = fromHexString(vector.salt);
const nonce = fromHexString(vector.nonce);

type Header = Record<string, unknown> & {
    kdf: Record<string, unknown>;
    aead: Record<string, unknown>;
    ciphertext: string;
};
const header = (): Header => JSON.parse(vector.fileText) as Header;
const withHeader = (edit: (value: Header) => void): string => {
    const value = header();
    edit(value);
    return JSON.stringify(value, null, 2);
};

const refusal = async (
    run: () => unknown,
    code: ReleaseRecoveryErrorCode
): Promise<ReleaseRecoveryError> => {
    let caught: unknown;
    try {
        await run();
    } catch (cause) {
        caught = cause;
    }
    expect(caught).toBeInstanceOf(ReleaseRecoveryError);
    expect((caught as ReleaseRecoveryError).code).toBe(code);
    return caught as ReleaseRecoveryError;
};

beforeEach(() => setKemProvider(mlKem768Provider));
afterEach(() => setKemProvider(NULL_KEM_PROVIDER));

describe('argon2id', () => {
    it('is RFC 9106 §5.3’s, in the copy the protocol package loads', () => {
        const tag = argon2id(
            fromHexString(RFC9106_ARGON2ID.password),
            fromHexString(RFC9106_ARGON2ID.salt),
            {
                t: RFC9106_ARGON2ID.iterations,
                m: RFC9106_ARGON2ID.memoryKiB,
                p: RFC9106_ARGON2ID.parallelism,
                key: fromHexString(RFC9106_ARGON2ID.secret),
                personalization: fromHexString(RFC9106_ARGON2ID.associatedData),
                dkLen: 32,
            }
        );
        expect(Buffer.from(tag).toString('hex')).toBe(RFC9106_ARGON2ID.tag);
    });

    it(
        'derives the vector key with the v1 parameters',
        async () => {
            const key = await deriveRecoveryKey(vector.passphrase, salt);
            expect(Buffer.from(key).toString('hex')).toBe(vector.derivedKey);
            const byHand = argon2id(new TextEncoder().encode(vector.passphrase), salt, {
                t: 3,
                m: 65536,
                p: 4,
                dkLen: 32,
            });
            expect(Buffer.from(byHand).toString('hex')).toBe(vector.derivedKey);
        },
        SLOW
    );
});

describe('the recovery vector', () => {
    it('opens with its derived key to the vector contents', async () => {
        const contents = await openRecoveryFile(parseRecoveryFile(vector.fileText), vectorKey);
        expect(contents).toEqual(vectorContents);
        await expect(
            checkRecoveryContents(contents, { accountId: ALICE.identity.accountId })
        ).resolves.toBeUndefined();
    });

    it('is reproduced byte for byte from the same contents, key, salt and nonce', async () => {
        expect(await sealRecoveryFile(vectorContents, vectorKey, salt, nonce)).toBe(
            vector.fileText
        );
    });

    it('decrypts outside WebCrypto from the record’s layout', () => {
        const parsed = header();
        const fileSalt = parsed.kdf.salt as string;
        const fileNonce = parsed.aead.nonce as string;
        const sealed = Buffer.from(parsed.ciphertext, 'base64');
        const u32 = (value: number) => {
            const out = Buffer.alloc(4);
            out.writeUInt32BE(value);
            return out;
        };
        const aad = Buffer.concat([
            Buffer.from('blackout-release-recovery-v1', 'ascii'),
            Buffer.from([0x00]),
            u32(0x13),
            u32(65536),
            u32(3),
            u32(4),
            Buffer.from(fileSalt, 'base64'),
            Buffer.from(fileNonce, 'base64'),
        ]);
        const decipher = createDecipheriv(
            'aes-256-gcm',
            vectorKey,
            Buffer.from(fileNonce, 'base64')
        );
        decipher.setAAD(aad);
        decipher.setAuthTag(sealed.subarray(sealed.length - 16));
        const padded = Buffer.concat([
            decipher.update(sealed.subarray(0, sealed.length - 16)),
            decipher.final(),
        ]);
        // ISO/IEC 7816-4 padding to the 16 KiB dead-drop bucket.
        expect(padded.length).toBe(16 * 1024);
        const end = padded.lastIndexOf(0x80);
        expect(padded.subarray(end + 1).every((byte) => byte === 0)).toBe(true);
        expect(JSON.parse(padded.subarray(0, end).toString('utf8'))).toEqual(vectorContents);
    });

    it(
        'reads with its passphrase, for its account only',
        async () => {
            expect(
                await readRecoveryFile(vector.fileText, vector.passphrase, {
                    accountId: ALICE.identity.accountId,
                })
            ).toEqual(vectorContents);
            await refusal(
                () =>
                    readRecoveryFile(vector.fileText, vector.passphrase, {
                        accountId: BOB.identity.accountId,
                    }),
                'other_account'
            );
        },
        SLOW
    );

    it(
        'refuses a wrong passphrase',
        async () => {
            await refusal(
                () => readRecoveryFile(vector.fileText, `${vector.passphrase}!`),
                'wrong_passphrase_or_damaged'
            );
        },
        SLOW
    );

    it('names nobody: neither the file name nor the header holds an account', () => {
        expect(RECOVERY_FILE_NAME).toBe('blackout-release-keys.json');
        expect(vector.fileText).not.toContain(ALICE.identity.accountId);
        expect(vector.fileText).not.toContain('bob');
        expect(Object.keys(header()).sort()).toEqual(
            ['aead', 'ciphertext', 'format', 'kdf', 'v'].sort()
        );
    });
});

describe('a recovery file cut short', () => {
    const lengths = [0, 1, 40, vector.fileText.length / 2, vector.fileText.length - 30];
    it.each(lengths.map((length) => Math.floor(length)))(
        'at %i characters is refused before argon2id runs',
        async (length) => {
            const text = vector.fileText.slice(0, length);
            await refusal(() => parseRecoveryFile(text), 'malformed');
            const started = Date.now();
            await refusal(() => readRecoveryFile(text, vector.passphrase), 'malformed');
            expect(Date.now() - started).toBeLessThan(1000);
        }
    );

    it('with its ciphertext shortened but still valid base64', async () => {
        const text = withHeader((value) => {
            value.ciphertext = (value.ciphertext as string).slice(0, -4);
        });
        await refusal(() => parseRecoveryFile(text), 'malformed');
    });
});

describe('an edited recovery file', () => {
    it.each([
        ['the salt', (value: Header) => (value.kdf.salt = Buffer.alloc(16, 7).toString('base64'))],
        [
            'the nonce',
            (value: Header) => (value.aead.nonce = Buffer.alloc(12, 7).toString('base64')),
        ],
        [
            'one ciphertext bit',
            (value: Header) => {
                const bytes = Buffer.from(value.ciphertext, 'base64');
                bytes[100] ^= 0x01;
                value.ciphertext = bytes.toString('base64');
            },
        ],
        [
            'the tag',
            (value: Header) => {
                const bytes = Buffer.from(value.ciphertext, 'base64');
                bytes[bytes.length - 1] ^= 0x80;
                value.ciphertext = bytes.toString('base64');
            },
        ],
    ])('fails to open when %s changed, even with the right key', async (_field, edit) => {
        const parsed = parseRecoveryFile(withHeader(edit));
        await refusal(() => openRecoveryFile(parsed, vectorKey), 'wrong_passphrase_or_damaged');
    });

    it.each([
        ['memory', (value: Header) => (value.kdf.memoryKiB = 1024)],
        ['passes', (value: Header) => (value.kdf.iterations = 1)],
        ['lanes', (value: Header) => (value.kdf.parallelism = 1)],
        ['the argon2 version', (value: Header) => (value.kdf.version = 16)],
        ['the KDF', (value: Header) => (value.kdf.alg = 'scrypt')],
        ['the cipher', (value: Header) => (value.aead.alg = 'AES-128-GCM')],
        ['the format version', (value: Header) => (value.v = 2)],
    ])('is refused before argon2id when %s changed', async (_field, edit) => {
        await refusal(() => parseRecoveryFile(withHeader(edit)), 'unsupported');
    });

    it.each([
        ['another format', (value: Header) => (value.format = 'something-else')],
        ['an extra field', (value: Header) => (value.accountId = ALICE.identity.accountId)],
        [
            'a non-canonical salt',
            (value: Header) => (value.kdf.salt = ` ${String(value.kdf.salt)}`),
        ],
        ['a short nonce', (value: Header) => (value.aead.nonce = 'AAAA')],
    ])('is refused as malformed with %s', async (_field, edit) => {
        await refusal(() => parseRecoveryFile(withHeader(edit)), 'malformed');
    });

    it('is refused when it is not JSON at all', async () => {
        await refusal(() => parseRecoveryFile('not a recovery file'), 'malformed');
    });
});

describe('what a recovery file holds', () => {
    it('is checked key by key before anything is kept', async () => {
        // Alice's key set holding Bob's ML-KEM secret key.
        const mismatched = structuredClone(vectorContents);
        const field = 'mlkem768SecretKey';
        mismatched.keySets[0] = { ...mismatched.keySets[0], [field]: BOB[field] };
        const sealed = await sealRecoveryFile(mismatched, vectorKey, salt, nonce);
        const opened = await openRecoveryFile(parseRecoveryFile(sealed), vectorKey);
        await refusal(() => checkRecoveryContents(opened), 'contents');

        const foreignKeySet = structuredClone(vectorContents);
        foreignKeySet.keySets.push({
            identity: BOB.identity,
            fingerprint: BOB.fingerprint,
            signingPrivateJwk: BOB.signingPrivateJwk,
            x25519PrivateJwk: BOB.x25519PrivateJwk,
            mlkem768SecretKey: BOB.mlkem768SecretKey,
            createdAt: BOB.createdAt,
            status: 'superseded',
        });
        await refusal(() => checkRecoveryContents(foreignKeySet), 'contents');
    });

    it.each([
        [
            'no current key set',
            (value: ReleaseRecoveryContents) => (value.keySets[0].status = 'superseded'),
        ],
        ['no key sets', (value: ReleaseRecoveryContents) => (value.keySets = [])],
        [
            'an extra field in a key set',
            (value: ReleaseRecoveryContents) =>
                Object.assign(value.keySets[0], { note: 'not part of the format' }),
        ],
        [
            'a damaged comparison',
            (value: ReleaseRecoveryContents) => (value.comparisons[0].fingerprint = 'abc'),
        ],
        [
            'another contents version',
            (value: ReleaseRecoveryContents) => Object.assign(value, { v: 2 }),
        ],
    ])('is refused with %s, even sealed under the right key', async (_case, edit) => {
        const contents = structuredClone(vectorContents);
        edit(contents);
        await refusal(() => sealRecoveryFile(contents, vectorKey, salt, nonce), 'contents');
    });

    it('hides how many people were compared, within a bucket', async () => {
        const many = structuredClone(vectorContents);
        for (let i = 0; i < 20; i += 1) {
            many.comparisons.push({
                ...vectorContents.comparisons[0],
                matrixId: `@p${i}:x.example`,
            });
        }
        const few = await sealRecoveryFile(vectorContents, vectorKey, salt, nonce);
        const more = await sealRecoveryFile(many, vectorKey, salt, nonce);
        expect(more.length).toBe(few.length);
    });

    it('refuses more than one file can hold', async () => {
        // Within the per-file caps (64 key sets, 2000 comparisons), but past 1 MiB.
        const huge = structuredClone(vectorContents);
        for (let i = 0; i < 63; i += 1) {
            huge.keySets.push({ ...vectorContents.keySets[0], status: 'superseded' });
        }
        for (let i = 0; i < 1999; i += 1) {
            huge.comparisons.push({
                ...vectorContents.comparisons[0],
                matrixId: `@${String(i).padStart(4, '0')}${'x'.repeat(236)}:x.example`,
            });
        }
        await refusal(() => sealRecoveryFile(huge, vectorKey, salt, nonce), 'too_large');
    });
});

describe('writing and reading back', () => {
    it('refuses a passphrase under 12 characters before argon2id runs', async () => {
        await refusal(() => writeRecoveryFile(vectorContents, 'eleven char'), 'passphrase_length');
        await refusal(() => readRecoveryFile(vector.fileText, ''), 'passphrase_length');
    });

    it(
        'round-trips a new key set, with a fresh salt and nonce each time, and NFC passphrases',
        async () => {
            const keySet = await createReleaseKeySet(ALICE.identity.accountId);
            const contents: ReleaseRecoveryContents = {
                v: 1,
                accountId: ALICE.identity.accountId,
                savedAt: new Date().toISOString(),
                keySets: [
                    { ...keySet, status: 'current' },
                    { ...vectorContents.keySets[0], status: 'superseded' },
                ],
                comparisons: vectorContents.comparisons,
            };
            // "é" as one code point when written, as "e" and a combining accent when read.
            const composed = 'résumé of a long walk';
            const decomposed = 'résumé of a long walk';
            expect(composed).not.toBe(decomposed);
            const one = await writeRecoveryFile(contents, composed);
            const two = await writeRecoveryFile(contents, composed);
            expect(JSON.parse(one).kdf.salt).not.toBe(JSON.parse(two).kdf.salt);
            expect(JSON.parse(one).ciphertext).not.toBe(JSON.parse(two).ciphertext);
            expect(
                await readRecoveryFile(one, decomposed, { accountId: ALICE.identity.accountId })
            ).toEqual(contents);
        },
        4 * SLOW
    );
});
