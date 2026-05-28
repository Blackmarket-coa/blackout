// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPerturbableImage, perturbImageClientSide } from '../../../src/app/utils/perturbImage';

const makeFile = (name: string, type: string, bytes = [1, 2, 3]) =>
    new File([new Uint8Array(bytes)], name, { type });

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('isPerturbableImage', () => {
    it('accepts jpeg/png/webp and rejects others', () => {
        expect(isPerturbableImage(makeFile('a.jpg', 'image/jpeg'))).toBe(true);
        expect(isPerturbableImage(makeFile('a.png', 'image/png'))).toBe(true);
        expect(isPerturbableImage(makeFile('a.gif', 'image/gif'))).toBe(false);
        expect(isPerturbableImage(makeFile('a.pdf', 'application/pdf'))).toBe(false);
    });
});

describe('perturbImageClientSide', () => {
    it('passes through non-raster types unchanged', async () => {
        const gif = makeFile('a.gif', 'image/gif');
        expect(await perturbImageClientSide(gif)).toBe(gif);
    });

    it('returns the original when canvas APIs are unavailable', async () => {
        vi.stubGlobal('createImageBitmap', undefined);
        const jpeg = makeFile('a.jpg', 'image/jpeg');
        expect(await perturbImageClientSide(jpeg)).toBe(jpeg);
    });

    it('re-encodes a perturbed image preserving name/type/dimensions', async () => {
        const close = vi.fn();
        vi.stubGlobal(
            'createImageBitmap',
            vi.fn(async () => ({ width: 3, height: 2, close }))
        );
        const imageData = { data: new Uint8ClampedArray(3 * 2 * 4).fill(128), width: 3, height: 2 };
        const putImageData = vi.fn();
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
            drawImage: vi.fn(),
            getImageData: vi.fn(() => imageData),
            putImageData,
        } as unknown as CanvasRenderingContext2D);
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
            this: HTMLCanvasElement,
            cb: BlobCallback,
            type?: string
        ) {
            cb(new Blob([new Uint8Array([7, 7, 7])], { type: type ?? 'image/png' }));
        } as HTMLCanvasElement['toBlob']);

        const png = makeFile('face.png', 'image/png');
        const result = await perturbImageClientSide(png);

        expect(result).not.toBe(png);
        expect(result.name).toBe('face.png');
        expect(result.type).toBe('image/png');
        expect(putImageData).toHaveBeenCalled();
        // Pixels were modified away from the flat 128 fill.
        expect([...imageData.data].some((v) => v !== 128)).toBe(true);
        expect(close).toHaveBeenCalled();
    });
});
