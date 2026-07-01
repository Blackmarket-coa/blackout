import { useMemo } from 'react';
import { useMatrixClientOrNull } from '../../hooks/useMatrixClient';
import { uploadMedia } from '../media/utils/matrixMedia';

/** A function that uploads a video File and resolves to its `mxc://` URI. */
export type VideoUploader = (file: File) => Promise<string>;

/** Best-effort object URL for a local preview; null where URL is unavailable. */
export function safeCreateObjectUrl(file: File): string | null {
    try {
        if (typeof URL?.createObjectURL !== 'function') return null;
        return URL.createObjectURL(file);
    } catch {
        return null;
    }
}

/**
 * Read a video file's duration in ms (best-effort). Resolves undefined off the
 * DOM, on error, or after an 8s timeout so a broken file never blocks a submit.
 * Mirrors the helper already used by the Debate composer.
 */
export function readVideoDurationMs(file: File): Promise<number | undefined> {
    if (typeof document === 'undefined') return Promise.resolve(undefined);
    const url = safeCreateObjectUrl(file);
    if (!url) return Promise.resolve(undefined);
    return new Promise((resolve) => {
        const video = document.createElement('video');
        let settled = false;
        const done = (ms?: number) => {
            if (settled) return;
            settled = true;
            URL.revokeObjectURL(url);
            resolve(ms);
        };
        video.preload = 'metadata';
        video.onloadedmetadata = () =>
            done(Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined);
        video.onerror = () => done(undefined);
        window.setTimeout(() => done(undefined), 8000);
        video.src = url;
    });
}

/**
 * The default Coliseum video uploader: pushes the file through the Matrix media
 * pipeline (`uploadMedia`) and returns its `mxc://`. Returns null when no Matrix
 * client is available (so callers can disable capture rather than crash).
 */
export function useColiseumVideoUploader(): VideoUploader | null {
    const mx = useMatrixClientOrNull();
    return useMemo<VideoUploader | null>(
        () => (mx ? (file: File) => uploadMedia(mx, file) : null),
        [mx]
    );
}
