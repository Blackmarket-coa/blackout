import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
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

const replayBadge: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    borderRadius: 999,
    background: 'var(--bg-nav, #1f2937)',
    color: 'var(--text-muted, #9ca3af)',
    border: '1px solid var(--border-default, #374151)',
    fontSize: 11,
    fontWeight: 700,
    width: 'fit-content',
};

const emptyStyle: CSSProperties = {
    margin: '24px 16px',
    padding: '24px 20px',
    border: '1px dashed var(--border-default, #374151)',
    borderRadius: 12,
    color: 'var(--text-muted, #9ca3af)',
    textAlign: 'center',
};

const ReplayCard = ({ stream }: { stream: StreamSummary }): JSX.Element => (
    <Link
        to={`${LIVE_PATH}/${encodeURIComponent(stream.id)}`}
        style={cardStyle}
        data-testid="replays-directory-card"
        data-stream-id={stream.id}
    >
        <span style={replayBadge}>▶ replay</span>
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
 * Replay archive mounted as the Streaming hub's "Replays" tab. Lists streams
 * that carry a `replayPointer`; cards deep-link to the LivestreamViewer, which
 * already plays the replay embed when a stream is offline with a pointer set.
 */
export const ReplaysDirectory = (): JSX.Element => {
    const [replays, setReplays] = useState<StreamSummary[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [forbidden, setForbidden] = useState(false);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        listStreams({ limit: 100 })
            .then((response) => {
                if (cancelled) return;
                setReplays(response.items.filter((item) => Boolean(item.replayPointer)));
                setLoaded(true);
            })
            .catch((err) => {
                if (cancelled) return;
                if ((err as { status?: number } | null)?.status === 403) {
                    setForbidden(true);
                } else {
                    setError(err instanceof Error ? err.message : 'failed to load replays');
                }
                setLoaded(true);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <section style={layoutStyle} data-shell-region="replays-directory">
            <header style={headerStyle}>
                <h1 style={titleStyle}>Replays</h1>
                <p style={subtitleStyle}>Past broadcasts you can watch back on demand.</p>
            </header>
            {forbidden ? (
                <p style={emptyStyle} data-testid="replays-directory-forbidden">
                    Streaming isn’t available on your account yet.
                </p>
            ) : error ? (
                <p style={emptyStyle} data-testid="replays-directory-error">
                    {error}
                </p>
            ) : !loaded ? (
                <p style={emptyStyle}>Loading replays…</p>
            ) : replays.length === 0 ? (
                <p style={emptyStyle} data-testid="replays-directory-empty">
                    No replays are available yet.
                </p>
            ) : (
                <div style={sectionStyle} data-testid="replays-directory-grid">
                    {replays.map((stream) => (
                        <ReplayCard key={stream.id} stream={stream} />
                    ))}
                </div>
            )}
        </section>
    );
};

export default ReplaysDirectory;
