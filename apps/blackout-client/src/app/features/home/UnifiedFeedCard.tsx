import { type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { UnifiedFeedItem, UnifiedFeedSource } from './unifiedFeedModel';

const SOURCE_LABELS: Record<UnifiedFeedSource, string> = {
    den: 'Den',
    stream: 'Live',
    coalition: 'Coalition',
    coliseum: 'Coliseum',
    status: 'Status',
};

const cardStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 10,
    background: 'var(--bg-input, #0f172a)',
    color: 'inherit',
    textDecoration: 'none',
};

const bodyStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
};

const sourceTagStyle: CSSProperties = {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--text-muted, #9ca3af)',
    fontWeight: 700,
};

const titleStyle: CSSProperties = {
    fontSize: 15,
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

const subtitleStyle: CSSProperties = {
    fontSize: 13,
    color: 'var(--text-muted, #9ca3af)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

const badgeStyle: CSSProperties = {
    minWidth: 22,
    height: 22,
    padding: '0 8px',
    borderRadius: 999,
    background: 'var(--accent-primary, #3b82f6)',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 11,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
};

const liveBadgeStyle: CSSProperties = {
    ...badgeStyle,
    background: 'var(--accent-danger, #ef4444)',
};

export const UnifiedFeedCard = ({ item }: { item: UnifiedFeedItem }): JSX.Element => {
    const isLive = item.source === 'stream' && item.badge === 'LIVE';
    return (
        <Link
            to={item.href}
            style={cardStyle}
            data-testid="home-feed-card"
            data-source={item.source}
            data-den-id={item.denId ?? undefined}
        >
            <span style={bodyStyle}>
                <span style={sourceTagStyle}>{SOURCE_LABELS[item.source]}</span>
                <span style={titleStyle}>{item.title}</span>
                <span style={subtitleStyle}>{item.subtitle}</span>
            </span>
            {item.badge ? (
                <span style={isLive ? liveBadgeStyle : badgeStyle} aria-label={item.badge}>
                    {item.badge}
                </span>
            ) : null}
        </Link>
    );
};

export default UnifiedFeedCard;
