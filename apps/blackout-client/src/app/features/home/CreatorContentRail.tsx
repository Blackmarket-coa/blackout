import type { CSSProperties } from 'react';
import type { CreatorContent } from '@blackout/core';

const railStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '12px 16px',
};

const headerStyle: CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: 'var(--text-secondary)',
};

const scrollerStyle: CSSProperties = {
    display: 'flex',
    gap: 10,
    overflowX: 'auto',
    paddingBottom: 4,
};

const cardStyle: CSSProperties = {
    flex: '0 0 220px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 12,
    borderRadius: 10,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-surface)',
};

const badgeStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    padding: '2px 8px',
    borderRadius: 999,
    border: '1px solid var(--border-default)',
    color: 'var(--text-secondary)',
    alignSelf: 'flex-start',
};

/**
 * Home-feed rail of recently published creator content (video / article /
 * guide). Hidden entirely when there's nothing to show, so it adds no empty
 * chrome to the feed.
 */
export function CreatorContentRail({ items }: { items: CreatorContent[] }): JSX.Element | null {
    if (items.length === 0) return null;
    return (
        <section style={railStyle} data-testid="home-creator-content-rail">
            <header style={headerStyle}>Fresh from creators</header>
            <div style={scrollerStyle}>
                {items.map((item) => (
                    <article
                        key={item.id}
                        style={cardStyle}
                        data-testid="home-creator-content-card"
                        data-content-kind={item.kind}
                    >
                        <span style={badgeStyle}>{item.kind}</span>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{item.title}</span>
                        {item.body ? (
                            <span
                                style={{
                                    fontSize: 12,
                                    color: 'var(--text-secondary)',
                                    overflow: 'hidden',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 3,
                                    WebkitBoxOrient: 'vertical',
                                }}
                            >
                                {item.body}
                            </span>
                        ) : null}
                    </article>
                ))}
            </div>
        </section>
    );
}

export default CreatorContentRail;
