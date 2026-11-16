// @vitest-environment jsdom
//
// What reaches the homeserver when a file is sent from the composer's send
// hook. These tests use the real attachment cipher (WebCrypto), not a mock:
// the claim under test is about bytes, so the bytes are what is checked.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDecipheriv, createHash } from 'node:crypto';
import { decryptAttachment, type EncryptedAttachmentInfo } from 'browser-encrypt-attachment';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Upload = { body: Blob; opts: Record<string, unknown> | undefined };

const uploads: Upload[] = [];
const sent: Array<{ roomId: string; type: string; content: Record<string, unknown> }> = [];

const rooms: Record<string, { hasEncryptionStateEvent: () => boolean } | null> = {};
let cryptoSaysEncrypted: Record<string, boolean> = {};

const client = {
    getRoom: (roomId: string) => rooms[roomId] ?? null,
    getCrypto: () => ({
        isEncryptionEnabledInRoom: async (roomId: string) => cryptoSaysEncrypted[roomId] === true,
    }),
    uploadContent: vi.fn(async (body: Blob, opts?: Record<string, unknown>) => {
        uploads.push({ body, opts });
        return { content_uri: `mxc://example.org/media${uploads.length}` };
    }),
    sendEvent: vi.fn(async (roomId: string, type: string, content: Record<string, unknown>) => {
        sent.push({ roomId, type, content });
        return { event_id: '$sent' };
    }),
};

vi.mock('../../../../src/app/plugins/matrix-adapters/hooks/useLegacyMatrixClientAdapter', () => ({
    useLegacyMatrixClientAdapter: () => client,
}));
vi.mock('../../../../src/app/plugins/matrix-adapters/hooks/useLegacyRoomAdapter', () => ({
    useLegacyRoomAdapter: () => ({ data: null, loading: false, error: null }),
}));

import { useLegacySendMessageAdapter } from '../../../../src/app/plugins/matrix-adapters/hooks/useLegacyTimelineAdapter';
import { sendRoomAttachment } from '../../../../src/app/features/media/utils/roomAttachment';

const SECRET = 'TOP-SECRET-PLAINTEXT-MARKER the meeting is at the old mill';
const FILE_NAME = 'meeting-location-old-mill.txt';

const readBytes = (blob: Blob): Promise<Uint8Array> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
    });

const includes = (haystack: Uint8Array, needle: Uint8Array): boolean => {
    outer: for (let i = 0; i + needle.length <= haystack.length; i += 1) {
        for (let j = 0; j < needle.length; j += 1) {
            if (haystack[i + j] !== needle[j]) continue outer;
        }
        return true;
    }
    return false;
};

type SendApi = ReturnType<typeof useLegacySendMessageAdapter>;

const mountSender = async (roomId: string) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    const api: { current: SendApi | null } = { current: null };
    const Probe = () => {
        api.current = useLegacySendMessageAdapter(roomId);
        return null;
    };
    await act(async () => {
        root.render(<Probe />);
    });
    return {
        api: () => api.current as SendApi,
        unmount: async () => {
            await act(async () => root.unmount());
            container.remove();
        },
    };
};

const secretFile = () => new File([SECRET], FILE_NAME, { type: 'text/plain' });

