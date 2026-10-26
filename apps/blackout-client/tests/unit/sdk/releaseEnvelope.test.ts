/**
 * The release envelope (`packages/blackout-protocol/src/release/envelope.ts`),
 * format v1: the fixed vectors, every byte string rebuilt by hand from the
 * record's tables with `node:crypto`; tampered, forged, mis-addressed and
 * replayed inputs; the validators; padding and sizes; the all-zero X25519
 * refusal; building, opening and re-sealing; and when a comparison counts.
 * Format and reasons: docs/security/release-envelope-2026-10-26.md.
 */
import {
    createCipheriv,
    createHash,
    createPrivateKey,
    createPublicKey,
    diffieHellman,
    hkdfSync,
    sign as nodeSign,
    verify as nodeVerify,
} from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    HybridSealError,
    NULL_KEM_PROVIDER,
    RELEASE_MESSAGE_MAX_BYTES,
    RELEASE_PADDED_SIZES,
    ReleaseEnvelopeError,
    buildReleaseEnvelope,
    createReleaseKeySet,
    decodeSealedKey,
    decryptReleaseContent,
    encodeSealedKey,
    encryptReleaseContentWith,
    hybridOpen,
    hybridSealWith,
    mlKem768Provider,
    newReleaseId,
    openReleaseCopy,
    parseReleaseCopy,
    parseReleaseEnvelope,
    parseReleaseHeader,
    releaseComparisonState,
    releaseContentAssociatedData,
    releaseCopySignedBytes,
    releaseDirectoryFingerprints,
    releaseHeaderOf,
    releaseKeyCommitment,
    releaseSealTranscript,
    releaseSignatureVerifier,
    resealReleaseCopy,
    sealReleaseCopyWith,
    setKemProvider,
    RELEASE_CONTENT_LABEL,
    RELEASE_IDENTITY_LABEL,
    RELEASE_KEY_CHECK_LABEL,
    RECOVERY_FILE_FORMAT,
    SAFETY_CODE_LABEL,
    RELEASE_KEY_COMMITMENT_LABEL,
    RELEASE_SEAL_LABEL,
    RELEASE_SEAL_SIGNATURE_LABEL,
    type ReleaseCopy,
    type ReleaseEnvelope,
    type ReleaseHeader,
    type ReleaseIdentity,
    type ReleaseKeySet,
} from '@blackout/protocol';
import { ml_kem768 } from '../../../../../packages/blackout-protocol/node_modules/@noble/post-quantum/ml-kem.js';
import { ALICE, BOB } from '../../../../../packages/blackout-protocol/src/release/testVectors';
import { RELEASE_ENVELOPE_VECTOR as V } from '../../../../../packages/blackout-protocol/src/release/envelopeVectors';

const subtle = globalThis.crypto.subtle;
const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
const fromHexString = (value: string): Uint8Array => Uint8Array.from(Buffer.from(value, 'hex'));
const fromB64 = (value: string): Uint8Array => Uint8Array.from(Buffer.from(value, 'base64'));
const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');
const ascii = (value: string): Buffer => Buffer.from(value, 'ascii');
const lp = (value: string): Buffer =>
    Buffer.concat([Buffer.from([value.length >> 8, value.length & 0xff]), ascii(value)]);
const label = (value: string): Buffer => Buffer.concat([ascii(value), Buffer.from([0])]);
const sha256 = (...parts: Uint8Array[]): Buffer =>
    createHash('sha256').update(Buffer.concat(parts)).digest();

// PKCS #8 for an Ed25519 (OID 1.3.101.112) or X25519 (1.3.101.110) private key.
const pkcs8 = (oidLastByte: number, privateKey: Uint8Array): Uint8Array =>
    Uint8Array.from([
        0x30,
        0x2e,
        0x02,
        0x01,
        0x00,
        0x30,
        0x05,
        0x06,
        0x03,
        0x2b,
        0x65,
        oidLastByte,
        0x04,
        0x22,
        0x04,
        0x20,
        ...privateKey,
    ]);
// SubjectPublicKeyInfo for a raw X25519 public key.
const spkiX25519 = (publicKey: Uint8Array): Buffer =>
    Buffer.concat([Buffer.from('302a300506032b656e032100', 'hex'), Buffer.from(publicKey)]);

const importX25519Public = (value: string): Promise<CryptoKey> =>
    subtle.importKey('raw', fromB64(value), { name: 'X25519' }, true, []);

const vectorKeySet = (person: typeof ALICE): ReleaseKeySet => ({
    identity: person.identity,
    fingerprint: person.fingerprint,
    signingPrivateJwk: person.signingPrivateJwk,
    x25519PrivateJwk: person.x25519PrivateJwk,
    mlkem768SecretKey: person.mlkem768SecretKey,
    createdAt: person.createdAt,
});

const aliceSigner = (): Promise<CryptoKey> =>
    subtle.importKey(
        'pkcs8',
        pkcs8(0x70, fromHexString(ALICE.seeds.ed25519)),
        { name: 'Ed25519' },
        false,
        ['sign']
    );

const webcryptoEphemeral = async (scalar: string) => {
    const privateKey = await subtle.importKey(
        'pkcs8',
        pkcs8(0x6e, fromHexString(scalar)),
        { name: 'X25519' },
        true,
        ['deriveBits']
    );
    const jwk = await subtle.exportKey('jwk', privateKey);
    return {
        privateKey,
        publicKeyBytes: Uint8Array.from(Buffer.from(jwk.x as string, 'base64url')),
    };
};

/** The fixed randomness of one vector copy, for `sealReleaseCopyWith`. */
const vectorRandomness = async (person: typeof ALICE, spec: typeof V.copies['alice']) => {
    const encapsulation = ml_kem768.encapsulate(
        fromB64(person.identity.mlkem768Key),
        fromHexString(spec.mlkemEncapsulationSeed)
    );
    return {
        ephemeral: await webcryptoEphemeral(spec.ephemeralX25519Scalar),
        encapsulation: {
            ciphertext: encapsulation.cipherText,
            sharedSecret: encapsulation.sharedSecret,
        },
        nonce: fromHexString(spec.wrapNonce),
    };
};

const vectorEnvelope = (): ReleaseEnvelope => ({
    ...V.header,
    copies: [V.copies.alice.copy, V.copies.bob.copy],
});

const openAsBob = (
    overrides: Partial<{ header: unknown; copy: unknown; ownerIdentity: unknown }> = {}
) =>
    openReleaseCopy({
        header: V.header,
        copy: V.copies.bob.copy,
        ownerIdentity: ALICE.identity,
        recipientAccountId: BOB.identity.accountId,
        keySets: [vectorKeySet(BOB)],
        ...overrides,
    });

/**
 * A copy of Bob's with some header or copy bytes changed, signed again with
 * Alice's real key over the changed bytes: what a dishonest holder of the
 * owner's key could send. Each check after the signature is then on its own.
 */
const signedByAlice = async (header: ReleaseHeader, copy: ReleaseCopy): Promise<ReleaseCopy> => {
    const nonce = fromB64(header.contentNonce);
    const ciphertext = fromB64(header.contentCiphertext);
    const signed = releaseCopySignedBytes(
        {
            releaseId: header.releaseId,
            ownerAccountId: header.ownerAccountId,
            ownerFingerprint: header.ownerFingerprint,
            recipientAccountId: copy.recipientAccountId,
            recipientFingerprint: copy.recipientFingerprint,
        },
        sha256(nonce, ciphertext),
        fromB64(header.keyCommitment),
        fromB64(copy.sealedKey)
    );
    const signature = new Uint8Array(
        await subtle.sign({ name: 'Ed25519' }, await aliceSigner(), signed)
    );
    return { ...copy, signature: b64(signature) };
};

