import { useEffect, useMemo, useRef } from 'react';
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
import { HomeComposer } from './HomeComposer';
import { LiveNowRail } from './LiveNowRail';
import { UnifiedFeedCard } from './UnifiedFeedCard';
import { AmbientBackdrop } from './AmbientBackdrop';
import { EcosystemCanvas } from './EcosystemCanvas';
import { ContextSidebar } from './context/ContextSidebar';
import { useTimeOfDay } from './useTimeOfDay';
import { useReducedMotion } from './useReducedMotion';
import { useAmbientSound } from './useAmbientSound';
import * as css from './HomeFeed.css';

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
 * the coalition feed, coliseum topics, and profile statuses) beside a
 * right-hand context/spatial-awareness sidebar. Each feed source is fetched
 * independently so one failure degrades gracefully (see `useUnifiedFeed`); no
 * new server endpoint is required.
 */
export const HomeFeed = (): JSX.Element => {
    const installed = useAtomValue(installedPluginsAtom);
    const feed = useUnifiedFeed();
    const atmosphere = useTimeOfDay();
    const reducedMotion = useReducedMotion();
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

    const signalCount = followingItems.length + discoverItems.length;
    const greeting = greetingForHour(new Date().getHours());

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
                            <span className={css.chip}>🌱 {signalCount} signals nearby</span>
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
                        {quickActions.length > 0 ? (
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
                                            <span className={css.quickActionTitle}>
                                                {action.title}
                                            </span>
                                            <span className={css.quickActionSubtitle}>
                                                {action.subtitle}
                                            </span>
                                        </Link>
                                    ))}
                                </div>
                            </section>
                        ) : null}
                        {pluginCards.length > 0 ? (
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
                                                to={
                                                    card.to ??
                                                    `/plugins/${encodeURIComponent(
                                                        record.manifest.id
                                                    )}`
                                                }
                                                className={css.quickAction}
                                                data-testid="home-plugin-card"
                                                data-plugin-id={record.manifest.id}
                                            >
                                                <span className={css.quickActionTitle}>
                                                    {card.title}
                                                </span>
                                                {card.subtitle ? (
                                                    <span className={css.quickActionSubtitle}>
                                                        {card.subtitle}
                                                    </span>
                                                ) : null}
                                            </Link>
                                        );
                                    })}
                                </div>
                            </section>
                        ) : null}
                        <LiveNowRail items={feed.liveRail} />
                        <WaveDivider />
                        <section
                            className={css.section}
                            data-shell-region="home-following"
                            data-testid="home-following-section"
                        >
                            <header className={css.sectionLabel}>Following</header>
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
                                    {followingItems.map((item) => (
                                        <UnifiedFeedCard
                                            key={item.id}
                                            item={item}
                                            reducedMotion={reducedMotion}
                                        />
                                    ))}
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
                                    <header className={css.sectionLabel}>Discover</header>
                                    <div className={css.feedList} data-testid="home-discover-list">
                                        {discoverItems.map((item) => (
                                            <UnifiedFeedCard
                                                key={item.id}
                                                item={item}
                                                reducedMotion={reducedMotion}
                                            />
                                        ))}
                                    </div>
                                </section>
                            </>
                        ) : null}
                    </main>
                    <aside className={css.rightColumn} data-shell-region="home-context">
                        <ContextSidebar feed={feed} atmosphere={atmosphere} />
                    </aside>
                </div>
            </div>
            {tourEnabled ? <HomeTourOverlay /> : null}
        </section>
    );
};

export default HomeFeed;
