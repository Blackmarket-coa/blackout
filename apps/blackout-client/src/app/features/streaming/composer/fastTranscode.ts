import type { ClipEditOptions, TranscodeProgress } from './clipTranscode';

/**
 * WebCodecs fast path for rendering upload renditions, built on mediabunny
 * (MPL-2.0). Hardware encode makes this typically 5–20x faster than the
 * ffmpeg.wasm path and it needs no core assets fetched — but it cannot apply
 * color grades, so any non-'none' filter stays on ffmpeg. Callers should
 * treat every throw here as "fall back to ffmpeg", not as a user-facing
 * failure (see renditionPipeline).
 */

/** Cheap synchronous probe; the real capability check happens per-convert. */
export const fastTranscodeSupported = (): boolean =>
    typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined';

/** libx264-style even-dimension guard; hardware encoders share the limit. */
const even = (value: number): number => Math.max(2, 2 * Math.floor(value / 2));

interface PictureOps {
    crop?: { left: number; top: number; width: number; height: number };
    width?: number;
    height?: number;
}

/**
 * Mirror of the ffmpeg chain's geometry: centered 9:16 crop (never widening
 * already-narrow sources), then a bounded downscale — ≤1280 tall for vertical
 * output, ≤720 tall otherwise — without ever upscaling. Exported for tests.
 */
export const buildPictureOps = (
    srcWidth: number,
    srcHeight: number,
    options: Pick<ClipEditOptions, 'vertical' | 'compress'>
): PictureOps => {
    const ops: PictureOps = {};
    let width = srcWidth;
    let height = srcHeight;
    if (options.vertical) {
        const cropWidth = Math.min(srcWidth, Math.floor((srcHeight * 9) / 16));
        ops.crop = {
            left: Math.floor((srcWidth - cropWidth) / 2),
            top: 0,
            width: cropWidth,
            height: srcHeight,
        };
        width = cropWidth;
    }
    if (options.compress) {
        const maxHeight = options.vertical ? 1280 : 720;
        const targetHeight = Math.min(maxHeight, height);
        ops.height = even(targetHeight);
        ops.width = even((width * targetHeight) / height);
    } else if (options.vertical) {
        // Crop output still needs even dimensions for the encoder.
        ops.width = even(width);
        ops.height = even(height);
    }
    return ops;
};

/** Bitrates matched to the ffmpeg path's perceived quality (crf 28-ish). */
const VIDEO_BITRATE = 2_500_000;
const AUDIO_BITRATE = 96_000;

/**
 * Render the rendition with WebCodecs. Throws whenever this environment or
 * source can't take the fast path — the caller falls back to ffmpeg.
 */
export const fastTranscodeClip = async (
    file: File,
    options: ClipEditOptions,
    onProgress?: TranscodeProgress
): Promise<Blob> => {
    if (options.filter && options.filter !== 'none') {
        throw new Error('Color grades require the ffmpeg engine.');
    }
    if (!fastTranscodeSupported()) {
        throw new Error('WebCodecs is unavailable in this environment.');
    }
    const {
        ALL_FORMATS,
        BlobSource,
        BufferTarget,
        Conversion,
        Input,
        Mp4OutputFormat,
        Output,
        canEncodeVideo,
    } = await import('mediabunny');

    if (!(await canEncodeVideo('avc'))) {
        throw new Error('This environment cannot encode H.264.');
    }

    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('The source has no video track.');

    const picture = buildPictureOps(track.displayWidth, track.displayHeight, options);
    const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });

    const conversion = await Conversion.init({
        input,
        output,
        trim: { start: options.startSeconds, end: options.endSeconds },
        video: {
            ...picture,
            fit: 'fill',
            codec: 'avc',
            bitrate: VIDEO_BITRATE,
        },
        audio: {
            codec: 'aac',
            bitrate: AUDIO_BITRATE,
        },
    });
    if (!conversion.isValid) {
        throw new Error('The source cannot be converted with WebCodecs.');
    }
    if (onProgress) conversion.onProgress = (ratio: number) => onProgress(ratio);
    await conversion.execute();

    const buffer = output.target.buffer;
    if (!buffer) throw new Error('WebCodecs conversion produced no output.');
    return new Blob([buffer], { type: 'video/mp4' });
};
