/**
 * X25519 keypair generation + serialization via WebCrypto.
 *
 * Modern browsers (Chrome 124+, Firefox 130+, Safari 17+) and Node 22+ ship
 * X25519 in `crypto.subtle`. No third-party dependency required.
 */

import { fromBase64, toBase64 } from './encoding';

export type DeadDropKeyPair = {
    publicKeyBase64: string;
    privateKeyJwk: JsonWebKey;
};

const subtle = (): SubtleCrypto => {
    if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
        throw new Error('WebCrypto SubtleCrypto is not available');
    }
    return globalThis.crypto.subtle;
};

export const generateRecipientKeyPair = async (): Promise<DeadDropKeyPair> => {
    const pair = (await subtle().generateKey(
        { name: 'X25519' } as unknown as AlgorithmIdentifier,
        true,
        ['deriveBits']
    )) as CryptoKeyPair;
    const rawPub = new Uint8Array(await subtle().exportKey('raw', pair.publicKey));
    const jwk = await subtle().exportKey('jwk', pair.privateKey);
    return {
        publicKeyBase64: toBase64(rawPub),
        privateKeyJwk: jwk,
    };
};

export const importRecipientPublicKey = async (
    publicKeyBase64: string
): Promise<CryptoKey> => {
    const raw = fromBase64(publicKeyBase64);
    if (raw.length !== 32) {
        throw new Error(`X25519 public key must be 32 bytes, got ${raw.length}`);
    }
    return subtle().importKey(
        'raw',
        raw as unknown as BufferSource,
        { name: 'X25519' } as unknown as AlgorithmIdentifier,
        true,
        []
    );
};

export const importRecipientPrivateKey = async (
    jwk: JsonWebKey
): Promise<CryptoKey> =>
    subtle().importKey(
        'jwk',
        jwk,
        { name: 'X25519' } as unknown as AlgorithmIdentifier,
        false,
        ['deriveBits']
    );

export const generateEphemeralKeyPair = async (): Promise<{
    privateKey: CryptoKey;
    publicKeyBytes: Uint8Array;
}> => {
    const pair = (await subtle().generateKey(
        { name: 'X25519' } as unknown as AlgorithmIdentifier,
        true,
        ['deriveBits']
    )) as CryptoKeyPair;
    const raw = new Uint8Array(await subtle().exportKey('raw', pair.publicKey));
    return { privateKey: pair.privateKey, publicKeyBytes: raw };
};

export const deriveSharedSecret = async (
    privateKey: CryptoKey,
    peerPublicKey: CryptoKey
): Promise<Uint8Array> => {
    const bits = await subtle().deriveBits(
        { name: 'X25519', public: peerPublicKey } as unknown as AlgorithmIdentifier,
        privateKey,
        256
    );
    return new Uint8Array(bits);
};
