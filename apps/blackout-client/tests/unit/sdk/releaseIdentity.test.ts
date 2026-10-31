/**
 * Release identities (`packages/blackout-protocol/src/release/`), format v1:
 * the signed bytes, fingerprint and signature against fixed vectors and an
 * independent rebuild from the record's layout; every refusal the validator
 * makes; key sets; and the safety code. These run with the dead-drop crypto
 * tests, in the client's Vitest suite. Format and reasons:
 * docs/security/release-identities-2026-10-26.md.
 */
import { createHash, createPublicKey, verify as nodeVerify } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    checkReleaseKeySet,
    computeSafetyCode,
    createReleaseKeySet,
    ed25519PublicKeyIsAcceptable,
    ed25519SignatureIsAcceptable,
    formatReleaseFingerprint,
    formatSafetyCode,
    mlKem768EncapsulationKeyIsWellFormed,
    mlKem768Provider,
    NULL_KEM_PROVIDER,
    publicReleaseIdentity,
    releaseIdentityFingerprint,
    releaseIdentitySignedBytes,
    safetyCodeHalf,
    setKemProvider,
    signReleaseIdentity,
    verifyReleaseIdentity,
    x25519KeyIsCanonical,
    type ReleaseIdentity,
    type ReleaseKeySet,
} from '@blackout/protocol';
import { ml_kem768 } from '../../../../../packages/blackout-protocol/node_modules/@noble/post-quantum/ml-kem.js';
import {
    ALICE,
    BOB,
    RFC7748_SECTION_6_1,
    RFC8032_TEST1,
    SAFETY_CODE_ALICE_BOB,
} from '../../../../../packages/blackout-protocol/src/release/testVectors';

const subtle = globalThis.crypto.subtle;
const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
const fromHexString = (value: string): Uint8Array => Uint8Array.from(Buffer.from(value, 'hex'));
const fromB64 = (value: string): Uint8Array => Uint8Array.from(Buffer.from(value, 'base64'));
const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

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
const importEd25519Seed = (seed: Uint8Array): Promise<CryptoKey> =>
    subtle.importKey('pkcs8', pkcs8(0x70, seed), { name: 'Ed25519' }, true, ['sign']);
const importX25519Scalar = (scalar: Uint8Array): Promise<CryptoKey> =>
    subtle.importKey('pkcs8', pkcs8(0x6e, scalar), { name: 'X25519' }, true, ['deriveBits']);

const vectorKeySet = (person: typeof ALICE): ReleaseKeySet => ({
    identity: person.identity,
    fingerprint: person.fingerprint,
    signingPrivateJwk: person.signingPrivateJwk,
    x25519PrivateJwk: person.x25519PrivateJwk,
    mlkem768SecretKey: person.mlkem768SecretKey,
    createdAt: person.createdAt,
});

/** Alice's identity with some public fields replaced, signed again with her key. */
const resignedAlice = async (fields: Partial<ReleaseIdentity>): Promise<ReleaseIdentity> => {
    const signer = await importEd25519Seed(fromHexString(ALICE.seeds.ed25519));
    const { signature: _signature, ...unsigned } = { ...ALICE.identity, ...fields };
    return signReleaseIdentity(unsigned, signer);
};

// The seven small-order X25519 encodings libsodium refuses: 0, 1, the two
// points of order 8, and p - 1, p, p + 1.
const SMALL_ORDER_X25519 = [
    '0000000000000000000000000000000000000000000000000000000000000000',
    '0100000000000000000000000000000000000000000000000000000000000000',
    'e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800',
    '5f9c95bca3508c24b1d0b1559c83ef5b04445cc4581c8e86d8224eddd09f1157',
    'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
    'edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
    'eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
];

// The y-coordinates of the small-order Ed25519 points, as libsodium lists
// them: 0, 1, the two of order 8, p - 1, and the unreduced p and p + 1. Each
// is tried with both sign bits, which covers the other x and "-0".
const SMALL_ORDER_ED25519 = [
    '0000000000000000000000000000000000000000000000000000000000000000',
    '0100000000000000000000000000000000000000000000000000000000000000',
    '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05',
    'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a',
    'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
    'edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
    'eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
];

const withSignBit = (value: string, sign: number): Uint8Array => {
    const bytes = fromHexString(value);
    bytes[31] |= sign;
    return bytes;
};