const flipByte = (value: string, at: number): string => {
    const bytes = fromB64(value);
    bytes[at] ^= 0x01;
    return b64(bytes);
};

beforeEach(() => setKemProvider(mlKem768Provider));
afterEach(() => setKemProvider(NULL_KEM_PROVIDER));

describe('labels', () => {
    const all = [
        RELEASE_IDENTITY_LABEL,
        RELEASE_KEY_CHECK_LABEL,
        SAFETY_CODE_LABEL,
        'blackout-release-recovery-v1',
        RELEASE_SEAL_LABEL,
        RELEASE_SEAL_SIGNATURE_LABEL,
        RELEASE_KEY_COMMITMENT_LABEL,
        RELEASE_CONTENT_LABEL,
    ];

    it("are the record's eight, at the record's lengths with their terminator", () => {
        expect(all.map((value) => label(value).length)).toEqual([29, 30, 32, 29, 25, 35, 35, 28]);
        expect(RECOVERY_FILE_FORMAT).toBe('blackout-release-recovery');
        expect(new Set(all).size).toBe(all.length);
    });

    it('none, with its terminator, is a prefix of another', () => {
        for (const a of all) {
            for (const b of all) {
                if (a !== b)
                    expect(label(b).subarray(0, label(a).length).equals(label(a))).toBe(false);
            }
        }
    });
});

describe('release envelope vectors, rebuilt by hand', () => {
    it("the content's associated data follows the record's layout", () => {
        const byHand = Buffer.concat([
            label('blackout-release-content-v1'),
            lp(V.releaseId),
            lp(ALICE.identity.accountId),
        ]);
        expect(byHand.length).toBe(104);
        expect(byHand.toString('hex')).toBe(V.associatedDataHex);
        expect(
            hex(
                releaseContentAssociatedData({
                    releaseId: V.releaseId,
                    ownerAccountId: ALICE.identity.accountId,
                })
            )
        ).toBe(V.associatedDataHex);
    });

    it('the content is AES-256-GCM of the padded message, rebuilt with node:crypto', async () => {
        const text = Buffer.from(V.message, 'utf8');
        const padded = Buffer.alloc(V.paddedLength);
        text.copy(padded);
        padded[text.length] = 0x80;
        const cipher = createCipheriv(
            'aes-256-gcm',
            Buffer.from(V.contentKey, 'hex'),
            Buffer.from(V.contentNonce, 'hex')
        );
        cipher.setAAD(Buffer.from(V.associatedDataHex, 'hex'));
        const byHand = Buffer.concat([cipher.update(padded), cipher.final(), cipher.getAuthTag()]);
        expect(byHand.toString('base64')).toBe(V.header.contentCiphertext);
        expect(byHand.length).toBe(1024 + 16);

        const built = await encryptReleaseContentWith(
            { text: V.message, releaseId: V.releaseId, ownerAccountId: ALICE.identity.accountId },
            { contentKey: fromHexString(V.contentKey), nonce: fromHexString(V.contentNonce) }
        );
        expect(b64(built.ciphertext)).toBe(V.header.contentCiphertext);
        expect(V.header.contentNonce).toBe(b64(fromHexString(V.contentNonce)));
    });

    it('the content hash and the commitment are SHA-256 of what the record says', async () => {
        expect(
            sha256(fromB64(V.header.contentNonce), fromB64(V.header.contentCiphertext)).toString(
                'hex'
            )
        ).toBe(V.contentHash);
        const commitment = sha256(
            label('blackout-release-key-commitment-v1'),
            fromHexString(V.contentKey)
        );
        expect(commitment.toString('base64')).toBe(V.header.keyCommitment);
        expect(b64(await releaseKeyCommitment(fromHexString(V.contentKey)))).toBe(
            V.header.keyCommitment
        );
    });

    it.each([
        ['alice', ALICE],
        ['bob', BOB],
    ] as const)(
        "%s's copy: transcript, shared secrets, wrap key, wrap and layout",
        async (who, person) => {
            const spec = V.copies[who];
            // The ephemeral key from the scalar, through node:crypto.
            const ephemeral = createPrivateKey({
                key: Buffer.from(pkcs8(0x6e, fromHexString(spec.ephemeralX25519Scalar))),
                format: 'der',
                type: 'pkcs8',
            });
            const ephemeralPublic = Buffer.from(
                createPublicKey(ephemeral).export({ format: 'jwk' }).x as string,
                'base64url'
            );
            expect(ephemeralPublic.toString('base64')).toBe(spec.ephemeralPublicKey);

            // T: the seal label, then the transcript's fields.
            const transcript = Buffer.concat([
                label('blackout-release-seal-v1'),
                lp(V.releaseId),
                lp(ALICE.identity.accountId),
                Buffer.from(ALICE.fingerprint, 'hex'),
                lp(person.identity.accountId),
                Buffer.from(person.fingerprint, 'hex'),
            ]);
            expect(transcript.length).toBe(203);
            expect(transcript.toString('hex')).toBe(spec.transcriptHex);
            expect(
                hex(
                    releaseSealTranscript({
                        releaseId: V.releaseId,
                        ownerAccountId: ALICE.identity.accountId,
                        ownerFingerprint: ALICE.fingerprint,
                        recipientAccountId: person.identity.accountId,
                        recipientFingerprint: person.fingerprint,
                    })
                )
            ).toBe(spec.transcriptHex);

            const ssX = diffieHellman({
                privateKey: ephemeral,
                publicKey: createPublicKey({
                    key: spkiX25519(fromB64(person.identity.x25519Key)),
                    format: 'der',
                    type: 'spki',
                }),
            });
            expect(ssX.toString('hex')).toBe(spec.x25519SharedSecret);
            const encapsulation = ml_kem768.encapsulate(
                fromB64(person.identity.mlkem768Key),
                fromHexString(spec.mlkemEncapsulationSeed)
            );
            expect(hex(encapsulation.sharedSecret)).toBe(spec.mlkemSharedSecret);
            expect(sha256(encapsulation.cipherText).toString('hex')).toBe(
                spec.mlkemCiphertextSha256
            );
            // The recipient's own secret key opens the encapsulation.
            expect(
                hex(
                    ml_kem768.decapsulate(
                        encapsulation.cipherText,
                        fromB64(person.mlkem768SecretKey)
                    )
                )
            ).toBe(spec.mlkemSharedSecret);

            // HKDF-SHA-256(ssX ‖ ssM, salt = pkE ‖ ctM, info = dead-drop label ‖ T).
            const wrapKey = Buffer.from(
                hkdfSync(
                    'sha256',
                    Buffer.concat([ssX, Buffer.from(encapsulation.sharedSecret)]),
                    Buffer.concat([ephemeralPublic, Buffer.from(encapsulation.cipherText)]),
                    Buffer.concat([ascii('blackout-deaddrop-v2-hybrid'), transcript]),
                    32
                )
            );
            expect(wrapKey.toString('hex')).toBe(spec.wrapKey);
            const wrap = createCipheriv('aes-256-gcm', wrapKey, Buffer.from(spec.wrapNonce, 'hex'));
            const wrapped = Buffer.concat([
                wrap.update(Buffer.from(V.contentKey, 'hex')),
                wrap.final(),
                wrap.getAuthTag(),
            ]);
            expect(wrapped.toString('hex')).toBe(spec.wrappedContentKey);

            const sealedKey = Buffer.concat([
                ephemeralPublic,
                Buffer.from(encapsulation.cipherText),
                Buffer.from(spec.wrapNonce, 'hex'),
                wrapped,
            ]);
            expect(sealedKey.length).toBe(1180);
            expect(sealedKey.toString('base64')).toBe(spec.copy.sealedKey);
            const parts = decodeSealedKey(sealedKey);
            expect(b64(encodeSealedKey(parts))).toBe(spec.copy.sealedKey);
        }
    );

    it.each([
        ['alice', ALICE],
        ['bob', BOB],
    ] as const)(
        "%s's copy is signed over the record's bytes, verifiable outside WebCrypto",
        async (who, person) => {
            const spec = V.copies[who];
            const signed = Buffer.concat([
                label('blackout-release-seal-signature-v1'),
                lp(V.releaseId),
                lp(ALICE.identity.accountId),
                Buffer.from(ALICE.fingerprint, 'hex'),
                lp(person.identity.accountId),
                Buffer.from(person.fingerprint, 'hex'),
                Buffer.from(V.contentHash, 'hex'),
                fromB64(V.header.keyCommitment),
                fromB64(spec.copy.sealedKey),
            ]);
            expect(signed.length).toBe(spec.signedBytesLength);
            expect(signed.length).toBe(1457);
            expect(sha256(signed).toString('hex')).toBe(spec.signedBytesSha256);
            const ownerKey = createPrivateKey({
                key: Buffer.from(pkcs8(0x70, fromHexString(ALICE.seeds.ed25519))),
                format: 'der',
                type: 'pkcs8',
            });
            expect(nodeSign(null, signed, ownerKey).toString('base64')).toBe(spec.copy.signature);
            expect(
                nodeVerify(null, signed, createPublicKey(ownerKey), fromB64(spec.copy.signature))
            ).toBe(true);
        }
    );

    it.each([
        ['alice', ALICE],
        ['bob', BOB],
    ] as const)(
        "sealReleaseCopyWith reproduces %s's copy from the fixed inputs",
        async (who, person) => {
            const copy = await sealReleaseCopyWith(
                {
                    header: V.header,
                    contentKey: fromHexString(V.contentKey),
                    recipient: person.identity,
                    ownerSigningKey: await aliceSigner(),
                },
                await vectorRandomness(person, V.copies[who])
            );
            expect(copy).toEqual(V.copies[who].copy);
        }
    );

    it('the whole envelope passes the validator, which returns exactly it', () => {
        const parsed = parseReleaseEnvelope(vectorEnvelope());
        expect(parsed).toEqual({ ok: true, value: vectorEnvelope() });
        expect(releaseHeaderOf(vectorEnvelope())).toEqual(V.header);
    });

    it('Bob opens his copy, and Alice opens her own', async () => {
        expect(await openAsBob()).toEqual({
            ok: true,
            text: V.message,
            ownerFingerprint: ALICE.fingerprint,
            keySetFingerprint: BOB.fingerprint,
        });
        expect(
            await openReleaseCopy({
                header: V.header,
                copy: V.copies.alice.copy,
                ownerIdentity: ALICE.identity,
                recipientAccountId: ALICE.identity.accountId,
                keySets: [vectorKeySet(ALICE)],
            })
        ).toMatchObject({ ok: true, text: V.message });
    });

    it('the signature verifier accepts both copies under Alice and no one else', async () => {
        const verifier = await releaseSignatureVerifier(V.header, ALICE.identity);
        expect(verifier.ok).toBe(true);
        if (!verifier.ok) return;
        expect(await verifier.verify(V.copies.alice.copy)).toBe(true);
        expect(await verifier.verify(V.copies.bob.copy)).toBe(true);
        expect(await releaseSignatureVerifier(V.header, BOB.identity)).toEqual({
            ok: false,
            problem: 'owner_identity',
        });
    });
});

