import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useAtomValue } from 'jotai';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
    INVITE_DEN_PARAM,
    INVITE_CANOPY_PARAM,
} from '../../components/invite-landing/postAcceptanceRoute';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { GlossaryTerm } from '../../lib/GlossaryTerm';
import {
    COALITION_PATH,
    COLISEUM_PATH,
    COMMUNITIES_PATH,
    EVENTS_PATH,
    LIVE_PATH,
    MARKET_PATH,
    STREAMING_PATH,
    buildCommunitiesPath,
} from '../../pages/paths';
import { TopicChipBar } from '../topics/TopicChipBar';
import { installedPluginsAtom } from '../monetization/install/installedPluginsAtom';
import { runtimeFeatureFlags, type FeatureFlags } from '../../core/features/featureFlags';
import { HomeTourOverlay } from '../onboarding/HomeTourOverlay';
import { useHomeTour } from '../onboarding/homeTourState';
import { trackOnboardingTourStarted } from '../onboarding/onboardingTelemetry';
import { useUnifiedFeed } from './hooks/useUnifiedFeed';
import type { FeedSort } from './unifiedFeedModel';
import { useStreak } from './streakState';
import { HomeComposer } from './HomeComposer';
import { LiveNowRail } from './LiveNowRail';
import { UnifiedFeedCard } from './UnifiedFeedCard';
import type { UnifiedFeedItem } from './unifiedFeedModel';
import {
    trackHomeSegmentSwitched,
    trackHomeSortChanged,
    type HomeFeedSegment,
} from './homeFeedTelemetry';

/** Case-insensitive filter over title/subtitle/tags. Empty query is a no-op. */
function filterFeedByQuery(
    items: readonly UnifiedFeedItem[],
    query: string
): UnifiedFeedItem[] {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return items as UnifiedFeedItem[];
    return items.filter((item) => {
        const haystack = [item.title, item.subtitle, ...item.tags].join(' ').toLowerCase();
        return haystack.includes(trimmed);
    });
}

const layoutStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    width: '100%',
    background: 'var(--bg-surface, #0f172a)',
    color: 'var(--text-primary, #f8fafc)',
};

const headerStyle: CSSProperties = {
    padding: '20px 20px 8px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    flexWrap: 'wrap',
};

const headerTitleColStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 0,
};

const titleStyle: CSSProperties = { margin: 0, fontSize: 22, fontWeight: 700 };
const subtitleStyle: CSSProperties = {
    margin: 0,
    color: 'var(--text-muted, #9ca3af)',
    fontSize: 13,
};

const sectionStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '4px 16px 12px',
};

const sectionLabelStyle: CSSProperties = {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--text-muted, #9ca3af)',
    margin: '8px 4px 0',
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

const cardBodyStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
};

const cardTitleStyle: CSSProperties = {
    fontSize: 15,
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

const cardSubtitleStyle: CSSProperties = {
    fontSize: 13,
    color: 'var(--text-muted, #9ca3af)',
};

const emptyStateStyle: CSSProperties = {
    margin: '24px 16px',
    padding: '24px 20px',
    border: '1px dashed var(--border-default, #374151)',
    borderRadius: 12,
    color: 'var(--text-muted, #9ca3af)',
    fontSize: 14,
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
};

const ctaLinkStyle: CSSProperties = {
    color: 'var(--accent-primary, #3b82f6)',
    textDecoration: 'underline',
    fontWeight: 600,
};

const streakChipStyle: CSSProperties = {
    width: 'fit-content',
    marginTop: 4,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    fontWeight: 600,
    padding: '2px 10px',
    borderRadius: 999,
    border: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-input, #0f172a)',
    color: 'var(--text-primary, #f8fafc)',
};

const controlsRowStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    padding: '0 16px 4px',
};

const pillGroupStyle: CSSProperties = { display: 'inline-flex', gap: 4 };

const pillStyle = (active: boolean): CSSProperties => ({
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid',
    borderColor: active ? 'var(--accent-primary, #3b82f6)' : 'var(--border-default, #374151)',
    background: active ? 'var(--accent-primary, #3b82f6)' : 'transparent',
    color: active ? '#fff' : 'var(--text-primary, #f8fafc)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
});

const sortPillStyle = (active: boolean): CSSProperties => ({
    ...pillStyle(active),
    padding: '4px 10px',
    fontWeight: 500,
    fontSize: 12,
});

