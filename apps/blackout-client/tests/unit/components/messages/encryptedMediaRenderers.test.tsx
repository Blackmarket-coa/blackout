// @vitest-environment jsdom
//
// The timeline's media renderers and encrypted attachments: what is fetched,
// when, and what the decrypted bytes are handed to the browser as. The cipher
// is real; only the network (the media client) and the object-URL registry
// are stood in for.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixEvent } from 'matrix-js-sdk';
import { encryptAttachment } from 'browser-encrypt-attachment';
import { BlackoutSdkError, MEDIA_TOO_LARGE } from '@blackout/sdk';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rooms: Record<string, { hasEncryptionStateEvent: () => boolean }> = {};
const fakeClient = {
    getHomeserverUrl: () => 'https://hs.example',
    getRoom: (roomId: string) => rooms[roomId] ?? null,
};
vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => fakeClient,
}));

const saveAs = vi.fn();
vi.mock('file-saver', () => ({
    default: { saveAs: (...args: unknown[]) => saveAs(...args) },
}));

import { mediaClient } from '../../../../src/app/sdk/client';
import { ENCRYPTED_AUTO_LOAD_MAX_BYTES } from '../../../../src/app/features/media/utils/encryptedMedia';
import {
    AudioMessage,
    FileMessage,
    ImageMessage,
    StickerMessage,
    VideoMessage,
} from '../../../../src/app/components/messages';
import {
    EXPOSED_KEY_MEDIA_NOTE,
    UNENCRYPTED_MEDIA_NOTE,
} from '../../../../src/app/components/messages/mediaShared';
import { getDefaultStore } from 'jotai';
import { settingsAtom } from '../../../../src/app/state/compat-settings';

const fetchArrayBuffer = vi.spyOn(mediaClient, 'fetchArrayBuffer');

// --- stand-ins for browser pieces jsdom does not have -----------------------

let visible = true;
const observers: Array<{ report: () => void }> = [];
class FakeIntersectionObserver {
    private readonly callback: (entries: Array<{ isIntersecting: boolean }>) => void;

    constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
        this.callback = callback;
        observers.push({ report: () => this.callback([{ isIntersecting: visible }]) });
    }

    observe() {
        this.callback([{ isIntersecting: visible }]);
    }

    disconnect() {}
}

const objectUrls: Blob[] = [];
const revoked: string[] = [];

const readBlob = (blob: Blob): Promise<Uint8Array> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
    });

// --- fixtures ---------------------------------------------------------------

const PLAINTEXT = 'PIXELS-OF-A-PRIVATE-PHOTO';
const ROOM = '!room:hs.example';

const encryptedContent = async (
    overrides: Record<string, unknown> = {},
    info: Record<string, unknown> = {}
) => {
    const result = await encryptAttachment(new TextEncoder().encode(PLAINTEXT).buffer);
    return {
        ciphertext: result.data,
        content: {
            msgtype: 'm.image',
            body: 'photo.png',
            file: { ...result.info, url: 'mxc://hs.example/cipher1' },
            info: { mimetype: 'image/png', size: PLAINTEXT.length, ...info },
            ...overrides,
        } as Record<string, unknown>,
    };
};

const eventOf = (
    content: Record<string, unknown>,
    roomId = ROOM,
    { eventEncrypted = true }: { eventEncrypted?: boolean } = {}
): MatrixEvent =>
    ({
        getContent: () => content,
        getRoomId: () => roomId,
        getType: () => 'm.room.message',
        getId: () => '$event',
        // Whether the message itself arrived end-to-end encrypted.
        isEncrypted: () => eventEncrypted,
    } as unknown as MatrixEvent);

const mounted: ReactDOM.Root[] = [];

const mount = async (node: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    mounted.push(root);
    await act(async () => {
        root.render(node);
    });
    return container;
};