describe('a recipient refuses, and shows nothing, when', () => {
    it.each([
        ['the release id', { releaseId: '7e1f0d2c-3b4a-4596-8a7b-6c5d4e3f2a1c' }],
        ['the content nonce', { contentNonce: flipByte(V.header.contentNonce, 0) }],
        [
            'the content ciphertext',
            { contentCiphertext: flipByte(V.header.contentCiphertext, 100) },
        ],
        ['the commitment', { keyCommitment: flipByte(V.header.keyCommitment, 5) }],
    ])('%s in the header was changed', async (_field, change) => {
        expect(await openAsBob({ header: { ...V.header, ...change } })).toEqual({
            ok: false,
            problem: 'signature',
        });
    });

    it("the header names another owner's fingerprint, or account", async () => {
        expect(
            await openAsBob({ header: { ...V.header, ownerFingerprint: BOB.fingerprint } })
        ).toEqual({ ok: false, problem: 'owner_identity' });
        expect(
            await openAsBob({ header: { ...V.header, ownerAccountId: BOB.identity.accountId } })
        ).toEqual({ ok: false, problem: 'owner_identity' });
    });

    it.each([
        ['its ephemeral key', 3],
        ['its ML-KEM ciphertext', 500],
        ['its wrap nonce', 1125],
        ['its wrapped key', 1170],
    ])('a byte of %s was changed', async (_part, at) => {
        const copy = { ...V.copies.bob.copy, sealedKey: flipByte(V.copies.bob.copy.sealedKey, at) };
        expect(await openAsBob({ copy })).toEqual({ ok: false, problem: 'signature' });
    });

    it('a byte of the signature was changed', async () => {
        const copy = { ...V.copies.bob.copy, signature: flipByte(V.copies.bob.copy.signature, 40) };
        expect(await openAsBob({ copy })).toEqual({ ok: false, problem: 'signature' });
    });

    it.each([
        ['its ephemeral key', 3],
        ['its ML-KEM ciphertext', 500],
        ['its wrap nonce', 1125],
        ['its wrapped key', 1170],
    ])('%s was changed and the owner signed it anyway: the wrap does not open', async (_p, at) => {
        const tampered = {
            ...V.copies.bob.copy,
            sealedKey: flipByte(V.copies.bob.copy.sealedKey, at),
        };
        const copy = await signedByAlice(V.header, tampered);
        const result = await openAsBob({ copy });
        expect(result.ok).toBe(false);
        // A changed ephemeral key can also make X25519 itself refuse.
        expect(['wrap', 'zero_shared_secret']).toContain((result as { problem: string }).problem);
    });

    it('the owner signed a commitment to another key: the wrap opens, K does not match', async () => {
        const header = {
            ...V.header,
            keyCommitment: b64(await releaseKeyCommitment(new Uint8Array(32).fill(9))),
        };
        const copy = await signedByAlice(header, V.copies.bob.copy);
        expect(await openAsBob({ header, copy })).toEqual({ ok: false, problem: 'commitment' });
    });

    it("the owner signed a ciphertext K doesn't open: K matches, the content does not", async () => {
        const other = await encryptReleaseContentWith(
            {
                text: 'another text',
                releaseId: V.releaseId,
                ownerAccountId: ALICE.identity.accountId,
            },
            { contentKey: new Uint8Array(32).fill(3), nonce: fromHexString(V.contentNonce) }
        );
        const header = { ...V.header, contentCiphertext: b64(other.ciphertext) };
        const copy = await signedByAlice(header, V.copies.bob.copy);
        expect(await openAsBob({ header, copy })).toEqual({ ok: false, problem: 'content' });
    });

    it('a copy was moved to another release, even signed by the owner for it', async () => {
        const header = { ...V.header, releaseId: newReleaseId() };
        expect(await openAsBob({ header })).toEqual({ ok: false, problem: 'signature' });
        const copy = await signedByAlice(header, V.copies.bob.copy);
        // The release id is in the transcript, so the wrap key differs.
        expect(await openAsBob({ header, copy })).toEqual({ ok: false, problem: 'wrap' });
    });

    it("someone else re-signs Alice's copy as their own: the transcript names Alice, so it does not open", async () => {
        const carol = await createReleaseKeySet('c4a1b2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d');
        const header = {
            ...V.header,
            ownerAccountId: carol.identity.accountId,
            ownerFingerprint: carol.fingerprint,
        };
        const signer = await subtle.importKey(
            'jwk',
            carol.signingPrivateJwk,
            { name: 'Ed25519' },
            false,
            ['sign']
        );
        const signed = releaseCopySignedBytes(
            {
                releaseId: V.releaseId,
                ownerAccountId: carol.identity.accountId,
                ownerFingerprint: carol.fingerprint,
                recipientAccountId: BOB.identity.accountId,
                recipientFingerprint: BOB.fingerprint,
            },
            fromHexString(V.contentHash),
            fromB64(V.header.keyCommitment),
            fromB64(V.copies.bob.copy.sealedKey)
        );
        const signature = b64(
            new Uint8Array(await subtle.sign({ name: 'Ed25519' }, signer, signed))
        );
        const copy = { ...V.copies.bob.copy, signature };
        const result = await openAsBob({ header, copy, ownerIdentity: carol.identity });
        // Carol's signature verifies under Carol; the wrap key is Alice's
        // transcript's, and the content's associated data names Alice.
        expect(result).toEqual({ ok: false, problem: 'wrap' });
    });

    it("the owner identity is another person's, or a forgery", async () => {
        expect(await openAsBob({ ownerIdentity: BOB.identity })).toEqual({
            ok: false,
            problem: 'owner_identity',
        });
        expect(
            await openAsBob({
                ownerIdentity: { ...ALICE.identity, signature: BOB.identity.signature },
            })
        ).toEqual({ ok: false, problem: 'owner_identity' });
        expect(await openAsBob({ ownerIdentity: { ...ALICE.identity, extra: 1 } })).toEqual({
            ok: false,
            problem: 'owner_identity',
        });
    });

    it("a copy signed by another key than the owner's", async () => {
        const bobSigner = await subtle.importKey(
            'jwk',
            BOB.signingPrivateJwk,
            { name: 'Ed25519' },
            false,
            ['sign']
        );
        const signed = releaseCopySignedBytes(
            {
                releaseId: V.releaseId,
                ownerAccountId: ALICE.identity.accountId,
                ownerFingerprint: ALICE.fingerprint,
                recipientAccountId: BOB.identity.accountId,
                recipientFingerprint: BOB.fingerprint,
            },
            fromHexString(V.contentHash),
            fromB64(V.header.keyCommitment),
            fromB64(V.copies.bob.copy.sealedKey)
        );
        const signature = b64(
            new Uint8Array(await subtle.sign({ name: 'Ed25519' }, bobSigner, signed))
        );
        expect(await openAsBob({ copy: { ...V.copies.bob.copy, signature } })).toEqual({
            ok: false,
            problem: 'signature',
        });
    });
});

