// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { nativePickVideo } from '../../src/platform/nativeMediaBridge';

const waitForInput = async (): Promise<HTMLInputElement> => {
    for (let i = 0; i < 50; i += 1) {
        const input = document.body.querySelector('input[type="file"]');
        if (input) return input as HTMLInputElement;
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error('Timed out waiting for file input to mount');
};

describe('nativePickVideo', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('opens the camera in video mode via the capture hint', async () => {
        const promise = nativePickVideo({ source: 'camera' });
        const input = await waitForInput();

        expect(input.getAttribute('accept')).toBe('video/*');
        expect(input.getAttribute('capture')).toBe('environment');

        input.dispatchEvent(new Event('change'));
        expect(await promise).toBeNull();
    });

    it('omits the capture hint for gallery picks', async () => {
        const promise = nativePickVideo({ source: 'gallery' });
        const input = await waitForInput();

        expect(input.getAttribute('capture')).toBeNull();

        input.dispatchEvent(new Event('change'));
        await promise;
    });

    it('returns the recorded file as a NativePickedVideo', async () => {
        const promise = nativePickVideo({ source: 'camera' });
        const input = await waitForInput();

        const file = new File([new Uint8Array([9, 9, 9])], 'take.mp4', {
            type: 'video/mp4',
        });
        Object.defineProperty(input, 'files', {
            configurable: true,
            value: [file] as unknown as FileList,
        });

        input.dispatchEvent(new Event('change'));
        const result = await promise;
        expect(result).toMatchObject({
            source: 'file-input',
            contentType: 'video/mp4',
            filename: 'take.mp4',
        });
    });

    it('falls back to a synthetic name and mp4 type when the picker omits them', async () => {
        const promise = nativePickVideo();
        const input = await waitForInput();

        const anonymous = new File([new Uint8Array([1])], '', { type: '' });
        Object.defineProperty(input, 'files', {
            configurable: true,
            value: [anonymous] as unknown as FileList,
        });

        input.dispatchEvent(new Event('change'));
        const result = await promise;
        expect(result).toMatchObject({
            contentType: 'video/mp4',
            filename: 'video.mp4',
        });
    });
});