/** Let the fetch → verify → decrypt chain (real WebCrypto) run to the end. */
const settle = async () => {
    for (let i = 0; i < 6; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
        });
    }
};

const click = async (el: Element | null) => {
    await act(async () => {
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
};

beforeEach(() => {
    visible = true;
    observers.length = 0;
    objectUrls.length = 0;
    revoked.length = 0;
    saveAs.mockReset();
    fetchArrayBuffer.mockReset();
    for (const key of Object.keys(rooms)) delete rooms[key];
    rooms[ROOM] = { hasEncryptionStateEvent: () => true };
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
        objectUrls.push(blob as Blob);
        return `blob:test/${objectUrls.length}`;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
        revoked.push(url);
    });
});

afterEach(async () => {
    await act(async () => {
        while (mounted.length) mounted.pop()?.unmount();
    });
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
});

describe('an encrypted image in the timeline', () => {
    it('is fetched as ciphertext, decrypted, and shown from a blob of its own type', async () => {
        const { ciphertext, content } = await encryptedContent();
        fetchArrayBuffer.mockResolvedValue(ciphertext);

        const container = await mount(<ImageMessage event={eventOf(content)} />);
        await settle();

        expect(fetchArrayBuffer).toHaveBeenCalledTimes(1);
        expect(fetchArrayBuffer.mock.calls[0][0]).toBe(
            'https://hs.example/_matrix/media/v3/download/hs.example/cipher1'
        );
        // Unasked, so capped.
        expect(fetchArrayBuffer.mock.calls[0][2]?.maxBytes).toBe(ENCRYPTED_AUTO_LOAD_MAX_BYTES);
        expect(objectUrls).toHaveLength(1);
        expect(objectUrls[0].type).toBe('image/png');
        expect(new TextDecoder().decode(await readBlob(objectUrls[0]))).toBe(PLAINTEXT);
        const img = container.querySelector('img');
        expect(img?.getAttribute('src')).toBe('blob:test/1');
        expect(container.textContent).not.toContain(UNENCRYPTED_MEDIA_NOTE);
    });

    it.each(['text/html', 'image/svg+xml', 'application/xhtml+xml'])(
        'declared as %s becomes a blob the browser will not render as a document',
        async (mimetype) => {
            const { ciphertext, content } = await encryptedContent({}, { mimetype });
            fetchArrayBuffer.mockResolvedValue(ciphertext);

            await mount(<ImageMessage event={eventOf(content)} />);
            await settle();

            expect(objectUrls).toHaveLength(1);
            expect(objectUrls[0].type).toBe('application/octet-stream');
        }
    );

    it('is not opened when the server returns bytes that do not match the message', async () => {
        const { ciphertext, content } = await encryptedContent();
        const tampered = new Uint8Array(ciphertext.slice(0));
        tampered[0] ^= 0xff;
        fetchArrayBuffer.mockResolvedValue(tampered.buffer);

        const container = await mount(<ImageMessage event={eventOf(content)} />);
        await settle();

        expect(objectUrls).toHaveLength(0);
        expect(container.querySelector('img')).toBeNull();
        expect(container.textContent).toContain('does not match the fingerprint in its message');
    });

    it('is not fetched until it has been on screen', async () => {
        visible = false;
        const { ciphertext, content } = await encryptedContent();
        fetchArrayBuffer.mockResolvedValue(ciphertext);

        const container = await mount(<ImageMessage event={eventOf(content)} />);
        await settle();
        expect(fetchArrayBuffer).not.toHaveBeenCalled();

        visible = true;
        await act(async () => {
            observers.forEach((o) => o.report());
        });
        await settle();
        expect(fetchArrayBuffer).toHaveBeenCalledTimes(1);
        expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:test/1');
    });

    it('stays decrypted when it scrolls out of view and back: one fetch, nothing released', async () => {
        const { ciphertext, content } = await encryptedContent();
        fetchArrayBuffer.mockResolvedValue(ciphertext);

        const container = await mount(<ImageMessage event={eventOf(content)} />);
        await settle();
        expect(fetchArrayBuffer).toHaveBeenCalledTimes(1);

        visible = false;
        await act(async () => {
            observers.forEach((o) => o.report());
        });
        await settle();
        visible = true;
        await act(async () => {
            observers.forEach((o) => o.report());
        });
        await settle();

        expect(fetchArrayBuffer).toHaveBeenCalledTimes(1);
        expect(revoked).toEqual([]);
        expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:test/1');
    });

    it('larger than the unasked limit waits for the reader, then loads without a cap', async () => {
        const size = ENCRYPTED_AUTO_LOAD_MAX_BYTES + 1;
        const { ciphertext, content } = await encryptedContent({}, { size });
        fetchArrayBuffer.mockResolvedValue(ciphertext);

        const container = await mount(<ImageMessage event={eventOf(content)} />);
        await settle();

        expect(fetchArrayBuffer).not.toHaveBeenCalled();
        const button = container.querySelector('[data-testid="load-encrypted-media"]');
        expect(button?.textContent).toBe('Load encrypted image (20.0 MB)');

        await click(button);
        await settle();

        expect(fetchArrayBuffer).toHaveBeenCalledTimes(1);
        expect(fetchArrayBuffer.mock.calls[0][2]?.maxBytes).toBeUndefined();
        expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:test/1');
    });

    it('that states no size is not fetched unasked', async () => {
        const { ciphertext, content } = await encryptedContent();
        delete (content.info as Record<string, unknown>).size;
        fetchArrayBuffer.mockResolvedValue(ciphertext);

        const container = await mount(<ImageMessage event={eventOf(content)} />);
        await settle();

        expect(fetchArrayBuffer).not.toHaveBeenCalled();
        expect(container.querySelector('[data-testid="load-encrypted-media"]')?.textContent).toBe(
            'Load encrypted image'
        );
    });

    it('that understates its size is stopped at the limit and offered, not shown as an error', async () => {
        const { ciphertext, content } = await encryptedContent();
        fetchArrayBuffer.mockImplementation(async (_url, _retry, limits) => {
            if (limits?.maxBytes !== undefined) {
                throw new BlackoutSdkError(
                    MEDIA_TOO_LARGE,
                    'Media is larger than allowed.',
                    'fatal'
                );
            }
            return ciphertext;
        });

        const container = await mount(<ImageMessage event={eventOf(content)} />);
        await settle();

        expect(fetchArrayBuffer).toHaveBeenCalledTimes(1);
        expect(objectUrls).toHaveLength(0);
        expect(container.textContent).not.toContain('failed to load');
        const button = container.querySelector('[data-testid="load-encrypted-media"]');
        // The size the message states was found to be wrong, so it is not repeated.
        expect(button?.textContent).toBe('Load encrypted image (larger than its message says)');

        await click(button);
        await settle();
        expect(fetchArrayBuffer).toHaveBeenCalledTimes(2);
        expect(fetchArrayBuffer.mock.calls[1][2]?.maxBytes).toBeUndefined();
        expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:test/1');
    });

    it('uses the encrypted reference even when a plain `url` sits beside it', async () => {
        const { ciphertext, content } = await encryptedContent({
            url: 'mxc://hs.example/decoy-plain',
        });
        fetchArrayBuffer.mockResolvedValue(ciphertext);

        const container = await mount(<ImageMessage event={eventOf(content)} />);
        await settle();

        expect(fetchArrayBuffer.mock.calls[0][0]).toContain('/hs.example/cipher1');
        expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:test/1');
        expect(container.innerHTML).not.toContain('decoy-plain');
    });

    it('whose `file` has no key shows an error and fetches nothing, not even a plain `url` beside it', async () => {
        const { content } = await encryptedContent({ url: 'mxc://hs.example/decoy-plain' });
        delete (content.file as Record<string, unknown>).key;

        const container = await mount(<ImageMessage event={eventOf(content)} />);
        await settle();

        expect(fetchArrayBuffer).not.toHaveBeenCalled();
        expect(container.querySelector('img')).toBeNull();
        expect(container.textContent).toContain('does not carry a usable key');
        // Asking again cannot produce a key the message does not have.
        expect(container.querySelector('[data-testid="retry-encrypted-media"]')).toBeNull();
    });

    it('stops downloading when it leaves the timeline before the file has arrived', async () => {
        const { content } = await encryptedContent();
        let signal: AbortSignal | undefined;
        fetchArrayBuffer.mockImplementation((_url, _retry, options) => {
            signal = options?.signal;
            return new Promise<ArrayBuffer>(() => {});
        });

        await mount(<ImageMessage event={eventOf(content)} />);
        await settle();
        expect(signal).toBeDefined();
        expect(signal?.aborted).toBe(false);

        await act(async () => {
            while (mounted.length) mounted.pop()?.unmount();
        });
        expect(signal?.aborted).toBe(true);
    });

    it('is not fetched unasked when the reader has switched media auto-load off', async () => {
        const store = getDefaultStore();
        const before = store.get(settingsAtom);
        store.set(settingsAtom, { ...before, mediaAutoLoad: false });
        try {
            const { ciphertext, content } = await encryptedContent();
            fetchArrayBuffer.mockResolvedValue(ciphertext);

            const container = await mount(<ImageMessage event={eventOf(content)} />);
            await settle();

            expect(fetchArrayBuffer).not.toHaveBeenCalled();
            const button = container.querySelector('[data-testid="load-encrypted-media"]');
            expect(button?.textContent).toBe('Load encrypted image (25.0 B)');

            await click(button);
            await settle();
            expect(fetchArrayBuffer).toHaveBeenCalledTimes(1);
            expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:test/1');
        } finally {
            store.set(settingsAtom, before);
        }
    });

    it('releases the decrypted copy when it leaves the timeline', async () => {
        const { ciphertext, content } = await encryptedContent();
        fetchArrayBuffer.mockResolvedValue(ciphertext);

        await mount(<ImageMessage event={eventOf(content)} />);
        await settle();
        expect(revoked).toEqual([]);

        await act(async () => {
            while (mounted.length) mounted.pop()?.unmount();
        });
        expect(revoked).toEqual(['blob:test/1']);
    });
});

