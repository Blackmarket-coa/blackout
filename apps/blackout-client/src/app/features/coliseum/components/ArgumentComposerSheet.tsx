import React, { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ColiseumArgumentMedia, ColiseumStance } from '@blackout/core';
import { Sheet } from '@blackout/ui/primitives';
import { coliseumSheetTheme } from '../coliseumArenaTheme.css';
import type { CreateColiseumArgumentInput } from '../coliseumClient';
import { STANCE_LABEL, STANCE_ORDER } from './stance';

const inputStyle: CSSProperties = {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    fontSize: 14,
    width: '100%',
    boxSizing: 'border-box',
};

const pillButtonStyle: CSSProperties = {
    padding: '2px 8px',
    borderRadius: 999,
    border: '1px solid var(--border-default)',
    background: 'transparent',
    color: 'var(--text-primary)',
    cursor: 'pointer',
};

function safeCreateObjectUrl(file: File): string | null {
    try {
        if (typeof URL?.createObjectURL !== 'function') return null;
        return URL.createObjectURL(file);
    } catch {
        return null;
    }
}

/**
 * Best-effort, non-blocking read of a video file's duration. Resolves
 * `undefined` (rather than rejecting) when metadata can't be loaded — the
 * field is optional and playback does not depend on it.
 */
function readVideoDurationMs(file: File): Promise<number | undefined> {
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
 * Bottom-sheet argument composer (was an inline form on the Debate tab).
 * Form structure and testids are unchanged; the sheet closes after a
 * successful post.
 */
export function ArgumentComposerSheet({
    open,
    onClose,
    topicId,
    onCreate,
    onUploadVideo,
    replyingTo,
    onCancelReply,
}: {
    open: boolean;
    onClose: () => void;
    topicId: string;
    onCreate: (input: CreateColiseumArgumentInput) => Promise<void>;
    onUploadVideo?: (file: File) => Promise<string>;
    replyingTo?: { id: string; authorId: string } | null;
    onCancelReply?: () => void;
}) {
    const [stance, setStance] = useState<ColiseumStance>('for');
    const [body, setBody] = useState('');
    const [pending, setPending] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
    const videoDurationRef = useRef<number | undefined>(undefined);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const clearVideo = useCallback(() => {
        setVideoFile(null);
        videoDurationRef.current = undefined;
        setVideoPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, []);

    // Revoke the object URL when the component unmounts.
    useEffect(
        () => () => {
            if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
        },
        [videoPreviewUrl]
    );

    // A rebuttal defaults to the opposing stance, but stays editable.
    useEffect(() => {
        if (replyingTo) setStance('against');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [replyingTo?.id]);

    const onPickVideo = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] ?? null;
        setError(null);
        videoDurationRef.current = undefined;
        setVideoPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return file ? safeCreateObjectUrl(file) : null;
        });
        setVideoFile(file);
        if (file) {
            // Fire-and-forget; submit uses whatever has resolved by then.
            void readVideoDurationMs(file).then((ms) => {
                videoDurationRef.current = ms;
            });
        }
    }, []);

    const onSubmit = useCallback(
        async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const trimmed = body.trim();
            if (!trimmed) {
                setError('Argument body is required.');
                return;
            }
            setPending(true);
            setError(null);
            try {
                let media: ColiseumArgumentMedia | undefined;
                if (videoFile) {
                    if (!onUploadVideo) {
                        throw new Error('Video upload is unavailable right now.');
                    }
                    setUploading(true);
                    const mxc = await onUploadVideo(videoFile);
                    setUploading(false);
                    media = { kind: 'video', mxc, durationMs: videoDurationRef.current };
                }
                await onCreate({
                    topicId,
                    stance,
                    body: trimmed,
                    ...(replyingTo ? { parentArgumentId: replyingTo.id } : {}),
                    ...(media ? { media } : {}),
                });
                setBody('');
                clearVideo();
                onCancelReply?.();
                onClose();
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to post argument.');
            } finally {
                setPending(false);
                setUploading(false);
            }
        },
        [
            body,
            clearVideo,
            onClose,
            onCreate,
            onCancelReply,
            onUploadVideo,
            replyingTo,
            stance,
            topicId,
        ]
    );

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title={replyingTo ? 'Rebut' : 'Add your argument'}
            backdropTestId="coliseum-debate-composer-backdrop"
            className={coliseumSheetTheme}
        >
            <form
                data-testid="coliseum-debate-composer"
                onSubmit={onSubmit}
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            >
                {replyingTo ? (
                    <div
                        data-testid="coliseum-composer-replying-to"
                        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
                    >
                        <strong>↪ Rebutting {replyingTo.authorId}</strong>
                        <button
                            type="button"
                            data-testid="coliseum-composer-cancel-reply"
                            onClick={onCancelReply}
                            style={pillButtonStyle}
                        >
                            Cancel
                        </button>
                    </div>
                ) : null}
                <label
                    style={{
                        display: 'grid',
                        gap: 4,
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                    }}
                >
                    Stance
                    <select
                        data-testid="coliseum-debate-composer-stance"
                        value={stance}
                        onChange={(event) => setStance(event.target.value as ColiseumStance)}
                        style={inputStyle}
                    >
                        {STANCE_ORDER.map((value) => (
                            <option key={value} value={value}>
                                {STANCE_LABEL[value]}
                            </option>
                        ))}
                    </select>
                </label>
                <textarea
                    data-testid="coliseum-debate-composer-body"
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="Make your case…"
                    rows={4}
                    style={{ ...inputStyle, resize: 'vertical' }}
                />
                {onUploadVideo ? (
                    <div style={{ display: 'grid', gap: 6 }}>
                        <label
                            style={{
                                display: 'grid',
                                gap: 4,
                                fontSize: 12,
                                color: 'var(--text-secondary)',
                            }}
                        >
                            Short video (optional) — record on mobile or attach a clip
                            <input
                                ref={fileInputRef}
                                data-testid="coliseum-debate-composer-video"
                                type="file"
                                accept="video/*"
                                onChange={onPickVideo}
                            />
                        </label>
                        {videoFile ? (
                            <div
                                data-testid="coliseum-debate-composer-video-preview"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    fontSize: 12,
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                {videoPreviewUrl ? (
                                    <video
                                        src={videoPreviewUrl}
                                        muted
                                        controls
                                        style={{ maxHeight: 96, borderRadius: 8 }}
                                    />
                                ) : null}
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {videoFile.name}
                                </span>
                                <button
                                    type="button"
                                    data-testid="coliseum-debate-composer-video-remove"
                                    onClick={clearVideo}
                                    style={pillButtonStyle}
                                >
                                    Remove
                                </button>
                            </div>
                        ) : null}
                    </div>
                ) : null}
                {error ? (
                    <p
                        role="alert"
                        data-testid="coliseum-debate-composer-error"
                        style={{ margin: 0, color: 'var(--danger)', fontSize: 12 }}
                    >
                        {error}
                    </p>
                ) : null}
                <button
                    type="submit"
                    data-testid="coliseum-debate-composer-submit"
                    disabled={pending}
                    style={{
                        alignSelf: 'flex-start',
                        padding: '10px 20px',
                        borderRadius: 999,
                        border: 'none',
                        background: 'var(--accent-primary, #1ABC9C)',
                        color: '#fff',
                        fontWeight: 700,
                        cursor: pending ? 'progress' : 'pointer',
                    }}
                >
                    {uploading ? 'Uploading video…' : pending ? 'Posting…' : 'Post argument'}
                </button>
            </form>
        </Sheet>
    );
}

export default ArgumentComposerSheet;
