import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';

/**
 * Browser-side clip editing via ffmpeg.wasm (OSS gap-fill WS3, composer
 * slice). Everything runs locally — the source video never leaves the device
 * until the creator uploads the finished clip.
 *
 * Licensing/bundle posture: `@ffmpeg/ffmpeg` (MIT) is the only module linked
 * into app code; the LGPL ffmpeg core loads at runtime as separate assets
 * (`?url` imports of the single-threaded @ffmpeg/core build, which needs no
 * SharedArrayBuffer/COOP headers). This module must only ever be imported
 * dynamically so none of it lands in the main bundle.
 */

export interface ClipEditOptions {
    /** Trim window, in seconds of the source video. */
    startSeconds: number;
    endSeconds: number;
    /** Crop the picture to centered 9:16 (re-encodes video). */
    vertical: boolean;
}

export type TranscodeProgress = (ratio: number) => void;

let ffmpegInstance: FFmpeg | null = null;

const loadFFmpeg = async (): Promise<FFmpeg> => {
    if (ffmpegInstance) return ffmpegInstance;
    const ffmpeg = new FFmpeg();
    await ffmpeg.load({ coreURL, wasmURL });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
};

/**
 * ffmpeg argv for the requested edit. Exported for tests: a straight trim is
 * a stream-copy (instant, keyframe-aligned); a vertical crop re-encodes video
 * (`crop=` has no copy path) but still copies audio.
 */
export const buildClipArgs = (
    input: string,
    output: string,
    options: ClipEditOptions
): string[] => {
    const duration = String(Math.max(0.1, options.endSeconds - options.startSeconds));
    const base = ['-ss', String(options.startSeconds), '-i', input, '-t', duration];
    if (options.vertical) {
        return [
            ...base,
            '-vf',
            // Centered 9:16 window; min() keeps already-narrow sources intact.
            'crop=min(iw\\,ih*9/16):ih',
            '-c:a',
            'copy',
            '-movflags',
            '+faststart',
            output,
        ];
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