describe('a file whose key travelled in a message that was not encrypted', () => {
    // The file is ciphertext on the server, but the server also holds the
    // message with the key in it, so it can read the file or swap it. Calling
    // that "encrypted" would be false.
    it('is not labelled encrypted, and in an encrypted room says the server can read it', async () => {
        const { ciphertext, content } = await encryptedContent();
        fetchArrayBuffer.mockResolvedValue(ciphertext);

        const container = await mount(
            <ImageMessage event={eventOf(content, ROOM, { eventEncrypted: false })} />
        );
        await settle();

        expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:test/1');
        expect(container.textContent).not.toContain('Encrypted image');
        expect(container.querySelector('[data-testid="unencrypted-media-note"]')?.textContent).toBe(
            EXPOSED_KEY_MEDIA_NOTE
        );
    });

    it('is labelled encrypted, with no note, when the message was end-to-end encrypted', async () => {
        const { ciphertext, content } = await encryptedContent();
        fetchArrayBuffer.mockResolvedValue(ciphertext);

        const container = await mount(<ImageMessage event={eventOf(content)} />);
        await settle();

        expect(container.textContent).toContain('Encrypted image');
        expect(container.querySelector('[data-testid="unencrypted-media-note"]')).toBeNull();
    });

    it.each([
        ['video', 'Encrypted video'],
        // With its separator: the note itself contains the words.
        ['file', ' · end-to-end encrypted'],
    ])('the %s component makes the same distinction', async (kind, label) => {
        const build = (eventEncrypted: boolean) => async () => {
            const { ciphertext, content } = await encryptedContent(
                kind === 'video'
                    ? { msgtype: 'm.video', body: 'c.mp4' }
                    : { msgtype: 'm.file', body: 'f.bin' },
                { mimetype: kind === 'video' ? 'video/mp4' : 'application/zip' }
            );
            fetchArrayBuffer.mockResolvedValue(ciphertext);
            const event = eventOf(content, ROOM, { eventEncrypted });
            const container = await mount(
                kind === 'video' ? <VideoMessage event={event} /> : <FileMessage event={event} />
            );
            await settle();
            if (kind === 'video') {
                await click(container.querySelector('[data-testid="load-encrypted-media"]'));
                await settle();
            }
            return container;
        };

        const exposed = await build(false)();
        expect(exposed.textContent).not.toContain(label);
        expect(exposed.querySelector('[data-testid="unencrypted-media-note"]')?.textContent).toBe(
            EXPOSED_KEY_MEDIA_NOTE
        );

        const sealed = await build(true)();
        expect(sealed.textContent).toContain(label);
        expect(sealed.querySelector('[data-testid="unencrypted-media-note"]')).toBeNull();
    });

    it('in a room without encryption carries no note and no encrypted label', async () => {
        rooms[ROOM] = { hasEncryptionStateEvent: () => false };
        const { ciphertext, content } = await encryptedContent();
        fetchArrayBuffer.mockResolvedValue(ciphertext);

        const container = await mount(
            <ImageMessage event={eventOf(content, ROOM, { eventEncrypted: false })} />
        );
        await settle();

        expect(container.textContent).not.toContain('Encrypted image');
        expect(container.querySelector('[data-testid="unencrypted-media-note"]')).toBeNull();
    });
});

