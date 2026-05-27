import { useEffect, useState, type CSSProperties } from 'react';
import { fetchStreamVods, type StreamVod } from './streamsClient';

/**
 * "Past broadcasts" (VOD) list for a stream, mounted under the player in the
 * LivestreamViewer. Reads `GET /v1/streaming/streams/:id/vods`. Renders
 * nothing when the stream has no replayable past broadcasts, so it's safe to
 * always mount.
 */

const wrapStyle: CSSProperties = {
    padding: '8px 16px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
};

const headingStyle: CSSProperties = {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text-primary, #f8fafc)',
};

const itemStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '8px 12px',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 8,
    background: 'var(--bg-input, #0f172a)',
    color: 'inherit',
    textDecoration: 'none',
    fontSize: 13,
};

const formatDuration = (seconds?: number): string => {
    if (!seconds || seconds <= 0) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${seconds}s`;
};

const formatDate = (iso: string): string => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
};

export const StreamVods = ({ streamId }: { streamId: string }): JSX.Element | null => {
    const [vods, setVods] = useState<StreamVod[]>([]);

    useEffect(() => {
        let cancelled = false;
        fetchStreamVods(streamId)
            .then((res) => {
                if (!cancelled) setVods(res.items);
            })
            .catch(() => {
                /* non-fatal: no past-broadcasts section */
            });
        return () => {
            cancelled = true;
        };
    }, [streamId]);

    if (vods.length === 0) return null;

    return (
        <div style={wrapStyle} data-testid="stream-vods">
            <h2 style={headingStyle}>Past broadcasts</h2>
            {vods.map((vod) => {
                const duration = formatDuration(vod.durationSeconds);
                return (
                    <a
                        key={vod.id}
                        href={vod.replayPointer}
                        style={itemStyle}
                        data-testid="stream-vod-item"
                        data-vod-id={vod.id}
                    >
                        <span>{formatDate(vod.startedAt)}</span>
                        {duration ? (
                            <span style={{ color: 'var(--text-muted, #9ca3af)' }}>{duration}</span>
                        ) : null}
                    </a>
                );
            })}
        </div>
    );
};

export default StreamVods;