beforeEach(() => {
    uploads.length = 0;
    sent.length = 0;
    for (const key of Object.keys(rooms)) delete rooms[key];
    cryptoSaysEncrypted = {};
    client.uploadContent.mockClear();
    client.sendEvent.mockClear();
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('a file sent in an end-to-end encrypted room', () => {
    beforeEach(() => {
        rooms['!enc:example.org'] = { hasEncryptionStateEvent: () => true };
    });

    it('reaches the media repository as ciphertext, with no file name and no file type', async () => {
        const sender = await mountSender('!enc:example.org');
        await act(async () => {
            await sender.api().sendMedia(secretFile());
        });

        expect(uploads).toHaveLength(1);
        const uploaded = await readBytes(uploads[0].body);
        const plaintext = new TextEncoder().encode(SECRET);

        // The server must not receive the file's bytes…
        expect(includes(uploaded, plaintext)).toBe(false);
        expect(includes(uploaded, new TextEncoder().encode('TOP-SECRET'))).toBe(false);
        // …nor its name, in the request or on the uploaded object…
        expect(uploads[0].opts?.includeFilename).toBe(false);
        expect(uploads[0].opts?.name).toBeUndefined();
        expect((uploads[0].body as File).name).toBeUndefined();
        // …nor its type.
        expect(uploads[0].opts?.type).toBe('application/octet-stream');
        expect(uploads[0].body.type).toBe('application/octet-stream');
        await sender.unmount();
    });

    it('sends a message that carries the key in `file` and has no plain `url`', async () => {
        const sender = await mountSender('!enc:example.org');
        await act(async () => {
            await sender.api().sendMedia(secretFile());
        });

        expect(sent).toHaveLength(1);
        const { content, type, roomId } = sent[0];
        expect(roomId).toBe('!enc:example.org');
        expect(type).toBe('m.room.message');
        expect(content.url).toBeUndefined();
        const file = content.file as EncryptedAttachmentInfo & { url: string };
        expect(file.url).toBe('mxc://example.org/media1');
        expect(file.v).toBe('v2');
        expect(file.key.alg).toBe('A256CTR');
        expect(typeof file.key.k).toBe('string');
        expect(typeof file.iv).toBe('string');
        expect(typeof file.hashes.sha256).toBe('string');
        await sender.unmount();
    });

    it('can be decrypted, with the key from the message, back to the original bytes', async () => {
        const sender = await mountSender('!enc:example.org');
        await act(async () => {
            await sender.api().sendMedia(secretFile());
        });

        const uploaded = await readBytes(uploads[0].body);
        const file = sent[0].content.file as EncryptedAttachmentInfo;
        const decrypted = await decryptAttachment(uploaded.buffer as ArrayBuffer, file);
        expect(new TextDecoder().decode(decrypted)).toBe(SECRET);
        await sender.unmount();
    });

    // The format is Matrix's encrypted-attachment v2: AES-256-CTR, the key as a
    // JWK, the IV and the SHA-256 of the ciphertext in unpadded base64. This
    // reads it with OpenSSL (node:crypto) and none of the app's own code, so a
    // quirk shared by the sending and receiving halves of one library cannot
    // hide here.
    it('is readable by an independent implementation of the Matrix attachment format', async () => {
        const sender = await mountSender('!enc:example.org');
        await act(async () => {
            await sender.api().sendMedia(secretFile());
        });

        const uploaded = Buffer.from(await readBytes(uploads[0].body));
        const file = sent[0].content.file as EncryptedAttachmentInfo;

        expect(file.key.kty).toBe('oct');
        expect(file.key.alg).toBe('A256CTR');
        expect(file.key.ext).toBe(true);
        expect([...file.key.key_ops].sort()).toEqual(['decrypt', 'encrypt']);
        const key = Buffer.from(file.key.k, 'base64url');
        const iv = Buffer.from(file.iv, 'base64');
        expect(key).toHaveLength(32);
        expect(iv).toHaveLength(16);
        // v2: the counter half of the IV starts at zero.
        expect([...iv.subarray(8)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
        // Unpadded base64, as the specification requires.
        expect(file.iv).not.toContain('=');
        expect(file.hashes.sha256).not.toContain('=');
        expect(file.hashes.sha256).toBe(
            createHash('sha256').update(uploaded).digest('base64').replace(/=+$/, '')
        );

        const decipher = createDecipheriv('aes-256-ctr', key, iv);
        const plaintext = Buffer.concat([decipher.update(uploaded), decipher.final()]);
        expect(plaintext.toString('utf8')).toBe(SECRET);
        // CTR adds no padding: the server learns the file's size to the byte.
        expect(uploaded).toHaveLength(Buffer.byteLength(SECRET));
        await sender.unmount();
    });

    it('uses a fresh key and IV for every file', async () => {
        const sender = await mountSender('!enc:example.org');
        await act(async () => {
            await sender.api().sendMedia(secretFile());
            await sender.api().sendMedia(secretFile());
        });

        const first = sent[0].content.file as EncryptedAttachmentInfo;
        const second = sent[1].content.file as EncryptedAttachmentInfo;
        expect(first.key.k).not.toBe(second.key.k);
        expect(first.iv).not.toBe(second.iv);
        const a = await readBytes(uploads[0].body);
        const b = await readBytes(uploads[1].body);
        expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
        await sender.unmount();
    });

    it('is encrypted for a caller that shapes its own content, such as a voice note', async () => {
        const sender = await mountSender('!enc:example.org');
        await act(async () => {
            await sender.api().sendMedia(secretFile(), {
                buildContent: (source) => ({
                    msgtype: 'm.audio',
                    body: 'voice.ogg',
                    ...source,
                    'org.matrix.msc3245.voice': {},
                }),
            });
        });

        const uploaded = await readBytes(uploads[0].body);
        expect(includes(uploaded, new TextEncoder().encode(SECRET))).toBe(false);
        expect(sent[0].content.url).toBeUndefined();
        expect((sent[0].content.file as { url: string }).url).toBe('mxc://example.org/media1');
        expect(sent[0].content.msgtype).toBe('m.audio');
        await sender.unmount();
    });
});

describe('a room the crypto store remembers as encrypted, whose state no longer says so', () => {
    it('still gets ciphertext: a server that hides the encryption event does not get the file', async () => {
        rooms['!downgraded:example.org'] = { hasEncryptionStateEvent: () => false };
        cryptoSaysEncrypted['!downgraded:example.org'] = true;
        const sender = await mountSender('!downgraded:example.org');
        await act(async () => {
            await sender.api().sendMedia(secretFile());
        });

        const uploaded = await readBytes(uploads[0].body);
        expect(includes(uploaded, new TextEncoder().encode(SECRET))).toBe(false);
        expect(uploads[0].opts?.includeFilename).toBe(false);
        expect(sent[0].content.url).toBeUndefined();
        expect(sent[0].content.file).toBeDefined();
        await sender.unmount();
    });
});

describe('a room this client has not loaded yet', () => {
    it('gets nothing: the file is not uploaded and no message is sent', async () => {
        const sender = await mountSender('!unknown:example.org');
        let failure: unknown;
        await act(async () => {
            await sender
                .api()
                .sendMedia(secretFile())
                .catch((err: unknown) => {
                    failure = err;
                });
        });

        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).message).toMatch(/has not finished loading/);
        expect(uploads).toHaveLength(0);
        expect(sent).toHaveLength(0);
        await sender.unmount();
    });
});

describe('a file sent in a room without encryption', () => {
    it('is uploaded as it is, with its name and type, and the message carries `url`', async () => {
        rooms['!plain:example.org'] = { hasEncryptionStateEvent: () => false };
        const sender = await mountSender('!plain:example.org');
        await act(async () => {
            await sender.api().sendMedia(secretFile());
        });

        expect(uploads).toHaveLength(1);
        const uploaded = await readBytes(uploads[0].body);
        expect(new TextDecoder().decode(uploaded)).toBe(SECRET);
        expect(uploads[0].opts).toMatchObject({
            includeFilename: true,
            name: FILE_NAME,
            type: 'text/plain',
        });
        expect(sent[0].content).toMatchObject({
            msgtype: 'm.file',
            body: FILE_NAME,
            url: 'mxc://example.org/media1',
            info: { mimetype: 'text/plain', size: SECRET.length },
        });
        expect(sent[0].content.file).toBeUndefined();
        await sender.unmount();
    });
});

describe('a room that leaves the store while an encrypted file is uploading', () => {
    // The message that would follow carries the file's key. The SDK sends a
    // message to a room it no longer holds without encrypting it, so the send
    // has to be checked again after the upload, not only before it.
    it('gets no message: the key is not sent', async () => {
        rooms['!leaving:example.org'] = { hasEncryptionStateEvent: () => true };
        client.uploadContent.mockImplementationOnce(
            async (body: Blob, opts?: Record<string, unknown>) => {
                uploads.push({ body, opts });
                // A sign-out clears the store while the upload is in flight.
                rooms['!leaving:example.org'] = null;
                return { content_uri: 'mxc://example.org/orphan' };
            }
        );
        const sender = await mountSender('!leaving:example.org');
        let failure: unknown;
        await act(async () => {
            await sender
                .api()
                .sendMedia(secretFile())
                .catch((err: unknown) => {
                    failure = err;
                });
        });

        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).message).toMatch(/has not finished loading/);
        expect(uploads).toHaveLength(1);
        expect(sent).toHaveLength(0);
        await sender.unmount();
    });
});