describe('a thumbnail address chosen by the sender', () => {
    const video = (thumbnail: string) => ({
        msgtype: 'm.video',
        body: 'clip.mp4',
        url: 'mxc://hs.example/plainvideo',
        info: { mimetype: 'video/mp4', size: 10, thumbnail_url: thumbnail },
    });

    it.each([
        'https://tracker.example/pixel.png',
        'http://tracker.example/pixel.png',
        '//tracker.example/pixel.png',
        'data:image/png;base64,AAAA',
    ])('is not handed to the browser when it is %s', async (thumbnail) => {
        const container = await mount(<VideoMessage event={eventOf(video(thumbnail))} />);
        await settle();

        const player = container.querySelector('video');
        expect(player).not.toBeNull();
        expect(player?.getAttribute('poster')).toBeNull();
        expect(container.innerHTML).not.toContain('tracker.example');
    });

    it('is loaded from this homeserver when it is an mxc:// address', async () => {
        const container = await mount(
            <VideoMessage event={eventOf(video('mxc://hs.example/thumb1'))} />
        );
        await settle();

        expect(container.querySelector('video')?.getAttribute('poster')).toBe(
            'https://hs.example/_matrix/media/v3/download/hs.example/thumb1'
        );
    });
});

describe('other encrypted media', () => {
    it('a voice note is decrypted when on screen', async () => {
        const { ciphertext, content } = await encryptedContent(
            { msgtype: 'm.audio', body: 'voice.ogg', 'org.matrix.msc3245.voice': {} },
            { mimetype: 'audio/ogg;codecs=opus' }
        );
        fetchArrayBuffer.mockResolvedValue(ciphertext);

        const container = await mount(<AudioMessage event={eventOf(content)} />);
        await settle();

        expect(fetchArrayBuffer).toHaveBeenCalledTimes(1);
        expect(objectUrls[0].type).toBe('audio/ogg');
        expect(container.querySelector('audio')?.getAttribute('src')).toBe('blob:test/1');
    });

    it('a sticker that arrives encrypted is decrypted like an image', async () => {
        const { ciphertext, content } = await encryptedContent({ body: 'wave' });
        fetchArrayBuffer.mockResolvedValue(ciphertext);

        const container = await mount(<StickerMessage event={eventOf(content)} />);
        await settle();

        expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:test/1');
    });

    it('a video is never fetched unasked, however small', async () => {
        const { ciphertext, content } = await encryptedContent(
            { msgtype: 'm.video', body: 'clip.mp4' },
            { mimetype: 'video/mp4', size: 10 }
        );
        fetchArrayBuffer.mockResolvedValue(ciphertext);

        const container = await mount(<VideoMessage event={eventOf(content)} />);
        await settle();

        expect(fetchArrayBuffer).not.toHaveBeenCalled();
        expect(container.querySelector('video')).toBeNull();
        const button = container.querySelector('[data-testid="load-encrypted-media"]');
        expect(button?.textContent).toBe('Load encrypted video (10.0 B)');

        await click(button);
        await settle();

        expect(fetchArrayBuffer).toHaveBeenCalledTimes(1);
        expect(objectUrls[0].type).toBe('video/mp4');
        expect(container.querySelector('video')?.getAttribute('src')).toBe('blob:test/1');
    });
});

