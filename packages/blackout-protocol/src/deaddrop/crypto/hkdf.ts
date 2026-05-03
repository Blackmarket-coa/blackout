/**
 * HKDF-SHA-256 wrapper around WebCrypto.
 * Used for deriving the AEAD key from the X25519 shared secret, and for
 * deriving deterministic decoy seeds.
 */

const subtle = (): SubtleCrypto => {
    if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
        throw new Error('WebCrypto SubtleCrypto is not available');
    }
    return globalThis.crypto.subtle;
};

// TS 5.7+ tightened `BufferSource` to `ArrayBufferView<ArrayBuffer>`,
// which `Uint8Array<ArrayBufferLike>` no longer satisfies. We reuse one
// small helper rather than scattering casts.
const asBufferSource = (bytes: Uint8Array): BufferSource => bytes as unknown as BufferSource;

export const hkdfSha256 = async (
    ikm: Uint8Array,
    salt: Uint8Array,
    info: Uint8Array,
    length: number
): Promise<Uint8Array> => {
    const baseKey = await subtle().importKey(
        'raw',
        asBufferSource(ikm),
        { name: 'HKDF' } as unknown as AlgorithmIdentifier,
        false,
        ['deriveBits']
    );
    const bits = await subtle().deriveBits(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: asBufferSource(salt),
            info: asBufferSource(info),
        } as unknown as AlgorithmIdentifier,
        baseKey,
        length * 8
    );
    return new Uint8Array(bits);
};

export const importAesGcmKey = async (rawKey: Uint8Array): Promise<CryptoKey> =>
    subtle().importKey(
        'raw',
        asBufferSource(rawKey),
        { name: 'AES-GCM' } as unknown as AlgorithmIdentifier,
        false,
        ['encrypt', 'decrypt']
    );