/** R = the identity point, S = 0: valid under a small-order key for every message. */
const universalSignature = (): Uint8Array => {
    const signature = new Uint8Array(64);
    signature[0] = 1;
    return signature;
};

/** p + k, little-endian, for k in 0..18: the unreduced forms of 0..18. */
const unreducedFieldElement = (k: number): Uint8Array => {
    const bytes = new Uint8Array(32).fill(0xff);
    bytes[0] = 0xed + k;
    bytes[31] = 0x7f;
    return bytes;
};

describe('WebCrypto against the RFC vectors', () => {
    it('signs RFC 8032 §7.1 TEST 1 as the RFC does', async () => {
        const privateKey = await importEd25519Seed(fromHexString(RFC8032_TEST1.seed));
        const jwk = await subtle.exportKey('jwk', privateKey);
        expect(hex(Buffer.from(jwk.x as string, 'base64url'))).toBe(RFC8032_TEST1.publicKey);
        const signature = new Uint8Array(
            await subtle.sign({ name: 'Ed25519' }, privateKey, new Uint8Array(0))
        );
        expect(hex(signature)).toBe(RFC8032_TEST1.signature);
    });

    it('agrees on RFC 7748 §6.1', async () => {
        const alice = await importX25519Scalar(fromHexString(RFC7748_SECTION_6_1.alicePrivate));
        const jwk = await subtle.exportKey('jwk', alice);
        expect(hex(Buffer.from(jwk.x as string, 'base64url'))).toBe(
            RFC7748_SECTION_6_1.alicePublic
        );
        const bob = await subtle.importKey(
            'raw',
            fromHexString(RFC7748_SECTION_6_1.bobPublic),
            { name: 'X25519' },
            true,
            []
        );
        const shared = new Uint8Array(
            await subtle.deriveBits({ name: 'X25519', public: bob }, alice, 256)
        );
        expect(hex(shared)).toBe(RFC7748_SECTION_6_1.shared);
    });
});

