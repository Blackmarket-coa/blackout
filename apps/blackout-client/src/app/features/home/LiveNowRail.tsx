import { type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { StreamFeedItem } from './unifiedFeedModel';

const railSectionStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '4px 16px 12px',
};

const railLabelStyle: CSSProperties = {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--text-muted, #9ca3af)',
    margin: '8px 4px 0',
};

const railStyle: CSSProperties = {
    display: 'flex',
    gap: 10,
    overflowX: 'auto',
    paddingBottom: 4,
};

const cardStyle: CSSProperties = {
    flex: '0 0 auto',
    width: 180,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '10px 12px',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 10,
    background: 'var(--bg-input, #0f172a)',
    color: 'inherit',
    textDecoration: 'none',
};

const liveTagStyle: CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.6,
    color: 'var(--accent-danger, #ef4444)',
};

const titleStyle: CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

export const LiveNowRail = ({ items }: { items: StreamFeedItem[] }): JSX.Element | null => {
    if (items.length === 0) return null;
    return (
        <section
            style={railSectionStyle}
            data-shell-region="home-live-rail"
            data-testid="home-live-rail"
        >
            <header style={railLabelStyle}>Live now</header>
            <div style={railStyle}>
                {items.map((item) => (
                    <Link
                        key={item.id}
                        to={item.href}
                        style={cardStyle}
                        data-testid="home-live-card"
                    >
                        <span style={liveTagStyle}>● LIVE</span>
                        <span style={titleStyle}>{item.title}</span>
                    </Link>
                ))}
            </div>
        </section>
    );
};

export default LiveNowRail;