const FEED_SORTS: { id: FeedSort; label: string }[] = [
    { id: 'hot', label: 'Hot' },
    { id: 'new', label: 'New' },
    { id: 'top', label: 'Top' },
];

interface QuickAction {
    flag: keyof FeatureFlags;
    to: string;
    title: string;
    subtitle: string;
    testid: string;
}

/**
 * Shortcut cards for the major top-level destinations. Each is gated by its
 * own feature flag so a card only renders when its route is actually mounted
 * (never a dead link). Order is display priority.
 */
const QUICK_ACTIONS: QuickAction[] = [
    {
        flag: 'streaming',
        to: STREAMING_PATH,
        title: 'Streaming',
        subtitle: 'Go live, manage connections & integrations',
        testid: 'home-quick-action-streaming',
    },
    {
        flag: 'coalition',
        to: COALITION_PATH,
        title: 'Coalition',
        subtitle: 'Cross-canopy mutual aid, map & shop',
        testid: 'home-quick-action-coalition',
    },
    {
        flag: 'coliseum',
        to: COLISEUM_PATH,
        title: 'Coliseum',
        subtitle: 'Debate topics, live verdicts & sources',
        testid: 'home-quick-action-coliseum',
    },
    {
        flag: 'eventsV1',
        to: EVENTS_PATH,
        title: 'Events',
        subtitle: 'Upcoming events & RSVPs',
        testid: 'home-quick-action-events',
    },
    {
        flag: 'streamsViewer',
        to: LIVE_PATH,
        title: 'Live',
        subtitle: 'Browse live streams',
        testid: 'home-quick-action-live',
    },
    {
        flag: 'marketTab',
        to: MARKET_PATH,
        title: 'Market',
        subtitle: 'Browse marketplace listings',
        testid: 'home-quick-action-market',
    },
];

/**
 * Top-level destination mounted at `/` when both `shellAppShell` and
 * `discoveryHomeFeed` flags are on. Renders a unified, client-aggregated
 * feed across dens, livestreams, the coalition feed, coliseum topics, and
 * profile statuses — stacked as a "Following" section (the viewer's joined
 * content) above a "Discover" section (everything else, de-duplicated) with a
 * pinned "Live now" rail. Each source is fetched independently so one failure
 * degrades gracefully (see `useUnifiedFeed`); no new server endpoint is
 * required.
 */