describe('release identity vectors', () => {
    beforeEach(() => setKemProvider(mlKem768Provider));
    afterEach(() => setKemProvider(NULL_KEM_PROVIDER));

    it.each([
        ['Alice', ALICE],
        ['Bob', BOB],
    ])("%s's keys come from the fixed seeds", async (_name, person) => {
        const signer = await importEd25519Seed(fromHexString(person.seeds.ed25519));
        const signerJwk = await subtle.exportKey('jwk', signer);
        expect(b64(Buffer.from(signerJwk.x as string, 'base64url'))).toBe(
            person.identity.signingKey
        );
        expect(person.signingPrivateJwk.d).toBe(
            Buffer.from(fromHexString(person.seeds.ed25519)).toString('base64url')
        );
        const agreement = await importX25519Scalar(fromHexString(person.seeds.x25519));
        const agreementJwk = await subtle.exportKey('jwk', agreement);
        expect(b64(Buffer.from(agreementJwk.x as string, 'base64url'))).toBe(
            person.identity.x25519Key
        );
        const kem = ml_kem768.keygen(fromHexString(person.seeds.mlkem768));
        expect(b64(kem.publicKey)).toBe(person.identity.mlkem768Key);
        expect(b64(kem.secretKey)).toBe(person.mlkem768SecretKey);
    });

    it.each([
        ['Alice', ALICE],
        ['Bob', BOB],
    ])("%s's signed bytes follow the record's layout, rebuilt by hand", (_name, person) => {
        const accountId = Buffer.from(person.identity.accountId, 'ascii');
        const byHand = Buffer.concat([
            Buffer.from('blackout-release-identity-v1', 'ascii'),
            Buffer.from([0x00]),
            Buffer.from([accountId.length >> 8, accountId.length & 0xff]),
            accountId,
            Buffer.from(person.identity.signingKey, 'base64'),
            Buffer.from(person.identity.x25519Key, 'base64'),
            Buffer.from(person.identity.mlkem768Key, 'base64'),
        ]);
        expect(byHand.length).toBe(29 + 2 + 36 + 32 + 32 + 1184);
        expect(byHand.toString('hex')).toBe(person.signedBytesHex);
        const built = releaseIdentitySignedBytes({
            accountId: person.identity.accountId,
            signingKey: fromB64(person.identity.signingKey),
            x25519Key: fromB64(person.identity.x25519Key),
            mlkem768Key: fromB64(person.identity.mlkem768Key),
        });
        expect(hex(built)).toBe(person.signedBytesHex);
    });

    it.each([
        ['Alice', ALICE],
        ['Bob', BOB],
    ])("%s's fingerprint is SHA-256 of the signed bytes", async (_name, person) => {
        const signed = fromHexString(person.signedBytesHex);
        expect(createHash('sha256').update(signed).digest('hex')).toBe(person.fingerprint);
        expect(await releaseIdentityFingerprint(signed)).toBe(person.fingerprint);
    });

    it.each([
        ['Alice', ALICE],
        ['Bob', BOB],
    ])(
        "%s's signature is reproduced, and verifies outside WebCrypto too",
        async (_name, person) => {
            const signer = await importEd25519Seed(fromHexString(person.seeds.ed25519));
            const { signature: _signature, ...unsigned } = person.identity;
            const signed = await signReleaseIdentity(unsigned, signer);
            expect(signed.signature).toBe(person.identity.signature);
            const publicKey = createPublicKey({
                key: { kty: 'OKP', crv: 'Ed25519', x: person.signingPrivateJwk.x },
                format: 'jwk',
            });
            expect(
                nodeVerify(
                    null,
                    fromHexString(person.signedBytesHex),
                    publicKey,
                    fromB64(person.identity.signature)
                )
            ).toBe(true);
        }
    );

    it('verifies both identities and computes their fingerprints itself', async () => {
        for (const person of [ALICE, BOB]) {
            const check = await verifyReleaseIdentity(person.identity, {
                accountId: person.identity.accountId,
            });
            expect(check).toEqual({
                ok: true,
                identity: person.identity,
                fingerprint: person.fingerprint,
            });
        }
    });

    it('accepts both vector key sets', async () => {
        expect(await checkReleaseKeySet(vectorKeySet(ALICE))).toBeNull();
        expect(await checkReleaseKeySet(vectorKeySet(BOB))).toBeNull();
    });

    it('shows a fingerprint in groups of four', () => {
        expect(formatReleaseFingerprint(ALICE.fingerprint).split(' ')).toHaveLength(16);
        expect(formatReleaseFingerprint(ALICE.fingerprint).replace(/ /g, '')).toBe(
            ALICE.fingerprint
        );
    });
});

