// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fastSupportedMock = vi.fn();
const fastClipMock = vi.fn();
const ffmpegClipMock = vi.fn();

vi.mock('../../../../src/app/features/streaming/composer/fastTranscode', () => ({
    fastTranscodeSupported: (...args: unknown[]) => fastSupportedMock(...args),
    fastTranscodeClip: (...args: unknown[]) => fastClipMock(...args),
}));
vi.mock('../../../../src/app/features/streaming/composer/clipTranscode', () => ({
    transcodeClip: (...args: unknown[]) => ffmpegClipMock(...args),
}));

import { renderRendition } from '../../../../src/app/features/streaming/composer/renditionPipeline';

const file = new File(['x'], 'in.mp4', { type: 'video/mp4' });
const baseOptions = { startSeconds: 0, endSeconds: 10, vertical: true, compress: true } as const;

describe('renderRendition', () => {
    beforeEach(() => {
        fastSupportedMock.mockReset();
        fastClipMock.mockReset();
        ffmpegClipMock.mockReset();
    });

    it('uses the WebCodecs engine when supported and no grade is requested', async () => {
        fastSupportedMock.mockReturnValue(true);
        fastClipMock.mockResolvedValue(new Blob(['fast']));

        const result = await renderRendition(file, { ...baseOptions });
        expect(result.engine).toBe('webcodecs');
        expect(ffmpegClipMock).not.toHaveBeenCalled();
    });

    it('falls back to ffmpeg when the fast path throws', async () => {
        fastSupportedMock.mockReturnValue(true);
        fastClipMock.mockRejectedValue(new Error('no hardware encoder'));
        ffmpegClipMock.mockResolvedValue(new Blob(['wasm']));
        const onProgress = vi.fn();

        const result = await renderRendition(file, { ...baseOptions }, onProgress);
        expect(result.engine).toBe('ffmpeg');
        // Progress resets between engines so the bar doesn't jump backwards.
        expect(onProgress).toHaveBeenCalledWith(0);
    });

    it('goes straight to ffmpeg for color grades', async () => {
        ffmpegClipMock.mockResolvedValue(new Blob(['graded']));
        const result = await renderRendition(file, { ...baseOptions, filter: 'mono' });
        expect(result.engine).toBe('ffmpeg');
        expect(fastClipMock).not.toHaveBeenCalled();
    });

    it("propagates ffmpeg's engine-missing error for the composer's raw fallback", async () => {
        fastSupportedMock.mockReturnValue(false);
        ffmpegClipMock.mockRejectedValue(
            new Error('Clip editing engine is not installed on this deployment (missing).')
        );
        await expect(renderRendition(file, { ...baseOptions })).rejects.toThrow(
            /engine is not installed/
        );
    });
});
