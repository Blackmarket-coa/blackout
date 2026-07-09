import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useAtom } from 'jotai';
import type { ColiseumStance, RankedColiseumArgument } from '@blackout/core';
import { coliseumReelMutedAtom } from '../../../state/coliseum';
import { useMatrixClientOrNull } from '../../../hooks/useMatrixClient';
import { mxcUrlToHttp } from '../../../utils/matrix';
import { useReducedMotion } from '../../home/useReducedMotion';
import { useViewportWidth } from '../../../hooks/useViewportWidth';
import { isMobileViewport } from '../../../pages/client/layoutMetrics';
import ColiseumCitationChip from '../ColiseumCitationChip';
import { StanceBadge } from './StanceBadge';
import { AuthorLine } from './AuthorLine';
import { ReelActionRail } from './ReelActionRail';
import { stanceTint, STANCE_COLOR } from './stance';
import * as css from '../tabs/reel.css';

/** Horizontal travel (px) past which a swipe counts as a vote. */
const SWIPE_THRESHOLD = 60;
/** Max pointer travel (px) for a press to still count as a tap. */
const TAP_SLOP = 12;
/** Two taps within this window (ms) count as a double-tap. */
const DOUBLE_TAP_MS = 300;

const HINT_SEEN_KEY = 'bmc-coliseum-reel-hint-seen';

export interface ArgumentReelItem extends RankedColiseumArgument {
    topicTitle?: string;
}

export interface ArgumentReelProps {
    items: ArgumentReelItem[];
    winnerId?: string | null;
    flashes: Record<string, 'up' | 'down' | null>;
    onVote: (argumentId: string, direction: 'up' | 'down') => void;
    /** Open the debate thread for this item (comments). */
    onOpenTopic?: (item: ArgumentReelItem) => void;
    /** Share this item (parent owns URL + toast). */
    onShare?: (item: ArgumentReelItem) => void;
    shareStatus?: string | null;
    /** Called near the end of the list to pull the next page. */
    onEndReached?: () => void;
    hasMore?: boolean;
    loading?: boolean;
    'data-testid'?: string;
}

function readHintSeen(): boolean {
    try {
        return window.localStorage.getItem(HINT_SEEN_KEY) === '1';
    } catch {
        return true;
    }
}

function markHintSeen(): void {
    try {
        window.localStorage.setItem(HINT_SEEN_KEY, '1');
    } catch {
        /* private mode etc. — hint just shows again */
    }
}

/** jsdom-safe play(): HTMLMediaElement.play is unimplemented there. */
function safePlay(el: HTMLVideoElement): void {
    try {
        const result = el.play();
        if (result && typeof result.catch === 'function') result.catch(() => undefined);
    } catch {
        /* no-op */
    }
}

function safePause(el: HTMLVideoElement): void {
    try {
        el.pause();
    } catch {
        /* no-op */
    }
}

