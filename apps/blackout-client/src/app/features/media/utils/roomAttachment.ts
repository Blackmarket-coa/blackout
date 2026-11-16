/**
 * Sending a file into a room.
 *
 * Every surface that posts a file as a room message goes through
 * `sendRoomAttachment`, so the decision "is this room end-to-end encrypted"
 * is made in one place. Nothing in the language stops new code from calling a
 * plain uploader instead; tests/unit/features/media/directUploadCallers.test.ts
 * fails when a file that is not on its list refers to one.
 *
 * In an encrypted room the file is encrypted in this client (AES-256-CTR, the
 * Matrix encrypted-attachment format, v2) before anything is uploaded. The
 * media repository receives ciphertext with no file name and no file type;
 * the key, IV and SHA-256 of the ciphertext travel in the message's `file`
 * field, which the SDK then encrypts with the rest of the event.
 *
 * What the homeserver still learns about an encrypted file: its size to the
 * byte (CTR mode adds no padding), who uploaded it and when, and the network
 * addresses it is downloaded from.
 *
 * Until 2026-11-16 the composer uploaded files unencrypted in every room,
 * encrypted or not. See docs/security/attachment-encryption-2026-11-16.md.
 */
import type { MatrixClient } from 'matrix-js-sdk';
import { encryptAttachment } from 'browser-encrypt-attachment';
import type { IEncryptedFile } from '../../../../types/matrix/common';
import { RoomNotReadyError } from '../../room/roomSendGuard';

/**
 * Where a message's media is. Spread it into the message content: a plain
 * upload is referenced by `url`, an encrypted one by `file`. A message must
 * carry exactly one of the two.
 */
export type AttachmentSource = { url: string } | { file: IEncryptedFile };

/** The upload type for ciphertext: it says nothing about what is inside. */
export const ENCRYPTED_UPLOAD_TYPE = 'application/octet-stream';

/**
 * The room became encrypted between the upload and the send. The upload was
 * made without encryption; posting it would put an unencrypted file in an
 * encrypted room, so the message is not sent.
 */
export class AttachmentEncryptionChangedError extends Error {
    constructor() {
        super(
            'Encryption was turned on in this room while the file was uploading. The file was not posted to the room. A copy without encryption reached the server and this app cannot delete it. Send again to send it encrypted.'
        );
        this.name = 'AttachmentEncryptionChangedError';
    }
}

type AttachmentClient = Pick<MatrixClient, 'getRoom' | 'uploadContent'> & {
    getCrypto?: MatrixClient['getCrypto'];
};

/**
 * Whether files sent to this room must be encrypted. Mirrors the SDK's own
 * rule for events (`shouldEncryptEventForRoom`): the room's state says so, or
 * the crypto store remembers that it once did. The second half matters: a
 * homeserver can stop serving the room's encryption event, and the crypto
 * store is what refuses that downgrade.
 *
 * Throws `RoomNotReadyError` for a room this client has not loaded: nothing
 * is uploaded, because it cannot tell whether the room is encrypted, and
 * guessing "not encrypted" is the one answer that can put a private file on
 * the server in the clear.
 */
export const roomEncryptsAttachments = async (
    client: AttachmentClient,
    roomId: string
): Promise<boolean> => {
    const room = client.getRoom(roomId);
    if (!room) throw new RoomNotReadyError();
    if (room.hasEncryptionStateEvent()) return true;
    const crypto = client.getCrypto?.();
    if (crypto && (await crypto.isEncryptionEnabledInRoom(roomId)) === true) return true;
    return false;
};

/**
 * Read a file's bytes. `Blob.arrayBuffer` where the runtime has it,
 * `FileReader` where it does not (older WebViews).
 */
const readBytes = (blob: Blob): Promise<ArrayBuffer> => {
    if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
    return new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
        reader.readAsArrayBuffer(blob);
    });
};

const contentUriOf = (response: { content_uri?: string }): string => {
    if (!response.content_uri) {
        throw new Error('Matrix upload succeeded but no content_uri was returned.');
    }
    return response.content_uri;
};

const uploadPlain = async (client: AttachmentClient, file: File): Promise<AttachmentSource> => {
    const response = await client.uploadContent(file, {
        includeFilename: true,
        name: file.name,
        type: file.type,
    });
    return { url: contentUriOf(response) };
};

const uploadEncrypted = async (client: AttachmentClient, file: File): Promise<AttachmentSource> => {
    const encrypted = await encryptAttachment(await readBytes(file));
    // A Blob, not a File: there is no name on the object for a later code
    // path to pick up, and the type is fixed.
    const ciphertext = new Blob([encrypted.data], { type: ENCRYPTED_UPLOAD_TYPE });
    const response = await client.uploadContent(ciphertext, {
        includeFilename: false,
        type: ENCRYPTED_UPLOAD_TYPE,
    });
    return { file: { ...encrypted.info, url: contentUriOf(response) } };
};

/**
 * Upload `file` for `roomId` (encrypted first if the room is encrypted),
 * build the message from where the upload landed, and send it.
 *
 * `send` is the caller's own event sender, so each surface keeps its event
 * type, relations and error handling.
 */
export const sendRoomAttachment = async (
    client: AttachmentClient,
    roomId: string,
    file: File,
    buildContent: (source: AttachmentSource) => Record<string, unknown>,
    send: (content: Record<string, unknown>) => Promise<unknown>
): Promise<void> => {
    const encrypt = await roomEncryptsAttachments(client, roomId);
    const source = encrypt ? await uploadEncrypted(client, file) : await uploadPlain(client, file);

    // An upload can take minutes. If the room turned encrypted meanwhile, the
    // SDK would encrypt the event and the room would show an encrypted
    // message whose file is not. Ask again before posting.
    // It throws if the room has left the store meanwhile (a sign-out, say):
    // the SDK would send a message to a room it no longer holds unencrypted,
    // and for an encrypted upload that message carries the file's key.
    const encryptNow = await roomEncryptsAttachments(client, roomId);
    if (!encrypt && encryptNow) {
        throw new AttachmentEncryptionChangedError();
    }

    await send(buildContent(source));
};