describe('loading state across failures and reuse', () => {
    it('a failed load offers "Try again", and trying again fetches again', async () => {
        const { ciphertext, content } = await encryptedContent();
        fetchArrayBuffer
            .mockRejectedValueOnce(
                new BlackoutSdkError(
                    'MEDIA_FETCH_FAILED',
                    'Unable to fetch media (503).',
                    'retryable'
                )
            )
            .mockResolvedValue(ciphertext);

        const container = await mount(<ImageMessage event={eventOf(content)} />);
        await settle();

        expect(container.textContent).toContain('Unable to fetch media (503).');
        expect(container.querySelector('img')).toBeNull();
        const retry = container.querySelector('[data-testid="retry-encrypted-media"]');
        expect(retry?.textContent).toBe('Try again');

        await click(retry);
        await settle();

        expect(fetchArrayBuffer).toHaveBeenCalledTimes(2);
        expect(container.querySelector('[data-testid="media-load-error"]')).toBeNull();
        expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:test/1');
    });

    it('a load the reader asked for can be tried again after it fails', async () => {
        const { ciphertext, content } = await encryptedContent(
            { msgtype: 'm.video', body: 'clip.mp4' },
            { mimetype: 'video/mp4', size: 10 }
        );
        fetchArrayBuffer
            .mockRejectedValueOnce(
                new BlackoutSdkError(
                    'MEDIA_FETCH_FAILED',
                    'Unable to fetch media (502).',
                    'retryable'
                )
            )
            .mockResolvedValue(ciphertext);

        const container = await mount(<VideoMessage event={eventOf(content)} />);
        await settle();
        await click(container.querySelector('[data-testid="load-encrypted-media"]'));
        await settle();

        expect(fetchArrayBuffer).toHaveBeenCalledTimes(1);
        expect(container.textContent).toContain('Unable to fetch media (502).');
        expect(container.querySelector('video')).toBeNull();

        await click(container.querySelector('[data-testid="retry-encrypted-media"]'));
        await settle();

        expect(fetchArrayBuffer).toHaveBeenCalledTimes(2);
        expect(container.querySelector('[data-testid="media-load-error"]')).toBeNull();
        expect(container.querySelector('video')?.getAttribute('src')).toBe('blob:test/1');
    });

    it('an unencrypted image that fails offers no retry: the browser loads it, not this code', async () => {
        const container = await mount(
            <ImageMessage
                event={eventOf({ msgtype: 'm.image', body: 'p.png', url: 'not-an-mxc-uri' })}
            />
        );
        await settle();

        expect(container.textContent).toContain('Invalid MXC URI');
        expect(container.querySelector('[data-testid="retry-encrypted-media"]')).toBeNull();
    });

    it("a component reused for another message does not inherit the reader's request", async () => {
        const first = await encryptedContent(
            { msgtype: 'm.video', body: 'one.mp4' },
            { mimetype: 'video/mp4', size: 10 }
        );
        const second = await encryptedContent(
            {
                msgtype: 'm.video',
                body: 'two.mp4',
            },
            { mimetype: 'video/mp4', size: 10 }
        );
        (second.content.file as { url: string }).url = 'mxc://hs.example/cipher2';
        fetchArrayBuffer.mockImplementation(async (url) =>
            String(url).endsWith('cipher2') ? second.ciphertext : first.ciphertext
        );

        const holder = document.createElement('div');
        document.body.appendChild(holder);
        const root = ReactDOM.createRoot(holder);
        mounted.push(root);
        await act(async () => {
            root.render(<VideoMessage event={eventOf(first.content)} />);
        });
        await settle();
        await click(holder.querySelector('[data-testid="load-encrypted-media"]'));
        await settle();
        expect(fetchArrayBuffer).toHaveBeenCalledTimes(1);
        expect(holder.querySelector('video')?.getAttribute('src')).toBe('blob:test/1');

        // Same component instance, another message: nothing is fetched for it
        // until the reader asks, and the first message's copy is released.
        await act(async () => {
            root.render(<VideoMessage event={eventOf(second.content)} />);
        });
        await settle();

        expect(fetchArrayBuffer).toHaveBeenCalledTimes(1);
        expect(holder.querySelector('video')).toBeNull();
        expect(revoked).toEqual(['blob:test/1']);
        expect(holder.querySelector('[data-testid="load-encrypted-media"]')).not.toBeNull();

        await click(holder.querySelector('[data-testid="load-encrypted-media"]'));
        await settle();
        expect(fetchArrayBuffer).toHaveBeenCalledTimes(2);
        expect(String(fetchArrayBuffer.mock.calls[1][0])).toContain('cipher2');
        expect(holder.querySelector('video')?.getAttribute('src')).toBe('blob:test/2');
    });
});