describe('a copy is for its recipient only', () => {
    it('another account opening it is told it is not theirs', async () => {
        expect(
            await openReleaseCopy({
                header: V.header,
                copy: V.copies.bob.copy,
                ownerIdentity: ALICE.identity,
                recipientAccountId: ALICE.identity.accountId,
                keySets: [vectorKeySet(ALICE), vectorKeySet(BOB)],
            })
        ).toEqual({ ok: false, problem: 'not_for_you' });
        expect(
            await openReleaseCopy({
                header: V.header,
                copy: V.copies.alice.copy,
                ownerIdentity: ALICE.identity,
                recipientAccountId: BOB.identity.accountId,
                keySets: [vectorKeySet(BOB)],
            })
        ).toEqual({ ok: false, problem: 'not_for_you' });
    });

    it('a copy relabelled for another account fails its signature', async () => {
        const copy = { ...V.copies.bob.copy, recipientAccountId: ALICE.identity.accountId };
        expect(
            await openReleaseCopy({
                header: V.header,
                copy: { ...copy, recipientFingerprint: ALICE.fingerprint },
                ownerIdentity: ALICE.identity,
                recipientAccountId: ALICE.identity.accountId,
                keySets: [vectorKeySet(ALICE)],
            })
        ).toEqual({ ok: false, problem: 'signature' });
    });

    it('a device without the key set the copy names has nothing to open it with', async () => {
        const other = await createReleaseKeySet(BOB.identity.accountId);
        expect(await openAsBob({ copy: V.copies.bob.copy }).then((r) => r.ok)).toBe(true);
        expect(
            await openReleaseCopy({
                header: V.header,
                copy: V.copies.bob.copy,
                ownerIdentity: ALICE.identity,
                recipientAccountId: BOB.identity.accountId,
                keySets: [other],
            })
        ).toEqual({ ok: false, problem: 'no_key' });
        // A key set whose private keys are not the identity's is not used.
        expect(
            await openReleaseCopy({
                header: V.header,
                copy: V.copies.bob.copy,
                ownerIdentity: ALICE.identity,
                recipientAccountId: BOB.identity.accountId,
                keySets: [{ ...vectorKeySet(BOB), x25519PrivateJwk: other.x25519PrivateJwk }],
            })
        ).toEqual({ ok: false, problem: 'no_key' });
    });

    it('opening and building need the ML-KEM provider, and say so', async () => {
        // The default provider has ML-KEM-768's lengths and refuses every call.
        setKemProvider(NULL_KEM_PROVIDER);
        expect(await openAsBob()).toEqual({ ok: false, problem: 'kem_provider' });
        await expect(
            buildReleaseEnvelope({
                ownerKeySet: vectorKeySet(ALICE),
                recipients: [BOB.identity],
                message: 'x',
            })
        ).rejects.toMatchObject({ code: 'kem_provider' });
    });
});

