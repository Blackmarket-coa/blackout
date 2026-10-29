import {
    createCipheriv,
    createPrivateKey,
    createPublicKey,
    diffieHellman,
    hkdfSync,
} from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
    decryptDeadDrop,
    deriveHybridAeadKey,
    encryptDeadDrop,
    generateRecipientKeyPair,
    isOpaqueEnvelope,
    isOpaqueEnvelopeV1,
    isOpaqueEnvelopeV2,
    mlKem768Provider,
    NULL_KEM_PROVIDER,
    setKemProvider,
    getKemProvider,
    HybridSealError,
    hybridOpen,
    hybridSeal,
    hybridSealWith,
    PQ_HYBRID_INFO,
    SUPPORTED_SUITES,
    type DeadDropEnvelopeV1,
    type DeadDropEnvelopeV2,
    type KemProvider,
} from '@blackout/protocol';
import { ml_kem768 } from '../../../../../packages/blackout-protocol/node_modules/@noble/post-quantum/ml-kem.js';
import { BOB } from '../../../../../packages/blackout-protocol/src/release/testVectors';

const bytes = (...n: number[]): Uint8Array => Uint8Array.from(n);

describe('deriveHybridAeadKey', () => {
    it('produces a 32-byte AEAD key', async () => {
        const key = await deriveHybridAeadKey({
            ecSecret: bytes(1, 2, 3, 4),
            pqSecret: bytes(5, 6, 7, 8),
            ephemeralX25519Pub: bytes(9, 10, 11),
            pqCiphertext: bytes(12, 13, 14, 15),
        });
        expect(key.length).toBe(32);
    });

    it('is deterministic for fixed inputs (test vector)', async () => {
        const a = await deriveHybridAeadKey({
            ecSecret: bytes(1, 2, 3, 4),
            pqSecret: bytes(5, 6, 7, 8),
            ephemeralX25519Pub: bytes(9, 10, 11),
            pqCiphertext: bytes(12, 13, 14, 15),
        });
        const b = await deriveHybridAeadKey({
            ecSecret: bytes(1, 2, 3, 4),
            pqSecret: bytes(5, 6, 7, 8),
            ephemeralX25519Pub: bytes(9, 10, 11),
            pqCiphertext: bytes(12, 13, 14, 15),
        });
        expect(Array.from(a)).toEqual(Array.from(b));
    });

    it('changes when the EC secret changes', async () => {
        const a = await deriveHybridAeadKey({
            ecSecret: bytes(1, 2, 3, 4),
            pqSecret: bytes(5, 6, 7, 8),
            ephemeralX25519Pub: bytes(9, 10, 11),
            pqCiphertext: bytes(12, 13, 14, 15),
        });
        const b = await deriveHybridAeadKey({
            ecSecret: bytes(1, 2, 3, 5),
            pqSecret: bytes(5, 6, 7, 8),
            ephemeralX25519Pub: bytes(9, 10, 11),
            pqCiphertext: bytes(12, 13, 14, 15),
        });
        expect(Array.from(a)).not.toEqual(Array.from(b));
    });

    it('changes when the PQ secret changes', async () => {
        const a = await deriveHybridAeadKey({
            ecSecret: bytes(1, 2, 3, 4),
            pqSecret: bytes(5, 6, 7, 8),
            ephemeralX25519Pub: bytes(9, 10, 11),
            pqCiphertext: bytes(12, 13, 14, 15),
        });
        const b = await deriveHybridAeadKey({
            ecSecret: bytes(1, 2, 3, 4),
            pqSecret: bytes(99, 99, 99, 99),
            ephemeralX25519Pub: bytes(9, 10, 11),
            pqCiphertext: bytes(12, 13, 14, 15),
        });
        expect(Array.from(a)).not.toEqual(Array.from(b));
    });

    it('binds the EC public key into the salt', async () => {
        const a = await deriveHybridAeadKey({
            ecSecret: bytes(1, 2, 3, 4),
            pqSecret: bytes(5, 6, 7, 8),
            ephemeralX25519Pub: bytes(9, 10, 11),
            pqCiphertext: bytes(12, 13, 14, 15),
        });
        const b = await deriveHybridAeadKey({
            ecSecret: bytes(1, 2, 3, 4),
            pqSecret: bytes(5, 6, 7, 8),
            ephemeralX25519Pub: bytes(0, 0, 0),
            pqCiphertext: bytes(12, 13, 14, 15),
        });
        expect(Array.from(a)).not.toEqual(Array.from(b));
    });

    it('binds the PQ ciphertext into the salt', async () => {
        const a = await deriveHybridAeadKey({
            ecSecret: bytes(1, 2, 3, 4),
            pqSecret: bytes(5, 6, 7, 8),
            ephemeralX25519Pub: bytes(9, 10, 11),
            pqCiphertext: bytes(12, 13, 14, 15),
        });
        const b = await deriveHybridAeadKey({
            ecSecret: bytes(1, 2, 3, 4),
            pqSecret: bytes(5, 6, 7, 8),
            ephemeralX25519Pub: bytes(9, 10, 11),
            pqCiphertext: bytes(0, 0, 0, 0),
        });
        expect(Array.from(a)).not.toEqual(Array.from(b));
    });

    it('mixes in the optional transcript', async () => {
        const base = {
            ecSecret: bytes(1, 2, 3, 4),
            pqSecret: bytes(5, 6, 7, 8),
            ephemeralX25519Pub: bytes(9, 10, 11),
            pqCiphertext: bytes(12, 13, 14, 15),
        };
        const a = await deriveHybridAeadKey(base);
        const b = await deriveHybridAeadKey({ ...base, transcript: bytes(0xaa, 0xbb) });
        expect(Array.from(a)).not.toEqual(Array.from(b));
    });

    it('rejects empty secrets', async () => {
        await expect(
            deriveHybridAeadKey({
                ecSecret: new Uint8Array(),
                pqSecret: bytes(1),
                ephemeralX25519Pub: bytes(2),
                pqCiphertext: bytes(3),
            })
        ).rejects.toThrow(/ecSecret/);
        await expect(
            deriveHybridAeadKey({
                ecSecret: bytes(1),
                pqSecret: new Uint8Array(),
                ephemeralX25519Pub: bytes(2),
                pqCiphertext: bytes(3),
            })
        ).rejects.toThrow(/pqSecret/);
    });

    it('uses the published HPKE-style info string', () => {
        expect(new TextDecoder().decode(PQ_HYBRID_INFO)).toBe('blackout-deaddrop-v2-hybrid');
    });
});

