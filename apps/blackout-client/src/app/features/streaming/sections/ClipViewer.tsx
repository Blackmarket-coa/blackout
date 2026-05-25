import React, { type CSSProperties, useEffect, useRef } from 'react';
import type { ClipSummary } from '../../streams';
import { useMatrixClientOrNull } from '../../../hooks/useMatrixClient';
import { mxcUrlToHttp } from '../../../utils/matrix';

/**
 * Vertical swipe/scroll clip reel. Adapts the scroll-snap `y mandatory`
 * pattern from `coliseum/tabs/ReelTab.tsx`. Resolves `mxc://` media via the
 * Matrix client when available, otherwise treats `mediaPointer` as a direct
 * (HLS/http) URL so the viewer still works for externally-hosted clips.
 */

const containerStyle: CSSProperties = {
    height: '100%',
    minHeight: 0,
    overflowY: 'auto',
    scrollSnapType: 'y mandatory',
    background: '#000',
};

const cardStyle: CSSProperties = {
    position: 'relative',
    height: '100%',
    minHeight: 0,
    scrollSnapAlign: 'start',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    color: '#fff',
    touchAction: 'pan-y',
};

const videoStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    background: '#000',
};

const overlayStyle: CSSProperties = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 20,
    background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0))',
};

const closeButtonStyle: CSSProperties = {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 2,
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.4)',
    background: 'rgba(0,0,0,0.5)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 13,
};

function resolvePointer(
    pointer: string | undefined,
    mx: ReturnType<typeof useMatrixClientOrNull>
): string | null {
    if (!pointer) return null;
    if (pointer.startsWith('mxc://')) {
        return mx ? mxcUrlToHttp(mx, pointer, true) : null;
    }
    return pointer;
}

function ClipReelCard({ clip }: { clip: ClipSummary }): JSX.Element {
    const mx = useMatrixClientOrNull();
    const videoSrc = resolvePointer(clip.mediaPointer, mx);
    const posterSrc = resolvePointer(clip.thumbnailPointer, mx);

    return (
        <article style={cardStyle} data-testid="clip-reel-card" data-clip-id={clip.id}>
            {videoSrc ? (
                <video
                    style={videoStyle}
                    src={videoSrc}
                    poster={posterSrc ?? undefined}
                    playsInline
                    muted
                    loop
                    controls={false}
                    data-testid="clip-reel-video"
                />
            ) : (
                <div
                    style={{
                        ...videoStyle,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 32,
                        background: 'radial-gradient(circle at 50% 30%, #1c2733, #05080c)',
                    }}
                >
                    <p style={{ margin: 0, fontSize: 20, fontWeight: 600, textAlign: 'center' }}>
                        {clip.title}
                    </p>
                </div>
            )}
            <div style={overlayStyle}>
                <strong style={{ fontSize: 16 }}>{clip.title}</strong>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>
                    {clip.creatorId}
                </span>
                {clip.tags.length > 0 ? (
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                        {clip.tags.map((tag) => `#${tag}`).join(' · ')}
                    </span>
                ) : null}
            </div>
        </article>
    );
}

export interface ClipViewerProps {
    clips: ClipSummary[];
    initialClipId?: string;
    onClose: () => void;
}

export function ClipViewer({ clips, initialClipId, onClose }: ClipViewerProps): JSX.Element {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!initialClipId || !containerRef.current) return;
        const target = containerRef.current.querySelector<HTMLElement>(
            `[data-clip-id="${CSS.escape(initialClipId)}"]`
        );
        target?.scrollIntoView();
    }, [initialClipId]);

    return (
        <div style={{ position: 'relative', height: '100%', minHeight: 0 }}>
            <button
                type="button"
                style={closeButtonStyle}
                onClick={onClose}
                data-testid="clip-viewer-close"
            >
                ← Back
            </button>
            <div style={containerStyle} ref={containerRef} data-testid="clip-viewer">
                {clips.map((clip) => (
                    <ClipReelCard key={clip.id} clip={clip} />
                ))}
            </div>
        </div>
    );
}

export default ClipViewer;