describe('small-order and zero X25519 in a copy', () => {
    it('a small-order ephemeral key, signed by the owner, does not open', async () => {
        const sealed = decodeSealedKey(fromB64(V.copies.bob.copy.sealedKey));
        // u = 0 is canonical and of small order: X25519 with it is all zeros.
        const tampered = { ...sealed, ephemeralPublicKey: new Uint8Array(32) };
        const copy = await signedByAlice(V.header, {
            ...V.copies.bob.copy,
            sealedKey: b64(encodeSealedKey(tampered)),
        });
        const result = await openAsBob({ copy });
        expect(result.ok).toBe(false);
        // Node's WebCrypto throws on small-order keys; an engine that returned
        // zeros would be refused by the zero check instead.
        expect(['wrap', 'zero_shared_secret']).toContain((result as { problem: string }).problem);
    });

    it('an engine that returns zeros for the copy is refused by the zero check', async () => {
        // Node's WebCrypto never returns zeros, so an engine that does is
        // stood in for. The key set's own checks run X25519 first; the copy's
        // agreement is the last X25519 call of an opening.
        const realDeriveBits = globalThis.crypto.subtle.deriveBits.bind(globalThis.crypto.subtle);
        const isX25519 = (algorithm: unknown) => (algorithm as { name?: string }).name === 'X25519';
        const counting = vi.spyOn(globalThis.crypto.subtle, 'deriveBits');
        expect((await openAsBob()).ok).toBe(true);
        const x25519Calls = counting.mock.calls.filter(([algorithm]) => isX25519(algorithm)).length;
        counting.mockRestore();
        let seen = 0;
        const zeroing = vi
            .spyOn(globalThis.crypto.subtle, 'deriveBits')
            .mockImplementation(async (algorithm, key, length) => {
                if (isX25519(algorithm)) {
                    seen += 1;
                    if (seen === x25519Calls) return new ArrayBuffer(32);
                }
                return realDeriveBits(algorithm, key, length);
            });
        try {
            expect(await openAsBob()).toEqual({ ok: false, problem: 'zero_shared_secret' });
        } finally {
            zeroing.mockRestore();
        }
    });
});

describe('the validators refuse', () => {
    const envelope = vectorEnvelope;

    it.each([
        ['an extra header field', () => ({ ...envelope(), sender: 'x' })],
        ['a missing field', () => (({ keyCommitment: _k, ...rest }) => rest)(envelope())],
        ['an array', () => [envelope()]],
        ['null', () => null],
        ['a JSON string', () => JSON.stringify(envelope())],
        [
            'an extra field in a copy',
            () => ({
                ...envelope(),
                copies: [V.copies.alice.copy, { ...V.copies.bob.copy, label: 'x' }],
            }),
        ],
    ])('%s (shape)', (_case, make) => {
        const result = parseReleaseEnvelope(make());
        expect(result).toEqual({ ok: false, problem: 'shape' });
    });

    it.each([2, '1', 0])('version %s', (v) => {
        expect(parseReleaseEnvelope({ ...envelope(), v })).toEqual({
            ok: false,
            problem: 'version',
        });
    });

    it.each([
        '7E1F0D2C-3B4A-4596-8A7B-6C5D4E3F2A1B',
        '7e1f0d2c-3b4a-1596-8a7b-6c5d4e3f2a1b',
        '7e1f0d2c-3b4a-4596-7a7b-6c5d4e3f2a1b',
        '7e1f0d2c3b4a45968a7b6c5d4e3f2a1b',
        '',
        '!room:example.org',
    ])('the release id %j', (releaseId) => {
        expect(parseReleaseEnvelope({ ...envelope(), releaseId })).toEqual({
            ok: false,
            problem: 'release_id',
        });
    });

    it.each(['', 'alice smith', '@alice:blackout.example', 'a'.repeat(129)])(
        'the owner account id %j',
        (ownerAccountId) => {
            expect(parseReleaseEnvelope({ ...envelope(), ownerAccountId })).toEqual({
                ok: false,
                problem: 'account_id',
            });
        }
    );

    it.each([
        ALICE.fingerprint.toUpperCase(),
        ALICE.fingerprint.slice(2),
        `${ALICE.fingerprint}00`,
    ])('the fingerprint %s', (ownerFingerprint) => {
        expect(parseReleaseEnvelope({ ...envelope(), ownerFingerprint })).toEqual({
            ok: false,
            problem: 'fingerprint',
        });
    });

    it('base64 that is not in its canonical form, or of the wrong length', () => {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        // 32 bytes leave two unused low bits in the last character before '='.
        const canonical = V.header.keyCommitment;
        const at = canonical.length - 2;
        const variant =
            canonical.slice(0, at) + alphabet[alphabet.indexOf(canonical[at]) ^ 1] + '=';
        expect(Buffer.from(variant, 'base64').equals(Buffer.from(canonical, 'base64'))).toBe(true);
        for (const keyCommitment of [variant, ` ${canonical}`, b64(new Uint8Array(31))]) {
            expect(parseReleaseEnvelope({ ...envelope(), keyCommitment })).toEqual({
                ok: false,
                problem: 'key_commitment',
            });
        }
        expect(
            parseReleaseEnvelope({ ...envelope(), contentNonce: b64(new Uint8Array(16)) })
        ).toEqual({
            ok: false,
            problem: 'content_nonce',
        });
    });

    it.each([1041, 1039, 2000, 16400 + 16, 262160 + 3, 512 + 16])(
        'a content ciphertext of %i bytes, which is no padded size',
        (length) => {
            expect(
                parseReleaseEnvelope({
                    ...envelope(),
                    contentCiphertext: b64(new Uint8Array(length)),
                })
            ).toEqual({ ok: false, problem: 'content_ciphertext' });
        }
    );

    it.each([1040, 16400, 262160])(
        'a content ciphertext of %i bytes is the right length',
        (length) => {
            expect(
                parseReleaseHeader({ ...V.header, contentCiphertext: b64(new Uint8Array(length)) })
                    .ok
            ).toBe(true);
        }
    );

    it('fewer than two copies, or more than sixty-five', () => {
        expect(parseReleaseEnvelope({ ...envelope(), copies: [] })).toEqual({
            ok: false,
            problem: 'copies',
        });
        expect(parseReleaseEnvelope({ ...envelope(), copies: [V.copies.alice.copy] })).toEqual({
            ok: false,
            problem: 'copies',
        });
        const many = Array.from({ length: 66 }, () => V.copies.bob.copy);
        expect(parseReleaseEnvelope({ ...envelope(), copies: many })).toEqual({
            ok: false,
            problem: 'copies',
        });
    });

    it('a recipient named twice', () => {
        expect(
            parseReleaseEnvelope({
                ...envelope(),
                copies: [V.copies.alice.copy, V.copies.bob.copy, V.copies.bob.copy],
            })
        ).toEqual({ ok: false, problem: 'duplicate_recipient' });
        expect(
            parseReleaseEnvelope({
                ...envelope(),
                copies: [V.copies.alice.copy, V.copies.alice.copy],
            })
        ).toEqual({ ok: false, problem: 'duplicate_recipient' });
    });

    it('no copy for the owner, or one under another fingerprint', () => {
        const carolCopy = {
            ...V.copies.bob.copy,
            recipientAccountId: 'c4a1b2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d',
        };
        expect(
            parseReleaseEnvelope({ ...envelope(), copies: [V.copies.bob.copy, carolCopy] })
        ).toEqual({ ok: false, problem: 'owner_copy' });
        expect(
            parseReleaseEnvelope({
                ...envelope(),
                copies: [
                    { ...V.copies.alice.copy, recipientFingerprint: BOB.fingerprint },
                    V.copies.bob.copy,
                ],
            })
        ).toEqual({ ok: false, problem: 'owner_copy' });
    });

    it('a sealed copy of the wrong length, or with a non-canonical ephemeral key', () => {
        const short = {
            ...V.copies.bob.copy,
            sealedKey: b64(fromB64(V.copies.bob.copy.sealedKey).subarray(1)),
        };
        expect(parseReleaseCopy(short)).toEqual({ ok: false, problem: 'sealed_key' });
        const topBit = fromB64(V.copies.bob.copy.sealedKey);
        topBit[31] |= 0x80;
        expect(parseReleaseCopy({ ...V.copies.bob.copy, sealedKey: b64(topBit) })).toEqual({
            ok: false,
            problem: 'sealed_key',
        });
        const unreduced = fromB64(V.copies.bob.copy.sealedKey);
        unreduced.set(Uint8Array.from([0xed, ...new Array(30).fill(0xff), 0x7f]), 0);
        expect(parseReleaseCopy({ ...V.copies.bob.copy, sealedKey: b64(unreduced) })).toEqual({
            ok: false,
            problem: 'sealed_key',
        });
    });

    it('a signature with a small-order R, or an S of L or more, before any verifying', () => {
        const smallR = new Uint8Array(64);
        smallR[0] = 1;
        const verify = vi.spyOn(globalThis.crypto.subtle, 'verify');
        try {
            expect(parseReleaseCopy({ ...V.copies.bob.copy, signature: b64(smallR) })).toEqual({
                ok: false,
                problem: 'signature',
            });
            const bigS = fromB64(V.copies.bob.copy.signature);
            bigS.set(new Uint8Array(32).fill(0xff), 32);
            expect(parseReleaseCopy({ ...V.copies.bob.copy, signature: b64(bigS) })).toEqual({
                ok: false,
                problem: 'signature',
            });
            expect(verify).not.toHaveBeenCalled();
        } finally {
            verify.mockRestore();
        }
    });
});

