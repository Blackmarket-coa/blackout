import type { ClipEditOptions, TranscodeProgress } from './clipTranscode';

/**
 * Engine dispatcher for upload renditions: try the WebCodecs fast path
 * (hardware encode, no core assets), fall back to ffmpeg.wasm for anything
 * it can't do — color grades, unsupported codecs/environments. Both engines
 * load lazily; callers pay only for the one that runs.
 *
 * ffmpeg's "engine is not installed" error intentionally propagates — the
 * composer maps it to its post-the-untouched-recording fallback.
 */
export interface RenditionResult {
    blob: Blob;
    engine: 'webcodecs' | 'ffmpeg';
}

export const renderRendition = async (
    file: File,
    options: ClipEditOptions,
    onProgress?: TranscodeProgress
): Promise<RenditionResult> => {
    const gradeRequested = Boolean(options.filter && options.filter !== 'none');
    if (!gradeRequested) {
        try {
            const { fastTranscodeSupported, fastTranscodeClip } = await import('./fastTranscode');
            if (fastTranscodeSupported()) {
                return {
                    blob: await fastTranscodeClip(file, options, onProgress),
                    engine: 'webcodecs',
                };
            }
        } catch {
            // Any fast-path failure just means "use ffmpeg" — reset progress
            // so the second engine's reporting starts clean.
            onProgress?.(0);
        }
    }
    const { transcodeClip } = await import('./clipTranscode');
    return { blob: await transcodeClip(file, options, onProgress), engine: 'ffmpeg' };
};
