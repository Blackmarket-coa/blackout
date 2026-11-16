/**
 * Opening an encrypted attachment (the `file` field of a Matrix message).
 *
 * The ciphertext is fetched from the media repository, its SHA-256 is checked
 * against the one in the message, and only then is it decrypted. The message
 * itself arrived end-to-end encrypted, so a ciphertext that matches its hash
 * is the one the sender uploaded; a homeserver that swaps the file is caught
 * here and nothing is opened.
 *
 * A decrypted file becomes a `Blob` that lives in this page's origin. A blob
 * that the browser would render as a document (HTML, SVG, XML) runs with this
 * app's access to the session and its keys the moment someone opens it in a
 * tab, so a blob is given the sender's declared type only when that type
 * cannot carry script. Everything else is `application/octet-stream`, which a
 * browser saves and never renders.
 */
import { decryptAttachment } from 'browser-encrypt-attachment';
import { AUDIO_MIME_TYPES, IMAGE_MIME_TYPES, VIDEO_MIME_TYPES } from '../../../utils/mimeTypes';
import { mxcToUrl } from '../../../utils/media';
import { mediaClient } from '../../../sdk/client';
import type { IEncryptedFile } from '../../../../types/matrix/common';

/** A type the browser saves and does not render. */
export const OPAQUE_BLOB_TYPE = 'application/octet-stream';

/**
 * Encrypted media up to this size is fetched and decrypted when it scrolls
 * into view; anything larger waits for the reader to ask. The ceiling is
 * enforced on the bytes that arrive, so a message that understates its
 * attachment's size does not get more than this downloaded unasked.
 */
export const ENCRYPTED_AUTO_LOAD_MAX_BYTES = 20 * 1024 * 1024;

const INLINE_BLOB_TYPES: ReadonlySet<string> = new Set([
    ...IMAGE_MIME_TYPES,
    ...VIDEO_MIME_TYPES,
    ...AUDIO_MIME_TYPES,
]);

/**
 * The type to give a decrypted blob that will be shown inline: the declared
 * type when it is a raster image, audio or video type from the allow-list,
 * the opaque type otherwise.
 */
export const inlineBlobType = (declared: unknown): string => {
    if (typeof declared !== 'string') return OPAQUE_BLOB_TYPE;
    const type = declared.split(';')[0].trim().toLowerCase();
    if (!INLINE_BLOB_TYPES.has(type)) return OPAQUE_BLOB_TYPE;
    // Chromium plays QuickTime containers only when told they are MP4.
    return type === 'video/quicktime' ? 'video/mp4' : type;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

/**
 * The encrypted-file reference in a message's content, or null when the
 * message has none or it is not usable (no `mxc://` URL, key, IV or hash).
 */
export const readEncryptedFile = (content: Record<string, unknown>): IEncryptedFile | null => {
    const file = content.file;
    if (!isRecord(file)) return null;
    const { url, key, iv, hashes } = file;
    if (typeof url !== 'string' || !url.startsWith('mxc://')) return null;
    if (!isRecord(key) || typeof key.k !== 'string') return null;
    if (typeof iv !== 'string') return null;
    if (!isRecord(hashes) || typeof hashes.sha256 !== 'string') return null;
    return file as unknown as IEncryptedFile;
};

/** Whether a message carries a `file` field at all, usable or not. */
export const hasEncryptedFileField = (content: Record<string, unknown>): boolean =>
    isRecord(content.file);

/** The file on the server is not the one the message describes. */
export class EncryptedMediaMismatchError extends Error {
    constructor() {
        super(
            'This file does not match the fingerprint in its message, so it was not opened. It may have been changed on the server.'
        );
        this.name = 'EncryptedMediaMismatchError';
    }
}

/** The file matched its fingerprint but could not be decrypted with the key in the message. */
export class EncryptedMediaDecryptError extends Error {
    constructor() {
        super('This file could not be decrypted with the key in its message.');
        this.name = 'EncryptedMediaDecryptError';
    }
}

export interface FetchDecryptedMediaInput {
    file: IEncryptedFile;
    homeserverUrl: string;
    /** The type for the resulting blob; see `inlineBlobType`. */
    blobType: string;
    /** Stop, with the SDK's `MEDIA_TOO_LARGE`, if more than this arrives. */
    maxBytes?: number;
}

/** Fetch an encrypted attachment, verify it, decrypt it. */
export const fetchDecryptedMedia = async ({
    file,
    homeserverUrl,
    blobType,
    maxBytes,
}: FetchDecryptedMediaInput): Promise<Blob> => {
    const downloadUrl = mxcToUrl(file.url, homeserverUrl);
    if (!downloadUrl) throw new Error('Invalid MXC URI');

    const ciphertext = await mediaClient.fetchArrayBuffer(
        downloadUrl,
        undefined,
        typeof maxBytes === 'number' ? { maxBytes } : undefined
    );

    let plaintext: ArrayBuffer;
    try {
        plaintext = await decryptAttachment(ciphertext, file);
    } catch (err) {
        if (err instanceof Error && /Mismatched SHA-256/i.test(err.message)) {
            throw new EncryptedMediaMismatchError();
        }
        throw new EncryptedMediaDecryptError();
    }
    return new Blob([plaintext], { type: blobType });
};