describe('padding and sizes', () => {
    const sizeOf = async (bytes: number): Promise<number> => {
        const content = await encryptReleaseContentWith(
            {
                text: 'a'.repeat(bytes),
                releaseId: V.releaseId,
                ownerAccountId: ALICE.identity.accountId,
            },
            { contentKey: new Uint8Array(32), nonce: new Uint8Array(12) }
        );
        return content.ciphertext.length - 16;
    };

    it('pads to 1, 16 or 256 KiB, leaving at least 16 bytes of room', async () => {
        expect(await sizeOf(1)).toBe(RELEASE_PADDED_SIZES[0]);
        expect(await sizeOf(1008)).toBe(1024);
        expect(await sizeOf(1009)).toBe(16384);
        expect(await sizeOf(16368)).toBe(16384);
        expect(await sizeOf(16369)).toBe(262144);
        expect(await sizeOf(RELEASE_MESSAGE_MAX_BYTES)).toBe(262144);
    });

    it('refuses an empty message and one over 64 KiB, counted in UTF-8 bytes', async () => {
        const encrypt = (text: string) =>
            encryptReleaseContentWith(
                { text, releaseId: V.releaseId, ownerAccountId: ALICE.identity.accountId },
                { contentKey: new Uint8Array(32), nonce: new Uint8Array(12) }
            );
        await expect(encrypt('')).rejects.toBeInstanceOf(ReleaseEnvelopeError);
        await expect(encrypt('a'.repeat(RELEASE_MESSAGE_MAX_BYTES + 1))).rejects.toMatchObject({
            code: 'message',
        });
        // 21,846 three-byte characters are 65,538 bytes.
        await expect(encrypt('✓'.repeat(21846))).rejects.toMatchObject({ code: 'message' });
    });

    const signedContent = async (padded: Uint8Array) => {
        const key = await subtle.importKey(
            'raw',
            fromHexString(V.contentKey),
            { name: 'AES-GCM' },
            false,
            ['encrypt']
        );
        const ciphertext = new Uint8Array(
            await subtle.encrypt(
                {
                    name: 'AES-GCM',
                    iv: fromHexString(V.contentNonce),
                    additionalData: fromHexString(V.associatedDataHex),
                },
                key,
                padded
            )
        );
        const header = { ...V.header, contentCiphertext: b64(ciphertext) };
        return { header, copy: await signedByAlice(header, V.copies.bob.copy) };
    };

    it('refuses content whose padding is broken, or that is not UTF-8', async () => {
        const noMarker = new Uint8Array(1024).fill(0x41);
        expect(await openAsBob(await signedContent(noMarker))).toEqual({
            ok: false,
            problem: 'content',
        });
        const notText = new Uint8Array(1024);
        notText.set([0xc3, 0x28, 0x80]);
        expect(await openAsBob(await signedContent(notText))).toEqual({
            ok: false,
            problem: 'content',
        });
        const empty = new Uint8Array(1024);
        empty[0] = 0x80;
        expect(await openAsBob(await signedContent(empty))).toEqual({
            ok: false,
            problem: 'content',
        });
    });

    it('opens content padded right, the way the vector is', async () => {
        const padded = new Uint8Array(1024);
        const text = new TextEncoder().encode('hand-padded');
        padded.set(text);
        padded[text.length] = 0x80;
        expect(await openAsBob(await signedContent(padded))).toMatchObject({
            ok: true,
            text: 'hand-padded',
        });
    });
});

