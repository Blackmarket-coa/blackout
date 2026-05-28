// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stripImageMetadata } from '../../../src/app/utils/stripImageMetadata';

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
