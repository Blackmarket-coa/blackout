// @vitest-environment jsdom
//
// Opening an encrypted attachment. Real cipher throughout: the ciphertext is
// produced by the same library a sender uses.
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptAttachment } from 'browser-encrypt-attachment';
import { mediaClient } from '../../../../src/app/sdk/client';
import {
    ENCRYPTED_AUTO_LOAD_MAX_BYTES,
    EncryptedMediaDecryptError,
    EncryptedMediaMismatchError,
    OPAQUE_BLOB_TYPE,
    fetchDecryptedMedia,
    hasEncryptedFileField,
    inlineBlobType,
    readEncryptedFile,
} from '../../../../src/app/features/media/utils/encryptedMedia';

const readBlob = (blob: Blob): Promise<Uint8Array> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
    });

const PLAINTEXT = 'the photographs from the march';

const encrypted = async () => {
    const result = await encryptAttachment(new TextEncoder().encode(PLAINTEXT).buffer);
    return {
        ciphertext: result.data,
        file: { ...result.info, url: 'mxc://hs.example/abc123' },
    };
};

describe('inlineBlobType', () => {
    it('keeps raster image, audio and video types from the allow-list', () => {
        expect(inlineBlobType('image/png')).toBe('image/png');
        expect(inlineBlobType('image/jpeg')).toBe('image/jpeg');
        expect(inlineBlobType('audio/ogg')).toBe('audio/ogg');
        expect(inlineBlobType('video/webm')).toBe('video/webm');
    });

    it('ignores parameters, case and padding around the type', () => {
        expect(inlineBlobType('audio/webm;codecs=opus')).toBe('audio/webm');
        expect(inlineBlobType(' IMAGE/PNG ; q=1')).toBe('image/png');
    });

    it('tells Chromium a QuickTime file is MP4', () => {
        expect(inlineBlobType('video/quicktime')).toBe('video/mp4');
    });

    it.each([
        'text/html',
        'application/xhtml+xml',
        'image/svg+xml',
        'application/xml',
        'text/xml',
        'text/javascript',
        'application/javascript',
        'application/pdf',
        'text/plain',
        'text/css',
        'image/png, text/html',
        '',
    ])('gives %j the opaque type, so a browser cannot render it as a document', (declared) => {
        expect(inlineBlobType(declared)).toBe(OPAQUE_BLOB_TYPE);
    });

    it('gives a missing or non-string type the opaque type', () => {
        expect(inlineBlobType(undefined)).toBe(OPAQUE_BLOB_TYPE);
        expect(inlineBlobType(null)).toBe(OPAQUE_BLOB_TYPE);
        expect(inlineBlobType({ toString: () => 'image/png' })).toBe(OPAQUE_BLOB_TYPE);
    });
});

describe('readEncryptedFile', () => {
    const file = {
        url: 'mxc://hs.example/abc123',
        v: 'v2',
        key: { alg: 'A256CTR', key_ops: ['encrypt', 'decrypt'], kty: 'oct', k: 'a2V5', ext: true },
        iv: 'aXY',
        hashes: { sha256: 'aGFzaA' },
    };

    it('returns the reference when the URL, key, IV and hash are all there', () => {
        expect(readEncryptedFile({ file })).toBe(file);
    });

    it('returns null when the message has no `file`', () => {
        expect(readEncryptedFile({ url: 'mxc://hs.example/plain' })).toBeNull();
        expect(hasEncryptedFileField({ url: 'mxc://hs.example/plain' })).toBe(false);
    });

    it.each([
        ['a URL that is not mxc://', { ...file, url: 'https://evil.example/x' }],
        ['no URL', { ...file, url: undefined }],
        ['no key', { ...file, key: undefined }],
        ['a key without key material', { ...file, key: { alg: 'A256CTR' } }],
        ['no IV', { ...file, iv: undefined }],
        ['no hashes', { ...file, hashes: undefined }],
        ['no SHA-256', { ...file, hashes: { md5: 'x' } }],
    ])('returns null for %s, and still counts the message as encrypted', (_label, broken) => {
        expect(readEncryptedFile({ file: broken })).toBeNull();
        expect(hasEncryptedFileField({ file: broken })).toBe(true);
    });
});