describe('NULL_KEM_PROVIDER (default)', () => {
    it('refuses every operation so we never ship a zero-strength KEM', async () => {
        await expect(NULL_KEM_PROVIDER.generateKeyPair()).rejects.toThrow(/not configured/);
        await expect(NULL_KEM_PROVIDER.encapsulate(new Uint8Array(1184))).rejects.toThrow(
            /not configured/
        );
        await expect(
            NULL_KEM_PROVIDER.decapsulate(new Uint8Array(1088), new Uint8Array(2400))
        ).rejects.toThrow(/not configured/);
    });

    it('exposes the ML-KEM-768 size constants', () => {
        expect(NULL_KEM_PROVIDER.publicKeyLength).toBe(1184);
        expect(NULL_KEM_PROVIDER.secretKeyLength).toBe(2400);
        expect(NULL_KEM_PROVIDER.ciphertextLength).toBe(1088);
        expect(NULL_KEM_PROVIDER.sharedSecretLength).toBe(32);
    });

    it('setKemProvider injects a provider reachable via getKemProvider', () => {
        const stub: KemProvider = {
            ...NULL_KEM_PROVIDER,
            generateKeyPair: async () => ({
                publicKey: new Uint8Array(1184),
                secretKey: new Uint8Array(2400),
            }),
        };
        try {
            setKemProvider(stub);
            expect(getKemProvider()).toBe(stub);
        } finally {
            setKemProvider(NULL_KEM_PROVIDER);
        }
    });
});

