import React, { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { MediaUploadCompletedPayload } from '@blackout/protocol';
import {
    cancelUpload as cancelUploadDefault,
    fetchCompletedUpload as fetchCompletedUploadDefault,
    fetchUploadProgress as fetchUploadProgressDefault,
    type MediaUploadProgress,
} from './mediaCallClient';

export interface MediaUploadWidgetProps {
    fetchUploadProgress?: typeof fetchUploadProgressDefault;
    cancelUpload?: typeof cancelUploadDefault;
    fetchCompletedUpload?: typeof fetchCompletedUploadDefault;
}

const containerStyle: CSSProperties = { display: 'grid', gap: 16, padding: 16 };
const cardStyle: CSSProperties = {
    display: 'grid',
    gap: 8,
    padding: 12,
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    background: 'var(--bg-surface)',
};
const fieldStyle: CSSProperties = {
    display: 'grid',
    gap: 4,
    fontSize: 12,
    color: 'var(--text-secondary)',
};

const progressBarStyle = (pct: number): CSSProperties => ({
    width: '100%',
    height: 8,
    borderRadius: 999,
    background: 'var(--bg-input)',
    overflow: 'hidden',
    position: 'relative',
});

const progressFillStyle = (pct: number): CSSProperties => ({
    width: `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`,
    height: '100%',
    background: 'var(--accent-primary, #1ABC9C)',
    transition: 'width 200ms ease',
});

const formatBytes = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const progressPercent = (progress: MediaUploadProgress): number => {
    if (progress.sizeBytes <= 0) return 0;
    return (progress.bytesUploaded / progress.sizeBytes) * 100;
};

export function MediaUploadWidget({
    fetchUploadProgress = fetchUploadProgressDefault,
    cancelUpload = cancelUploadDefault,
    fetchCompletedUpload = fetchCompletedUploadDefault,
}: MediaUploadWidgetProps = {}) {
    const [uploadIdInput, setUploadIdInput] = useState('');
    const [trackedId, setTrackedId] = useState<string | null>(null);
    const [progress, setProgress] = useState<MediaUploadProgress | null>(null);
    const [completed, setCompleted] = useState<MediaUploadCompletedPayload | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [cancelPending, setCancelPending] = useState(false);
    const [cancelError, setCancelError] = useState<string | null>(null);

    const loadOnce = useCallback(
        async (id: string) => {
            setLoading(true);
            setLoadError(null);
            setCompleted(null);
            try {
                const next = await fetchUploadProgress(id);
                setProgress(next);
                if (next.status === 'completed') {
                    try {
                        setCompleted(await fetchCompletedUpload(id));
                    } catch {
                        // Completed-detail is informational; treat fetch failure
                        // as missing detail, not as a load error.
                        setCompleted(null);
                    }
                }
            } catch (error) {
                setProgress(null);
                setLoadError(
                    error instanceof Error
                        ? error.message
                        : 'Failed to fetch upload progress.',
                );
            } finally {
                setLoading(false);
            }
        },
        [fetchCompletedUpload, fetchUploadProgress],
    );

    useEffect(() => {
        if (!trackedId) return;
        void loadOnce(trackedId);
    }, [loadOnce, trackedId]);

    const onTrack = useCallback(
        (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const id = uploadIdInput.trim();
            if (!id) return;
            setTrackedId(id);
            setCancelError(null);
        },
        [uploadIdInput],
    );

    const onRefresh = useCallback(() => {
        if (!trackedId) return;
        void loadOnce(trackedId);
    }, [loadOnce, trackedId]);

    const onCancel = useCallback(async () => {
        if (!trackedId) return;
        setCancelPending(true);
        setCancelError(null);
        try {
            await cancelUpload(trackedId);
            // Server emits a completed-event with status=failed; refresh state
            // so the UI flips to the terminal status.
            await loadOnce(trackedId);
        } catch (error) {
            setCancelError(
                error instanceof Error ? error.message : 'Failed to cancel upload.',
            );
        } finally {
            setCancelPending(false);
        }
    }, [cancelUpload, loadOnce, trackedId]);

    const isTerminal =
        progress !== null &&
        (progress.status === 'completed' || progress.status === 'failed');
    const pct = progress ? progressPercent(progress) : 0;

    return (
        <main style={containerStyle} data-testid="media-upload-widget">
            <header>
                <h1 style={{ margin: 0 }}>Media pipeline</h1>
                <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>
                    Track an in-flight upload by id. Shows live progress, lets you cancel
                    while in-flight, and surfaces the completed Matrix Content URI when the
                    server finalizes.
                </p>
            </header>

            <form
                style={cardStyle}
                onSubmit={onTrack}
                data-testid="media-upload-track-form"
            >
                <label style={fieldStyle}>
                    Upload id
                    <input
                        data-testid="media-upload-id-input"
                        value={uploadIdInput}
                        onChange={(event) => setUploadIdInput(event.target.value)}
                        placeholder="upload-…"
                        required
                    />
                </label>
                <button
                    type="submit"
                    data-testid="media-upload-track-submit"
                    disabled={!uploadIdInput.trim()}
                    style={{
                        alignSelf: 'flex-start',
                        padding: '6px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--accent-primary, #1ABC9C)',
                        background: 'var(--accent-primary, #1ABC9C)',
                        color: '#fff',
                        cursor: 'pointer',
                    }}
                >
                    Track upload
                </button>
            </form>

            {trackedId ? (
                <section style={cardStyle} data-testid="media-upload-status">
                    <header
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}
                    >
                        <strong>{trackedId}</strong>
                        <button
                            type="button"
                            onClick={onRefresh}
                            disabled={loading}
                            data-testid="media-upload-refresh"
                        >
                            Refresh
                        </button>
                    </header>
                    {loadError ? (
                        <p
                            role="alert"
                            data-testid="media-upload-load-error"
                            style={{ color: 'var(--danger)', margin: 0 }}
                        >
                            {loadError}
                        </p>
                    ) : null}
                    {loading && !progress ? (
                        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                            Loading status…
                        </p>
                    ) : !progress ? (
                        <p
                            data-testid="media-upload-empty"
                            style={{ color: 'var(--text-secondary)', margin: 0 }}
                        >
                            No status returned yet.
                        </p>
                    ) : (
                        <>
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                }}
                            >
                                <small
                                    data-testid="media-upload-status-label"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    {progress.status}
                                </small>
                                <small style={{ color: 'var(--text-secondary)' }}>
                                    {formatBytes(progress.bytesUploaded)} /{' '}
                                    {formatBytes(progress.sizeBytes)} ({pct.toFixed(1)}%)
                                </small>
                            </div>
                            <div
                                role="progressbar"
                                aria-valuenow={Math.round(pct)}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                data-testid="media-upload-progress-bar"
                                style={progressBarStyle(pct)}
                            >
                                <div style={progressFillStyle(pct)} />
                            </div>
                            {progress.estimatedCompletionAt ? (
                                <small style={{ color: 'var(--text-secondary)' }}>
                                    ETA{' '}
                                    {new Date(progress.estimatedCompletionAt).toLocaleString()}
                                </small>
                            ) : null}
                            {cancelError ? (
                                <p
                                    role="alert"
                                    data-testid="media-upload-cancel-error"
                                    style={{ color: 'var(--danger)', margin: 0 }}
                                >
                                    {cancelError}
                                </p>
                            ) : null}
                            {!isTerminal ? (
                                <button
                                    type="button"
                                    data-testid="media-upload-cancel"
                                    onClick={() => void onCancel()}
                                    disabled={cancelPending}
                                    style={{
                                        alignSelf: 'flex-start',
                                        padding: '6px 14px',
                                        borderRadius: 8,
                                        border: '1px solid var(--danger)',
                                        background: 'var(--bg-input)',
                                        color: 'var(--danger)',
                                        cursor: cancelPending ? 'progress' : 'pointer',
                                    }}
                                >
                                    {cancelPending ? 'Cancelling…' : 'Cancel upload'}
                                </button>
                            ) : null}
                        </>
                    )}
                    {completed ? (
                        <div
                            data-testid="media-upload-completed-card"
                            style={{
                                marginTop: 4,
                                borderTop: '1px solid var(--border-default)',
                                paddingTop: 8,
                                display: 'grid',
                                gap: 4,
                            }}
                        >
                            <strong>Completed</strong>
                            <small style={{ color: 'var(--text-secondary)' }}>
                                {completed.filename} · {completed.contentType} ·{' '}
                                {formatBytes(completed.sizeBytes)}
                            </small>
                            {completed.mxc ? (
                                <small style={{ color: 'var(--text-secondary)' }}>
                                    mxc:{' '}
                                    <code data-testid="media-upload-completed-mxc">
                                        {completed.mxc}
                                    </code>
                                </small>
                            ) : null}
                            <small style={{ color: 'var(--text-secondary)' }}>
                                Finalized {new Date(completed.completedAt).toLocaleString()}
                            </small>
                            {completed.failureReason ? (
                                <small style={{ color: 'var(--danger)' }}>
                                    {completed.failureReason}
                                </small>
                            ) : null}
                        </div>
                    ) : null}
                </section>
            ) : (
                <p
                    data-testid="media-upload-no-tracking"
                    style={{ color: 'var(--text-secondary)', margin: 0 }}
                >
                    Enter an upload id above to track its progress.
                </p>
            )}
        </main>
    );
}

export default MediaUploadWidget;
