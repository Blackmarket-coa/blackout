import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { useAtomValue } from 'jotai';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
    INVITE_DEN_PARAM,
    INVITE_CANOPY_PARAM,
} from '../../components/invite-landing/postAcceptanceRoute';
import { joinedRoomsAtom } from '../../state/rooms';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { GlossaryTerm } from '../../lib/GlossaryTerm';
import { COMMUNITIES_PATH, STREAMING_PATH, buildCommunitiesPath } from '../../pages/paths';
import { TopicChipBar } from '../topics/TopicChipBar';
import { installedPluginsAtom } from '../monetization/install/installedPluginsAtom';
import { runtimeFeatureFlags } from '../../core/features/featureFlags';
import { HomeTourOverlay } from '../onboarding/HomeTourOverlay';
import { useHomeTour } from '../onboarding/homeTourState';
import { trackOnboardingTourStarted } from '../onboarding/onboardingTelemetry';
import {
    buildHomeFeed,
    groupHomeFeedByBucket,
    type HomeFeedBucket,
    type HomeFeedItem,
} from './feedModel';

const BUCKET_LABELS: Record<HomeFeedBucket, string> = {
    today: 'Today',
    'this-week': 'This week',
    older: 'Earlier',
};

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
    flexDirection: 'column',
    gap: 4,
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

const unreadStyle: CSSProperties = {
    minWidth: 22,
    height: 22,
    padding: '0 6px',
    borderRadius: 999,
    background: 'var(--accent-primary, #3b82f6)',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 11,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
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

const HomeFeedCard = ({ item }: { item: HomeFeedItem }): JSX.Element => (
    <Link
        to={buildCommunitiesPath(item.canopyId, item.denId)}
        style={cardStyle}
        data-testid="home-feed-card"
        data-den-id={item.denId}
    >
        <span style={cardBodyStyle}>
            <span style={cardTitleStyle}>{item.title}</span>
            <span style={cardSubtitleStyle}>{item.subtitle}</span>
        </span>
        {item.unreadCount > 0 ? (
            <span style={unreadStyle} aria-label={`${item.unreadCount} unread`}>
                {item.unreadCount > 99 ? '99+' : item.unreadCount}
            </span>
        ) : null}
    </Link>
);

/**
 * Top-level destination mounted at `/` when both `shellAppShell` and
 * `discoveryHomeFeed` flags are on. Renders a chronologically-merged
 * card list across the user's joined dens, grouped by today /
 * this-week / earlier.
 *
 * Data path:
 *   `joinedRoomsAtom` (Matrix sync) → `buildHomeFeed` (pure) →
 *   `groupHomeFeedByBucket` → render. No new server endpoint required;
 *   the reader still has full data via Matrix /sync.
 */
export const HomeFeed = (): JSX.Element => {
    const rooms = useAtomValue(joinedRoomsAtom);
    const installed = useAtomValue(installedPluginsAtom);
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

    const items = useMemo(() => buildHomeFeed(rooms, Date.now()), [rooms]);
    const groups = useMemo(() => groupHomeFeedByBucket(items), [items]);

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
                <h1 style={titleStyle}>Home</h1>
                <p style={subtitleStyle}>Latest activity from your {BLACKOUT_TERMS.den.plural}.</p>
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
            </header>
            <TopicChipBar />
            {runtimeFeatureFlags.streaming ? (
                <section
                    style={sectionStyle}
                    data-shell-region="home-quick-actions"
                    data-testid="home-quick-actions"
                >
                    <header style={sectionLabelStyle}>Quick actions</header>
                    <Link
                        to={STREAMING_PATH}
                        style={cardStyle}
                        data-testid="home-quick-action-streaming"
                    >
                        <span style={cardBodyStyle}>
                            <span style={cardTitleStyle}>Streaming</span>
                            <span style={cardSubtitleStyle}>
                                Go live, manage connections &amp; integrations
                            </span>
                        </span>
                    </Link>
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
            {items.length === 0 ? (
                <div style={emptyStateStyle} data-testid="home-feed-empty">
                    <strong>No activity yet.</strong>
                    <span>
                        Join a{' '}
                        <GlossaryTerm term="canopy">{BLACKOUT_TERMS.canopy.singular}</GlossaryTerm>{' '}
                        to start seeing posts in your feed.
                    </span>
                    <Link to={COMMUNITIES_PATH} style={ctaLinkStyle}>
                        Discover {BLACKOUT_TERMS.canopy.plural}
                    </Link>
                </div>
            ) : (
                <div data-testid="home-feed-list">
                    {groups.map((group) => (
                        <section key={group.bucket} style={sectionStyle} data-bucket={group.bucket}>
                            <header style={sectionLabelStyle}>{BUCKET_LABELS[group.bucket]}</header>
                            {group.items.map((item) => (
                                <HomeFeedCard key={item.id} item={item} />
                            ))}
                        </section>
                    ))}
                </div>
            )}
            {tourEnabled ? <HomeTourOverlay /> : null}
        </section>
    );
};

export default HomeFeed;
