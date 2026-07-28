import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import classNames from 'classnames';
import { useAtomValue, useSetAtom } from 'jotai';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
    INVITE_DEN_PARAM,
    INVITE_CANOPY_PARAM,
} from '../../components/invite-landing/postAcceptanceRoute';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { GlossaryTerm } from '../../lib/GlossaryTerm';
import { FeatureGuide } from '../../components/feature-guide/FeatureGuide';
import {
    CANOPIES_PATH,
    COMMUNITIES_PATH,
    EVENTS_PATH,
    LIVE_PATH,
    MARKET_PATH,
    SWIPE_FEED_PATH,
    buildCommunitiesPath,
} from '../../pages/paths';
import { TopicChipBar } from '../topics/TopicChipBar';
import { installedPluginsAtom } from '../monetization/install/installedPluginsAtom';
import { grantedFeatureKeySetAtom } from '../monetization/install/grantedFeatureKeysAtom';
import { betaUnlockAllEnabled } from '../../core/features/betaUnlock';
import { runtimeFeatureFlags, type FeatureFlags } from '../../core/features/featureFlags';
import {
    HOME_WIDGET_BY_ID,
    isWidgetEntitled,
    isWidgetFlagEnabled,
    type HomeWidgetId,
} from './homeWidgets';
import { homeLayoutAtom } from './state/homeLayout';
import { HomeCustomizePanel } from './HomeCustomizePanel';
import { PrivacyPulseWidget, CoalitionPulseWidget } from './widgets/premiumWidgets';
import { HomeTourOverlay } from '../onboarding/HomeTourOverlay';
import { useHomeTour } from '../onboarding/homeTourState';
import { trackOnboardingTourStarted } from '../onboarding/onboardingTelemetry';
import { useUnifiedFeed } from './hooks/useUnifiedFeed';
import { useBountyBoard } from './hooks/useBountyBoard';
import { useCreatorContentFeed } from './hooks/useCreatorContentFeed';
import type { FeedSort, UnifiedFeedItem } from './unifiedFeedModel';
import { useStreak } from './streakState';
import {
    trackHomeSegmentSwitched,
    trackHomeSortChanged,
    type HomeFeedSegment,
} from './homeFeedTelemetry';
import { HomeComposer } from './HomeComposer';
import { LiveNowRail } from './LiveNowRail';
import { BountyBoard } from './BountyBoard';
import { CreatorContentRail } from './CreatorContentRail';
import { UnifiedFeedCard } from './UnifiedFeedCard';
import { AmbientBackdrop } from './AmbientBackdrop';
import { EcosystemCanvas } from './EcosystemCanvas';
import { ContextSidebar } from './context/ContextSidebar';
import { useNearbySignals } from './useNearbySignals';
import { LocationConsentDialog } from '../location/LocationConsentDialog';
import { useTimeOfDay } from './useTimeOfDay';
import { useReducedMotion } from './useReducedMotion';
import { useAmbientSound } from './useAmbientSound';
import * as css from './HomeFeed.css';

/** Case-insensitive filter over title/subtitle/tags. Empty query is a no-op. */
function filterFeedByQuery(items: readonly UnifiedFeedItem[], query: string): UnifiedFeedItem[] {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return items as UnifiedFeedItem[];
    return items.filter((item) => {
        const haystack = [item.title, item.subtitle, ...item.tags].join(' ').toLowerCase();
        return haystack.includes(trimmed);
    });
}

const FEED_SORTS: { id: FeedSort; label: string; hint: string }[] = [
    { id: 'hot', label: 'Hot', hint: 'Rising now — a blend of score and recency' },
    { id: 'new', label: 'New', hint: 'Newest first' },
    { id: 'top', label: 'Top', hint: 'Highest-scored first' },
];

/** Tooltip copy for the For You / Following feed segments. */
const SEGMENT_HINTS = {
    forYou: 'Everything across Blackout, ranked for you',
    following: 'New activity from the dens and people you follow',
} as const;