describe('envelope shape (v1 ↔ v2)', () => {
    const v1: DeadDropEnvelopeV1 = {
        v: 1,
        suite: 'sealedbox-x25519-aes256gcm-v1',
        pad: 'minimal',
        dropId: 'd1',
        clue: 'AAAA',
        ek: 'BBBB',
        nonce: 'CCCC',
        ct: 'DDDD',
        expiresAt: '2027-01-01T00:00:00.000Z',
    };
    const v2: DeadDropEnvelopeV2 = {
        v: 2,
        suite: 'sealedbox-x25519-mlkem768-aes256gcm-v2',
        pad: 'bucket',
        dropId: 'd2',
        clue: 'AAAA',
        ek: 'BBBB',
        pqCt: 'EEEE',
        nonce: 'CCCC',
        ct: 'DDDD',
        expiresAt: '2027-01-01T00:00:00.000Z',
    };

    it('SUPPORTED_SUITES advertises both v1 and v2', () => {
        expect(SUPPORTED_SUITES).toContain('sealedbox-x25519-aes256gcm-v1');
        expect(SUPPORTED_SUITES).toContain('sealedbox-x25519-mlkem768-aes256gcm-v2');
    });

    it('isOpaqueEnvelopeV1 accepts v1 and rejects v2', () => {
        expect(isOpaqueEnvelopeV1(v1)).toBe(true);
        expect(isOpaqueEnvelopeV1(v2)).toBe(false);
    });

    it('isOpaqueEnvelopeV2 accepts v2 and rejects v1', () => {
        expect(isOpaqueEnvelopeV2(v2)).toBe(true);
        expect(isOpaqueEnvelopeV2(v1)).toBe(false);
    });

    it('isOpaqueEnvelope accepts both v1 and v2', () => {
        expect(isOpaqueEnvelope(v1)).toBe(true);
        expect(isOpaqueEnvelope(v2)).toBe(true);
    });

    it('rejects v2 envelopes that try to smuggle extra fields', () => {
        expect(isOpaqueEnvelopeV2({ ...v2, sender: '@alice:server' })).toBe(false);
    });

    it('rejects v2 envelopes that omit the PQ ciphertext leg', () => {
        const broken: Record<string, unknown> = { ...v2 };
        delete broken.pqCt;
        expect(isOpaqueEnvelopeV2(broken)).toBe(false);
    });

    it('rejects v2 envelopes with the wrong suite tag', () => {
        expect(
            isOpaqueEnvelopeV2({
                ...v2,
                suite: 'sealedbox-x25519-aes256gcm-v1',
            } as unknown)
        ).toBe(false);
    });
});

describe('mlKem768Provider (FIPS 203 ML-KEM-768)', () => {
    it('exports the FIPS 203 Table 3 sizes', () => {
        expect(mlKem768Provider.publicKeyLength).toBe(1184);
        expect(mlKem768Provider.secretKeyLength).toBe(2400);
        expect(mlKem768Provider.ciphertextLength).toBe(1088);
        expect(mlKem768Provider.sharedSecretLength).toBe(32);
    });

    it('generates keypairs with the published byte lengths', async () => {
        const { publicKey, secretKey } = await mlKem768Provider.generateKeyPair();
        expect(publicKey.length).toBe(mlKem768Provider.publicKeyLength);
        expect(secretKey.length).toBe(mlKem768Provider.secretKeyLength);
    });

    it('encapsulate / decapsulate round-trips a 32-byte shared secret', async () => {
        const { publicKey, secretKey } = await mlKem768Provider.generateKeyPair();
        const enc = await mlKem768Provider.encapsulate(publicKey);
        expect(enc.ciphertext.length).toBe(mlKem768Provider.ciphertextLength);
        expect(enc.sharedSecret.length).toBe(mlKem768Provider.sharedSecretLength);
        const recovered = await mlKem768Provider.decapsulate(enc.ciphertext, secretKey);
        expect(Array.from(recovered)).toEqual(Array.from(enc.sharedSecret));
    });

    it('decapsulate produces an implicit-rejection secret for a tampered ciphertext', async () => {
        // ML-KEM is IND-CCA2: a tampered ciphertext does not raise — it
        // returns a deterministic pseudo-random secret derived from the
        // ciphertext + secret key (FIPS 203 §7.3, "implicit rejection").
        // The recovered secret must NOT equal the original shared secret.
        const { publicKey, secretKey } = await mlKem768Provider.generateKeyPair();
        const enc = await mlKem768Provider.encapsulate(publicKey);
        const tampered = new Uint8Array(enc.ciphertext);
        tampered[0] ^= 0xff;
        const recovered = await mlKem768Provider.decapsulate(tampered, secretKey);
        expect(recovered.length).toBe(mlKem768Provider.sharedSecretLength);
        expect(Array.from(recovered)).not.toEqual(Array.from(enc.sharedSecret));
    });

    it('encapsulate rejects a wrong-length recipient public key', async () => {
        await expect(mlKem768Provider.encapsulate(new Uint8Array(100))).rejects.toThrow(
            /publicKey/
        );
    });

    it('decapsulate rejects wrong-length ciphertext or secret key', async () => {
        const { secretKey } = await mlKem768Provider.generateKeyPair();
        await expect(mlKem768Provider.decapsulate(new Uint8Array(10), secretKey)).rejects.toThrow(
            /ciphertext/
        );
        await expect(
            mlKem768Provider.decapsulate(new Uint8Array(1088), new Uint8Array(10))
        ).rejects.toThrow(/secretKey/);
    });
});