describe('building, opening and re-sealing with fresh keys', () => {
    let owner: ReleaseKeySet;
    let bob: ReleaseKeySet;
    let carol: ReleaseKeySet;

    beforeAll(async () => {
        setKemProvider(mlKem768Provider);
        owner = await createReleaseKeySet('a1a2a3a4-b1b2-4c1c-8d1d-e1e2e3e4e5e6');
        bob = await createReleaseKeySet('b1b2b3b4-c1c2-4d1d-9e1e-f1f2f3f4f5f6');
        carol = await createReleaseKeySet('c1c2c3c4-d1d2-4e1e-af1f-a1a2a3a4a5a6');
    });

    it('every recipient and the owner open the same text; nobody else does', async () => {
        const envelope = await buildReleaseEnvelope({
            ownerKeySet: owner,
            recipients: [bob.identity, carol.identity],
            message: 'Fresh release text',
        });
        expect(parseReleaseEnvelope(envelope).ok).toBe(true);
        expect(envelope.copies.map((copy) => copy.recipientAccountId)).toEqual([
            owner.identity.accountId,
            bob.identity.accountId,
            carol.identity.accountId,
        ]);
        const header = releaseHeaderOf(envelope);
        for (const person of [owner, bob, carol]) {
            const copy = envelope.copies.find(
                (c) => c.recipientAccountId === person.identity.accountId
            );
            expect(
                await openReleaseCopy({
                    header,
                    copy,
                    ownerIdentity: owner.identity,
                    recipientAccountId: person.identity.accountId,
                    keySets: [person],
                })
            ).toMatchObject({ ok: true, text: 'Fresh release text' });
        }
        // Bob's keys do not open Carol's copy, relabelled for him or not.
        const carolsCopy = envelope.copies[2];
        expect(
            await openReleaseCopy({
                header,
                copy: carolsCopy,
                ownerIdentity: owner.identity,
                recipientAccountId: bob.identity.accountId,
                keySets: [bob],
            })
        ).toEqual({ ok: false, problem: 'not_for_you' });
    });

    it('refuses the owner as a recipient, anyone twice, none, or more than 64', async () => {
        const build = (recipients: ReleaseIdentity[]) =>
            buildReleaseEnvelope({ ownerKeySet: owner, recipients, message: 'x' });
        await expect(build([owner.identity])).rejects.toMatchObject({ code: 'recipients' });
        await expect(build([bob.identity, bob.identity])).rejects.toMatchObject({
            code: 'recipients',
        });
        await expect(build([])).rejects.toMatchObject({ code: 'recipients' });
        await expect(build(Array.from({ length: 65 }, () => bob.identity))).rejects.toMatchObject({
            code: 'recipients',
        });
    });

    it('refuses a recipient identity that fails its check, and an owner key set that is not sound', async () => {
        await expect(
            buildReleaseEnvelope({
                ownerKeySet: owner,
                recipients: [{ ...bob.identity, signature: carol.identity.signature }],
                message: 'x',
            })
        ).rejects.toMatchObject({ code: 'recipient_identity' });
        await expect(
            buildReleaseEnvelope({
                ownerKeySet: { ...owner, signingPrivateJwk: bob.signingPrivateJwk },
                recipients: [bob.identity],
                message: 'x',
            })
        ).rejects.toMatchObject({ code: 'owner_key_set' });
    });

    it("re-sealing gives Bob's new key a copy of the same K under the same header", async () => {
        const envelope = await buildReleaseEnvelope({
            ownerKeySet: owner,
            recipients: [bob.identity],
            message: 'Kept across a key change',
        });
        const header = releaseHeaderOf(envelope);
        const newBob = await createReleaseKeySet(bob.identity.accountId);
        const copy = await resealReleaseCopy({
            header,
            ownCopy: envelope.copies[0],
            ownerKeySet: owner,
            recipient: newBob.identity,
        });
        expect(copy.recipientFingerprint).toBe(newBob.fingerprint);
        const verifier = await releaseSignatureVerifier(header, owner.identity);
        expect(verifier.ok && (await verifier.verify(copy))).toBe(true);
        expect(
            await openReleaseCopy({
                header,
                copy,
                ownerIdentity: owner.identity,
                recipientAccountId: bob.identity.accountId,
                keySets: [newBob, bob],
            })
        ).toMatchObject({
            ok: true,
            text: 'Kept across a key change',
            keySetFingerprint: newBob.fingerprint,
        });
        // The old copy still opens with the old key: re-sealing does not revoke (E14).
        expect(
            await openReleaseCopy({
                header,
                copy: envelope.copies[1],
                ownerIdentity: owner.identity,
                recipientAccountId: bob.identity.accountId,
                keySets: [bob],
            })
        ).toMatchObject({ ok: true, text: 'Kept across a key change' });
    });

    it('re-sealing refuses when it cannot trust the copy it would open', async () => {
        const envelope = await buildReleaseEnvelope({
            ownerKeySet: owner,
            recipients: [bob.identity, carol.identity],
            message: 'x',
        });
        const header = releaseHeaderOf(envelope);
        const reseal = (input: Partial<Parameters<typeof resealReleaseCopy>[0]>) =>
            resealReleaseCopy({
                header,
                ownCopy: envelope.copies[0],
                ownerKeySet: owner,
                recipient: bob.identity,
                ...input,
            });
        // Another key set than the header's: the owner arms again.
        await expect(reseal({ ownerKeySet: carol })).rejects.toMatchObject({
            code: 'owner_key_changed',
        });
        // A recipient's copy in place of the owner's own.
        await expect(reseal({ ownCopy: envelope.copies[1] })).rejects.toMatchObject({
            code: 'own_copy',
        });
        // A server that changed the header's commitment, or the own copy.
        await expect(
            reseal({ header: { ...header, keyCommitment: flipByte(header.keyCommitment, 1) } })
        ).rejects.toMatchObject({ code: 'own_copy' });
        await expect(
            reseal({
                ownCopy: {
                    ...envelope.copies[0],
                    sealedKey: flipByte(envelope.copies[0].sealedKey, 1170),
                },
            })
        ).rejects.toMatchObject({ code: 'own_copy' });
        // Not to the owner.
        await expect(reseal({ recipient: owner.identity })).rejects.toMatchObject({
            code: 'recipients',
        });
    });

    it('makes a new release id each time, a version 4 UUID', () => {
        const ids = new Set(Array.from({ length: 50 }, () => newReleaseId()));
        expect(ids.size).toBe(50);
        for (const id of ids) {
            expect(id).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
            );
        }
    });
});

describe('when a comparison counts (H1)', () => {
    const comparison = {
        accountId: BOB.identity.accountId,
        matrixId: '@bob:blackout.example',
        fingerprint: BOB.fingerprint,
        ownFingerprint: ALICE.fingerprint,
        comparedAt: '2026-10-26T11:00:00.000Z',
    };
    const state = (overrides: Partial<Parameters<typeof releaseComparisonState>[0]> = {}) =>
        releaseComparisonState({
            comparison,
            currentFingerprint: BOB.fingerprint,
            supersededFingerprints: [],
            seenSinceComparison: [BOB.fingerprint],
            ownFingerprint: ALICE.fingerprint,
            ...overrides,
        });

    it('counts for the current identity it names', () => {
        expect(state()).toBe('current');
        expect(state({ ownFingerprint: undefined, seenSinceComparison: undefined })).toBe(
            'current'
        );
    });

    it('is none without a comparison', () => {
        expect(state({ comparison: null })).toBe('none');
        expect(state({ comparison: undefined })).toBe('none');
    });

    it('is stale once another identity is current, the compared one is listed as replaced, or a newer one was seen', () => {
        expect(state({ currentFingerprint: ALICE.fingerprint })).toBe('stale');
        expect(state({ currentFingerprint: null })).toBe('stale');
        expect(state({ supersededFingerprints: [BOB.fingerprint] })).toBe('stale');
        // The server shows the compared key as current again after a newer one.
        expect(state({ seenSinceComparison: [BOB.fingerprint, ALICE.fingerprint] })).toBe('stale');
    });

    it("is stale for sealing once the owner's own key changed since comparing", () => {
        expect(state({ ownFingerprint: BOB.fingerprint })).toBe('stale');
    });

    it('reads fingerprints from verified identities only, never the stated ones', async () => {
        const entry = {
            accountId: BOB.identity.accountId,
            matrixId: '@bob:blackout.example',
            current: { identity: BOB.identity, fingerprint: ALICE.fingerprint, publishedAt: 'x' },
            superseded: [
                {
                    identity: { ...ALICE.identity, accountId: BOB.identity.accountId },
                    fingerprint: BOB.fingerprint,
                    publishedAt: 'x',
                },
                { identity: ALICE.identity, fingerprint: BOB.fingerprint, publishedAt: 'x' },
            ],
        };
        expect(await releaseDirectoryFingerprints(entry, BOB.identity.accountId)).toEqual({
            current: BOB.fingerprint,
            superseded: [],
        });
        expect(await releaseDirectoryFingerprints(entry, ALICE.identity.accountId)).toEqual({
            current: null,
            superseded: [],
        });
    });
});

