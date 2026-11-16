import { describe, expect, it } from 'vitest';

import {
    attachmentKind,
    buildAttachmentContent,
} from '../../../../src/app/features/room/attachmentContent';

describe('attachmentKind', () => {
    it('classifies by mimetype prefix with m.file as the fallback', () => {
        expect(attachmentKind('image/png')).toBe('image');
        expect(attachmentKind('image/gif')).toBe('image');
        expect(attachmentKind('video/mp4')).toBe('video');
        expect(attachmentKind('audio/ogg')).toBe('audio');
        expect(attachmentKind('application/pdf')).toBe('file');
        expect(attachmentKind('')).toBe('file');
    });
});

describe('buildAttachmentContent', () => {
    const url = 'mxc://example.org/abc';
    const base = {
        source: { url },
        fileName: 'photo.png',
        mimeType: 'image/png',
        size: 1024,
    };

    it('sends images as m.image with dimensions when measured', () => {
        expect(buildAttachmentContent({ ...base, dims: { w: 640, h: 480 } })).toEqual({
            msgtype: 'm.image',
            body: 'photo.png',
            url,
            info: { mimetype: 'image/png', size: 1024, w: 640, h: 480 },
        });
    });

    it('omits w/h when dimensions are unknown', () => {
        const content = buildAttachmentContent(base);
        expect(content.msgtype).toBe('m.image');
        expect(content.info).toEqual({ mimetype: 'image/png', size: 1024 });
    });

    it('maps video and audio mimetypes to their msgtypes', () => {
        expect(
            buildAttachmentContent({ ...base, fileName: 'clip.mp4', mimeType: 'video/mp4' }).msgtype
        ).toBe('m.video');
        expect(
            buildAttachmentContent({ ...base, fileName: 'song.ogg', mimeType: 'audio/ogg' }).msgtype
        ).toBe('m.audio');
    });

    it('keeps everything else as the legacy m.file shape', () => {
        expect(
            buildAttachmentContent({
                ...base,
                fileName: 'doc.pdf',
                mimeType: 'application/pdf',
            })
        ).toEqual({
            msgtype: 'm.file',
            body: 'doc.pdf',
            url,
            info: { mimetype: 'application/pdf', size: 1024 },
        });
    });

    const encryptedFile = {
        url: 'mxc://example.org/ciphertext',
        v: 'v2',
        key: { alg: 'A256CTR', key_ops: ['encrypt', 'decrypt'], kty: 'oct', k: 'a2V5', ext: true },
        iv: 'aXY',
        hashes: { sha256: 'aGFzaA' },
    };

    it('references an encrypted upload by `file`, and writes no `url` beside it', () => {
        const content = buildAttachmentContent({ ...base, source: { file: encryptedFile } });
        expect(content).toEqual({
            msgtype: 'm.image',
            body: 'photo.png',
            file: encryptedFile,
            info: { mimetype: 'image/png', size: 1024 },
        });
        expect('url' in content).toBe(false);
    });
});