describe('encryptDeadDrop / decryptDeadDrop with v2 hybrid envelope', () => {
    const ENC = new TextEncoder();
    const DEC = new TextDecoder();

    it('round-trips a plaintext through v2 (X25519 + ML-KEM-768) hybrid', async () => {
        setKemProvider(mlKem768Provider);
        try {
            const ec = await generateRecipientKeyPair();
            const pq = await mlKem768Provider.generateKeyPair();
            const plaintext = ENC.encode('classified — drop at the broken arcade @ 23:00');

            const envelope = await encryptDeadDrop({
                plaintext,
                recipientPublicKeyBase64: ec.publicKeyBase64,
                paddingStrategy: 'minimal',
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
                suite: 'sealedbox-x25519-mlkem768-aes256gcm-v2',
                recipientPqPublicKey: pq.publicKey,
            });

            expect(isOpaqueEnvelopeV2(envelope)).toBe(true);
            expect(envelope.v).toBe(2);
            expect(envelope.suite).toBe('sealedbox-x25519-mlkem768-aes256gcm-v2');

            const recovered = await decryptDeadDrop({
                envelope,
                recipientPrivateKeyJwk: ec.privateKeyJwk,
                recipientPqSecretKey: pq.secretKey,
            });
            expect(DEC.decode(recovered)).toBe('classified — drop at the broken arcade @ 23:00');
        } finally {
            setKemProvider(NULL_KEM_PROVIDER);
        }
    });

    it('v2 envelope decryption fails if the PQ secret is wrong (hybrid binding)', async () => {
        setKemProvider(mlKem768Provider);
        try {
            const ec = await generateRecipientKeyPair();
            const pq = await mlKem768Provider.generateKeyPair();
            const wrong = await mlKem768Provider.generateKeyPair();
            const envelope = await encryptDeadDrop({
                plaintext: ENC.encode('zzz'),
                recipientPublicKeyBase64: ec.publicKeyBase64,
                paddingStrategy: 'minimal',
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
                suite: 'sealedbox-x25519-mlkem768-aes256gcm-v2',
                recipientPqPublicKey: pq.publicKey,
            });
            await expect(
                decryptDeadDrop({
                    envelope,
                    recipientPrivateKeyJwk: ec.privateKeyJwk,
                    recipientPqSecretKey: wrong.secretKey,
                })
            ).rejects.toBeDefined();
        } finally {
            setKemProvider(NULL_KEM_PROVIDER);
        }
    });

    it('v2 encrypt rejects a missing PQ public key', async () => {
        setKemProvider(mlKem768Provider);
        try {
            const ec = await generateRecipientKeyPair();
            await expect(
                encryptDeadDrop({
                    plaintext: ENC.encode('x'),
                    recipientPublicKeyBase64: ec.publicKeyBase64,
                    paddingStrategy: 'minimal',
                    expiresAt: new Date(Date.now() + 60_000).toISOString(),
                    // @ts-expect-error — overload requires recipientPqPublicKey, runtime check too
                    suite: 'sealedbox-x25519-mlkem768-aes256gcm-v2',
                })
            ).rejects.toThrow(/recipientPqPublicKey/);
        } finally {
            setKemProvider(NULL_KEM_PROVIDER);
        }
    });

    it('v2 decrypt rejects a missing PQ secret key', async () => {
        setKemProvider(mlKem768Provider);
        try {
            const ec = await generateRecipientKeyPair();
            const pq = await mlKem768Provider.generateKeyPair();
            const envelope = await encryptDeadDrop({
                plaintext: ENC.encode('x'),
                recipientPublicKeyBase64: ec.publicKeyBase64,
                paddingStrategy: 'minimal',
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
                suite: 'sealedbox-x25519-mlkem768-aes256gcm-v2',
                recipientPqPublicKey: pq.publicKey,
            });
            await expect(
                decryptDeadDrop({
                    envelope,
                    recipientPrivateKeyJwk: ec.privateKeyJwk,
                })
            ).rejects.toThrow(/recipientPqSecretKey/);
        } finally {
            setKemProvider(NULL_KEM_PROVIDER);
        }
    });

    it('default (no suite) still produces a v1 envelope and does not need PQ keys', async () => {
        const ec = await generateRecipientKeyPair();
        const envelope = await encryptDeadDrop({
            plaintext: ENC.encode('legacy'),
            recipientPublicKeyBase64: ec.publicKeyBase64,
            paddingStrategy: 'minimal',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
        expect(envelope.v).toBe(1);
        expect(envelope.suite).toBe('sealedbox-x25519-aes256gcm-v1');
        const recovered = await decryptDeadDrop({
            envelope,
            recipientPrivateKeyJwk: ec.privateKeyJwk,
        });
        expect(DEC.decode(recovered)).toBe('legacy');
    });
});

describe('one hybrid sealing function for dead drops and release copies (hybridSeal.ts)', () => {
    // Fixed, synthetic inputs: an ephemeral X25519 scalar, an ML-KEM-768
    // encapsulation seed and a nonce, all byte ranges; the recipient is the
    // release-identity vectors' Bob. Every expected value is rebuilt here
    // with node:crypto (and noble's ML-KEM, the only one in the tree).
    const scalar = Uint8Array.from({ length: 32 }, (_, i) => 0x21 + i);
    const seed = Uint8Array.from({ length: 32 }, (_, i) => 0x61 + i);
    const nonce = Uint8Array.from({ length: 12 }, (_, i) => 0xa1 + i);
    const plaintext = new Uint8Array(40).fill(7);
    const pkcs8X25519 = (key: Uint8Array) =>
        Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), Buffer.from(key)]);
    const fromB64 = (value: string) => Uint8Array.from(Buffer.from(value, 'base64'));

    const fixed = async () => {
        const privateKey = await globalThis.crypto.subtle.importKey(
            'pkcs8',
            pkcs8X25519(scalar),
            { name: 'X25519' },
            true,
            ['deriveBits']
        );
        const jwk = await globalThis.crypto.subtle.exportKey('jwk', privateKey);
        const publicKeyBytes = Uint8Array.from(Buffer.from(jwk.x as string, 'base64url'));
        const encapsulation = ml_kem768.encapsulate(fromB64(BOB.identity.mlkem768Key), seed);
        return {
            randomness: {
                ephemeral: { privateKey, publicKeyBytes },
                encapsulation: {
                    ciphertext: encapsulation.cipherText,
                    sharedSecret: encapsulation.sharedSecret,
                },
                nonce,
            },
            recipient: await globalThis.crypto.subtle.importKey(
                'raw',
                fromB64(BOB.identity.x25519Key),
                { name: 'X25519' },
                true,
                []
            ),
        };
    };

    // ssX, then HKDF(ssX ‖ ssM, salt = ephemeral ‖ ML-KEM ciphertext,
    // info = "blackout-deaddrop-v2-hybrid" ‖ transcript), then AES-256-GCM.
    const byHand = (transcript: Uint8Array, kemCiphertext: Uint8Array, kemSecret: Uint8Array) => {
        const ephemeral = createPrivateKey({
            key: pkcs8X25519(scalar),
            format: 'der',
            type: 'pkcs8',
        });
        const ephemeralPublic = Buffer.from(
            createPublicKey(ephemeral).export({ format: 'jwk' }).x as string,
            'base64url'
        );
        const ssX = diffieHellman({
            privateKey: ephemeral,
            publicKey: createPublicKey({
                key: Buffer.concat([
                    Buffer.from('302a300506032b656e032100', 'hex'),
                    Buffer.from(fromB64(BOB.identity.x25519Key)),
                ]),
                format: 'der',
                type: 'spki',
            }),
        });
        const key = Buffer.from(
            hkdfSync(
                'sha256',
                Buffer.concat([ssX, Buffer.from(kemSecret)]),
                Buffer.concat([ephemeralPublic, Buffer.from(kemCiphertext)]),
                Buffer.concat([Buffer.from('blackout-deaddrop-v2-hybrid', 'ascii'), transcript]),
                32
            )
        );
        const cipher = createCipheriv('aes-256-gcm', key, Buffer.from(nonce));
        return Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
    };

    it('with no transcript, seals exactly as dead-drop v2 always derived it', async () => {
        const { randomness, recipient } = await fixed();
        // The seal clears the shared secret it was given (best effort), so
        // the rebuild takes its own copy first.
        const kemSecret = Uint8Array.from(randomness.encapsulation.sharedSecret);
        const sealed = await hybridSealWith(
            { plaintext, recipientX25519PublicKey: recipient },
            randomness
        );
        expect(randomness.encapsulation.sharedSecret.every((byte) => byte === 0)).toBe(true);
        const expected = byHand(new Uint8Array(0), randomness.encapsulation.ciphertext, kemSecret);
        expect(Buffer.from(sealed.ciphertext).equals(expected)).toBe(true);
        expect(Array.from(sealed.ephemeralPublicKey)).toEqual(
            Array.from(randomness.ephemeral.publicKeyBytes)
        );
        expect(Array.from(sealed.kemCiphertext)).toEqual(
            Array.from(randomness.encapsulation.ciphertext)
        );
    });

    it('with a transcript, appends it to the info, and only then', async () => {
        const { randomness, recipient } = await fixed();
        const kemSecret = Uint8Array.from(randomness.encapsulation.sharedSecret);
        const transcript = Uint8Array.from([1, 2, 3, 4]);
        const sealed = await hybridSealWith(
            { plaintext, recipientX25519PublicKey: recipient, transcript },
            randomness
        );
        expect(
            Buffer.from(sealed.ciphertext).equals(
                byHand(transcript, randomness.encapsulation.ciphertext, kemSecret)
            )
        ).toBe(true);
    });

    it('opens with the recipient’s keys and the same transcript, and with nothing else', async () => {
        setKemProvider(mlKem768Provider);
        try {
            const transcript = Uint8Array.from([9, 9]);
            const sealed = await hybridSeal({
                plaintext,
                recipientX25519PublicKeyBase64: BOB.identity.x25519Key,
                recipientPqPublicKey: fromB64(BOB.identity.mlkem768Key),
                transcript,
            });
            const privateKey = await globalThis.crypto.subtle.importKey(
                'jwk',
                BOB.x25519PrivateJwk,
                { name: 'X25519' },
                false,
                ['deriveBits']
            );
            const open = (with_: Uint8Array | undefined) =>
                hybridOpen({
                    sealed,
                    recipientPrivateKey: privateKey,
                    recipientPqSecretKey: fromB64(BOB.mlkem768SecretKey),
                    transcript: with_,
                });
            expect(Array.from(await open(transcript))).toEqual(Array.from(plaintext));
            await expect(open(undefined)).rejects.toThrow();
            await expect(open(Uint8Array.from([9, 8]))).rejects.toThrow();
        } finally {
            setKemProvider(NULL_KEM_PROVIDER);
        }
    });

    it('refuses an all-zero X25519 output when sealing, where an engine returns zeros', async () => {
        // Node's WebCrypto throws on small-order keys, so the zero check is
        // reached only by an engine that returns zeros; this stands in for one.
        const { randomness, recipient } = await fixed();
        const deriveBits = vi
            .spyOn(globalThis.crypto.subtle, 'deriveBits')
            .mockResolvedValueOnce(new ArrayBuffer(32));
        try {
            await expect(
                hybridSealWith({ plaintext, recipientX25519PublicKey: recipient }, randomness)
            ).rejects.toBeInstanceOf(HybridSealError);
        } finally {
            deriveBits.mockRestore();
        }
    });

    it('refuses an all-zero X25519 output when opening, a dead drop included', async () => {
        setKemProvider(mlKem768Provider);
        try {
            const envelope = await encryptDeadDrop({
                plaintext,
                recipientPublicKeyBase64: BOB.identity.x25519Key,
                paddingStrategy: 'minimal',
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
                suite: 'sealedbox-x25519-mlkem768-aes256gcm-v2',
                recipientPqPublicKey: fromB64(BOB.identity.mlkem768Key),
            });
            const open = () =>
                decryptDeadDrop({
                    envelope,
                    recipientPrivateKeyJwk: BOB.x25519PrivateJwk,
                    recipientPqSecretKey: fromB64(BOB.mlkem768SecretKey),
                });
            expect(Array.from(await open())).toEqual(Array.from(plaintext));
            const deriveBits = vi
                .spyOn(globalThis.crypto.subtle, 'deriveBits')
                .mockResolvedValueOnce(new ArrayBuffer(32));
            try {
                await expect(open()).rejects.toMatchObject({ code: 'zero_shared_secret' });
            } finally {
                deriveBits.mockRestore();
            }
        } finally {
            setKemProvider(NULL_KEM_PROVIDER);
        }
    });

    it('refuses a nonce that is not 12 bytes', async () => {
        const { randomness, recipient } = await fixed();
        await expect(
            hybridSealWith(
                { plaintext, recipientX25519PublicKey: recipient },
                { ...randomness, nonce: new Uint8Array(8) }
            )
        ).rejects.toThrow(/nonce must be 12 bytes/);
    });
});
