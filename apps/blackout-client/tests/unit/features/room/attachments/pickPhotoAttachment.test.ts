// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NativePickedPhoto } from '../../../../../src/platform/nativeMediaBridge';
import { pickPhotoAttachment } from '../../../../../src/app/features/room/attachments/pickPhotoAttachment';

const makePicked = (overrides: Partial<NativePickedPhoto> = {}): NativePickedPhoto => ({
    source: 'capacitor-camera',
    contentType: 'image/jpeg',
    blob: new Blob(['fake-bytes'], { type: 'image/jpeg' }),
    filename: 'snap.jpg',
    ...overrides,
});

beforeEach(() => {
    vi.useRealTimers();
});

describe('pickPhotoAttachment (Workstream A Port 4 carry-over — native composer attach)', () => {
    it('returns null when the native picker resolves to null (user cancel)', async () => {
        const pickPhoto = vi.fn(async () => null);
        const result = await pickPhotoAttachment({ pickPhoto });
        expect(result).toBeNull();
        // The picker was invoked with the default `auto` source.
        expect(pickPhoto).toHaveBeenCalledWith({ source: 'auto' });
    });

    it('forwards the explicit source option to the picker', async () => {
        const pickPhoto = vi.fn(async () => null);
        await pickPhotoAttachment({ pickPhoto, source: 'camera' });
        expect(pickPhoto).toHaveBeenCalledWith({ source: 'camera' });
    });

    it('returns null when the picked photo has a zero-byte blob', async () => {
        const pickPhoto = vi.fn(async () =>
            makePicked({ blob: new Blob([], { type: 'image/jpeg' }) }),
        );
        const result = await pickPhotoAttachment({ pickPhoto });
        expect(result).toBeNull();
    });

    it('builds a File with the picker filename, contentType, and the source-label surfaced', async () => {
        const pickPhoto = vi.fn(async () =>
            makePicked({
                source: 'file-input',
                contentType: 'image/png',
                filename: 'paste.png',
                blob: new Blob(['payload'], { type: 'image/png' }),
            }),
        );
        const result = await pickPhotoAttachment({ pickPhoto });
        expect(result).not.toBeNull();
        expect(result?.source).toBe('file-input');
        expect(result?.file.name).toBe('paste.png');
        expect(result?.file.type).toBe('image/png');
        expect(result?.file.size).toBe(new Blob(['payload']).size);
    });

    it('falls back to a synthetic filename when the picker provides an empty one', async () => {
        const fixedNow = 1_730_000_000_000;
        vi.useFakeTimers();
        vi.setSystemTime(fixedNow);

        const pickPhoto = vi.fn(async () => makePicked({ filename: '' }));
        const result = await pickPhotoAttachment({ pickPhoto });
        expect(result?.file.name).toBe(`photo-${fixedNow}`);

        vi.useRealTimers();
    });

    it('falls back to application/octet-stream when the picker reports no contentType', async () => {
        const pickPhoto = vi.fn(async () =>
            makePicked({ contentType: '', blob: new Blob(['bytes']) }),
        );
        const result = await pickPhotoAttachment({ pickPhoto });
        // The bridge's blob may still report its own MIME, but the File
        // factory receives the explicit fallback type.
        expect(result?.file.type).toBe('application/octet-stream');
    });

    it('uses the injected fileFactory when provided (test-double escape hatch)', async () => {
        const pickPhoto = vi.fn(async () => makePicked({ filename: 'snap.jpg' }));
        const fakeFile = { name: 'fake', type: 'image/jpeg', size: 42 } as unknown as File;
        const fileFactory = vi.fn(() => fakeFile);

        const result = await pickPhotoAttachment({ pickPhoto, fileFactory });
        expect(fileFactory).toHaveBeenCalledTimes(1);
        // First arg: blob parts array containing the bridge's blob.
        const [bits, name, options] = fileFactory.mock.calls[0] as [
            BlobPart[],
            string,
            FilePropertyBag | undefined,
        ];
        expect(Array.isArray(bits)).toBe(true);
        expect(bits).toHaveLength(1);
        expect(name).toBe('snap.jpg');
        expect(options?.type).toBe('image/jpeg');
        expect(result?.file).toBe(fakeFile);
    });
});