describe('an encrypted file in the timeline', () => {
    const fileContent = (mimetype: string, body: string) =>
        encryptedContent({ msgtype: 'm.file', body }, { mimetype });

    it('is not fetched when shown; Download fetches, decrypts and saves it under its name', async () => {
        const { ciphertext, content } = await fileContent('application/pdf', 'minutes.pdf');
        fetchArrayBuffer.mockResolvedValue(ciphertext);

        const container = await mount(<FileMessage event={eventOf(content)} />);
        await settle();

        expect(fetchArrayBuffer).not.toHaveBeenCalled();
        expect(container.textContent).toContain('minutes.pdf');
        expect(container.textContent).toContain('encrypted');
        // No link to the ciphertext, and no inline preview of a decrypted document.
        expect(container.querySelector('a')).toBeNull();
        expect(container.querySelector('iframe')).toBeNull();

        await click(container.querySelector('[data-testid="download-encrypted-file"]'));
        await settle();

        expect(fetchArrayBuffer).toHaveBeenCalledTimes(1);
        expect(fetchArrayBuffer.mock.calls[0][2]?.maxBytes).toBeUndefined();
        expect(saveAs).toHaveBeenCalledTimes(1);
        const [blob, name] = saveAs.mock.calls[0] as [Blob, string];
        expect(name).toBe('minutes.pdf');
        expect(new TextDecoder().decode(await readBlob(blob))).toBe(PLAINTEXT);
        expect(container.querySelector('iframe')).toBeNull();
        expect(objectUrls).toHaveLength(0);
    });

    it.each(['text/html', 'image/svg+xml', 'application/pdf', 'image/png'])(
        'declared as %s is saved as an opaque blob, never one a browser would render',
        async (mimetype) => {
            const { ciphertext, content } = await fileContent(mimetype, 'file.bin');
            fetchArrayBuffer.mockResolvedValue(ciphertext);

            const container = await mount(<FileMessage event={eventOf(content)} />);
            await settle();
            await click(container.querySelector('[data-testid="download-encrypted-file"]'));
            await settle();

            const [blob] = saveAs.mock.calls[0] as [Blob, string];
            expect(blob.type).toBe('application/octet-stream');
        }
    );

    it('that was changed on the server is not saved', async () => {
        const { ciphertext, content } = await fileContent('text/plain', 'notes.txt');
        const tampered = new Uint8Array(ciphertext.slice(0));
        tampered[1] ^= 0x10;
        fetchArrayBuffer.mockResolvedValue(tampered.buffer);

        const container = await mount(<FileMessage event={eventOf(content)} />);
        await settle();
        await click(container.querySelector('[data-testid="download-encrypted-file"]'));
        await settle();

        expect(saveAs).not.toHaveBeenCalled();
        expect(container.textContent).toContain('does not match the fingerprint in its message');
    });
});