describe('fetchDecryptedMedia', () => {
    const fetchArrayBuffer = vi.spyOn(mediaClient, 'fetchArrayBuffer');

    beforeEach(() => {
        fetchArrayBuffer.mockReset();
    });

    afterEach(() => {
        fetchArrayBuffer.mockReset();
    });

    it('fetches the ciphertext from the media repository and returns the original bytes', async () => {
        const { ciphertext, file } = await encrypted();
        fetchArrayBuffer.mockResolvedValue(ciphertext);

        const blob = await fetchDecryptedMedia({
            file,
            homeserverUrl: 'https://hs.example/',
            blobType: 'image/png',
        });

        expect(fetchArrayBuffer).toHaveBeenCalledTimes(1);
        expect(fetchArrayBuffer.mock.calls[0][0]).toBe(
            'https://hs.example/_matrix/media/v3/download/hs.example/abc123'
        );
        expect(new TextDecoder().decode(await readBlob(blob))).toBe(PLAINTEXT);
        expect(blob.type).toBe('image/png');
    });

    // A file encrypted by another implementation of the Matrix format: built
    // here with OpenSSL (node:crypto) from the specification, not with the
    // library this app sends with.
    it('opens a file encrypted by an independent implementation of the format', async () => {
        const key = randomBytes(32);
        const iv = Buffer.concat([randomBytes(8), Buffer.alloc(8)]);
        const cipher = createCipheriv('aes-256-ctr', key, iv);
        const ciphertext = Buffer.concat([cipher.update(PLAINTEXT, 'utf8'), cipher.final()]);
        const file = {
            url: 'mxc://other.example/fromElsewhere',
            v: 'v2',
            key: {
                kty: 'oct',
                alg: 'A256CTR',
                ext: true,
                key_ops: ['encrypt', 'decrypt'],
                k: key.toString('base64url'),
            },
            iv: iv.toString('base64').replace(/=+$/, ''),
            hashes: {
                sha256: createHash('sha256').update(ciphertext).digest('base64').replace(/=+$/, ''),
            },
        };
        fetchArrayBuffer.mockResolvedValue(
            ciphertext.buffer.slice(
                ciphertext.byteOffset,
                ciphertext.byteOffset + ciphertext.byteLength
            ) as ArrayBuffer
        );

        const blob = await fetchDecryptedMedia({
            file,
            homeserverUrl: 'https://hs.example',
            blobType: 'image/png',
        });

        expect(fetchArrayBuffer.mock.calls[0][0]).toBe(
            'https://hs.example/_matrix/media/v3/download/other.example/fromElsewhere'
        );
        expect(new TextDecoder().decode(await readBlob(blob))).toBe(PLAINTEXT);
    });

    it('passes the byte ceiling through to the media client, and none when not given', async () => {
        const { ciphertext, file } = await encrypted();
        fetchArrayBuffer.mockResolvedValue(ciphertext);

        await fetchDecryptedMedia({
            file,
            homeserverUrl: 'https://hs.example',
            blobType: OPAQUE_BLOB_TYPE,
            maxBytes: ENCRYPTED_AUTO_LOAD_MAX_BYTES,
        });
        expect(fetchArrayBuffer.mock.calls[0][2]).toEqual({
            maxBytes: ENCRYPTED_AUTO_LOAD_MAX_BYTES,
        });

        await fetchDecryptedMedia({
            file,
            homeserverUrl: 'https://hs.example',
            blobType: OPAQUE_BLOB_TYPE,
        });
        expect(fetchArrayBuffer.mock.calls[1][2]).toBeUndefined();
    });

    it('accepts a fingerprint written with base64 padding: the same hash, spelled differently', async () => {
        const { ciphertext, file } = await encrypted();
        fetchArrayBuffer.mockResolvedValue(ciphertext);
        const padded = { ...file, hashes: { sha256: `${file.hashes.sha256}=` } };

        const blob = await fetchDecryptedMedia({
            file: padded,
            homeserverUrl: 'https://hs.example',
            blobType: 'image/png',
        });
        expect(new TextDecoder().decode(await readBlob(blob))).toBe(PLAINTEXT);

        // Padding is all that is forgiven: a different hash is still refused.
        const other = await encryptAttachment(new TextEncoder().encode('another file').buffer);
        fetchArrayBuffer.mockResolvedValue(other.data);
        await expect(
            fetchDecryptedMedia({
                file: padded,
                homeserverUrl: 'https://hs.example',
                blobType: 'image/png',
            })
        ).rejects.toBeInstanceOf(EncryptedMediaMismatchError);
    });

    it('hands the abort signal to the media client, with or without a byte ceiling', async () => {
        const { ciphertext, file } = await encrypted();
        fetchArrayBuffer.mockResolvedValue(ciphertext);
        const controller = new AbortController();

        await fetchDecryptedMedia({
            file,
            homeserverUrl: 'https://hs.example',
            blobType: 'image/png',
            signal: controller.signal,
        });
        expect(fetchArrayBuffer.mock.calls[0][2]).toEqual({ signal: controller.signal });

        await fetchDecryptedMedia({
            file,
            homeserverUrl: 'https://hs.example',
            blobType: 'image/png',
            maxBytes: 10_000,
            signal: controller.signal,
        });
        expect(fetchArrayBuffer.mock.calls[1][2]).toEqual({
            maxBytes: 10_000,
            signal: controller.signal,
        });
    });

    it('refuses a file whose bytes were changed on the server', async () => {
        const { ciphertext, file } = await encrypted();
        const tampered = new Uint8Array(ciphertext.slice(0));
        tampered[3] ^= 0x01;
        fetchArrayBuffer.mockResolvedValue(tampered.buffer);

        await expect(
            fetchDecryptedMedia({
                file,
                homeserverUrl: 'https://hs.example',
                blobType: 'image/png',
            })
        ).rejects.toBeInstanceOf(EncryptedMediaMismatchError);
    });

    it('refuses a different file served in place of the one the message describes', async () => {
        const { file } = await encrypted();
        const other = await encryptAttachment(new TextEncoder().encode('another file').buffer);
        fetchArrayBuffer.mockResolvedValue(other.data);

        await expect(
            fetchDecryptedMedia({
                file,
                homeserverUrl: 'https://hs.example',
                blobType: 'image/png',
            })
        ).rejects.toBeInstanceOf(EncryptedMediaMismatchError);
    });

    it('refuses a file that was truncated', async () => {
        const { ciphertext, file } = await encrypted();
        fetchArrayBuffer.mockResolvedValue(ciphertext.slice(0, 5));

        await expect(
            fetchDecryptedMedia({
                file,
                homeserverUrl: 'https://hs.example',
                blobType: 'image/png',
            })
        ).rejects.toBeInstanceOf(EncryptedMediaMismatchError);
    });

    it('reports a key that cannot be used as a decryption failure', async () => {
        const { ciphertext, file } = await encrypted();
        fetchArrayBuffer.mockResolvedValue(ciphertext);

        await expect(
            fetchDecryptedMedia({
                file: { ...file, key: { ...file.key, k: 'too-short' } },
                homeserverUrl: 'https://hs.example',
                blobType: 'image/png',
            })
        ).rejects.toBeInstanceOf(EncryptedMediaDecryptError);
    });

    it('does not fetch anything for a reference that is not an mxc:// URL', async () => {
        const { file } = await encrypted();
        await expect(
            fetchDecryptedMedia({
                file: { ...file, url: 'https://evil.example/track.gif' },
                homeserverUrl: 'https://hs.example',
                blobType: 'image/png',
            })
        ).rejects.toThrow('Invalid MXC URI');
        expect(fetchArrayBuffer).not.toHaveBeenCalled();
    });

    it('lets a fetch failure through as it is', async () => {
        const { file } = await encrypted();
        fetchArrayBuffer.mockRejectedValue(new Error('Unable to fetch media (404).'));
        await expect(
            fetchDecryptedMedia({
                file,
                homeserverUrl: 'https://hs.example',
                blobType: 'image/png',
            })
        ).rejects.toThrow('Unable to fetch media (404).');
    });
});
