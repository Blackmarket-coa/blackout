// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initMock = vi.fn();
const canEncodeVideoMock = vi.fn();

class FakeBufferTarget {
    buffer: ArrayBuffer | null = null;
}

vi.mock('mediabunny', () => ({
    ALL_FORMATS: ['all'],
    BlobSource: class {
        constructor(public blob: unknown) {}
    },
    BufferTarget: FakeBufferTarget,
    Mp4OutputFormat: class {},
    Input: class {
        constructor(public opts: unknown) {}
        async getPrimaryVideoTrack() {
            return { displayWidth: 1920, displayHeight: 1080 };
        }
    },
    Output: class {
        target: FakeBufferTarget;
        constructor(opts: { target: FakeBufferTarget }) {
            this.target = opts.target;
        }
    },
    Conversion: { init: (...args: unknown[]) => initMock(...args) },
    canEncodeVideo: (...args: unknown[]) => canEncodeVideoMock(...args),
}));

import {
    buildPictureOps,
    fastTranscodeClip,
    fastTranscodeSupported,
} from '../../../../src/app/features/streaming/composer/fastTranscode';

describe('buildPictureOps', () => {
    it('is a no-op for plain trims (no crop, no compress)', () => {
        expect(buildPictureOps(1920, 1080, { vertical: false })).toEqual({});
    });

    it('crops a landscape source to centered 9:16', () => {
        const ops = buildPictureOps(1920, 1080, { vertical: true });
        // 1080 * 9/16 = 607 → crop centered horizontally, full height.
        expect(ops.crop).toEqual({ left: 656, top: 0, width: 607, height: 1080 });
        // Encoder-safe even output dimensions.
        expect(ops.width).toBe(606);
        expect(ops.height).toBe(1080);
    });

    it('keeps already-narrow sources uncropped wider than 9:16', () => {
        const ops = buildPictureOps(500, 1920, { vertical: true });
        expect(ops.crop).toEqual({ left: 0, top: 0, width: 500, height: 1920 });
    });

    it('bounds landscape compress to 720p without upscaling', () => {
        expect(buildPictureOps(1920, 1080, { vertical: false, compress: true })).toEqual({
            width: 1280,
            height: 720,
        });
        expect(buildPictureOps(640, 360, { vertical: false, compress: true })).toEqual({
            width: 640,
            height: 360,
        });
    });

    it('bounds vertical compress to 1280 tall after the crop', () => {
        const ops = buildPictureOps(3840, 2160, { vertical: true, compress: true });
        expect(ops.crop?.width).toBe(1215);
        expect(ops.height).toBe(1280);
        // 1215 * (1280/2160) = 720
        expect(ops.width).toBe(720);
    });
});

describe('fastTranscodeClip', () => {
    beforeEach(() => {
        initMock.mockReset();
        canEncodeVideoMock.mockReset();
        vi.stubGlobal('VideoEncoder', class {});
        vi.stubGlobal('AudioEncoder', class {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const file = new File([new Uint8Array([1])], 'in.mp4', { type: 'video/mp4' });

    it('reports support from the WebCodecs globals', () => {
        expect(fastTranscodeSupported()).toBe(true);
    });

    it('maps trim/crop/scale options into the conversion and returns the mp4', async () => {
        canEncodeVideoMock.mockResolvedValue(true);
        initMock.mockImplementation(async (opts: { output: { target: FakeBufferTarget } }) => ({
            isValid: true,
            onProgress: null,
            execute: async () => {
                opts.output.target.buffer = new Uint8Array([9, 9]).buffer;
            },
        }));

        const blob = await fastTranscodeClip(file, {
            startSeconds: 2,
            endSeconds: 12,
            vertical: true,
            compress: true,
        });

        expect(blob.type).toBe('video/mp4');
        expect(blob.size).toBe(2);
        const [opts] = initMock.mock.calls[0] as [
            {
                trim: { start: number; end: number };
                video: Record<string, unknown>;
                audio: Record<string, unknown>;
            }
        ];
        expect(opts.trim).toEqual({ start: 2, end: 12 });
        expect(opts.video.codec).toBe('avc');
        expect(opts.video.crop).toEqual({ left: 656, top: 0, width: 607, height: 1080 });
        // 1080-tall source: the 1280 bound never upscales.
        expect(opts.video.height).toBe(1080);
        expect(opts.video.width).toBe(606);
        expect(opts.audio.codec).toBe('aac');
    });

    it('refuses color grades so they stay on the ffmpeg engine', async () => {
        await expect(
            fastTranscodeClip(file, {
                startSeconds: 0,
                endSeconds: 5,
                vertical: false,
                filter: 'mono',
            })
        ).rejects.toThrow(/ffmpeg/);
        expect(initMock).not.toHaveBeenCalled();
    });

    it('throws when H.264 encoding is unsupported', async () => {
        canEncodeVideoMock.mockResolvedValue(false);
        await expect(
            fastTranscodeClip(file, { startSeconds: 0, endSeconds: 5, vertical: false })
        ).rejects.toThrow(/encode/);
    });

    it('throws when the conversion is invalid for this source', async () => {
        canEncodeVideoMock.mockResolvedValue(true);
        initMock.mockResolvedValue({ isValid: false, execute: vi.fn() });
        await expect(
            fastTranscodeClip(file, { startSeconds: 0, endSeconds: 5, vertical: false })
        ).rejects.toThrow(/converted/);
    });
});
