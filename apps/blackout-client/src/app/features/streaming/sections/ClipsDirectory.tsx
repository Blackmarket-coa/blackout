import React, { type CSSProperties, useEffect, useState } from 'react';
import { listClips, type ClipSummary } from '../../streams';
import {
    HubSection,
    hubCardMetaStyle,
    hubCardTitleStyle,
    hubEmptyStyle,
    hubGridStyle,
} from '../components/HubSection';
import ClipViewer from './ClipViewer';

const clipCardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 0,
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 14,
    background: 'var(--bg-input, #0f172a)',
    color: 'inherit',
    cursor: 'pointer',
    overflow: 'hidden',
    textAlign: 'left',
    font: 'inherit',
};

const thumbStyle: CSSProperties = {
    width: '100%',
    aspectRatio: '9 / 16',
    objectFit: 'cover',
    background: 'radial-gradient(circle at 50% 30%, #1c2733, #05080c)',
    maxHeight: 280,
};

const cardBodyStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '10px 12px 14px',
};

const formatDuration = (seconds: number): string => {
    if (!seconds || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
};

/**
 * Short-form clip directory for the Creator Hub. Reads
 * `streamsClient.listClips()`; tapping a clip opens the vertical
 * ClipViewer reel starting at that clip. Forbidden / empty / error states
 * mirror LiveDirectory so the surface degrades gracefully when streaming
 * isn't enabled on the account.
 */
export const ClipsDirectory = (): JSX.Element => {
    const [clips, setClips] = useState<ClipSummary[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [forbidden, setForbidden] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [openClipId, setOpenClipId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        listClips({ limit: 60 })
            .then((response) => {
                if (cancelled) return;
                setClips(response.items);
                setLoaded(true);
            })
            .catch((err) => {
                if (cancelled) return;
                if ((err as { status?: number } | null)?.status === 403) {
                    setForbidden(true);
                } else {
                    setError(err instanceof Error ? err.message : 'failed to load clips');
                }
                setLoaded(true);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (openClipId) {
        return (
            <ClipViewer
                clips={clips}
                initialClipId={openClipId}
                onClose={() => setOpenClipId(null)}
            />
        );
    }

    return (
        <HubSection
            title="Clips"
            subtitle="Short-form highlights and vertical video from across the hub."
            testId="clips-directory"
            shellRegion="clips-directory"
        >
            {forbidden ? (
                <p style={hubEmptyStyle} data-testid="clips-directory-forbidden">
                    Clips aren’t available on your account yet.
                </p>
            ) : error ? (
                <p style={hubEmptyStyle} data-testid="clips-directory-error">
                    {error}
                </p>
            ) : !loaded ? (
                <p style={hubEmptyStyle}>Loading clips…</p>
            ) : clips.length === 0 ? (
                <p style={hubEmptyStyle} data-testid="clips-directory-empty">
                    No clips yet. Highlights from streams will show up here.
                </p>
            ) : (
                <div style={hubGridStyle} data-testid="clips-directory-grid">
                    {clips.map((clip) => (
                        <button
                            key={clip.id}
                            type="button"
                            style={clipCardStyle}
                            onClick={() => setOpenClipId(clip.id)}
                            data-testid="clips-directory-card"
                            data-clip-id={clip.id}
                        >
                            {clip.thumbnailPointer &&
                            !clip.thumbnailPointer.startsWith('mxc://') ? (
                                <img src={clip.thumbnailPointer} alt="" style={thumbStyle} />
                            ) : (
                                <div style={thumbStyle} />
                            )}
                            <div style={cardBodyStyle}>
                                <span style={hubCardTitleStyle}>{clip.title}</span>
                                <span style={hubCardMetaStyle}>
                                    {clip.creatorId} · {formatDuration(clip.durationSeconds)}
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </HubSection>
    );
};

export default ClipsDirectory;
