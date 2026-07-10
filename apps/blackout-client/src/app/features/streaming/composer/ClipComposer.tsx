import React, { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createClip, type ClipSummary } from '../../streams/streamsClient';
import { uploadMedia } from '../../media/utils/matrixMedia';
import { useMatrixClientOrNull } from '../../../hooks/useMatrixClient';
import type { ClipEditOptions } from './clipTranscode';

/**
 * Upload-and-edit clip composer (OSS gap-fill WS3 final slice): pick a video,
 * trim it, optionally crop to vertical 9:16 — all in the browser via
 * ffmpeg.wasm — then upload the result to Matrix media and register it as a
 * clip. The heavy transcode module is imported only when the creator actually
 * processes a clip, so browsing the hub never pays for the wasm core.
 */

const panelStyle: CSSProperties = {
    display: 'grid',
    gap: 12,
    padding: 16,
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 14,
    background: 'var(--bg-input, #0f172a)',
};

const rowStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: 12,
    fontSize: 12,
};

const inputStyle: CSSProperties = {
    padding: '6px 8px',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 8,
    background: 'var(--bg-surface, #111827)',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 12,
};

const buttonStyle: CSSProperties = {
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-accent, #2563eb)',
    color: 'var(--text-on-accent, #fff)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
};

export interface ClipComposerProps {
    onCreated: (clip: ClipSummary) => void;
    onClose: () => void;
}

export const ClipComposer = ({ onCreated, onClose }: ClipComposerProps): JSX.Element => {
    const mx = useMatrixClientOrNull();
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [sourceDuration, setSourceDuration] = useState<number | null>(null);
    const [title, setTitle] = useState('');
    const [start, setStart] = useState('0');
    const [end, setEnd] = useState('');
    const [vertical, setVertical] = useState(true);
    const [phase, setPhase] = useState<'idle' | 'processing' | 'uploading'>('idle');
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    useEffect(
        () => () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        },
        [previewUrl]
    );

    const pickFile = (picked: File | null) => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setFile(picked);
        setSourceDuration(null);
        setPreviewUrl(picked ? URL.createObjectURL(picked) : null);
        if (picked && !title) setTitle(picked.name.replace(/\.[^.]+$/, ''));
    };

    const onMetadata = () => {
        const duration = videoRef.current?.duration;
        if (duration && Number.isFinite(duration)) {
            setSourceDuration(duration);
            if (!end) setEnd(String(Math.floor(Math.min(duration, 60))));
        }
    };

    const submit = async () => {
        if (!mx) {
            setError('Sign in before creating clips.');
            return;
        }
        if (!file) {
            setError('Choose a video first.');
            return;
        }
        const startSeconds = Number(start);
        const endSeconds = Number(end);
        if (!title.trim()) {
            setError('Give the clip a title.');
            return;
        }
        if (
            !Number.isFinite(startSeconds) ||
            !Number.isFinite(endSeconds) ||
            startSeconds < 0 ||
            endSeconds <= startSeconds
        ) {
            setError('The trim window needs a start before its end.');
            return;
        }

        setError(null);
        setProgress(0);
        setPhase('processing');
        try {
            const options: ClipEditOptions = { startSeconds, endSeconds, vertical };
            const { transcodeClip } = await import('./clipTranscode');
            const blob = await transcodeClip(file, options, setProgress);

            setPhase('uploading');
            const edited = new File([blob], `${title.trim().slice(0, 60) || 'clip'}.mp4`, {
                type: 'video/mp4',
            });
            const mediaPointer = await uploadMedia(mx, edited);
            const clip = await createClip({
                creatorId: mx.getUserId() ?? '',
                title: title.trim(),
                mediaPointer,
                durationSeconds: Math.round(endSeconds - startSeconds),
                tags: [],
            });
            onCreated(clip);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not create the clip.');
            setPhase('idle');
        }
    };

    const busy = phase !== 'idle';

    return (
        <div style={panelStyle} data-testid="clip-composer">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 14 }}>New clip</strong>
                <button
                    type="button"
                    style={{ ...buttonStyle, background: 'transparent', color: 'inherit' }}
                    onClick={onClose}
                    disabled={busy}
                    data-testid="clip-composer-close"
                >
                    Close
                </button>
            </div>

            <input
                type="file"
                accept="video/*"
                data-testid="clip-composer-file"
                disabled={busy}
                onChange={(e) => pickFile(e.currentTarget.files?.[0] ?? null)}
            />

            {previewUrl ? (
                <video
                    ref={videoRef}
                    src={previewUrl}
                    controls
                    playsInline
                    onLoadedMetadata={onMetadata}
                    style={{ maxHeight: 260, borderRadius: 10, background: '#000' }}
                    data-testid="clip-composer-preview"
                />
            ) : null}

            <div style={rowStyle}>
                <label style={{ display: 'grid', gap: 2 }}>
                    Title
                    <input
                        style={{ ...inputStyle, width: 200 }}
                        value={title}
                        disabled={busy}
                        onChange={(e) => setTitle(e.currentTarget.value)}
                        placeholder="Best moment"
                    />
                </label>
                <label style={{ display: 'grid', gap: 2 }}>
                    Start (s)
                    <input
                        style={{ ...inputStyle, width: 80 }}
                        type="number"
                        min="0"
                        value={start}
                        disabled={busy}
                        onChange={(e) => setStart(e.currentTarget.value)}
                    />
                </label>
                <label style={{ display: 'grid', gap: 2 }}>
                    End (s)
                    <input
                        style={{ ...inputStyle, width: 80 }}
                        type="number"
                        min="1"
                        value={end}
                        disabled={busy}
                        onChange={(e) => setEnd(e.currentTarget.value)}
                    />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                        type="checkbox"
                        checked={vertical}
                        disabled={busy}
                        data-testid="clip-composer-vertical"
                        onChange={(e) => setVertical(e.currentTarget.checked)}
                    />
                    Crop to 9:16
                </label>
                {sourceDuration !== null ? (
                    <span style={{ color: 'var(--text-muted, #9ca3af)' }}>
                        Source: {Math.round(sourceDuration)}s
                    </span>
                ) : null}
            </div>

            <div style={rowStyle}>
                <button
                    type="button"
                    style={buttonStyle}
                    onClick={() => void submit()}
                    disabled={busy}
                    data-testid="clip-composer-submit"
                >
                    {phase === 'processing'
                        ? `Processing… ${Math.round(progress * 100)}%`
                        : phase === 'uploading'
                        ? 'Uploading…'
                        : 'Create clip'}
                </button>
                {error ? (
                    <span
                        style={{ color: 'var(--text-danger, #f87171)' }}
                        data-testid="clip-composer-error"
                    >
                        {error}
                    </span>
                ) : null}
            </div>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted, #9ca3af)' }}>
                Editing happens entirely in your browser — the source video never leaves this
                device; only the finished clip uploads.
            </p>
        </div>
    );
};

export default ClipComposer;
