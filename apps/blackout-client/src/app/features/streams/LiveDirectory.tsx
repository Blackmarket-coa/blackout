import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { LIVE_PATH } from '../../pages/paths';
import { listStreams, type StreamSummary } from './streamsClient';

const layoutStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    width: '100%',
    background: 'var(--bg-surface, #0f172a)',
    color: 'var(--text-primary, #f8fafc)',
};

const headerStyle: CSSProperties = {
    padding: '16px 20px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
};

const titleStyle: CSSProperties = { margin: 0, fontSize: 22, fontWeight: 700 };
const subtitleStyle: CSSProperties = {
    margin: 0,
    color: 'var(--text-muted, #9ca3af)',
    fontSize: 13,
};

const sectionStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: 10,
    padding: '12px 16px 24px',
};

const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 12,
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 12,
    background: 'var(--bg-input, #0f172a)',
    color: 'inherit',
    textDecoration: 'none',
};

const liveBadge: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    borderRadius: 999,
    background: 'var(--text-danger, #ef4444)',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 11,
    fontWeight: 700,
    width: 'fit-content',
};

const offlineBadge: CSSProperties = {
    ...liveBadge,
    background: 'var(--bg-nav, #1f2937)',
    color: 'var(--text-muted, #9ca3af)',
    border: '1px solid var(--border-default, #374151)',
};

const emptyStyle: CSSProperties = {
    margin: '24px 16px',
    padding: '24px 20px',
    border: '1px dashed var(--border-default, #374151)',
    borderRadius: 12,
    color: 'var(--text-muted, #9ca3af)',
    textAlign: 'center',
};

const StreamCard = ({ stream }: { stream: StreamSummary }): JSX.Element => (
    <Link
        to={`${LIVE_PATH}/${encodeURIComponent(stream.id)}`}
        style={cardStyle}
        data-testid="live-directory-card"
        data-stream-id={stream.id}
        data-stream-state={stream.state}
    >
        <span style={stream.state === 'live' ? liveBadge : offlineBadge}>
            {stream.state === 'live' ? '● LIVE' : 'replay'}
        </span>
        <strong style={{ fontSize: 14 }}>{stream.title}</strong>
        <span style={{ fontSize: 12, color: 'var(--text-muted, #9ca3af)' }}>
            {stream.creatorId}
        </span>
        {stream.tags.length > 0 ? (
            <span style={{ fontSize: 11, color: 'var(--text-muted, #9ca3af)' }}>
                {stream.tags.map((tag) => `#${tag}`).join(' · ')}
            </span>
        ) : null}
    </Link>
);

/**
 * Live + recent-replays directory mounted at `/live`. Reads
 * `streamsClient.listStreams()` and groups by state — live first, then
 * recently-updated replays. Empty state copy reflects that the catalog
 * may simply be cold (no creators have gone live yet).
 */
export const LiveDirectory = (): JSX.Element => {
    const [streams, setStreams] = useState<StreamSummary[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [forbidden, setForbidden] = useState(false);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        listStreams({ limit: 60 })
            .then((response) => {
                if (cancelled) return;
                setStreams(response.items);
                setLoaded(true);
            })
            .catch((err) => {
                if (cancelled) return;
                if ((err as { status?: number } | null)?.status === 403) {
                    setForbidden(true);
                } else {
                    setError(err instanceof Error ? err.message : 'failed to load streams');
                }
                setLoaded(true);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <section style={layoutStyle} data-shell-region="live-directory">
            <header style={headerStyle}>
                <h1 style={titleStyle}>Live</h1>
                <p style={subtitleStyle}>
                    Streams from creators across {BLACKOUT_TERMS.canopy.plural} you can join.
                </p>
            </header>
            {forbidden ? (
                <p style={emptyStyle} data-testid="live-directory-forbidden">
                    Streaming isn’t available on your account yet.
                </p>
            ) : error ? (
                <p style={emptyStyle} data-testid="live-directory-error">
                    {error}
                </p>
            ) : !loaded ? (
                <p style={emptyStyle}>Loading streams…</p>
            ) : streams.length === 0 ? (
                <p style={emptyStyle} data-testid="live-directory-empty">
                    No streams are live right now. Check back soon.
                </p>
            ) : (
                <div style={sectionStyle} data-testid="live-directory-grid">
                    {streams.map((stream) => (
                        <StreamCard key={stream.id} stream={stream} />
                    ))}
                </div>
            )}
        </section>
    );
};

export default LiveDirectory;