function ReelSlide({
    item,
    index,
    active,
    mountMedia,
    muted,
    isWinner,
    flash,
    reducedMotion,
    documentVisible,
    setSize,
    onVote,
    onOpenTopic,
    onShare,
    slideRef,
}: {
    item: ArgumentReelItem;
    index: number;
    active: boolean;
    mountMedia: boolean;
    muted: boolean;
    isWinner: boolean;
    flash: 'up' | 'down' | null;
    reducedMotion: boolean;
    documentVisible: boolean;
    setSize: number;
    onVote: (argumentId: string, direction: 'up' | 'down') => void;
    onOpenTopic?: () => void;
    onShare?: () => void;
    slideRef: (node: HTMLElement | null) => void;
}) {
    const mx = useMatrixClientOrNull();
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [userPaused, setUserPaused] = useState(false);
    const [progress, setProgress] = useState(0);
    const [heart, setHeart] = useState(0);
    const touchStart = useRef<{ x: number; y: number } | null>(null);
    const lastTap = useRef<number>(0);
    const singleTapTimer = useRef<number | null>(null);

    const videoSrc = item.media && mx ? mxcUrlToHttp(mx, item.media.mxc, true) : null;
    const posterSrc =
        item.media?.posterMxc && mx ? mxcUrlToHttp(mx, item.media.posterMxc, true) : null;

    // Visibility-driven playback: only the active slide plays; anything else
    // (or a hidden document / user pause) is paused.
    useEffect(() => {
        const el = videoRef.current;
        if (!el) return;
        if (active && mountMedia && !userPaused && documentVisible) safePlay(el);
        else safePause(el);
    }, [active, mountMedia, userPaused, documentVisible]);

    // Reset transient state when the slide scrolls away.
    useEffect(() => {
        if (!active) {
            setUserPaused(false);
            setProgress(0);
        }
    }, [active]);

    useEffect(
        () => () => {
            if (singleTapTimer.current !== null) window.clearTimeout(singleTapTimer.current);
        },
        []
    );

    const onTimeUpdate = useCallback(() => {
        const el = videoRef.current;
        if (!el || !el.duration || !Number.isFinite(el.duration)) return;
        setProgress(Math.min(100, (el.currentTime / el.duration) * 100));
    }, []);

    const triggerAgree = useCallback(() => {
        onVote(item.id, 'up');
        setHeart((value) => value + 1);
        window.setTimeout(() => setHeart(0), 700);
    }, [item.id, onVote]);

    // Tap = pause/play, double-tap = agree. Attached to the media layer only,
    // so rail/overlay buttons never toggle playback.
    const onMediaPointerDown = useCallback((event: React.PointerEvent) => {
        touchStart.current = { x: event.clientX, y: event.clientY };
    }, []);

    const onMediaPointerUp = useCallback(
        (event: React.PointerEvent) => {
            const start = touchStart.current;
            if (!start) return;
            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;
            const moved = Math.hypot(dx, dy);
            if (moved > TAP_SLOP) return; // swipe/scroll, not a tap
            const now = Date.now();
            if (now - lastTap.current < DOUBLE_TAP_MS) {
                lastTap.current = 0;
                if (singleTapTimer.current !== null) {
                    window.clearTimeout(singleTapTimer.current);
                    singleTapTimer.current = null;
                }
                triggerAgree();
                return;
            }
            lastTap.current = now;
            singleTapTimer.current = window.setTimeout(() => {
                singleTapTimer.current = null;
                if (videoSrc) setUserPaused((value) => !value);
            }, DOUBLE_TAP_MS);
        },
        [triggerAgree, videoSrc]
    );

    const onTouchStart = useCallback((event: React.TouchEvent) => {
        const touch = event.touches[0];
        touchStart.current = { x: touch.clientX, y: touch.clientY };
    }, []);

    const onTouchEnd = useCallback(
        (event: React.TouchEvent) => {
            const start = touchStart.current;
            if (!start) return;
            const touch = event.changedTouches[0];
            const dx = touch.clientX - start.x;
            const dy = touch.clientY - start.y;
            // Horizontal intent only: vertical swipes fall through to native
            // scroll-snap (scroll up = next argument = neutral).
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
                onVote(item.id, dx > 0 ? 'up' : 'down');
            }
        },
        [item.id, onVote]
    );

    return (
        <article
            ref={slideRef}
            className={css.slide}
            role="article"
            aria-posinset={index + 1}
            aria-setsize={setSize}
            aria-current={active ? 'true' : undefined}
            data-testid="coliseum-reel-card"
            data-coliseum-argument-id={item.id}
            data-active={active ? 'true' : undefined}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
        >
            {mountMedia && videoSrc ? (
                <video
                    ref={videoRef}
                    className={css.media}
                    src={videoSrc}
                    poster={posterSrc ?? undefined}
                    playsInline
                    muted={muted}
                    loop
                    controls={false}
                    preload="auto"
                    onTimeUpdate={onTimeUpdate}
                    data-testid="coliseum-reel-video"
                    onPointerDown={onMediaPointerDown}
                    onPointerUp={onMediaPointerUp}
                />
            ) : (
                <div
                    className={css.textCard}
                    style={{
                        background: posterSrc
                            ? `url(${posterSrc}) center/cover no-repeat, #05080c`
                            : `radial-gradient(circle at 50% 30%, ${stanceTint(
                                  item.stance as ColiseumStance,
                                  '2e'
                              )}, #05080c 75%)`,
                    }}
                    onPointerDown={onMediaPointerDown}
                    onPointerUp={onMediaPointerUp}
                >
                    {!videoSrc ? <p className={css.textCardBody}>{item.body}</p> : null}
                </div>
            )}

            {flash ? (
                <div
                    aria-hidden
                    data-testid={`coliseum-reel-flash-${flash}`}
                    className={css.flashOverlay}
                    style={{
                        background:
                            flash === 'up' ? 'rgba(26,188,156,0.18)' : 'rgba(231,76,60,0.18)',
                    }}
                >
                    {flash === 'up' ? '👍' : '👎'}
                </div>
            ) : null}

            {heart > 0 && !reducedMotion ? (
                <div aria-hidden className={css.heartBurst} data-testid="coliseum-reel-heart">
                    ❤️
                </div>
            ) : null}

            {userPaused ? (
                <div aria-hidden className={css.pausedBadge} data-testid="coliseum-reel-paused">
                    ▶
                </div>
            ) : null}

            <ReelActionRail
                argument={item}
                onVote={onVote}
                onOpenDebate={onOpenTopic}
                onShare={onShare}
            />

            <div className={css.overlay}>
                {item.topicTitle ? (
                    <button
                        type="button"
                        data-testid="coliseum-reel-topic-chip"
                        onClick={onOpenTopic}
                        className={css.topicChip}
                    >
                        From: {item.topicTitle} →
                    </button>
                ) : null}
                <div className={css.metaRow}>
                    <StanceBadge stance={item.stance} />
                    {item.parentArgumentId ? (
                        <span data-testid="coliseum-reel-rebuttal">↪ rebuttal</span>
                    ) : null}
                    {isWinner ? (
                        <span style={{ fontWeight: 700, color: STANCE_COLOR[item.stance] }}>
                            🏆 Winner
                        </span>
                    ) : null}
                    <span style={{ marginLeft: 'auto' }}>
                        consensus {Math.round(item.nuanceScore * 100)}%
                    </span>
                </div>
                <AuthorLine userId={item.authorId} timestamp={item.createdAt} invert />
                {videoSrc ? <p className={css.bodyText}>{item.body}</p> : null}
                {item.citations.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {item.citations.map((citation, citationIndex) => (
                            <ColiseumCitationChip key={citationIndex} citation={citation} />
                        ))}
                    </div>
                ) : null}
            </div>

            {videoSrc && active ? (
                <div className={css.progressTrack} data-testid="coliseum-reel-progress" aria-hidden>
                    <div className={css.progressFill} style={{ width: `${progress}%` }} />
                </div>
            ) : null}
        </article>
    );
}

