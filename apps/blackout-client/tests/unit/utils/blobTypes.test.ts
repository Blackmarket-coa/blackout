// @vitest-environment jsdom
//
// A blob made from media bytes lives in this app's origin. If its type is one
// a browser renders as a document (HTML, SVG, XML), then opening it in a tab
// runs whatever script is in it with the app's session and keys. The type
// comes from whoever sent the media, so every place that makes such a blob has
// to refuse those types.
//
// These are the two places the older message components (still mounted in
// message search) make their blobs.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encryptAttachment } from 'browser-encrypt-attachment';
import { decryptFile, downloadMedia } from '../../../src/app/utils/matrix';
import { FALLBACK_MIMETYPE, getBlobSafeMimeType } from '../../../src/app/utils/mimeTypes';

const DOCUMENT_TYPES = [
    'text/html',
    'application/xhtml+xml',
    'image/svg+xml',
    'application/xml',
    'text/xml',
    'text/javascript',
    'application/javascript',
    'application/ecmascript',
    'text/css',
    'application/pdf',
    'text/plain',
];

describe('getBlobSafeMimeType', () => {
    it.each(DOCUMENT_TYPES)('refuses %s', (type) => {
        expect(getBlobSafeMimeType(type)).toBe(FALLBACK_MIMETYPE);
    });

    it('keeps raster image, audio and video types', () => {
        expect(getBlobSafeMimeType('image/png')).toBe('image/png');
        expect(getBlobSafeMimeType('audio/ogg')).toBe('audio/ogg');
        expect(getBlobSafeMimeType('video/webm')).toBe('video/webm');
    });

    it('is not fooled by case, padding or parameters', () => {
        expect(getBlobSafeMimeType(' Image/PNG ; charset=utf-8')).toBe('image/png');
        expect(getBlobSafeMimeType('TEXT/HTML')).toBe(FALLBACK_MIMETYPE);
        expect(getBlobSafeMimeType('image/png, text/html')).toBe(FALLBACK_MIMETYPE);
    });
});

describe('decryptFile', () => {
    const encrypted = async () => {
        const result = await encryptAttachment(new TextEncoder().encode('<svg onload=1>').buffer);
        return { data: result.data, info: result.info };
    };

    it.each(DOCUMENT_TYPES)('gives a file declared as %s the opaque type', async (type) => {
        const { data, info } = await encrypted();
        const blob = await decryptFile(data, type, info);
        expect(blob.type).toBe('application/octet-stream');
    });

    it('keeps a raster image type, so the image still shows', async () => {
        const { data, info } = await encrypted();
        const blob = await decryptFile(data, 'image/png', info);
        expect(blob.type).toBe('image/png');
        expect(blob.size).toBe('<svg onload=1>'.length);
    });
});

describe('downloadMedia', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const serve = (type: string) =>
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({
                blob: async () => new Blob(['<script>1</script>'], { type }),
            }))
        );

    it.each(['text/html', 'image/svg+xml', 'application/xhtml+xml'])(
        'does not pass on a %s type the server reports',
        async (type) => {
            serve(type);
            const blob = await downloadMedia('https://hs.example/_matrix/media/v3/download/a/b');
            expect(blob.type).toBe('application/octet-stream');
            expect(blob.size).toBe('<script>1</script>'.length);
        }
    );

    it('keeps a raster image type', async () => {
        serve('image/jpeg');
        const blob = await downloadMedia('https://hs.example/_matrix/media/v3/download/a/b');
        expect(blob.type).toBe('image/jpeg');
    });
});
