import classNames from 'classnames';
import { useEffect, useRef } from 'react';
import { useSetAtom } from 'jotai';
import { Link } from 'react-router-dom';
import { recordViewEvent } from '../../sdk/viewEvents';
import { markFeedItemOpenedAtom } from './feedSeen';
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
    governance: 'Governance',
};

const SOURCE_GLYPH: Record<UnifiedFeedSource, string> = {
    den: '🔥',
    stream: '🎥',
    coliseum: '⚖️',
    coalition: '📍',
    status: '✦',
    wall: '📝',
    marketplace: '🛒',
    governance: '🗳️',
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
    const cardRef = useRef<HTMLAnchorElement>(null);
    const markOpened = useSetAtom(markFeedItemOpenedAtom);

    // One impression per item per session, fired when at least half the card
    // has actually been on screen (not merely rendered below the fold).
    useEffect(() => {
        const node = cardRef.current;
        if (!node || typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (!entries.some((entry) => entry.isIntersecting)) return;
                recordViewEvent(
                    'feed_item_impression',
                    { itemId: item.id, source: item.source },
                    {
                        coalitionId: item.canopyId ?? undefined,
                        dedupeKey: `impression:${item.id}`,
                    }
                );
                observer.disconnect();
            },
            { threshold: 0.5 }
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [item.id, item.source, item.canopyId]);

    return (
        <Link
            ref={cardRef}
            to={item.href}
            className={css.card({ source: item.source })}
            data-testid="home-feed-card"
            data-source={item.source}
            data-den-id={item.denId ?? undefined}
            onClick={() => {
                markOpened(item);
                recordViewEvent(
                    'feed_item_opened',
                    { itemId: item.id, source: item.source },
                    { coalitionId: item.canopyId ?? undefined }
                );
            }}
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