interface QuickAction {
    flag: keyof FeatureFlags;
    to: string;
    title: string;
    subtitle: string;
    testid: string;
}

/**
 * Shortcut cards for secondary discovery destinations. The primary
 * destinations (Home · Creator Hub · Coalition · Coliseum) live in the
 * global top nav. Each card is gated by its own feature flag so it only
 * renders when its route is actually mounted (never a dead link). Order is
 * display priority — the canopies hub leads since it's the gateway into the
 * Discord-style server experience.
 */
const QUICK_ACTIONS: QuickAction[] = [
    {
        flag: 'canopyServer',
        to: CANOPIES_PATH,
        title: BLACKOUT_TERMS.canopy.titlePlural,
        subtitle: 'Your communities & channels',
        testid: 'home-quick-action-canopies',
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

const greetingForHour = (hour: number): string => {
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    if (hour < 21) return 'Good evening';
    return 'Good night';
};

const PHASE_ICON: Record<string, string> = { dawn: '🌅', day: '☀️', dusk: '🌇', night: '🌙' };

/** Soft organic divider between feed sections. */
const WaveDivider = (): JSX.Element => (
    <svg className={css.wave} viewBox="0 0 1200 18" preserveAspectRatio="none" aria-hidden="true">
        <path
            d="M0 9 C 150 18, 300 0, 450 9 S 750 18, 900 9 S 1200 0, 1200 9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
        />
    </svg>
);

/**
 * Top-level destination mounted at `/` when both `shellAppShell` and
 * `discoveryHomeFeed` flags are on. A solarpunk "living ecosystem" home: an
 * ambient time-of-day backdrop + community-nervous-system canvas behind a
 * two-column layout — a centre living feed (unified across dens, livestreams,
 * the coalition feed, coliseum topics, marketplace listings, and profile
 * statuses) beside a right-hand context/spatial-awareness sidebar. Each feed
 * source is fetched independently so one failure degrades gracefully (see
 * `useUnifiedFeed`); no new server endpoint is required.
 *
 * When `homeFeedSegments` is on the centre column becomes a single segmented
 * list (For You / Following) with Hot/New/Top sort; otherwise it stacks the
 * classic Following + Discover sections. A feed search filters either layout,
 * and an optional daily-streak chip surfaces in the header.
 */
export const HomeFeed = (): JSX.Element => {
    const installed = useAtomValue(installedPluginsAtom);
    const segmentsEnabled = runtimeFeatureFlags.homeFeedSegments;
    const streakEnabled = runtimeFeatureFlags.homeStreak;
    const [segment, setSegment] = useState<HomeFeedSegment>('forYou');
    const [sort, setSort] = useState<FeedSort>('hot');
    const [query, setQuery] = useState('');
    const [editingLayout, setEditingLayout] = useState(false);
    const layout = useAtomValue(homeLayoutAtom);
    const setLayout = useSetAtom(homeLayoutAtom);
    const grantedFeatureKeys = useAtomValue(grantedFeatureKeySetAtom);
    // Premium widgets resolve against the feature keys the caller holds (a
    // subscription bundle / individual unlock), unioned with beta-unlock. Never
    // a layout preference — that can't raise a gate.
    const betaUnlocked = betaUnlockAllEnabled();
    const hasFeature = useMemo(
        () => (key: string) => betaUnlocked || grantedFeatureKeys.has(key),
        [betaUnlocked, grantedFeatureKeys]
    );
    const feed = useUnifiedFeed(segmentsEnabled ? sort : undefined);
    const bountyBoard = useBountyBoard(runtimeFeatureFlags.homeBountyBoard);
    const creatorContentFeed = useCreatorContentFeed(runtimeFeatureFlags.creatorContent);
    const streak = useStreak(streakEnabled);
    const atmosphere = useTimeOfDay();
    const reducedMotion = useReducedMotion();
    const nearby = useNearbySignals();
    const ambientSound = useAmbientSound();
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

    // Segmented mode shows one list at a time, so "For You" is the full ranked
    // discover feed (no de-dupe against a simultaneously-visible Following).
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

    const greeting = greetingForHour(new Date().getHours());

    const nearbyChipLabel = nearby.enabled
        ? nearby.loading
            ? 'finding signals…'
            : nearby.error
            ? 'nearby unavailable'
            : `${nearby.count ?? 0} signal${nearby.count === 1 ? '' : 's'} nearby`
        : 'nearby off';

    const renderCards = (items: readonly UnifiedFeedItem[]): JSX.Element[] =>
        filterFeedByQuery(items, query).map((item) => (
            <UnifiedFeedCard key={item.id} item={item} reducedMotion={reducedMotion} />
        ));

    // === Town Square widgets ===
    // Each modular home section is a node the user can reorder / hide / remove /
    // add via the Customize panel. The search box + header stay fixed chrome.
    const featureGuideNode: ReactNode = (
        <FeatureGuide style={{ borderRadius: 10, border: '1px solid var(--border-default)' }}>
            The Town Square gathers activity from every corner of Blackout — your{' '}
            <GlossaryTerm term="den">dens</GlossaryTerm>, live streams, Coliseum debates, market
            listings, and people you follow — into one feed.
        </FeatureGuide>
    );

    const quickActionsNode: ReactNode =
        quickActions.length > 0 ? (
            <section
                className={css.section}
                data-shell-region="home-quick-actions"
                data-testid="home-quick-actions"
            >
                <header className={css.sectionLabel}>Quick actions</header>
                <div className={css.quickActions}>
                    {quickActions.map((action) => (
                        <Link
                            key={action.to}
                            to={action.to}
                            className={css.quickAction}
                            data-testid={action.testid}
                        >
                            <span className={css.quickActionTitle}>{action.title}</span>
                            <span className={css.quickActionSubtitle}>{action.subtitle}</span>
                        </Link>
                    ))}
                </div>
            </section>
        ) : null;

    const pluginsNode: ReactNode =
        pluginCards.length > 0 ? (
            <section
                className={css.section}
                data-shell-region="home-plugin-cards"
                data-testid="home-plugin-cards"
            >
                <header className={css.sectionLabel}>Plugins</header>
                <div className={css.quickActions}>
                    {pluginCards.map((record) => {
                        const card = record.manifest.homepageCard!;
                        return (
                            <Link
                                key={record.manifest.id}
                                to={card.to ?? `/plugins/${encodeURIComponent(record.manifest.id)}`}
                                className={css.quickAction}
                                data-testid="home-plugin-card"
                                data-plugin-id={record.manifest.id}
                            >
                                <span className={css.quickActionTitle}>{card.title}</span>
                                {card.subtitle ? (
                                    <span className={css.quickActionSubtitle}>{card.subtitle}</span>
                                ) : null}
                            </Link>
                        );
                    })}
                </div>
            </section>
        ) : null;

    const bountyBoardNode: ReactNode = <BountyBoard items={bountyBoard.bounties} />;
    const creatorRailNode: ReactNode = <CreatorContentRail items={creatorContentFeed.content} />;
    const liveRailNode: ReactNode = <LiveNowRail items={feed.liveRail} />;

    const feedNode: ReactNode = (
        <>
            <WaveDivider />
            {segmentsEnabled ? (
                <div className={css.controlsRow} data-testid="home-feed-controls">
                    <div className={css.pillGroup} role="tablist" aria-label="Feed">
                        <button
                            type="button"
                            role="tab"
                            data-testid="home-feed-segment-foryou"
                            title={SEGMENT_HINTS.forYou}
                            aria-pressed={segment === 'forYou'}
                            aria-selected={segment === 'forYou'}
                            className={classNames(css.pill, segment === 'forYou' && css.pillActive)}
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
                            title={SEGMENT_HINTS.following}
                            aria-pressed={segment === 'following'}
                            aria-selected={segment === 'following'}
                            className={classNames(
                                css.pill,
                                segment === 'following' && css.pillActive
                            )}
                            onClick={() => {
                                setSegment('following');
                                trackHomeSegmentSwitched('following');
                            }}
                        >
                            Following
                        </button>
                    </div>
                    <div className={css.pillGroup} aria-label="Sort">
                        {FEED_SORTS.map((option) => (
                            <button
                                key={option.id}
                                type="button"
                                data-testid={`home-feed-sort-${option.id}`}
                                title={option.hint}
                                aria-pressed={sort === option.id}
                                className={classNames(
                                    css.pill,
                                    css.sortPill,
                                    sort === option.id && css.pillActive
                                )}
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
            {segmentsEnabled ? (
                <section
                    className={css.section}
                    data-shell-region="home-feed-segment"
                    data-testid="home-feed-segment-section"
                >
                    {segmentItems.length === 0 ? (
                        <div className={css.emptyState} data-testid="home-feed-empty">
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
                                    <Link to={COMMUNITIES_PATH} className={css.ctaLink}>
                                        Discover {BLACKOUT_TERMS.canopy.plural}
                                    </Link>
                                </>
                            ) : null}
                        </div>
                    ) : (
                        <div className={css.feedList} data-testid="home-feed-list">
                            {renderCards(segmentItems)}
                        </div>
                    )}
                </section>
            ) : (
                <>
                    <section
                        className={css.section}
                        data-shell-region="home-following"
                        data-testid="home-following-section"
                    >
                        <header className={css.sectionLabel} title={SEGMENT_HINTS.following}>
                            Following
                        </header>
                        {followingItems.length === 0 ? (
                            <div className={css.emptyState} data-testid="home-feed-empty">
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
                                        <Link to={COMMUNITIES_PATH} className={css.ctaLink}>
                                            Discover {BLACKOUT_TERMS.canopy.plural}
                                        </Link>
                                    </>
                                ) : null}
                            </div>
                        ) : (
                            <div className={css.feedList} data-testid="home-feed-list">
                                {renderCards(followingItems)}
                            </div>
                        )}
                    </section>
                    {discoverItems.length > 0 ? (
                        <>
                            <WaveDivider />
                            <section
                                className={css.section}
                                data-shell-region="home-discover"
                                data-testid="home-discover-section"
                            >
                                <header
                                    className={css.sectionLabel}
                                    title="Suggestions from across Blackout, beyond what you already follow"
                                >
                                    Discover
                                </header>
                                <div className={css.feedList} data-testid="home-discover-list">
                                    {renderCards(discoverItems)}
                                </div>
                            </section>
                        </>
                    ) : null}
                </>
            )}
        </>
    );

    const widgetNodes: Record<HomeWidgetId, ReactNode> = {
        featureGuide: featureGuideNode,
        quickActions: quickActionsNode,
        plugins: pluginsNode,
        bountyBoard: bountyBoardNode,
        creatorRail: creatorRailNode,
        liveRail: liveRailNode,
        feed: feedNode,
        premiumPrivacyPulse: <PrivacyPulseWidget />,
        premiumCoalitionPulse: <CoalitionPulseWidget />,
    };

    // The visible, ordered widget ids: user order minus hidden, gated by feature
    // flag + entitlement, and only those with something to render right now.
    const orderedWidgetIds = layout.order.filter((id) => {
        if (layout.hidden.includes(id)) return false;
        const def = HOME_WIDGET_BY_ID[id];
        if (!isWidgetFlagEnabled(def, runtimeFeatureFlags)) return false;
        if (!isWidgetEntitled(def, hasFeature)) return false;
        return Boolean(widgetNodes[id]);
    });

    return (
        <section className={css.root} data-shell-region="home-feed">
            <AmbientBackdrop atmosphere={atmosphere} reducedMotion={reducedMotion} />
            <EcosystemCanvas
                glow={atmosphere.glow}
                activity={Math.min(12, feed.discover.length)}
                reducedMotion={reducedMotion}
            />
            <div className={css.content}>
                <header className={css.header} data-testid="home-feed-header">
                    <div className={css.headerTitleCol}>
                        <h1 className={css.greeting}>{greeting}</h1>
                        <p className={css.subtitle}>What&apos;s growing across Blackout today.</p>
                        <div className={css.atmosphereRow}>
                            <span className={css.chip}>
                                {PHASE_ICON[atmosphere.phase]} {atmosphere.label}
                            </span>
                            <button
                                type="button"
                                className={css.chip}
                                data-testid="home-nearby-chip"
                                title={
                                    nearby.enabled
                                        ? 'Real located signals within 10 km. Click to turn off.'
                                        : 'Turn on location services to count mutual-aid, events & market signals near you. You choose after reading what is used and kept.'
                                }
                                aria-pressed={nearby.enabled}
                                style={{ cursor: 'pointer', font: 'inherit', border: 'none' }}
                                onClick={() =>
                                    nearby.enabled ? nearby.disable() : nearby.requestEnable()
                                }
                            >
                                🌱 {nearbyChipLabel}
                            </button>
                            {streakEnabled && streak.count > 0 ? (
                                <span className={css.chip} data-testid="home-streak-chip">
                                    <span aria-hidden="true">🔥</span> {streak.count}-day streak
                                </span>
                            ) : null}
                        </div>
                        {showReplay ? (
                            <button
                                type="button"
                                data-testid="home-tour-replay"
                                className={css.replayButton}
                                onClick={() => {
                                    void (async () => {
                                        await homeTour.reset();
                                        trackOnboardingTourStarted(Date.now());
                                        await homeTour.start();
                                    })();
                                }}
                            >
                                Replay homepage tour
                            </button>
                        ) : null}
                    </div>
                    <div className={css.headerActions}>
                        {runtimeFeatureFlags.profile ? <HomeComposer /> : null}
                        <button
                            type="button"
                            className={css.iconButton}
                            data-testid="home-customize-toggle"
                            aria-pressed={editingLayout}
                            title="Customize your Town Square layout"
                            onClick={() => setEditingLayout((v) => !v)}
                        >
                            ⚙ Customize
                        </button>
                        <Link
                            to={SWIPE_FEED_PATH}
                            className={css.iconButton}
                            data-testid="home-swipe-view-link"
                            title="Open the full-screen swipe feed"
                        >
                            ⬍ Swipe view
                        </Link>
                        <button
                            type="button"
                            className={css.iconButton}
                            data-testid="home-ambient-sound-toggle"
                            aria-pressed={ambientSound.enabled}
                            disabled={!ambientSound.supported}
                            title={
                                ambientSound.supported
                                    ? 'Toggle ambient soundscape'
                                    : 'Ambient soundscape coming soon'
                            }
                            onClick={ambientSound.toggle}
                        >
                            {ambientSound.enabled ? '🔊' : '🔈'} Ambient{' '}
                            {ambientSound.enabled ? 'on' : 'off'}
                        </button>
                    </div>
                </header>
                <div className={css.topicBar}>
                    <TopicChipBar />
                </div>
                <div className={css.grid}>
                    <main className={css.centerColumn}>
                        <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search your feed…"
                            data-testid="home-feed-search"
                            className={css.searchInput}
                        />
                        {editingLayout ? (
                            <HomeCustomizePanel
                                layout={layout}
                                setLayout={setLayout}
                                flags={runtimeFeatureFlags}
                                hasFeature={hasFeature}
                                onClose={() => setEditingLayout(false)}
                                onUpsell={(path) => navigate(path)}
                            />
                        ) : null}
                        {orderedWidgetIds.map((id) => (
                            <div key={id} data-home-widget={id}>
                                {widgetNodes[id]}
                            </div>
                        ))}
                    </main>
                    <aside className={css.rightColumn} data-shell-region="home-context">
                        <ContextSidebar feed={feed} atmosphere={atmosphere} />
                    </aside>
                </div>
            </div>
            {tourEnabled ? <HomeTourOverlay /> : null}
            <LocationConsentDialog
                open={nearby.disclosureOpen}
                onConfirm={nearby.confirmEnable}
                onCancel={nearby.cancelEnable}
            />
        </section>
    );
};

export default HomeFeed;
