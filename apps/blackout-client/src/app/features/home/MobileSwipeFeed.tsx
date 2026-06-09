import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { UnifiedFeedCard } from './UnifiedFeedCard';
import { useReducedMotion } from './useReducedMotion';
import { useUnifiedFeed } from './hooks/useUnifiedFeed';
import type { FeedSort, UnifiedFeedItem } from './unifiedFeedModel';

const containerStyle: CSSProperties = {
    position: 'relative',
    height: '100%',
    width: '100%',
    overflowY: 'auto',
    scrollSnapType: 'y mandatory',
    WebkitOverflowScrolling: 'touch',
    background: 'var(--background-base, #0b0b0f)',
    outline: 'none',
};

const slideStyle: CSSProperties = {
    height: '100%',
    minHeight: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    boxSizing: 'border-box',
    scrollSnapAlign: 'start',
    scrollSnapStop: 'always',
};

const pillStyle: CSSProperties = {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--text-primary, #fff)',
    background: 'rgba(0, 0, 0, 0.55)',
    pointerEvents: 'none',
};

const navButtonBase: CSSProperties = {
    position: 'absolute',
    right: 12,
    width: 40,
    height: 40,
    borderRadius: '50%',
    border: '1px solid var(--border-default, rgba(255,255,255,0.18))',
    background: 'rgba(0, 0, 0, 0.5)',
    color: 'var(--text-primary, #fff)',
    cursor: 'pointer',
    fontSize: 18,
    lineHeight: '1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
};

const messageStyle: CSSProperties = {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-secondary, #aaa)',
    fontSize: 14,
};

export interface MobileSwipeFeedProps {
    sort?: FeedSort;
}

/**
 * Full-screen, vertical swipe-first feed (TikTok/Reels style). Reuses the
 * unified feed data (`useUnifiedFeed`) — Following first, then Discover — and
 * presents one card per viewport. Swiping is native CSS scroll-snap (so touch
 * + trackpad work without a gesture library); keyboard (↑/↓, j/k, PageUp/Down,
 * Space) and on-screen prev/next buttons drive the same `goTo`. The active
 * index is mirrored to an `aria-current` slide and a "n / total" pill, and kept
 * in sync with manual scrolling via the snap-position handler.
 */
export const MobileSwipeFeed = ({ sort }: MobileSwipeFeedProps = {}): JSX.Element => {
    const { following, discover, loading } = useUnifiedFeed(sort);
    const reducedMotion = useReducedMotion();

    const items = useMemo<UnifiedFeedItem[]>(() => {
        const seen = new Set<string>();
        const merged: UnifiedFeedItem[] = [];
        for (const item of [...following, ...discover]) {
            if (seen.has(item.id)) continue;
            seen.add(item.id);
            merged.push(item);
        }
        return merged;
    }, [following, discover]);

    const containerRef = useRef<HTMLDivElement | null>(null);
    const slideRefs = useRef<Array<HTMLElement | null>>([]);
    const [activeIndex, setActiveIndex] = useState(0);

    // Keep the active index in range when the feed length changes.
    useEffect(() => {
        setActiveIndex((prev) => (items.length === 0 ? 0 : Math.min(prev, items.length - 1)));
    }, [items.length]);

    const goTo = useCallback(
        (index: number) => {
            const clamped = Math.max(0, Math.min(index, items.length - 1));
            setActiveIndex(clamped);
            const el = slideRefs.current[clamped];
            // jsdom has no real layout and its scrollIntoView throws — guard so
            // tests (and any non-DOM host) still drive the index.
            if (el && typeof el.scrollIntoView === 'function') {
                try {
                    el.scrollIntoView({
                        behavior: reducedMotion ? 'auto' : 'smooth',
                        block: 'start',
                    });
                } catch {
                    /* no-op: environment without scroll support */
                }
            }
        },
        [items.length, reducedMotion],
    );

    const onKeyDown = useCallback(
        (event: ReactKeyboardEvent<HTMLDivElement>) => {
            switch (event.key) {
                case 'ArrowDown':
                case 'j':
                case 'PageDown':
                case ' ':
                    event.preventDefault();
                    goTo(activeIndex + 1);
                    break;
                case 'ArrowUp':
                case 'k':
                case 'PageUp':
                    event.preventDefault();
                    goTo(activeIndex - 1);
                    break;
                case 'Home':
                    event.preventDefault();
                    goTo(0);
                    break;
                case 'End':
                    event.preventDefault();
                    goTo(items.length - 1);
                    break;
                default:
                    break;
            }
        },
        [activeIndex, goTo, items.length],
    );

    // Mirror manual swipe/scroll into the active index so the pill + a11y stay
    // in sync. Guards against the zero-height jsdom case.
    const onScroll = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;
        const height = container.clientHeight;
        if (height <= 0) return;
        const next = Math.round(container.scrollTop / height);
        const clamped = Math.max(0, Math.min(next, items.length - 1));
        setActiveIndex((prev) => (prev === clamped ? prev : clamped));
    }, [items.length]);

    if (!loading && items.length === 0) {
        return (
            <div style={messageStyle} data-testid="swipe-feed-empty">
                Your feed is quiet right now — follow people and dens to fill it.
            </div>
        );
    }

    if (loading && items.length === 0) {
        return (
            <div style={messageStyle} data-testid="swipe-feed-loading">
                Loading your feed…
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            style={containerStyle}
            onScroll={onScroll}
            onKeyDown={onKeyDown}
            tabIndex={0}
            role="feed"
            aria-label="Swipe feed"
            aria-busy={loading}
            data-testid="swipe-feed"
        >
            <span style={pillStyle} aria-hidden="true" data-testid="swipe-feed-position">
                {Math.min(activeIndex + 1, items.length)} / {items.length}
            </span>

            {items.map((item, index) => (
                <section
                    key={item.id}
                    ref={(node) => {
                        slideRefs.current[index] = node;
                    }}
                    style={slideStyle}
                    role="article"
                    aria-posinset={index + 1}
                    aria-setsize={items.length}
                    aria-current={index === activeIndex ? 'true' : undefined}
                    data-testid="swipe-feed-slide"
                    data-active={index === activeIndex ? 'true' : undefined}
                >
                    <UnifiedFeedCard item={item} reducedMotion={reducedMotion} />
                </section>
            ))}

            <button
                type="button"
                style={{ ...navButtonBase, bottom: 68 }}
                onClick={() => goTo(activeIndex - 1)}
                disabled={activeIndex <= 0}
                aria-label="Previous post"
                data-testid="swipe-feed-prev"
            >
                ↑
            </button>
            <button
                type="button"
                style={{ ...navButtonBase, bottom: 20 }}
                onClick={() => goTo(activeIndex + 1)}
                disabled={activeIndex >= items.length - 1}
                aria-label="Next post"
                data-testid="swipe-feed-next"
            >
                ↓
            </button>
        </div>
    );
};

export default MobileSwipeFeed;