export const HomeFeed = (): JSX.Element => {
    const installed = useAtomValue(installedPluginsAtom);
    const segmentsEnabled = runtimeFeatureFlags.homeFeedSegments;
    const streakEnabled = runtimeFeatureFlags.homeStreak;
    const [segment, setSegment] = useState<HomeFeedSegment>('forYou');
    const [sort, setSort] = useState<FeedSort>('hot');
    const feed = useUnifiedFeed(segmentsEnabled ? sort : undefined);
    const streak = useStreak(streakEnabled);
    const tourEnabled = runtimeFeatureFlags.onboardingHomeTour;
    const homeTour = useHomeTour();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    // Invite handoff: a freshly-invited user lands on `/?invite_den=…` so the
    // Home tour can run first. Kick off the tour, then route them into the den
    // once it completes/dismisses (or immediately if the tour is off/done).
    const inviteDen = searchParams.get(INVITE_DEN_PARAM);
    const inviteCanopy = searchParams.get(INVITE_CANOPY_PARAM);
    const tourStatus = homeTour.state.status;
    const tourKickedRef = useRef(false);
    useEffect(() => {
        if (!inviteDen) return;
        const goToDen = () =>
            navigate(buildCommunitiesPath(inviteCanopy ?? null, inviteDen), { replace: true });
        if (!tourEnabled) {
            goToDen();
            return;
        }
        if (tourStatus === 'completed' || tourStatus === 'dismissed') {
            goToDen();
            return;
        }
        if (tourStatus === 'idle' && !tourKickedRef.current) {
            tourKickedRef.current = true;
            trackOnboardingTourStarted(Date.now());
            void homeTour.start();
        }
        // 'running' → wait; the effect re-runs when the status changes.
    }, [inviteDen, inviteCanopy, tourEnabled, tourStatus, homeTour, navigate]);

    const followingItems = feed.following;
    // Discover sits below Following and only surfaces what isn't already there,
    // so the two stacked sections never show the same card twice.
    const followingIds = useMemo(
        () => new Set(followingItems.map((item) => item.id)),
        [followingItems]
    );
    const discoverItems = useMemo(
        () => feed.discover.filter((item) => !followingIds.has(item.id)),
        [feed.discover, followingIds]
    );

    const [query, setQuery] = useState('');
    // Segmented mode shows one list at a time, so "For You" is the full ranked
    // discover feed (no need to de-dupe against a simultaneously-visible
    // Following section).
    const segmentItems = segment === 'following' ? followingItems : feed.discover;

    const quickActions = QUICK_ACTIONS.filter((action) => runtimeFeatureFlags[action.flag]);

    const pluginCards = useMemo(
        () =>
            installed
                .filter((r) => r.status === 'enabled' && r.manifest.homepageCard)
                .sort(
                    (a, b) =>
                        (a.manifest.homepageCard?.order ?? 0) -
                        (b.manifest.homepageCard?.order ?? 0)
                ),
        [installed]
    );

    const showReplay =
        tourEnabled &&
        (homeTour.state.status === 'completed' || homeTour.state.status === 'dismissed');

    return (
        <section style={layoutStyle} data-shell-region="home-feed">
            <header style={headerStyle} data-testid="home-feed-header">
                <div style={headerTitleColStyle}>
                    <h1 style={titleStyle}>Home</h1>
                    <p style={subtitleStyle}>What&apos;s happening across Blackout.</p>
                    {streakEnabled && streak.count > 0 ? (
                        <span style={streakChipStyle} data-testid="home-streak-chip">
                            <span aria-hidden="true">🔥</span>
                            {streak.count}-day streak
                        </span>
                    ) : null}
                    {showReplay ? (
                        <button
                            type="button"
                            data-testid="home-tour-replay"
                            onClick={() => {
                                void (async () => {
                                    await homeTour.reset();
                                    trackOnboardingTourStarted(Date.now());
                                    await homeTour.start();
                                })();
                            }}
                            style={{
                                width: 'fit-content',
                                marginTop: 4,
                                fontSize: 12,
                                background: 'transparent',
                                color: 'var(--accent-primary, #3b82f6)',
                                border: '1px solid var(--border-default, #374151)',
                                borderRadius: 8,
                                padding: '4px 8px',
                                cursor: 'pointer',
                            }}
                        >
                            Replay homepage tour
                        </button>
                    ) : null}
                </div>
                {runtimeFeatureFlags.profile ? <HomeComposer /> : null}
            </header>
            <TopicChipBar />
            <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search your feed…"
                data-testid="home-feed-search"
                style={{
                    margin: '8px 16px',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-default, #374151)',
                    background: 'var(--bg-input, #0f172a)',
                    color: 'var(--text-primary, #f8fafc)',
                }}
            />
            {segmentsEnabled ? (
                <div style={controlsRowStyle} data-testid="home-feed-controls">
                    <div style={pillGroupStyle} role="tablist" aria-label="Feed">
                        <button
                            type="button"
                            role="tab"
                            data-testid="home-feed-segment-foryou"
                            aria-pressed={segment === 'forYou'}
                            aria-selected={segment === 'forYou'}
                            style={pillStyle(segment === 'forYou')}
                            onClick={() => {
                                setSegment('forYou');
                                trackHomeSegmentSwitched('forYou');
                            }}
                        >
                            For You
                        </button>
                        <button
                            type="button"
                            role="tab"
                            data-testid="home-feed-segment-following"
                            aria-pressed={segment === 'following'}
                            aria-selected={segment === 'following'}
                            style={pillStyle(segment === 'following')}
                            onClick={() => {
                                setSegment('following');
                                trackHomeSegmentSwitched('following');
                            }}
                        >
                            Following
                        </button>
                    </div>
                    <div style={pillGroupStyle} aria-label="Sort">
                        {FEED_SORTS.map((option) => (
                            <button
                                key={option.id}
                                type="button"
                                data-testid={`home-feed-sort-${option.id}`}
                                aria-pressed={sort === option.id}
                                style={sortPillStyle(sort === option.id)}
                                onClick={() => {
                                    setSort(option.id);
                                    trackHomeSortChanged(option.id);
                                }}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}
            {quickActions.length > 0 ? (
                <section
                    style={sectionStyle}
                    data-shell-region="home-quick-actions"
                    data-testid="home-quick-actions"
                >
                    <header style={sectionLabelStyle}>Quick actions</header>
                    {quickActions.map((action) => (
                        <Link
                            key={action.to}
                            to={action.to}
                            style={cardStyle}
                            data-testid={action.testid}
                        >
                            <span style={cardBodyStyle}>
                                <span style={cardTitleStyle}>{action.title}</span>
                                <span style={cardSubtitleStyle}>{action.subtitle}</span>
                            </span>
                        </Link>
                    ))}
                </section>
            ) : null}
            {pluginCards.length > 0 ? (
                <section
                    style={sectionStyle}
                    data-shell-region="home-plugin-cards"
                    data-testid="home-plugin-cards"
                >
                    <header style={sectionLabelStyle}>Plugins</header>
                    {pluginCards.map((record) => {
                        const card = record.manifest.homepageCard!;
                        return (
                            <Link
                                key={record.manifest.id}
                                to={card.to ?? `/plugins/${encodeURIComponent(record.manifest.id)}`}
                                style={cardStyle}
                                data-testid="home-plugin-card"
                                data-plugin-id={record.manifest.id}
                            >
                                <span style={cardBodyStyle}>
                                    <span style={cardTitleStyle}>{card.title}</span>
                                    {card.subtitle ? (
                                        <span style={cardSubtitleStyle}>{card.subtitle}</span>
                                    ) : null}
                                </span>
                            </Link>
                        );
                    })}
                </section>
            ) : null}
            <LiveNowRail items={feed.liveRail} />
            {segmentsEnabled ? (
                <section
                    data-shell-region="home-feed-segment"
                    data-testid="home-feed-segment-section"
                >
                    {segmentItems.length === 0 ? (
                        <div style={emptyStateStyle} data-testid="home-feed-empty">
                            <strong>
                                {feed.loading
                                    ? 'Loading your feed…'
                                    : segment === 'following'
                                    ? 'No activity yet.'
                                    : 'Nothing to show right now.'}
                            </strong>
                            {!feed.loading && segment === 'following' ? (
                                <>
                                    <span>
                                        Join a{' '}
                                        <GlossaryTerm term="canopy">
                                            {BLACKOUT_TERMS.canopy.singular}
                                        </GlossaryTerm>{' '}
                                        to start seeing posts in your feed.
                                    </span>
                                    <Link to={COMMUNITIES_PATH} style={ctaLinkStyle}>
                                        Discover {BLACKOUT_TERMS.canopy.plural}
                                    </Link>
                                </>
                            ) : null}
                        </div>
                    ) : (
                        <div style={sectionStyle} data-testid="home-feed-list">
                            {filterFeedByQuery(segmentItems, query).map((item) => (
                                <UnifiedFeedCard key={item.id} item={item} />
                            ))}
                        </div>
                    )}
                </section>
            ) : (
                <>
                    <section
                        data-shell-region="home-following"
                        data-testid="home-following-section"
                    >
                        <header style={sectionLabelStyle}>Following</header>
                        {followingItems.length === 0 ? (
                            <div style={emptyStateStyle} data-testid="home-feed-empty">
                                <strong>
                                    {feed.loading ? 'Loading your feed…' : 'No activity yet.'}
                                </strong>
                                {!feed.loading ? (
                                    <>
                                        <span>
                                            Join a{' '}
                                            <GlossaryTerm term="canopy">
                                                {BLACKOUT_TERMS.canopy.singular}
                                            </GlossaryTerm>{' '}
                                            to start seeing posts in your feed.
                                        </span>
                                        <Link to={COMMUNITIES_PATH} style={ctaLinkStyle}>
                                            Discover {BLACKOUT_TERMS.canopy.plural}
                                        </Link>
                                    </>
                                ) : null}
                            </div>
                        ) : (
                            <div style={sectionStyle} data-testid="home-feed-list">
                                {filterFeedByQuery(followingItems, query).map((item) => (
                                    <UnifiedFeedCard key={item.id} item={item} />
                                ))}
                            </div>
                        )}
                    </section>
                    {discoverItems.length > 0 ? (
                        <section
                            data-shell-region="home-discover"
                            data-testid="home-discover-section"
                        >
                            <header style={sectionLabelStyle}>Discover</header>
                            <div style={sectionStyle} data-testid="home-discover-list">
                                {filterFeedByQuery(discoverItems, query).map((item) => (
                                    <UnifiedFeedCard key={item.id} item={item} />
                                ))}
                            </div>
                        </section>
                    ) : null}
                </>
            )}
            {tourEnabled ? <HomeTourOverlay /> : null}
        </section>
    );
};

export default HomeFeed;
