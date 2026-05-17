import type { CSSProperties } from 'react';
import { useAtomValue } from 'jotai';
import { Link } from 'react-router-dom';
import { installedHomepageCardsAtom } from '../monetization/install/installedHomepageCardsAtom';

const sectionStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '4px 16px 12px',
};

const labelStyle: CSSProperties = {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--text-muted, #9ca3af)',
    margin: '8px 4px 0',
};

const railStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    gap: 12,
    overflowX: 'auto',
    paddingBottom: 4,
};

const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 220,
    maxWidth: 260,
    padding: '12px 14px',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 10,
    background: 'var(--bg-input, #0f172a)',
    color: 'inherit',
    textDecoration: 'none',
    flex: '0 0 auto',
};

const cardHeaderStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
};

const iconStyle: CSSProperties = {
    width: 24,
    height: 24,
    borderRadius: 6,
    objectFit: 'cover',
    flex: '0 0 auto',
};

const cardTitleStyle: CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

const cardSummaryStyle: CSSProperties = {
    fontSize: 12,
    color: 'var(--text-muted, #9ca3af)',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
};

export const PluginCardRail = (): JSX.Element | null => {
    const cards = useAtomValue(installedHomepageCardsAtom);
    if (cards.length === 0) return null;

    return (
        <section
            style={sectionStyle}
            data-testid="plugin-card-rail"
            data-shell-region="plugin-card-rail"
        >
            <header style={labelStyle}>From your plugins</header>
            <div style={railStyle}>
                {cards.map((card) => (
                    <Link
                        key={card.pluginId}
                        to={card.href}
                        style={cardStyle}
                        data-testid="plugin-card"
                        data-plugin-id={card.pluginId}
                    >
                        <span style={cardHeaderStyle}>
                            {card.iconUrl ? (
                                <img src={card.iconUrl} alt="" style={iconStyle} />
                            ) : null}
                            <span style={cardTitleStyle}>{card.title}</span>
                        </span>
                        {card.summary ? (
                            <span style={cardSummaryStyle}>{card.summary}</span>
                        ) : null}
                    </Link>
                ))}
            </div>
        </section>
    );
};

export default PluginCardRail;