describe('media sent without encryption', () => {
    const plain = (msgtype: string, body: string, mimetype: string) => ({
        msgtype,
        body,
        url: 'mxc://hs.example/plain1',
        info: { mimetype, size: 1234 },
    });
    const PLAIN_URL = 'https://hs.example/_matrix/media/v3/download/hs.example/plain1';

    it('is shown straight from the media URL, with nothing fetched by this code', async () => {
        rooms[ROOM] = { hasEncryptionStateEvent: () => false };
        const container = await mount(
            <ImageMessage event={eventOf(plain('m.image', 'photo.png', 'image/png'))} />
        );
        await settle();

        expect(fetchArrayBuffer).not.toHaveBeenCalled();
        expect(objectUrls).toHaveLength(0);
        expect(container.querySelector('img')?.getAttribute('src')).toBe(PLAIN_URL);
        expect(container.textContent).not.toContain(UNENCRYPTED_MEDIA_NOTE);
    });

    it.each([
        ['image', () => <ImageMessage event={eventOf(plain('m.image', 'p.png', 'image/png'))} />],
        ['video', () => <VideoMessage event={eventOf(plain('m.video', 'c.mp4', 'video/mp4'))} />],
        ['audio', () => <AudioMessage event={eventOf(plain('m.audio', 'a.ogg', 'audio/ogg'))} />],
        ['file', () => <FileMessage event={eventOf(plain('m.file', 'f.txt', 'text/plain'))} />],
    ])(
        'in an encrypted room, an unencrypted %s says the server can read it',
        async (_kind, render) => {
            const container = await mount(render());
            await settle();

            const note = container.querySelector('[data-testid="unencrypted-media-note"]');
            expect(note?.textContent).toBe(UNENCRYPTED_MEDIA_NOTE);
            expect(fetchArrayBuffer).not.toHaveBeenCalled();
        }
    );

    it('in a room without encryption, carries no such note', async () => {
        rooms[ROOM] = { hasEncryptionStateEvent: () => false };
        const container = await mount(
            <FileMessage event={eventOf(plain('m.file', 'f.txt', 'text/plain'))} />
        );
        await settle();

        expect(container.querySelector('[data-testid="unencrypted-media-note"]')).toBeNull();
        expect(container.querySelector('a')?.getAttribute('href')).toBe(PLAIN_URL);
    });

    it('a sticker in an encrypted room carries no note: packs are not private to the room', async () => {
        const container = await mount(
            <StickerMessage event={eventOf(plain('m.sticker', 'wave', 'image/png'))} />
        );
        await settle();

        expect(container.querySelector('[data-testid="unencrypted-media-note"]')).toBeNull();
        expect(container.querySelector('img')?.getAttribute('src')).toBe(PLAIN_URL);
    });
});
