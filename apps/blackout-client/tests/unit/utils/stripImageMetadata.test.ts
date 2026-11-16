// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { keepsMetadata, stripImageMetadata } from '../../../src/app/utils/stripImageMetadata';

const makeFile = (name: string, type: string, bytes = [1, 2, 3]) =>
    new File([new Uint8Array(bytes)], name, { type });

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('stripImageMetadata', () => {
    it('passes through non-strippable types unchanged (same reference)', async () => {
        const gif = makeFile('a.gif', 'image/gif');
        expect(await stripImageMetadata(gif)).toBe(gif);

        const pdf = makeFile('a.pdf', 'application/pdf');
        expect(await stripImageMetadata(pdf)).toBe(pdf);
    });

    it('returns the original when canvas APIs are unavailable', async () => {
        vi.stubGlobal('createImageBitmap', undefined);
        const jpeg = makeFile('a.jpg', 'image/jpeg');
        expect(await stripImageMetadata(jpeg)).toBe(jpeg);
    });

    it('re-encodes strippable images into a new File preserving name and type', async () => {
        const close = vi.fn();
        vi.stubGlobal(
            'createImageBitmap',
            vi.fn(async () => ({ width: 2, height: 2, close }))
        );
        // Force the canvas path to produce a deterministic blob.
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
            drawImage: vi.fn(),
        } as unknown as CanvasRenderingContext2D);
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
            this: HTMLCanvasElement,
            cb: BlobCallback,
            type?: string
        ) {
            cb(new Blob([new Uint8Array([9, 9, 9])], { type: type ?? 'image/jpeg' }));
        } as HTMLCanvasElement['toBlob']);

        const jpeg = makeFile('photo.jpg', 'image/jpeg', [1, 2, 3, 4, 5]);
        const result = await stripImageMetadata(jpeg);

        expect(result).not.toBe(jpeg);
        expect(result.name).toBe('photo.jpg');
        expect(result.type).toBe('image/jpeg');
        expect(close).toHaveBeenCalled();
    });
});

// The privacy tools said metadata stripping was "always on". It is done only
// for JPEG, PNG and WebP, so the message box needs to know which attachments
// go out with their metadata. docs/security/trust-claims-2026-11-16.md, T12.
describe('keepsMetadata', () => {
    const stubCanvas = () => {
        vi.stubGlobal(
            'createImageBitmap',
            vi.fn(async () => ({ width: 2, height: 2, close: vi.fn() }))
        );
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
            drawImage: vi.fn(),
        } as unknown as CanvasRenderingContext2D);
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
            this: HTMLCanvasElement,
            cb: BlobCallback,
            type?: string
        ) {
            cb(new Blob([new Uint8Array([9])], { type: type ?? 'image/jpeg' }));
        } as HTMLCanvasElement['toBlob']);
    };

    it('is false for a picture this module re-encoded, and true for its original', async () => {
        stubCanvas();
        const original = makeFile('photo.jpg', 'image/jpeg');
        const cleaned = await stripImageMetadata(original);
        expect(keepsMetadata(cleaned)).toBe(false);
        expect(keepsMetadata(original)).toBe(true);
    });

    it('is true for a JPEG that could not be re-encoded', async () => {
        vi.stubGlobal('createImageBitmap', undefined);
        const jpeg = makeFile('photo.jpg', 'image/jpeg');
        expect(keepsMetadata(await stripImageMetadata(jpeg))).toBe(true);
    });

    it.each([
        ['IMG_0042.heic', 'image/heic'],
        ['IMG_0042.heif', 'image/heif'],
        ['photo.avif', 'image/avif'],
        ['scan.tiff', 'image/tiff'],
        ['loop.gif', 'image/gif'],
    ])('is true for a picture in a format it does not re-encode: %s', async (name, type) => {
        stubCanvas();
        expect(keepsMetadata(await stripImageMetadata(makeFile(name, type)))).toBe(true);
    });

    it('is true for a picture whose type the browser did not report, known by its name', async () => {
        expect(keepsMetadata(makeFile('IMG_0042.HEIC', ''))).toBe(true);
    });

    it.each([
        ['clip.mp4', 'video/mp4'],
        ['IMG_0043.MOV', 'video/quicktime'],
        ['IMG_0044.MOV', ''],
    ])('is true for a video, which is never re-encoded: %s', (name, type) => {
        expect(keepsMetadata(makeFile(name, type))).toBe(true);
    });

    it.each([
        ['notes.txt', 'text/plain'],
        ['report.pdf', 'application/pdf'],
        ['voice.ogg', 'audio/ogg'],
        ['README', ''],
    ])('is false for a file that is not a picture or a video: %s', (name, type) => {
        expect(keepsMetadata(makeFile(name, type))).toBe(false);
    });
});