/**
 * Full-screen vertical argument reel (TikTok-style): one slide per viewport
 * with scroll-snap, active-index tracking, visibility-driven video playback,
 * windowed media mounting (active ±1), keyboard navigation, double-tap agree,
 * and an action rail. Purely presentational — data + voting come from props.
 */
export function ArgumentReel({
    items,
    winnerId = null,
    flashes,
    onVote,
    onOpenTopic,
    onShare,
    shareStatus,
    onEndReached,
    hasMore = false,
    loading = false,
    'data-testid': testId = 'coliseum-reel',
}: ArgumentReelProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const slideRefs = useRef<Array<HTMLElement | null>>([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [documentVisible, setDocumentVisible] = useState(true);
    const [hintVisible, setHintVisible] = useState(() =>
        typeof window === 'undefined' ? false : !readHintSeen()
    );
    const [muted, setMuted] = useAtom(coliseumReelMutedAtom);
    const reducedMotion = useReducedMotion();
    const viewportWidth = useViewportWidth();
    const isMobile = isMobileViewport(viewportWidth);

    // Pause everything while the app is backgrounded.
    useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        const onVisibility = () => setDocumentVisible(document.visibilityState !== 'hidden');
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, []);

    // Keep the active index in range when the feed length changes.
    useEffect(() => {
        setActiveIndex((prev) => (items.length === 0 ? 0 : Math.min(prev, items.length - 1)));
    }, [items.length]);

    const goTo = useCallback(
        (index: number) => {
            const clamped = Math.max(0, Math.min(index, items.length - 1));
            setActiveIndex(clamped);
            const el = slideRefs.current[clamped];
            // jsdom has no layout and scrollIntoView throws — guard so tests
            // (and any non-DOM host) still drive the index.
            if (el && typeof el.scrollIntoView === 'function') {
                try {
                    el.scrollIntoView({
                        behavior: reducedMotion ? 'auto' : 'smooth',
                        block: 'start',
                    });
                } catch {
                    /* no-op */
                }
            }
        },
        [items.length, reducedMotion]
    );

    const dismissHint = useCallback(() => {
        setHintVisible(false);
        markHintSeen();
    }, []);

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
        [activeIndex, goTo, items.length]
    );

    // Mirror manual swipe/scroll into the active index (guards the zero-height
    // jsdom case) and pull the next page near the end.
    const onScroll = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;
        const height = container.clientHeight;
        if (height <= 0) return;
        const next = Math.round(container.scrollTop / height);
        const clamped = Math.max(0, Math.min(next, items.length - 1));
        setActiveIndex((prev) => (prev === clamped ? prev : clamped));
        if (hasMore && !loading && clamped >= items.length - 3) onEndReached?.();
        if (hintVisible) dismissHint();
    }, [items.length, hasMore, loading, onEndReached, hintVisible, dismissHint]);

    const positionLabel = useMemo(
        () => `${Math.min(activeIndex + 1, items.length)} / ${items.length}${hasMore ? '+' : ''}`,
        [activeIndex, items.length, hasMore]
    );

    return (
        <div
            ref={containerRef}
            className={css.container}
            onScroll={onScroll}
            onKeyDown={onKeyDown}
            tabIndex={0}
            role="feed"
            aria-label="Argument reel"
            aria-busy={loading}
            data-testid={testId}
        >
            <div className={css.topChrome}>
                <span className={css.positionPill} aria-hidden data-testid="coliseum-reel-position">
                    {positionLabel}
                </span>
                <button
                    type="button"
                    className={css.chromeButton}
                    aria-label={muted ? 'Unmute' : 'Mute'}
                    aria-pressed={muted}
                    data-testid="coliseum-reel-mute"
                    onClick={() => setMuted((value) => !value)}
                >
                    {muted ? '🔇' : '🔊'}
                </button>
            </div>

            {shareStatus ? (
                <div role="status" className={css.statusToast}>
                    {shareStatus}
                </div>
            ) : null}

            {items.map((item, index) => (
                <ReelSlide
                    key={item.id}
                    item={item}
                    index={index}
                    setSize={items.length}
                    active={index === activeIndex}
                    mountMedia={Math.abs(index - activeIndex) <= 1}
                    muted={muted}
                    isWinner={item.id === winnerId}
                    flash={flashes[item.id] ?? null}
                    reducedMotion={reducedMotion}
                    documentVisible={documentVisible}
                    onVote={onVote}
                    onOpenTopic={onOpenTopic ? () => onOpenTopic(item) : undefined}
                    onShare={onShare ? () => onShare(item) : undefined}
                    slideRef={(node) => {
                        slideRefs.current[index] = node;
                    }}
                />
            ))}

            {!isMobile ? (
                <>
                    <button
                        type="button"
                        className={css.navButton}
                        style={{ bottom: 68 }}
                        onClick={() => goTo(activeIndex - 1)}
                        disabled={activeIndex <= 0}
                        aria-label="Previous argument"
                        data-testid="coliseum-reel-prev"
                    >
                        ↑
                    </button>
                    <button
                        type="button"
                        className={css.navButton}
                        style={{ bottom: 20 }}
                        onClick={() => goTo(activeIndex + 1)}
                        disabled={activeIndex >= items.length - 1 && !hasMore}
                        aria-label="Next argument"
                        data-testid="coliseum-reel-next"
                    >
                        ↓
                    </button>
                </>
            ) : null}

            {hintVisible && items.length > 0 ? (
                <div className={css.hintOverlay} data-testid="coliseum-reel-hint">
                    <p className={css.hintTitle}>Welcome to the arena</p>
                    <p className={css.hintLine}>Swipe up for the next argument</p>
                    <p className={css.hintLine}>Swipe right to agree · left to disagree</p>
                    <p className={css.hintLine}>Double-tap to agree · tap to pause</p>
                    <button
                        type="button"
                        className={css.hintButton}
                        data-testid="coliseum-reel-hint-dismiss"
                        onClick={dismissHint}
                    >
                        Got it
                    </button>
                </div>
            ) : null}
        </div>
    );
}

export default ArgumentReel;
