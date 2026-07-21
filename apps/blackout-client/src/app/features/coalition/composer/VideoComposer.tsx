import React, { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { CoalitionFeedItem } from '@blackout/core';
import { uploadMedia, mxcToUrl } from '../../media/utils/matrixMedia';
import { useMatrixClientOrNull } from '../../../hooks/useMatrixClient';
import type { ClipColorFilter, ClipEditOptions } from '../../streaming/composer/clipTranscode';
import { postCoalitionFeedItem, type CoalitionScopeQuery } from '../coalitionClient';
import { nativePickVideo } from '../../../../platform/nativeMediaBridge';
import { useWebcamRecorder, webcamRecordingSupported } from './useWebcamRecorder';
import {
    listLocalVideos,
    loadLocalVideoBlob,
    localVideoVaultSupported,
    markLocalVideoPosted,
    removeLocalVideo,
    saveLocalVideo,
    type LocalVideoEntry,
} from '../../../../platform/localVideoVault';

/**
 * Record-and-post video composer for the Coalition reel (device-master
 * posture): the camera recording is saved into the on-device vault as the
 * full-quality master, and only a trimmed/cropped/compressed rendition is
 * uploaded and posted to the feed. Server copies can expire under media
 * retention — the library below the composer lets the creator repost any
 * original at any time.
 *
 * Capture uses the native camera through the file-input `capture` hint (see
 * nativePickVideo), and editing reuses the ffmpeg.wasm clip transcoder. Both
 * heavy pieces load lazily; browsing the feed never pays for them.
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

const ghostButtonStyle: CSSProperties = {
    ...buttonStyle,
    background: 'transparent',
    color: 'inherit',
};

type Phase = 'idle' | 'saving' | 'processing' | 'uploading' | 'posting';

/**
 * CSS approximations of the export color grades for the live preview. The
 * real grade runs in ffmpeg at export; these only have to look close.
 */
const FILTER_PREVIEW_CSS: Record<ClipColorFilter, string> = {
    none: 'none',
    mono: 'grayscale(1)',
    warm: 'sepia(0.22) saturate(1.15)',
    cool: 'hue-rotate(-8deg) saturate(1.05) brightness(1.02)',
    vivid: 'saturate(1.35) contrast(1.06)',
};

const FILTER_LABELS: Record<ClipColorFilter, string> = {
    none: 'No filter',
    mono: 'Mono',
    warm: 'Warm',
    cool: 'Cool',
    vivid: 'Vivid',
};

/**
 * In-app camera panel (getUserMedia + MediaRecorder) for runtimes where the
 * file-input `capture` hint can't launch a native camera — desktop browsers
 * foremost. Opens the camera on mount, releases it on unmount.
 */
function WebcamPanel({
    onRecorded,
    onClose,
}: {
    onRecorded: (file: File) => void;
    onClose: () => void;
}): JSX.Element {
    const recorder = useWebcamRecorder();
    const previewRef = useRef<HTMLVideoElement | null>(null);
    const { open, close, file } = recorder;

    useEffect(() => {
        void open();
        return close;
    }, [open, close]);

    useEffect(() => {
        if (previewRef.current) previewRef.current.srcObject = recorder.stream;
    }, [recorder.stream]);

    useEffect(() => {
        if (file) onRecorded(file);
    }, [file, onRecorded]);

    return (
        <div style={{ display: 'grid', gap: 8 }} data-testid="video-composer-webcam">
            <video
                ref={previewRef}
                autoPlay
                muted
                playsInline
                style={{ maxHeight: 220, borderRadius: 10, background: '#000' }}
                data-testid="video-composer-webcam-preview"
            />
            <div style={rowStyle}>
                <button
                    type="button"
                    style={buttonStyle}
                    onClick={() => (recorder.recording ? recorder.stop() : void recorder.start())}
                    data-testid="video-composer-webcam-toggle"
                >
                    {recorder.recording ? '■ Stop' : '● Record'}
                </button>
                <button
                    type="button"
                    style={ghostButtonStyle}
                    onClick={onClose}
                    data-testid="video-composer-webcam-close"
                >
                    Cancel
                </button>
                {recorder.error ? (
                    <span style={{ color: 'var(--text-danger, #f87171)' }}>
                        {recorder.error.message}
                    </span>
                ) : null}
            </div>
        </div>
    );
}

const phaseLabel = (phase: Phase, progress: number): string => {
    switch (phase) {
        case 'saving':
            return 'Saving original…';
        case 'processing':
            return `Processing… ${Math.round(progress * 100)}%`;
        case 'uploading':
            return 'Uploading…';
        case 'posting':
            return 'Posting…';
        default:
            return 'Post video';
    }
};

export interface VideoComposerProps {
    scope: CoalitionScopeQuery;
    onPosted: (item: CoalitionFeedItem) => void;
    onClose: () => void;
    /** Open with this vault original preloaded (the reel's repost path). */
    initialVaultEntryId?: string;
}

export const VideoComposer = ({
    scope,
    onPosted,
    onClose,
    initialVaultEntryId,
}: VideoComposerProps): JSX.Element => {
    const mx = useMatrixClientOrNull();
    const [file, setFile] = useState<File | null>(null);
    /** Vault id backing `file` — set when loaded from the library or after save. */
    const [fileVaultId, setFileVaultId] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [sourceDuration, setSourceDuration] = useState<number | null>(null);
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [start, setStart] = useState('0');
    const [end, setEnd] = useState('');
    const [vertical, setVertical] = useState(true);
    const [compress, setCompress] = useState(true);
    const [filter, setFilter] = useState<ClipColorFilter>('none');
    const [keepOriginal, setKeepOriginal] = useState(true);
    const [webcamOpen, setWebcamOpen] = useState(false);
    const [phase, setPhase] = useState<Phase>('idle');
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [library, setLibrary] = useState<LocalVideoEntry[]>([]);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    const vaultAvailable = localVideoVaultSupported();

    useEffect(
        () => () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        },
        [previewUrl]
    );

    const refreshLibrary = useCallback(async () => {
        if (!vaultAvailable) return;
        try {
            setLibrary(await listLocalVideos());
        } catch {
            // The vault is an enhancement; a broken IndexedDB never blocks posting.
        }
    }, [vaultAvailable]);

    useEffect(() => {
        void refreshLibrary();
    }, [refreshLibrary]);

    const adoptFile = (picked: File | null, vaultId: string | null) => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setFile(picked);
        setFileVaultId(vaultId);
        setSourceDuration(null);
        setStart('0');
        setEnd('');
        setPreviewUrl(picked ? URL.createObjectURL(picked) : null);
        if (picked && !title) setTitle(picked.name.replace(/\.[^.]+$/, ''));
    };

    const capture = async (source: 'camera' | 'gallery') => {
        setError(null);
        const picked = await nativePickVideo({ source });
        if (!picked) return;
        const named = new File([picked.blob], picked.filename, {
            type: picked.contentType,
        });
        adoptFile(named, null);
    };

    const loadFromVault = async (entry: LocalVideoEntry) => {
        setError(null);
        const blob = await loadLocalVideoBlob(entry.id);
        if (!blob) {
            setError('That original is no longer on this device.');
            void refreshLibrary();
            return;
        }
        adoptFile(new File([blob], entry.filename, { type: entry.contentType }), entry.id);
        if (!title) setTitle(entry.title);
    };

    const deleteFromVault = async (entry: LocalVideoEntry) => {
        await removeLocalVideo(entry.id);
        if (fileVaultId === entry.id) setFileVaultId(null);
        void refreshLibrary();
    };

    // Repost path: opened from the reel with a vault original to preload.
    const preloadedRef = useRef(false);
    useEffect(() => {
        if (!initialVaultEntryId || preloadedRef.current || !vaultAvailable) return;
        preloadedRef.current = true;
        void (async () => {
            const entry = (await listLocalVideos()).find((e) => e.id === initialVaultEntryId);
            if (entry) await loadFromVault(entry);
            else setError('That original is no longer on this device.');
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialVaultEntryId, vaultAvailable]);

    // adoptFile closes over previewUrl/title state; route the webcam callback
    // through a ref so WebcamPanel's effect deps stay stable.
    const adoptFileRef = useRef((take: File) => adoptFile(take, null));
    adoptFileRef.current = (take: File) => adoptFile(take, null);
    const onWebcamTake = useCallback((take: File) => {
        setWebcamOpen(false);
        adoptFileRef.current(take);
    }, []);

    const onMetadata = () => {
        const duration = videoRef.current?.duration;
        if (duration && Number.isFinite(duration)) {
            setSourceDuration(duration);
            if (!end) setEnd(String(Math.floor(Math.min(duration, 60))));
        }
    };

    const submit = async () => {
        if (!mx) {
            setError('Sign in before posting videos.');
            return;
        }
        if (!file) {
            setError('Record or choose a video first.');
            return;
        }
        if (!title.trim()) {
            setError('Give the video a title.');
            return;
        }
        const startSeconds = Number(start);
        const endSeconds = Number(end);
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
        setNotice(null);
        setProgress(0);
        try {
            let vaultId = fileVaultId;
            if (keepOriginal && vaultAvailable && !vaultId) {
                setPhase('saving');
                try {
                    const entry = await saveLocalVideo(file, {
                        title: title.trim(),
                        filename: file.name,
                        contentType: file.type,
                        durationSeconds: sourceDuration ? Math.round(sourceDuration) : undefined,
                    });
                    vaultId = entry.id;
                    setFileVaultId(entry.id);
                } catch {
                    // Vault write failure must not lose the post; flag it instead.
                    setNotice('Could not save the original to this device.');
                }
            }

            setPhase('processing');
            let upload: File;
            try {
                const options: ClipEditOptions = {
                    startSeconds,
                    endSeconds,
                    vertical,
                    compress,
                    filter,
                };
                const { transcodeClip } = await import('../../streaming/composer/clipTranscode');
                const blob = await transcodeClip(file, options, setProgress);
                upload = new File([blob], `${title.trim().slice(0, 60) || 'video'}.mp4`, {
                    type: 'video/mp4',
                });
            } catch (err) {
                // Deployments without the ffmpeg core assets can still post —
                // fall back to the untouched recording rather than dead-ending.
                if (err instanceof Error && /engine is not installed/.test(err.message)) {
                    setNotice(
                        'Processing engine unavailable on this deployment — posting the untouched recording.'
                    );
                    upload = file;
                } else {
                    throw err;
                }
            }

            setPhase('uploading');
            const contentUri = await uploadMedia(mx, upload);
            const homeserverUrl =
                (mx as unknown as { getHomeserverUrl?: () => string }).getHomeserverUrl?.() ??
                (mx as unknown as { baseUrl?: string }).baseUrl ??
                '';
            const mediaUrl = homeserverUrl ? mxcToUrl(contentUri, homeserverUrl) : null;
            if (!mediaUrl) {
                throw new Error('Upload succeeded but the media URL could not be resolved.');
            }

            setPhase('posting');
            const { feedItem } = await postCoalitionFeedItem({
                kind: 'video',
                title: title.trim(),
                body: body.trim() || undefined,
                mediaUrl,
                canopyId: scope.canopyId,
                denId: scope.denId,
            });
            if (vaultId) {
                await markLocalVideoPosted(vaultId, feedItem.id).catch(() => undefined);
                void refreshLibrary();
            }
            onPosted(feedItem);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not post the video.');
            setPhase('idle');
        }
    };

    const busy = phase !== 'idle';

    return (
        <div style={panelStyle} data-testid="video-composer">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 14 }}>New video</strong>
                <button
                    type="button"
                    style={ghostButtonStyle}
                    onClick={onClose}
                    disabled={busy}
                    data-testid="video-composer-close"
                >
                    Close
                </button>
            </div>

            <div style={rowStyle}>
                <button
                    type="button"
                    style={buttonStyle}
                    onClick={() => void capture('camera')}
                    disabled={busy}
                    data-testid="video-composer-record"
                >
                    🎥 Record with camera
                </button>
                <button
                    type="button"
                    style={ghostButtonStyle}
                    onClick={() => void capture('gallery')}
                    disabled={busy}
                    data-testid="video-composer-pick"
                >
                    Choose from device
                </button>
                {webcamRecordingSupported() ? (
                    <button
                        type="button"
                        style={ghostButtonStyle}
                        onClick={() => setWebcamOpen((v) => !v)}
                        aria-pressed={webcamOpen}
                        disabled={busy}
                        data-testid="video-composer-webcam-open"
                    >
                        ⏺ Record in app
                    </button>
                ) : null}
                {file ? (
                    <span style={{ color: 'var(--text-muted, #9ca3af)' }}>
                        {file.name} ({Math.max(1, Math.round(file.size / (1024 * 1024)))} MB)
                    </span>
                ) : null}
            </div>

            {webcamOpen && !busy ? (
                <WebcamPanel onRecorded={onWebcamTake} onClose={() => setWebcamOpen(false)} />
            ) : null}

            {previewUrl ? (
                <video
                    ref={videoRef}
                    src={previewUrl}
                    controls
                    playsInline
                    onLoadedMetadata={onMetadata}
                    style={{
                        maxHeight: 260,
                        borderRadius: 10,
                        background: '#000',
                        filter: FILTER_PREVIEW_CSS[filter],
                    }}
                    data-testid="video-composer-preview"
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
                        placeholder="What's happening"
                        data-testid="video-composer-title"
                    />
                </label>
                <label style={{ display: 'grid', gap: 2 }}>
                    Caption
                    <input
                        style={{ ...inputStyle, width: 240 }}
                        value={body}
                        disabled={busy}
                        onChange={(e) => setBody(e.currentTarget.value)}
                        placeholder="Optional caption"
                        data-testid="video-composer-body"
                    />
                </label>
            </div>

            <div style={rowStyle}>
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
                        data-testid="video-composer-end"
                    />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                        type="checkbox"
                        checked={vertical}
                        disabled={busy}
                        onChange={(e) => setVertical(e.currentTarget.checked)}
                        data-testid="video-composer-vertical"
                    />
                    Crop to 9:16
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                        type="checkbox"
                        checked={compress}
                        disabled={busy}
                        onChange={(e) => setCompress(e.currentTarget.checked)}
                        data-testid="video-composer-compress"
                    />
                    Compress for upload
                </label>
                <label style={{ display: 'grid', gap: 2 }}>
                    Filter
                    <select
                        style={inputStyle}
                        value={filter}
                        disabled={busy}
                        onChange={(e) => setFilter(e.currentTarget.value as ClipColorFilter)}
                        data-testid="video-composer-filter"
                    >
                        {(Object.keys(FILTER_LABELS) as ClipColorFilter[]).map((key) => (
                            <option key={key} value={key}>
                                {FILTER_LABELS[key]}
                            </option>
                        ))}
                    </select>
                </label>
                {vaultAvailable ? (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                            type="checkbox"
                            checked={keepOriginal}
                            disabled={busy}
                            onChange={(e) => setKeepOriginal(e.currentTarget.checked)}
                            data-testid="video-composer-keep"
                        />
                        Keep original on this device
                    </label>
                ) : null}
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
                    data-testid="video-composer-submit"
                >
                    {phaseLabel(phase, progress)}
                </button>
                {error ? (
                    <span
                        style={{ color: 'var(--text-danger, #f87171)' }}
                        data-testid="video-composer-error"
                    >
                        {error}
                    </span>
                ) : null}
                {notice ? (
                    <span
                        style={{ color: 'var(--text-muted, #9ca3af)' }}
                        data-testid="video-composer-notice"
                    >
                        {notice}
                    </span>
                ) : null}
            </div>

            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted, #9ca3af)' }}>
                Recording and editing happen on this device. Your full-quality original stays here;
                only the finished rendition uploads. If a server copy expires, repost it from the
                library below.
            </p>

            {vaultAvailable && library.length > 0 ? (
                <div style={{ display: 'grid', gap: 6 }} data-testid="video-composer-library">
                    <strong style={{ fontSize: 12 }}>On this device</strong>
                    {library.map((entry) => (
                        <div
                            key={entry.id}
                            style={{ ...rowStyle, alignItems: 'center' }}
                            data-testid={`video-composer-library-${entry.id}`}
                        >
                            <span style={{ flex: 1, minWidth: 140 }}>
                                {entry.title}
                                <span style={{ color: 'var(--text-muted, #9ca3af)' }}>
                                    {' '}
                                    · {Math.max(1, Math.round(entry.sizeBytes / (1024 * 1024)))} MB
                                    {entry.durationSeconds ? ` · ${entry.durationSeconds}s` : ''}
                                    {entry.lastPostedAt ? ' · posted' : ''}
                                </span>
                            </span>
                            <button
                                type="button"
                                style={ghostButtonStyle}
                                onClick={() => void loadFromVault(entry)}
                                disabled={busy}
                                data-testid={`video-composer-library-load-${entry.id}`}
                            >
                                Load
                            </button>
                            <button
                                type="button"
                                style={ghostButtonStyle}
                                onClick={() => void deleteFromVault(entry)}
                                disabled={busy}
                                data-testid={`video-composer-library-delete-${entry.id}`}
                            >
                                Delete
                            </button>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
};

export default VideoComposer;