describe('verifyReleaseIdentity refuses', () => {
    it.each([
        ['the account id', { accountId: '0b6f5a8e-7c1d-4e2f-9a3b-5c4d6e7f8a92' }],
        ['the signing key', { signingKey: BOB.identity.signingKey }],
        ['the X25519 key', { x25519Key: BOB.identity.x25519Key }],
        ['the ML-KEM key', { mlkem768Key: BOB.identity.mlkem768Key }],
    ])('an identity whose %s was changed after signing', async (_field, change) => {
        const check = await verifyReleaseIdentity({ ...ALICE.identity, ...change });
        expect(check).toEqual({ ok: false, problem: 'signature' });
    });

    it('a signature with one bit flipped', async () => {
        const signature = fromB64(ALICE.identity.signature);
        signature[10] ^= 0x01;
        const check = await verifyReleaseIdentity({ ...ALICE.identity, signature: b64(signature) });
        expect(check).toEqual({ ok: false, problem: 'signature' });
    });

    it("another identity's signature", async () => {
        const check = await verifyReleaseIdentity({
            ...ALICE.identity,
            signature: BOB.identity.signature,
        });
        expect(check).toEqual({ ok: false, problem: 'signature' });
    });

    it('a valid signature by another key over the same bytes', async () => {
        const other = await importEd25519Seed(fromHexString(BOB.seeds.ed25519));
        const forged = new Uint8Array(
            await subtle.sign({ name: 'Ed25519' }, other, fromHexString(ALICE.signedBytesHex))
        );
        const check = await verifyReleaseIdentity({ ...ALICE.identity, signature: b64(forged) });
        expect(check).toEqual({ ok: false, problem: 'signature' });
    });

    it('a signature over the bytes without the label', async () => {
        const signer = await importEd25519Seed(fromHexString(ALICE.seeds.ed25519));
        const unlabelled = fromHexString(ALICE.signedBytesHex).subarray(29);
        const signature = new Uint8Array(
            await subtle.sign({ name: 'Ed25519' }, signer, unlabelled)
        );
        const check = await verifyReleaseIdentity({
            ...ALICE.identity,
            signature: b64(signature),
        });
        expect(check).toEqual({ ok: false, problem: 'signature' });
    });

    it('an identity for another account than the one asked for', async () => {
        const check = await verifyReleaseIdentity(ALICE.identity, {
            accountId: BOB.identity.accountId,
        });
        expect(check).toEqual({ ok: false, problem: 'account_mismatch' });
    });

    it.each([
        ['an extra field', { ...ALICE.identity, privateKey: 'x' }],
        ['a missing field', (({ signature: _s, ...rest }) => rest)(ALICE.identity)],
        ['an array', [ALICE.identity]],
        ['null', null],
        ['a string', JSON.stringify(ALICE.identity)],
    ])('%s', async (_case, input) => {
        expect(await verifyReleaseIdentity(input)).toEqual({ ok: false, problem: 'shape' });
    });

    it.each([2, '1', 0])('version %s', async (v) => {
        expect(await verifyReleaseIdentity({ ...ALICE.identity, v })).toEqual({
            ok: false,
            problem: 'version',
        });
    });

    it.each(['', 'alice smith', '@alice:blackout.example', 'é', 'a'.repeat(129)])(
        'the account id %j',
        async (accountId) => {
            expect(await verifyReleaseIdentity({ ...ALICE.identity, accountId })).toEqual({
                ok: false,
                problem: 'account_id',
            });
        }
    );

    it('base64 that decodes to the same bytes but is not the canonical form', async () => {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        const canonical = ALICE.identity.signingKey;
        // 32 bytes leave two unused low bits in the last character before '='.
        const at = canonical.length - 2;
        const variant =
            canonical.slice(0, at) + alphabet[alphabet.indexOf(canonical[at]) ^ 1] + '=';
        expect(Buffer.from(variant, 'base64').equals(Buffer.from(canonical, 'base64'))).toBe(true);
        for (const signingKey of [variant, ` ${canonical}`, canonical.replace('=', '')]) {
            expect(await verifyReleaseIdentity({ ...ALICE.identity, signingKey })).toEqual({
                ok: false,
                problem: 'signing_key',
            });
        }
    });

    it('keys and signatures of the wrong length', async () => {
        const short = (value: string) => b64(fromB64(value).subarray(1));
        expect(
            await verifyReleaseIdentity({
                ...ALICE.identity,
                signingKey: short(ALICE.identity.signingKey),
            })
        ).toEqual({ ok: false, problem: 'signing_key' });
        expect(
            await verifyReleaseIdentity({
                ...ALICE.identity,
                x25519Key: short(ALICE.identity.x25519Key),
            })
        ).toEqual({ ok: false, problem: 'x25519_key' });
        expect(
            await verifyReleaseIdentity({
                ...ALICE.identity,
                mlkem768Key: short(ALICE.identity.mlkem768Key),
            })
        ).toEqual({ ok: false, problem: 'mlkem768_key' });
        expect(
            await verifyReleaseIdentity({
                ...ALICE.identity,
                signature: short(ALICE.identity.signature),
            })
        ).toEqual({ ok: false, problem: 'signature' });
    });

    it.each(SMALL_ORDER_X25519)('the small-order X25519 key %s, even signed', async (key) => {
        const identity = await resignedAlice({ x25519Key: b64(fromHexString(key)) });
        expect(await verifyReleaseIdentity(identity)).toEqual({ ok: false, problem: 'x25519_key' });
    });

    // L1 (independent review, 2026-10-26).
    it('a small-order Ed25519 key, which WebCrypto alone accepts with R = identity, S = 0', async () => {
        // The gap: Node's WebCrypto verifies the universal signature under the
        // identity point, over the identity's bytes or any other message.
        const identityPoint = fromHexString(SMALL_ORDER_ED25519[1]);
        const publicKey = await subtle.importKey('raw', identityPoint, { name: 'Ed25519' }, false, [
            'verify',
        ]);
        for (const message of [
            fromHexString(ALICE.signedBytesHex),
            new TextEncoder().encode('blackout-release-seal-signature-v1\0anything'),
        ]) {
            expect(
                await subtle.verify({ name: 'Ed25519' }, publicKey, universalSignature(), message)
            ).toBe(true);
        }
        // The validator refuses the key before WebCrypto sees it.
        const verify = vi.spyOn(globalThis.crypto.subtle, 'verify');
        try {
            expect(
                await verifyReleaseIdentity({
                    ...ALICE.identity,
                    signingKey: b64(identityPoint),
                    signature: b64(universalSignature()),
                })
            ).toEqual({ ok: false, problem: 'signing_key' });
            expect(verify).not.toHaveBeenCalled();
        } finally {
            verify.mockRestore();
        }
    });

    it.each(SMALL_ORDER_ED25519.flatMap((y) => [[y, 0x00] as const, [y, 0x80] as const]))(
        'the small-order Ed25519 key %s with sign bit %i, with the universal signature',
        async (y, sign) => {
            const key = withSignBit(y, sign);
            expect(ed25519PublicKeyIsAcceptable(key)).toBe(false);
            expect(
                await verifyReleaseIdentity({
                    ...ALICE.identity,
                    signingKey: b64(key),
                    signature: b64(universalSignature()),
                })
            ).toEqual({ ok: false, problem: 'signing_key' });
        }
    );

    it('the review’s probe values: y = p + 1, "-0", the identity and the point of order 2', async () => {
        const probes = [
            'eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
            '0100000000000000000000000000000000000000000000000000000000000080',
            '0100000000000000000000000000000000000000000000000000000000000000',
            'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
        ];
        for (const probe of probes) {
            expect(
                await verifyReleaseIdentity({
                    ...ALICE.identity,
                    signingKey: b64(fromHexString(probe)),
                    signature: b64(universalSignature()),
                })
            ).toEqual({ ok: false, problem: 'signing_key' });
        }
    });

    it('an Ed25519 key whose y is not reduced, whatever point it names', async () => {
        for (let k = 0; k <= 18; k += 1) {
            for (const sign of [0x00, 0x80]) {
                const key = unreducedFieldElement(k);
                key[31] |= sign;
                expect(ed25519PublicKeyIsAcceptable(key)).toBe(false);
                expect(
                    await verifyReleaseIdentity({ ...ALICE.identity, signingKey: b64(key) })
                ).toEqual({ ok: false, problem: 'signing_key' });
            }
        }
        // Alice's own key passes the same test.
        expect(ed25519PublicKeyIsAcceptable(fromB64(ALICE.identity.signingKey))).toBe(true);
    });

    it('a signature whose R has small order, or whose S is not below L, before WebCrypto', async () => {
        const L = (1n << 252n) + 27742317777372353535851937790883648493n;
        const real = fromB64(ALICE.identity.signature);
        let S = 0n;
        for (let i = 31; i >= 0; i -= 1) S = (S << 8n) | BigInt(real[32 + i]);
        const withS = (value: bigint): Uint8Array => {
            const signature = Uint8Array.from(real);
            let rest = value;
            for (let i = 0; i < 32; i += 1) {
                signature[32 + i] = Number(rest & 0xffn);
                rest >>= 8n;
            }
            return signature;
        };
        const refusedBeforeWebCrypto: Uint8Array[] = [
            withS(S + L),
            withS(L),
            ...SMALL_ORDER_ED25519.map((y) => {
                const signature = Uint8Array.from(real);
                signature.set(fromHexString(y), 0);
                return signature;
            }),
        ];
        const verify = vi.spyOn(globalThis.crypto.subtle, 'verify');
        try {
            for (const signature of refusedBeforeWebCrypto) {
                expect(ed25519SignatureIsAcceptable(signature)).toBe(false);
                expect(
                    await verifyReleaseIdentity({ ...ALICE.identity, signature: b64(signature) })
                ).toEqual({ ok: false, problem: 'signature' });
            }
            expect(verify).not.toHaveBeenCalled();
        } finally {
            verify.mockRestore();
        }
        // S = L - 1 is in range, so it reaches WebCrypto, which refuses it.
        expect(ed25519SignatureIsAcceptable(withS(L - 1n))).toBe(true);
        expect(
            await verifyReleaseIdentity({ ...ALICE.identity, signature: b64(withS(L - 1n)) })
        ).toEqual({ ok: false, problem: 'signature' });
        expect(ed25519SignatureIsAcceptable(real)).toBe(true);
    });

    // L2 (independent review, 2026-10-26).
    it('an X25519 key with its top bit set: the same shared secret, another fingerprint', async () => {
        const key = fromB64(ALICE.identity.x25519Key);
        const high = Uint8Array.from(key);
        high[31] |= 0x80;
        // RFC 7748 masks the bit, so both encodings agree on every secret.
        const ephemeral = (await subtle.generateKey({ name: 'X25519' }, false, [
            'deriveBits',
        ])) as CryptoKeyPair;
        const secretFor = async (bytes: Uint8Array) =>
            hex(
                new Uint8Array(
                    await subtle.deriveBits(
                        {
                            name: 'X25519',
                            public: await subtle.importKey(
                                'raw',
                                bytes,
                                { name: 'X25519' },
                                true,
                                []
                            ),
                        } as unknown as AlgorithmIdentifier,
                        ephemeral.privateKey,
                        256
                    )
                )
            );
        expect(await secretFor(high)).toBe(await secretFor(key));
        expect(x25519KeyIsCanonical(high)).toBe(false);
        const identity = await resignedAlice({ x25519Key: b64(high) });
        const deriveBits = vi.spyOn(globalThis.crypto.subtle, 'deriveBits');
        try {
            expect(await verifyReleaseIdentity(identity)).toEqual({
                ok: false,
                problem: 'x25519_key',
            });
            expect(deriveBits).not.toHaveBeenCalled();
        } finally {
            deriveBits.mockRestore();
        }
    });

    it('an X25519 u-coordinate of p or more, as the review’s probe u = p + 9', async () => {
        for (let k = 0; k <= 18; k += 1) {
            const key = unreducedFieldElement(k);
            expect(x25519KeyIsCanonical(key)).toBe(false);
            const identity = await resignedAlice({ x25519Key: b64(key) });
            expect(await verifyReleaseIdentity(identity)).toEqual({
                ok: false,
                problem: 'x25519_key',
            });
        }
        // u = 9, the base point, is canonical and contributes.
        const nine = new Uint8Array(32);
        nine[0] = 9;
        expect(x25519KeyIsCanonical(nine)).toBe(true);
        expect(
            (await verifyReleaseIdentity(await resignedAlice({ x25519Key: b64(nine) }))).ok
        ).toBe(true);
    });

    it('a key whose X25519 output is all zeros, where an engine returns zeros instead of refusing', async () => {
        // Node's WebCrypto throws on small-order keys, so the zero check is
        // reached only by an engine that returns the zeros; this stands in for one.
        const deriveBits = vi
            .spyOn(globalThis.crypto.subtle, 'deriveBits')
            .mockResolvedValueOnce(new ArrayBuffer(32));
        try {
            expect(await verifyReleaseIdentity(ALICE.identity)).toEqual({
                ok: false,
                problem: 'x25519_key',
            });
            expect(deriveBits).toHaveBeenCalledTimes(1);
        } finally {
            deriveBits.mockRestore();
        }
        expect((await verifyReleaseIdentity(ALICE.identity)).ok).toBe(true);
    });

    it('an ML-KEM key with a coefficient of q, even signed, as noble does', async () => {
        const key = fromB64(ALICE.identity.mlkem768Key);
        // First coefficient = byte 0 + low nibble of byte 1: 0xd01 = 3329 = q.
        key[0] = 0x01;
        key[1] = (key[1] & 0xf0) | 0x0d;
        expect(mlKem768EncapsulationKeyIsWellFormed(key)).toBe(false);
        await expect(mlKem768Provider.encapsulate(key)).rejects.toThrow(/modulus/);
        const identity = await resignedAlice({ mlkem768Key: b64(key) });
        expect(await verifyReleaseIdentity(identity)).toEqual({
            ok: false,
            problem: 'mlkem768_key',
        });
    });

    it('checks every coefficient but leaves the seed ρ alone', () => {
        const key = fromB64(ALICE.identity.mlkem768Key);
        expect(mlKem768EncapsulationKeyIsWellFormed(key)).toBe(true);
        const lastCoefficient = Uint8Array.from(key);
        // The last pair of coefficients sits in bytes 1149..1151; 0xfff > q.
        lastCoefficient[1151] = 0xff;
        lastCoefficient[1150] |= 0xf0;
        expect(mlKem768EncapsulationKeyIsWellFormed(lastCoefficient)).toBe(false);
        const seed = Uint8Array.from(key);
        seed.fill(0xff, 1152);
        expect(mlKem768EncapsulationKeyIsWellFormed(seed)).toBe(true);
    });
});