describe('sendRoomAttachment on its own, whatever the caller sends with', () => {
    // The hooks and the client both refuse an unloaded room. This layer must
    // not lean on them: a caller hands it any `send` it likes.
    it('does not call send when the room left the store during an encrypted upload', async () => {
        let room: { hasEncryptionStateEvent: () => boolean } | null = {
            hasEncryptionStateEvent: () => true,
        };
        const bare = {
            getRoom: () => room,
            getCrypto: () => undefined,
            uploadContent: vi.fn(async () => {
                room = null;
                return { content_uri: 'mxc://example.org/orphan' };
            }),
        };
        const send = vi.fn(async () => undefined);

        await expect(
            sendRoomAttachment(
                bare as never,
                '!leaving:example.org',
                secretFile(),
                (source) => ({ msgtype: 'm.file', ...source }),
                send
            )
        ).rejects.toThrow(/has not finished loading/);

        expect(bare.uploadContent).toHaveBeenCalledTimes(1);
        expect(send).not.toHaveBeenCalled();
    });

    it('does not call send when a plain upload finds the room encrypted afterwards', async () => {
        let encrypted = false;
        const bare = {
            getRoom: () => ({ hasEncryptionStateEvent: () => encrypted }),
            getCrypto: () => undefined,
            uploadContent: vi.fn(async () => {
                encrypted = true;
                return { content_uri: 'mxc://example.org/raced' };
            }),
        };
        const send = vi.fn(async () => undefined);

        await expect(
            sendRoomAttachment(
                bare as never,
                '!turning:example.org',
                secretFile(),
                (source) => ({ msgtype: 'm.file', ...source }),
                send
            )
        ).rejects.toThrow(/Encryption was turned on/);
        expect(send).not.toHaveBeenCalled();
    });
});

describe('encryption that is turned on while a file is uploading', () => {
    it('stops the send: the unencrypted upload is not posted to the now-encrypted room', async () => {
        let encrypted = false;
        rooms['!turning:example.org'] = { hasEncryptionStateEvent: () => encrypted };
        client.uploadContent.mockImplementationOnce(
            async (body: Blob, opts?: Record<string, unknown>) => {
                uploads.push({ body, opts });
                // The room's encryption event arrives while the upload is in flight.
                encrypted = true;
                return { content_uri: 'mxc://example.org/raced' };
            }
        );
        const sender = await mountSender('!turning:example.org');
        let failure: unknown;
        await act(async () => {
            await sender
                .api()
                .sendMedia(secretFile())
                .catch((err: unknown) => {
                    failure = err;
                });
        });

        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).message).toMatch(/Encryption was turned on/);
        expect(sent).toHaveLength(0);
        await sender.unmount();
    });
});