describe('the smaller checks, each on its own', () => {
    it('a header with an extra field is refused when opening, not only in an envelope', async () => {
        expect(
            await openAsBob({ header: { ...V.header, sender: ALICE.identity.accountId } })
        ).toEqual({
            ok: false,
            problem: 'shape',
        });
    });

    it("a copy's own account id and fingerprint are checked", () => {
        expect(
            parseReleaseCopy({ ...V.copies.bob.copy, recipientAccountId: '@bob:blackout.example' })
        ).toEqual({ ok: false, problem: 'account_id' });
        expect(
            parseReleaseCopy({
                ...V.copies.bob.copy,
                recipientFingerprint: BOB.fingerprint.toUpperCase(),
            })
        ).toEqual({ ok: false, problem: 'fingerprint' });
    });

    it('a message over the cap, padded and signed by the owner, is not shown', async () => {
        const key = await subtle.importKey(
            'raw',
            fromHexString(V.contentKey),
            { name: 'AES-GCM' },
            false,
            ['encrypt']
        );
        const padded = new Uint8Array(262_144).fill(0x61, 0, RELEASE_MESSAGE_MAX_BYTES + 1);
        padded[RELEASE_MESSAGE_MAX_BYTES + 1] = 0x80;
        padded.fill(0, RELEASE_MESSAGE_MAX_BYTES + 2);
        const ciphertext = new Uint8Array(
            await subtle.encrypt(
                {
                    name: 'AES-GCM',
                    iv: fromHexString(V.contentNonce),
                    additionalData: fromHexString(V.associatedDataHex),
                },
                key,
                padded
            )
        );
        const header = { ...V.header, contentCiphertext: b64(ciphertext) };
        const copy = await signedByAlice(header, V.copies.bob.copy);
        expect(await openAsBob({ header, copy })).toEqual({ ok: false, problem: 'content' });
    });

    it('says unsupported when WebCrypto cannot check the owner’s key', async () => {
        const verify = vi
            .spyOn(globalThis.crypto.subtle, 'verify')
            .mockRejectedValueOnce(
                Object.assign(new Error('no Ed25519'), { name: 'NotSupportedError' })
            );
        try {
            expect(await releaseSignatureVerifier(V.header, ALICE.identity)).toEqual({
                ok: false,
                problem: 'unsupported',
            });
        } finally {
            verify.mockRestore();
        }
    });

    it('re-sealing refuses an owner key set whose private keys are not its identity’s', async () => {
        const carol = await createReleaseKeySet('c9c8c7c6-d5d4-4e3e-8f2f-a1a0b9b8c7c6');
        await expect(
            resealReleaseCopy({
                header: V.header,
                ownCopy: V.copies.alice.copy,
                ownerKeySet: { ...vectorKeySet(ALICE), signingPrivateJwk: carol.signingPrivateJwk },
                recipient: BOB.identity,
            })
        ).rejects.toMatchObject({ code: 'owner_key_set' });
        // And says when the copy it was given is someone else's.
        await expect(
            resealReleaseCopy({
                header: V.header,
                ownCopy: V.copies.bob.copy,
                ownerKeySet: vectorKeySet(ALICE),
                recipient: BOB.identity,
            })
        ).rejects.toThrow(/not the owner's own/);
        // The vector's own copy re-seals, to the same identity as before.
        const again = await resealReleaseCopy({
            header: V.header,
            ownCopy: V.copies.alice.copy,
            ownerKeySet: vectorKeySet(ALICE),
            recipient: BOB.identity,
        });
        expect(await openAsBob({ copy: again })).toMatchObject({ ok: true, text: V.message });
    });

    it("another account's valid identity served as current counts as nothing", async () => {
        const entry = {
            accountId: BOB.identity.accountId,
            matrixId: null,
            current: { identity: ALICE.identity, fingerprint: BOB.fingerprint, publishedAt: 'x' },
            superseded: [],
        };
        expect(await releaseDirectoryFingerprints(entry, BOB.identity.accountId)).toEqual({
            current: null,
            superseded: [],
        });
    });

    it('the verifier checks the form of a copy it is handed, parsed or not', async () => {
        const verifier = await releaseSignatureVerifier(V.header, ALICE.identity);
        expect(verifier.ok).toBe(true);
        if (!verifier.ok) return;
        expect(await verifier.verify(V.copies.bob.copy)).toBe(true);
        // The same signed fields with one more beside them is not a copy.
        expect(
            await verifier.verify({ ...V.copies.bob.copy, label: 'x' } as unknown as ReleaseCopy)
        ).toBe(false);
    });

    it('decrypting checks the header it is handed, parsed or not', async () => {
        // A well-formed GCM ciphertext under K, but of 512 padded bytes: no
        // release size.
        const key = await subtle.importKey(
            'raw',
            fromHexString(V.contentKey),
            { name: 'AES-GCM' },
            false,
            ['encrypt']
        );
        const padded = new Uint8Array(512);
        padded.set(new TextEncoder().encode('short'));
        padded[5] = 0x80;
        const ciphertext = new Uint8Array(
            await subtle.encrypt(
                {
                    name: 'AES-GCM',
                    iv: fromHexString(V.contentNonce),
                    additionalData: fromHexString(V.associatedDataHex),
                },
                key,
                padded
            )
        );
        await expect(
            decryptReleaseContent(
                { ...V.header, contentCiphertext: b64(ciphertext) },
                fromHexString(V.contentKey)
            )
        ).rejects.toThrow(/header is malformed/);
        expect(await decryptReleaseContent(V.header, fromHexString(V.contentKey))).toBe(V.message);
    });

    it('length guards refuse what the format cannot hold', async () => {
        const recipient = await importX25519Public(BOB.identity.x25519Key);
        const randomness = await vectorRandomness(BOB, V.copies.bob);
        await expect(
            hybridSealWith(
                { plaintext: new Uint8Array(32), recipientX25519PublicKey: recipient },
                { ...randomness, nonce: new Uint8Array(8) }
            )
        ).rejects.toThrow(/nonce must be 12 bytes/);
        const fields = {
            text: 'x',
            releaseId: V.releaseId,
            ownerAccountId: ALICE.identity.accountId,
        };
        await expect(
            encryptReleaseContentWith(fields, {
                contentKey: new Uint8Array(16),
                nonce: new Uint8Array(12),
            })
        ).rejects.toThrow(/wrong content key or nonce length/);
        await expect(
            encryptReleaseContentWith(fields, {
                contentKey: new Uint8Array(32),
                nonce: new Uint8Array(16),
            })
        ).rejects.toThrow(/wrong content key or nonce length/);
        await expect(
            sealReleaseCopyWith(
                {
                    header: V.header,
                    contentKey: new Uint8Array(16),
                    recipient: BOB.identity,
                    ownerSigningKey: await aliceSigner(),
                },
                randomness
            )
        ).rejects.toThrow(/content key must be 32 bytes/);
        expect(() => releaseKeyCommitment(new Uint8Array(16))).toThrow(/32 bytes/);
        const context = {
            releaseId: V.releaseId,
            ownerAccountId: ALICE.identity.accountId,
            ownerFingerprint: ALICE.fingerprint,
            recipientAccountId: BOB.identity.accountId,
            recipientFingerprint: BOB.fingerprint,
        };
        expect(() =>
            releaseCopySignedBytes(
                context,
                new Uint8Array(31),
                new Uint8Array(32),
                new Uint8Array(1180)
            )
        ).toThrow(/wrong length/);
        expect(() => releaseSealTranscript({ ...context, releaseId: 'not-a-release-id' })).toThrow(
            /release id/
        );
        expect(() => releaseSealTranscript({ ...context, ownerFingerprint: 'abc' })).toThrow(
            /fingerprint/
        );
        expect(() => releaseSealTranscript({ ...context, recipientAccountId: '@x:y' })).toThrow(
            /account id/
        );
        expect(() => decodeSealedKey(new Uint8Array(1179))).toThrow(/1180 bytes/);
        const parts = decodeSealedKey(fromB64(V.copies.bob.copy.sealedKey));
        expect(() => encodeSealedKey({ ...parts, nonce: new Uint8Array(11) })).toThrow(
            /wrong length/
        );
    });
});
