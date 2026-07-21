import React, { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
    nativeCameraFlip,
    nativeCameraPreviewStart,
    nativeCameraPreviewStop,
    nativeCameraRecordStart,
    nativeCameraRecordStop,
    readNativeFileAsBlob,
} from '../../../../platform/nativeMediaBridge';

/**
 * Hold-to-record surface over the native camera viewfinder
 * (@capgo/camera-preview). The plugin renders the camera BEHIND the webview,
 * so this overlay keeps a transparent center — we temporarily clear the
 * document backgrounds while open and restore them on close.
 *
 * TikTok-style takes: each press-and-hold records one native segment; takes
 * accumulate and are stream-copy stitched (same camera session → same codec)
 * into a single mp4 on Done. If the stitch engine is unavailable, the first
 * take is used and the caller is told via the notice in the result.
 */

export interface NativeCameraRecorderProps {
    onRecorded: (file: File, notice?: string) => void;
    onClose: () => void;
}

const MAX_SEGMENT_SECONDS = 60;

const controlStyle: CSSProperties = {
    border: '1px solid rgba(255,255,255,0.4)',
    borderRadius: 999,
    padding: '8px 16px',
    background: 'rgba(0,0,0,0.45)',
    color: '#fff',
    fontSize: 13,
    cursor: 'pointer',
};

export const NativeCameraRecorder = ({
    onRecorded,
    onClose,
}: NativeCameraRecorderProps): JSX.Element => {
    const [ready, setReady] = useState(false);
    const [recording, setRecording] = useState(false);
    const [segments, setSegments] = useState<Blob[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const recordStartedAt = useRef<number | null>(null);
    const closedRef = useRef(false);

    // The native preview sits behind the webview; the page must not paint
    // over it. Remember and restore whatever backgrounds were set.
    useEffect(() => {
        const html = document.documentElement;
        const body = document.body;
        const saved = [html.style.background, body.style.background] as const;
        html.style.background = 'transparent';
        body.style.background = 'transparent';
        void (async () => {
            const opened = await nativeCameraPreviewStart('rear');
            if (closedRef.current) {
                await nativeCameraPreviewStop();
                return;
            }
            if (opened) setReady(true);
            else setError('Could not open the camera.');
        })();
        return () => {
            closedRef.current = true;
            void nativeCameraPreviewStop();
            html.style.background = saved[0];
            body.style.background = saved[1];
        };
    }, []);

    const beginSegment = useCallback(async () => {
        if (!ready || recording || busy) return;
        setError(null);
        const started = await nativeCameraRecordStart(MAX_SEGMENT_SECONDS);
        if (!started) {
            setError('Recording failed to start.');
            return;
        }
        recordStartedAt.current = performance.now();
        setRecording(true);
    }, [ready, recording, busy]);

    const endSegment = useCallback(async () => {
        if (!recording) return;
        setRecording(false);
        // Sub-300ms holds are almost always accidental taps; still stop the
        // native recorder, but drop the resulting sliver.
        const heldMs = recordStartedAt.current
            ? performance.now() - recordStartedAt.current
            : Number.POSITIVE_INFINITY;
        const path = await nativeCameraRecordStop();
        if (!path || heldMs < 300) return;
        const blob = await readNativeFileAsBlob(path);
        if (!blob) {
            setError('Could not read the recorded take.');
            return;
        }
        setSegments((prev) => [...prev, blob]);
    }, [recording]);

    const finish = useCallback(async () => {
        if (segments.length === 0 || busy) return;
        setBusy(true);
        setError(null);
        try {
            let joined: Blob;
            let notice: string | undefined;
            if (segments.length === 1) {
                joined = segments[0];
            } else {
                try {
                    const { concatClips } = await import('../../streaming/composer/clipTranscode');
                    joined = await concatClips(segments);
                } catch (err) {
                    if (err instanceof Error && /engine is not installed/.test(err.message)) {
                        joined = segments[0];
                        notice = 'Stitching engine unavailable — using the first take only.';
                    } else {
                        throw err;
                    }
                }
            }
            onRecorded(
                new File([joined], `camera-${Date.now()}.mp4`, { type: 'video/mp4' }),
                notice
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not finish the recording.');
            setBusy(false);
        }
    }, [segments, busy, onRecorded]);

    return (
        <div
            data-testid="native-camera-recorder"
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 40,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                background: 'transparent',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: 16 }}>
                <button
                    type="button"
                    style={controlStyle}
                    onClick={onClose}
                    disabled={busy}
                    data-testid="native-camera-cancel"
                >
                    ✕ Cancel
                </button>
                <button
                    type="button"
                    style={controlStyle}
                    onClick={() => void nativeCameraFlip()}
                    disabled={!ready || recording || busy}
                    data-testid="native-camera-flip"
                >
                    ⇄ Flip
                </button>
            </div>

            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 12,
                    padding: '0 16px 32px',
                }}
            >
                {error ? (
                    <span
                        style={{ ...controlStyle, cursor: 'default', color: '#f87171' }}
                        data-testid="native-camera-error"
                    >
                        {error}
                    </span>
                ) : null}
                <span
                    style={{ ...controlStyle, cursor: 'default' }}
                    data-testid="native-camera-status"
                >
                    {recording
                        ? '● Recording… release to stop'
                        : segments.length > 0
                        ? `${segments.length} take${
                              segments.length > 1 ? 's' : ''
                          } — hold to add another`
                        : 'Hold to record'}
                </span>
                <button
                    type="button"
                    onPointerDown={() => void beginSegment()}
                    onPointerUp={() => void endSegment()}
                    onPointerLeave={() => void endSegment()}
                    disabled={!ready || busy}
                    data-testid="native-camera-record"
                    aria-label="Hold to record"
                    style={{
                        width: 72,
                        height: 72,
                        borderRadius: '50%',
                        border: '4px solid rgba(255,255,255,0.9)',
                        background: recording ? '#ef4444' : 'rgba(255,255,255,0.25)',
                        cursor: 'pointer',
                    }}
                />
                <button
                    type="button"
                    style={{
                        ...controlStyle,
                        opacity: segments.length === 0 || busy ? 0.5 : 1,
                    }}
                    onClick={() => void finish()}
                    disabled={segments.length === 0 || busy}
                    data-testid="native-camera-done"
                >
                    {busy ? 'Stitching…' : `✓ Use ${segments.length > 1 ? 'takes' : 'take'}`}
                </button>
            </div>
        </div>
    );
};

export default NativeCameraRecorder;
