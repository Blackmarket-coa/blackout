import { describe, expect, it } from 'vitest';
import {
    DEAD_DROP_PADDING_BUCKETS,
    decryptDeadDrop,
    encryptDeadDrop,
    generateRecipientKeyPair,
    isOpaqueEnvelope,
    splitDeadDropSecret,
    combineDeadDropShares,
    type DeadDropEnvelopeV1,
} from '@blackout/protocol';

const ENC = new TextEncoder();
const DEC = new TextDecoder();

describe('@blackout/protocol dead-drop crypto core', () => {
    it('round-trips a plaintext through encrypt/decrypt with minimal padding', async () => {
        const recipient = await generateRecipientKeyPair();
        const plaintext = ENC.encode('rendezvous behind the broken arcade at 23:00');

        const envelope = await encryptDeadDrop({
            plaintext,
            recipientPublicKeyBase64: recipient.publicKeyBase64,
            paddingStrategy: 'minimal',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });

        expect(isOpaqueEnvelope(envelope)).toBe(true);
        expect(envelope.v).toBe(1);
        expect(envelope.suite).toBe('sealedbox-x25519-aes256gcm-v1');
        expect(envelope.pad).toBe('minimal');

        const recovered = await decryptDeadDrop({
            envelope,
            recipientPrivateKeyJwk: recipient.privateKeyJwk,
        });
        expect(DEC.decode(recovered)).toBe('rendezvous behind the broken arcade at 23:00');
    });

    it('round-trips with bucket padding and pads to a published bucket size', async () => {
        const recipient = await generateRecipientKeyPair();
        const plaintext = ENC.encode('hello world');

        const envelope = await encryptDeadDrop({
            plaintext,
            recipientPublicKeyBase64: recipient.publicKeyBase64,
            paddingStrategy: 'bucket',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });

        // ciphertext (base64-decoded) length should be (bucket + 16-byte tag).
        const padding = envelope.ct.endsWith('==') ? 2 : envelope.ct.endsWith('=') ? 1 : 0;
        const ctBytes = (envelope.ct.length / 4) * 3 - padding;
        const cleartextEquivalent = ctBytes - 16;
        expect(DEAD_DROP_PADDING_BUCKETS.includes(cleartextEquivalent)).toBe(true);

        const recovered = await decryptDeadDrop({
            envelope,
            recipientPrivateKeyJwk: recipient.privateKeyJwk,
        });
        expect(DEC.decode(recovered)).toBe('hello world');
    });

    it('two bucket-padded drops with different plaintexts of the same bucket have identical ciphertext byte length', async () => {
        const recipient = await generateRecipientKeyPair();
        const expiresAt = new Date(Date.now() + 60_000).toISOString();
        const a = await encryptDeadDrop({
            plaintext: ENC.encode('A'),
            recipientPublicKeyBase64: recipient.publicKeyBase64,
            paddingStrategy: 'bucket',
            expiresAt,
        });
        const b = await encryptDeadDrop({
            plaintext: ENC.encode('a much longer message that still fits in the smallest bucket'),
            recipientPublicKeyBase64: recipient.publicKeyBase64,
            paddingStrategy: 'bucket',
            expiresAt,
        });
        expect(a.ct.length).toBe(b.ct.length);
        expect(a.ek.length).toBe(b.ek.length);
        expect(a.nonce.length).toBe(b.nonce.length);
        expect(a.clue.length).toBe(b.clue.length);
    });

    it('isOpaqueEnvelope rejects envelopes with extra fields (anti-cleartext-leak)', () => {
        const ok: DeadDropEnvelopeV1 = {
            v: 1,
            suite: 'sealedbox-x25519-aes256gcm-v1',
            pad: 'minimal',
            dropId: 'abc',
            clue: 'AAAA',
            ek: 'BBBB',
            nonce: 'CCCC',
            ct: 'DDDD',
            expiresAt: '2030-01-01T00:00:00.000Z',
        };
        expect(isOpaqueEnvelope(ok)).toBe(true);
        expect(isOpaqueEnvelope({ ...ok, sender: '@me:srv' })).toBe(false);
        expect(isOpaqueEnvelope({ ...ok, recipient: '@you:srv' })).toBe(false);
        expect(isOpaqueEnvelope({ ...ok, plaintext: 'oops' })).toBe(false);
        expect(isOpaqueEnvelope({ ...ok, v: 2 })).toBe(false);
        expect(isOpaqueEnvelope({ ...ok, suite: 'made-up-suite' })).toBe(false);
    });

    it('decryption fails for a tampered ciphertext', async () => {
        const recipient = await generateRecipientKeyPair();
        const envelope = await encryptDeadDrop({
            plaintext: ENC.encode('classified'),
            recipientPublicKeyBase64: recipient.publicKeyBase64,
            paddingStrategy: 'minimal',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
        const tampered: DeadDropEnvelopeV1 = {
            ...envelope,
            ct: envelope.ct.slice(0, -4) + (envelope.ct.endsWith('A==') ? 'B==' : 'AAAA'),
        };
        await expect(
            decryptDeadDrop({
                envelope: tampered,
                recipientPrivateKeyJwk: recipient.privateKeyJwk,
            })
        ).rejects.toBeDefined();
    });
});

describe('@blackout/protocol Shamir SSS (k-of-n quorum)', () => {
    it('reconstructs the secret from any k of n shares', () => {
        const secret = new Uint8Array(32);
        for (let i = 0; i < 32; i += 1) secret[i] = (i * 7 + 3) & 0xff;

        const shares = splitDeadDropSecret(secret, 3, 5);
        expect(shares).toHaveLength(5);

        const trySubset = (indices: number[]) =>
            combineDeadDropShares(indices.map((i) => shares[i]));

        expect(Array.from(trySubset([0, 1, 2]))).toEqual(Array.from(secret));
        expect(Array.from(trySubset([0, 2, 4]))).toEqual(Array.from(secret));
        expect(Array.from(trySubset([1, 3, 4]))).toEqual(Array.from(secret));
        expect(Array.from(trySubset([0, 1, 2, 3, 4]))).toEqual(Array.from(secret));
    });

    it('cannot reconstruct from fewer than k shares (returns wrong bytes, never the secret)', () => {
        const secret = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0xca, 0xfe, 0xba, 0xbe]);
        const shares = splitDeadDropSecret(secret, 3, 5);
        const guess = combineDeadDropShares([shares[0], shares[1]]);
        expect(Array.from(guess)).not.toEqual(Array.from(secret));
    });

    it('rejects malformed split inputs', () => {
        expect(() => splitDeadDropSecret(new Uint8Array(8), 1, 3)).toThrow();
        expect(() => splitDeadDropSecret(new Uint8Array(8), 4, 3)).toThrow();
        expect(() => splitDeadDropSecret(new Uint8Array(0), 2, 3)).toThrow();
    });

    it('rejects combine with duplicate share x-values', () => {
        const shares = splitDeadDropSecret(new Uint8Array([1, 2, 3]), 2, 3);
        expect(() => combineDeadDropShares([shares[0], shares[0]])).toThrow();
    });
});
