import { describe, expect, it } from 'vitest';
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
    PQ_HYBRID_INFO,
    SUPPORTED_SUITES,
    type DeadDropEnvelopeV1,
    type DeadDropEnvelopeV2,
    type KemProvider,
} from '@blackout/protocol';

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
            }),
        ).rejects.toThrow(/ecSecret/);
        await expect(
            deriveHybridAeadKey({
                ecSecret: bytes(1),
                pqSecret: new Uint8Array(),
                ephemeralX25519Pub: bytes(2),
                pqCiphertext: bytes(3),
            }),
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
            /not configured/,
        );
        await expect(
            NULL_KEM_PROVIDER.decapsulate(new Uint8Array(1088), new Uint8Array(2400)),
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
            } as unknown),
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
            /publicKey/,
        );
    });

    it('decapsulate rejects wrong-length ciphertext or secret key', async () => {
        const { secretKey } = await mlKem768Provider.generateKeyPair();
        await expect(
            mlKem768Provider.decapsulate(new Uint8Array(10), secretKey),
        ).rejects.toThrow(/ciphertext/);
        await expect(
            mlKem768Provider.decapsulate(new Uint8Array(1088), new Uint8Array(10)),
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
                }),
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
                }),
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
                }),
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