describe('key sets', () => {
    beforeEach(() => setKemProvider(mlKem768Provider));
    afterEach(() => setKemProvider(NULL_KEM_PROVIDER));

    it('creates a key set whose identity anyone can verify', async () => {
        const keySet = await createReleaseKeySet(
            ALICE.identity.accountId,
            new Date('2026-10-26T09:00:00Z')
        );
        const check = await verifyReleaseIdentity(keySet.identity, {
            accountId: ALICE.identity.accountId,
        });
        expect(check.ok && check.fingerprint).toBe(keySet.fingerprint);
        expect(keySet.createdAt).toBe('2026-10-26T09:00:00.000Z');
        expect(await checkReleaseKeySet(keySet)).toBeNull();
        expect(fromB64(keySet.mlkem768SecretKey)).toHaveLength(2400);
        expect(Object.keys(keySet.signingPrivateJwk).sort()).toEqual(['crv', 'd', 'kty', 'x']);
    });

    it('publishes only the public fields, whatever object it is given', async () => {
        const keySet = await createReleaseKeySet(ALICE.identity.accountId);
        const leaky = { ...keySet.identity, ...keySet } as unknown as ReleaseIdentity;
        const sent = JSON.stringify(publicReleaseIdentity(leaky));
        expect(Object.keys(JSON.parse(sent)).sort()).toEqual(
            ['accountId', 'mlkem768Key', 'signature', 'signingKey', 'v', 'x25519Key'].sort()
        );
        expect(sent).not.toContain(keySet.signingPrivateJwk.d);
        expect(sent).not.toContain(keySet.x25519PrivateJwk.d);
        expect(sent).not.toContain(keySet.mlkem768SecretKey.slice(0, 40));
    });

    it('refuses to make keys with the default KEM provider, which has none', async () => {
        setKemProvider(NULL_KEM_PROVIDER);
        await expect(createReleaseKeySet(ALICE.identity.accountId)).rejects.toThrow(
            /not configured/
        );
        expect(await checkReleaseKeySet(vectorKeySet(ALICE))).toBe('kem_provider');
    });

    it('refuses an account id that is not in the allowed form', async () => {
        await expect(createReleaseKeySet('@alice:blackout.example')).rejects.toThrow(/account id/);
    });

    it('finds private keys that are not the identity’s', async () => {
        const alice = vectorKeySet(ALICE);
        const bob = vectorKeySet(BOB);
        // Alice's key set with one field taken from Bob's.
        const swapped = (field: keyof ReleaseKeySet): ReleaseKeySet => ({
            ...alice,
            [field]: bob[field],
        });
        expect(await checkReleaseKeySet(swapped('signingPrivateJwk'))).toBe('signing_private_key');
        expect(
            await checkReleaseKeySet({
                ...alice,
                signingPrivateJwk: { ...bob.signingPrivateJwk, x: alice.signingPrivateJwk.x },
            })
        ).toBe('signing_private_key');
        expect(await checkReleaseKeySet(swapped('x25519PrivateJwk'))).toBe('x25519_private_key');
        expect(
            await checkReleaseKeySet({
                ...alice,
                x25519PrivateJwk: { ...bob.x25519PrivateJwk, x: alice.x25519PrivateJwk.x },
            })
        ).toBe('x25519_private_key');
        expect(await checkReleaseKeySet(swapped('mlkem768SecretKey'))).toBe('mlkem768_secret_key');
        // The right embedded public key, but the hash and the secret part are Bob's.
        const spliced = fromB64(bob.mlkem768SecretKey);
        spliced.set(fromB64(alice.identity.mlkem768Key), 1152);
        expect(await checkReleaseKeySet({ ...alice, mlkem768SecretKey: b64(spliced) })).toBe(
            'mlkem768_secret_key'
        );
        // Alice's public key, hash and z, so noble's own hash check passes, with
        // Bob's secret part: only the round trip shows it (implicit rejection
        // hands back a key that is not the encapsulated one).
        const secretPart = fromB64(alice.mlkem768SecretKey);
        secretPart.set(fromB64(bob.mlkem768SecretKey).subarray(0, 1152), 0);
        expect(await checkReleaseKeySet({ ...alice, mlkem768SecretKey: b64(secretPart) })).toBe(
            'mlkem768_secret_key'
        );
    });

    it('finds a wrong fingerprint, a changed identity and the wrong account', async () => {
        const alice = vectorKeySet(ALICE);
        expect(await checkReleaseKeySet({ ...alice, fingerprint: BOB.fingerprint })).toBe(
            'fingerprint'
        );
        expect(
            await checkReleaseKeySet({
                ...alice,
                identity: { ...alice.identity, signature: BOB.identity.signature },
            })
        ).toBe('identity');
        expect(await checkReleaseKeySet(alice, { accountId: BOB.identity.accountId })).toBe(
            'identity'
        );
        expect(await checkReleaseKeySet({ ...alice, createdAt: 'yesterday' })).toBe('shape');
        expect(await checkReleaseKeySet(null)).toBe('shape');
    });
});

