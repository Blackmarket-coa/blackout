import classNames from 'classnames';
import { Link } from 'react-router-dom';
import * as css from './UnifiedFeedCard.css';
import type { UnifiedFeedItem, UnifiedFeedSource } from './unifiedFeedModel';

const SOURCE_LABELS: Record<UnifiedFeedSource, string> = {
    den: 'Den',
    stream: 'Live',
    coalition: 'Coalition',
    coliseum: 'Coliseum',
    status: 'Status',
    wall: 'Post',
    marketplace: 'Market',
};

const SOURCE_GLYPH: Record<UnifiedFeedSource, string> = {
    den: '🔥',
    stream: '🎥',
    coliseum: '⚖️',
    coalition: '📍',
    status: '✦',
    wall: '📝',
    marketplace: '🛒',
};

interface UnifiedFeedCardProps {
    item: UnifiedFeedItem;
    reducedMotion?: boolean;
}

/**
 * One organic, source-tinted card in the living feed. Each source carries its
 * own accent + glyph (campfire dens, live windows, debate scales, coalition
 * pins, human-energy statuses, market stalls); dens additionally get a softly
 * flickering "campfire" ring when motion is allowed. When an item has media,
 * the leading slot shows an inline thumbnail instead of the glyph ring.
 */
export const UnifiedFeedCard = ({
    item,
    reducedMotion = false,
}: UnifiedFeedCardProps): JSX.Element => {
    const isLive = item.source === 'stream' && item.badge === 'LIVE';
    const glyph =
        item.source === 'status' && 'emoji' in item && item.emoji
            ? item.emoji
            : SOURCE_GLYPH[item.source];
    const emberRing = item.source === 'den' && !reducedMotion;

    return (
        <Link
            to={item.href}
            className={css.card({ source: item.source })}
            data-testid="home-feed-card"
            data-source={item.source}
            data-den-id={item.denId ?? undefined}
        >
            {item.mediaUrl ? (
                <img
                    src={item.mediaUrl}
                    alt=""
                    className={css.thumb}
                    loading="lazy"
                    data-testid="home-feed-card-thumb"
                />
            ) : (
                <span
                    className={classNames(css.ring, emberRing && css.ringEmber)}
                    aria-hidden="true"
                >
                    {glyph}
                </span>
            )}
            <span className={css.body}>
                <span className={css.sourceTag}>{SOURCE_LABELS[item.source]}</span>
                <span className={css.title}>{item.title}</span>
                <span className={css.subtitle}>{item.subtitle}</span>
            </span>
            {item.badge ? (
                <span
                    className={classNames(css.badge, isLive && css.liveBadge)}
                    aria-label={item.badge}
                >
                    {item.badge}
                </span>
            ) : null}
        </Link>
    );
};

export default UnifiedFeedCard;
