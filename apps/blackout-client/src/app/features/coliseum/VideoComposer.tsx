import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
} from 'react';
import { MAX_ROUND_DURATION_MS, type ColiseumArgumentMedia } from '@blackout/core';
import {
    useColiseumVideoUploader,
    readVideoDurationMs,
    safeCreateObjectUrl,
    type VideoUploader,
} from './videoUpload';
import { useVideoRecorder } from './useVideoRecorder';

const inputStyle: CSSProperties = {
    padding: 8,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
};

const primaryButton: CSSProperties = {
    padding: '8px 14px',
    border: '1px solid var(--accent-primary)',
    background: 'var(--accent-primary)',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
};

const ghostButton: CSSProperties = {
    ...primaryButton,
    background: 'transparent',
    color: 'var(--text-primary)',
    borderColor: 'var(--border-default)',
    fontWeight: 500,
};

export interface VideoComposerSubmit {
    body?: string;
    /** Present when a video was attached. Optional only when `requireVideo` is false. */
    media?: ColiseumArgumentMedia;
}

export interface VideoComposerProps {
    onSubmit: (payload: VideoComposerSubmit) => Promise<void> | void;
    submitLabel: string;
    bodyPlaceholder?: string;
    /** Extra controls (e.g. a round-kind select) rendered above the submit row. */
    extraControls?: ReactNode;
    /** Injectable for tests; defaults to the Matrix-backed uploader. */
    uploader?: VideoUploader | null;
    /** When false, hides the in-app camera recorder (file pick only). */
    allowRecord?: boolean;
    /** When false, a text-only submit is allowed (e.g. Crucible final statement). */
    requireVideo?: boolean;
}

/**
 * Shared Coliseum video composer: pick or record a video, preview it, upload it
 * to an `mxc://`, and submit `{ body, media }`. Enforces the 3-minute round cap
 * client-side. Reuses the Matrix media-upload pipeline via `useColiseumVideoUploader`.
 */
export function VideoComposer({
    onSubmit,
    submitLabel,
    bodyPlaceholder = 'Say your piece…',
    extraControls,
    uploader,
    allowRecord = true,
    requireVideo = true,
}: VideoComposerProps) {
    const defaultUploader = useColiseumVideoUploader();
    const upload = uploader !== undefined ? uploader : defaultUploader;
    const recorder = useVideoRecorder();

    const [body, setBody] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [durationMs, setDurationMs] = useState<number | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const selfViewRef = useRef<HTMLVideoElement | null>(null);

    const acceptFile = useCallback((picked: File | null) => {
        setError(null);
        setFile(picked);
        setPreviewUrl(picked ? safeCreateObjectUrl(picked) : null);
        setDurationMs(undefined);
        if (picked) void readVideoDurationMs(picked).then(setDurationMs);
    }, []);

    // Adopt a completed recording as the selected file.
    useEffect(() => {
        if (recorder.file) acceptFile(recorder.file);
    }, [recorder.file, acceptFile]);

    // Wire the live camera stream into the self-view while recording.
    useEffect(() => {
        if (selfViewRef.current) selfViewRef.current.srcObject = recorder.stream;
    }, [recorder.stream]);

    const overCap = durationMs !== undefined && durationMs > MAX_ROUND_DURATION_MS;
    const hasContent = requireVideo ? !!file : !!file || body.trim().length > 0;
    // A video, when attached, still needs an uploader; text-only needs none.
    const uploaderOk = file ? !!upload : true;
    const canSubmit = hasContent && uploaderOk && !busy && !overCap && !recorder.recording;

    const submit = useCallback(async () => {
        if (!canSubmit) return;
        setBusy(true);
        setError(null);
        try {
            let media: ColiseumArgumentMedia | undefined;
            if (file && upload) {
                const mxc = await upload(file);
                media = { kind: 'video', mxc, durationMs };
            }
            await onSubmit({ body: body.trim() || undefined, media });
            setBody('');
            acceptFile(null);
        } catch {
            setError('Upload failed. Try again.');
        } finally {
            setBusy(false);
        }
    }, [canSubmit, file, upload, body, durationMs, onSubmit, acceptFile]);

    return (
        <div
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            data-testid="coliseum-video-composer"
        >
            <input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={bodyPlaceholder}
                style={inputStyle}
            />
            {extraControls}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => acceptFile(e.target.files?.[0] ?? null)}
                    data-testid="coliseum-video-file"
                    style={{ color: 'var(--text-secondary)' }}
                />
                {allowRecord && recorder.supported ? (
                    recorder.recording ? (
                        <button type="button" style={primaryButton} onClick={recorder.stop}>
                            ⏺ Stop
                        </button>
                    ) : (
                        <button
                            type="button"
                            style={ghostButton}
                            onClick={() => void recorder.start()}
                        >
                            Record
                        </button>
                    )
                ) : null}
            </div>
            {recorder.recording ? (
                <video
                    ref={selfViewRef}
                    muted
                    autoPlay
                    playsInline
                    style={{ maxHeight: 120, background: '#000' }}
                />
            ) : previewUrl ? (
                <video src={previewUrl} muted controls style={{ maxHeight: 120 }} />
            ) : null}
            {overCap ? (
                <span style={{ color: 'var(--danger)', fontSize: 12 }}>
                    Clip exceeds the 3-minute cap.
                </span>
            ) : null}
            {error ? <span style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</span> : null}
            {!upload ? (
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    Sign in to attach video.
                </span>
            ) : null}
            <button type="button" style={primaryButton} disabled={!canSubmit} onClick={submit}>
                {busy ? 'Uploading…' : submitLabel}
            </button>
        </div>
    );
}

export default VideoComposer;
