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
    const base = {
        url: 'mxc://example.org/abc',
        fileName: 'photo.png',
        mimeType: 'image/png',
        size: 1024,
    };

    it('sends images as m.image with dimensions when measured', () => {
        expect(buildAttachmentContent({ ...base, dims: { w: 640, h: 480 } })).toEqual({
            msgtype: 'm.image',
            body: 'photo.png',
            url: base.url,
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
            url: base.url,
            info: { mimetype: 'application/pdf', size: 1024 },
        });
    });
});
