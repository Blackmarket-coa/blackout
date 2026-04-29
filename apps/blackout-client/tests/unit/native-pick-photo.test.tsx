// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { nativePickPhoto } from '../../src/platform/nativeMediaBridge';

const waitForInput = async (): Promise<HTMLInputElement> => {
    for (let i = 0; i < 50; i += 1) {
        const input = document.body.querySelector('input[type="file"]');
        if (input) return input as HTMLInputElement;
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error('Timed out waiting for file input fallback to mount');
};

describe('nativePickPhoto', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('returns null when the user cancels the file input (no files)', async () => {
        const promise = nativePickPhoto({ source: 'camera' });
        const input = await waitForInput();

        expect(input.getAttribute('capture')).toBe('environment');
        expect(input.getAttribute('accept')).toBe('image/*');

        input.dispatchEvent(new Event('change'));
        const result = await promise;
        expect(result).toBeNull();
    });

    it('omits the capture hint when source is gallery', async () => {
        const promise = nativePickPhoto({ source: 'gallery' });
        const input = await waitForInput();

        expect(input.getAttribute('capture')).toBeNull();

        input.dispatchEvent(new Event('change'));
        await promise;
    });

    it('returns the picked file as a NativePickedPhoto when the user picks one', async () => {
        const promise = nativePickPhoto({ source: 'auto' });
        const input = await waitForInput();

        const file = new File([new Uint8Array([1, 2, 3])], 'cat.png', {
            type: 'image/png',
        });

        // jsdom forbids assigning to input.files via setters; spoof with defineProperty.
        Object.defineProperty(input, 'files', {
            configurable: true,
            value: [file] as unknown as FileList,
        });

        input.dispatchEvent(new Event('change'));
        const result = await promise;

        expect(result).not.toBeNull();
        expect(result?.source).toBe('file-input');
        expect(result?.contentType).toBe('image/png');
        expect(result?.filename).toBe('cat.png');
        expect(result?.blob).toBe(file);
    });
});
