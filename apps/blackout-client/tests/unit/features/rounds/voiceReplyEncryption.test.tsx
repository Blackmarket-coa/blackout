// @vitest-environment jsdom
//
// A voice reply to a round is a file posted into a room. In an encrypted room
// it must reach the server as ciphertext, like any other attachment.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptAttachment, type EncryptedAttachmentInfo } from 'browser-encrypt-attachment';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const uploads: Array<{ body: Blob; opts: Record<string, unknown> | undefined }> = [];
const sent: Array<{ roomId: string; type: string; content: Record<string, unknown> }> = [];
let encrypted = true;

const client = {
    getRoom: () => ({ hasEncryptionStateEvent: () => encrypted }),
    getCrypto: () => ({ isEncryptionEnabledInRoom: async () => false }),
    uploadContent: vi.fn(async (body: Blob, opts?: Record<string, unknown>) => {
        uploads.push({ body, opts });
        return { content_uri: 'mxc://example.org/voice1' };
    }),
    sendEvent: vi.fn(async (roomId: string, type: string, content: Record<string, unknown>) => {
        sent.push({ roomId, type, content });
        return { event_id: '$reply' };
    }),
};

vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => client,
}));

import { useSendVoiceRoundReply } from '../../../../src/app/features/rounds/useRounds';

const VOICE = 'OPUS-FRAMES-OF-A-PRIVATE-VOICE-NOTE';

const readBytes = (blob: Blob): Promise<Uint8Array> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
    });

const mountReplier = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    const api: { current: ReturnType<typeof useSendVoiceRoundReply> | null } = { current: null };
    const Probe = () => {
        api.current = useSendVoiceRoundReply('!round-room:example.org');
        return null;
    };
    await act(async () => {
        root.render(<Probe />);
    });
    return {
        send: (file: File) =>
            (api.current as ReturnType<typeof useSendVoiceRoundReply>)(file, '$round'),
        unmount: async () => {
            await act(async () => root.unmount());
            container.remove();
        },
    };
};

beforeEach(() => {
    uploads.length = 0;
    sent.length = 0;
    encrypted = true;
    client.uploadContent.mockClear();
    client.sendEvent.mockClear();
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('a voice reply to a round', () => {
    it('in an encrypted room is uploaded as ciphertext and referenced by `file`', async () => {
        const replier = await mountReplier();
        await act(async () => {
            await replier.send(new File([VOICE], 'voice-note-1.webm', { type: 'audio/webm' }));
        });

        expect(uploads).toHaveLength(1);
        const uploaded = await readBytes(uploads[0].body);
        expect(new TextDecoder().decode(uploaded)).not.toContain('OPUS-FRAMES');
        expect(uploads[0].opts).toEqual({
            includeFilename: false,
            type: 'application/octet-stream',
        });

        expect(sent).toHaveLength(1);
        const { content, roomId, type } = sent[0];
        expect(roomId).toBe('!round-room:example.org');
        expect(type).toBe('m.room.message');
        expect(content.url).toBeUndefined();
        expect(content.msgtype).toBe('m.audio');
        expect(content['org.matrix.msc3245.voice']).toEqual({});
        expect(content['m.relates_to']).toEqual({ 'm.in_reply_to': { event_id: '$round' } });

        const file = content.file as EncryptedAttachmentInfo & { url: string };
        expect(file.url).toBe('mxc://example.org/voice1');
        const decrypted = await decryptAttachment(uploaded.buffer as ArrayBuffer, file);
        expect(new TextDecoder().decode(decrypted)).toBe(VOICE);
        await replier.unmount();
    });

    it('in a room without encryption is uploaded as it is and referenced by `url`', async () => {
        encrypted = false;
        const replier = await mountReplier();
        await act(async () => {
            await replier.send(new File([VOICE], 'voice-note-1.webm', { type: 'audio/webm' }));
        });

        expect(new TextDecoder().decode(await readBytes(uploads[0].body))).toBe(VOICE);
        expect(sent[0].content.url).toBe('mxc://example.org/voice1');
        expect(sent[0].content.file).toBeUndefined();
        await replier.unmount();
    });
});