describe('safety code', () => {
    it('matches the vector, halves and all', async () => {
        expect(await safetyCodeHalf(ALICE.fingerprint)).toBe(SAFETY_CODE_ALICE_BOB.aliceHalf);
        expect(await safetyCodeHalf(BOB.fingerprint)).toBe(SAFETY_CODE_ALICE_BOB.bobHalf);
        const code = await computeSafetyCode(ALICE.fingerprint, BOB.fingerprint);
        expect(code).toBe(SAFETY_CODE_ALICE_BOB.code);
        expect(formatSafetyCode(code)).toEqual(SAFETY_CODE_ALICE_BOB.groups);
    });

    it('computes a half as the record says, outside WebCrypto', () => {
        for (const [fingerprint, half] of [
            [ALICE.fingerprint, SAFETY_CODE_ALICE_BOB.aliceHalf],
            [BOB.fingerprint, SAFETY_CODE_ALICE_BOB.bobHalf],
        ]) {
            const digest = createHash('sha512')
                .update(Buffer.from('blackout-release-safety-code-v1', 'ascii'))
                .update(Buffer.from([0x00]))
                .update(Buffer.from(fingerprint, 'hex'))
                .digest();
            let digits = '';
            for (let chunk = 0; chunk < 6; chunk += 1) {
                const value = digest.readUIntBE(chunk * 5, 5);
                digits += String(value % 100000).padStart(5, '0');
            }
            expect(digits).toBe(half);
        }
    });

    it('is the same from both sides, and is 60 digits', async () => {
        const one = await computeSafetyCode(ALICE.fingerprint, BOB.fingerprint);
        const other = await computeSafetyCode(BOB.fingerprint, ALICE.fingerprint);
        expect(one).toBe(other);
        expect(one).toMatch(/^\d{60}$/);
    });

    it('changes when either identity does, and keeps the other half', async () => {
        setKemProvider(mlKem768Provider);
        try {
            const replaced = await createReleaseKeySet(ALICE.identity.accountId);
            const code = await computeSafetyCode(replaced.fingerprint, BOB.fingerprint);
            expect(code).not.toBe(SAFETY_CODE_ALICE_BOB.code);
            expect(code).toContain(SAFETY_CODE_ALICE_BOB.bobHalf);
            expect(code).not.toContain(SAFETY_CODE_ALICE_BOB.aliceHalf);
        } finally {
            setKemProvider(NULL_KEM_PROVIDER);
        }
    });

    it('refuses to compare an identity with itself, or a malformed fingerprint', async () => {
        await expect(computeSafetyCode(ALICE.fingerprint, ALICE.fingerprint)).rejects.toThrow(
            /itself/
        );
        await expect(
            computeSafetyCode(ALICE.fingerprint.toUpperCase(), BOB.fingerprint)
        ).rejects.toThrow(/hex/);
        await expect(
            computeSafetyCode(ALICE.fingerprint.slice(2), BOB.fingerprint)
        ).rejects.toThrow(/hex/);
        expect(() => formatSafetyCode('1234')).toThrow(/60 digits/);
    });
});
