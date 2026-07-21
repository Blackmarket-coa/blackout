import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

/**
 * Browser-side clip editing via ffmpeg.wasm (OSS gap-fill WS3, composer
 * slice). Everything runs locally — the source video never leaves the device
 * until the creator uploads the finished clip.
 *
 * Licensing/bundle posture: `@ffmpeg/ffmpeg` (MIT) is the only module linked
 * into app code. The ~32 MB LGPL core is deliberately NOT bundled — it would
 * blow the CI dist-size gate and force every deployment to ship it — and is
 * instead fetched at runtime from FFMPEG_CORE_BASE (default `/ffmpeg-core`,
 * override with VITE_FFMPEG_CORE_BASE_URL). Deployments enable the composer
 * by publishing `@ffmpeg/core/dist/esm/ffmpeg-core.{js,wasm}` at that path
 * (see infra/single-server-baseline). The single-threaded core needs no
 * SharedArrayBuffer/COOP headers; toBlobURL keeps worker loading working even
 * when the base is cross-origin.
 */

const FFMPEG_CORE_BASE = (
    (import.meta.env.VITE_FFMPEG_CORE_BASE_URL as string | undefined) ?? '/ffmpeg-core'
).replace(/\/+$/, '');

export interface ClipEditOptions {
    /** Trim window, in seconds of the source video. */
    startSeconds: number;
    endSeconds: number;
    /** Crop the picture to centered 9:16 (re-encodes video). */
    vertical: boolean;
    /**
     * Re-encode to a bounded H.264/AAC rendition (long edge ≤1280) sized for
     * feed playback. This is the device-master posture: a phone-quality
     * original stays on the device while a ~10x smaller copy uploads.
     */
    compress?: boolean;
}

export type TranscodeProgress = (ratio: number) => void;

let ffmpegInstance: FFmpeg | null = null;

const loadFFmpeg = async (): Promise<FFmpeg> => {
    if (ffmpegInstance) return ffmpegInstance;
    const ffmpeg = new FFmpeg();
    try {
        await ffmpeg.load({
            coreURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
        });
    } catch {
        throw new Error(
            'Clip editing engine is not installed on this deployment ' +
                `(ffmpeg core assets missing under ${FFMPEG_CORE_BASE}).`
        );
    }
    ffmpegInstance = ffmpeg;
    return ffmpeg;
};

// Centered 9:16 window; min() keeps already-narrow sources intact.
const VERTICAL_CROP = 'crop=min(iw\\,ih*9/16):ih';
// Bounded downscales for the compressed rendition. `-2` keeps aspect with an
// even width; `2*trunc(.../2)` forces an even height (libx264 rejects odd
// dimensions) while never upscaling small sources.
const SCALE_VERTICAL = 'scale=-2:2*trunc(min(1280\\,ih)/2)';
const SCALE_LANDSCAPE = 'scale=-2:2*trunc(min(720\\,ih)/2)';

/**
 * ffmpeg argv for the requested edit. Exported for tests: a straight trim is
 * a stream-copy (instant, keyframe-aligned); a vertical crop re-encodes video
 * (`crop=` has no copy path) but still copies audio; `compress` re-encodes
 * both streams into a bounded H.264/AAC rendition for upload.
 */
export const buildClipArgs = (
    input: string,
    output: string,
    options: ClipEditOptions
): string[] => {
    const duration = String(Math.max(0.1, options.endSeconds - options.startSeconds));
    const base = ['-ss', String(options.startSeconds), '-i', input, '-t', duration];
    if (options.compress) {
        const filters = options.vertical ? `${VERTICAL_CROP},${SCALE_VERTICAL}` : SCALE_LANDSCAPE;
        return [
            ...base,
            '-vf',
            filters,
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-crf',
            '28',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-b:a',
            '96k',
            '-movflags',
            '+faststart',
            output,
        ];
    }
    if (options.vertical) {
        return [...base, '-vf', VERTICAL_CROP, '-c:a', 'copy', '-movflags', '+faststart', output];
    }
    return [...base, '-c', 'copy', '-movflags', '+faststart', output];
};

/** Run the edit and hand back the finished mp4. */
export const transcodeClip = async (
    file: File,
    options: ClipEditOptions,
    onProgress?: TranscodeProgress
): Promise<Blob> => {
    const ffmpeg = await loadFFmpeg();
    const input = 'input.mp4';
    const output = 'output.mp4';

    const progressListener = ({ progress }: { progress: number }) => {
        onProgress?.(Math.max(0, Math.min(1, progress)));
    };
    ffmpeg.on('progress', progressListener);
    try {
        await ffmpeg.writeFile(input, await fetchFile(file));
        const code = await ffmpeg.exec(buildClipArgs(input, output, options));
        if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
        const data = (await ffmpeg.readFile(output)) as Uint8Array;
        // Copy into a plain ArrayBuffer-backed view: readFile hands back a view
        // over the wasm heap, which Blob's typings (and lifetime) reject.
        return new Blob([new Uint8Array(data)], { type: 'video/mp4' });
    } finally {
        ffmpeg.off('progress', progressListener);
        // Best-effort scratch cleanup; the wasm FS dies with the worker anyway.
        await ffmpeg.deleteFile(input).catch(() => undefined);
        await ffmpeg.deleteFile(output).catch(() => undefined);
    }
};
