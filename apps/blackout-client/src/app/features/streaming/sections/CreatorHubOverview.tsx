import React, { type CSSProperties, useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
    COALITION_PATH,
    CREATOR_DASHBOARD_PATH,
    EVENTS_PATH,
    MONETIZATION_EARNINGS_PATH,
} from '../../../pages/paths';
import { listStreams } from '../../streams';
import { fetchMyAmbassador, fetchMyReferrals } from '../../growth';
import { creatorSubsApi } from '../../monetization/monetizationApi';
import { readBlackoutApiToken } from '../../monetization/marketplace/useMarketplaceAuth';
import { fetchMyContent } from '../../creators/contentClient';
import { fetchCreatorInsights, type CreatorInsightsSummary } from '../insightsClient';
import type { StreamingHubViewId, StreamingTabId } from '../../../state/streaming';
import {
    HubSection,
    hubCardMetaStyle,
    hubCardStyle,
    hubCardTitleStyle,
    hubGridStyle,
} from '../components/HubSection';

export interface CreatorHubOverviewProps {
    /**
     * Switches the hub's active tab (and optionally a sub-view inside a
     * consolidated tab). Provided by `StreamingView` so the overview cards
     * can deep-link into sibling hub tabs (Live, Clips, Rewards) without
     * owning router state.
     */
    onSelectTab?: (tab: StreamingTabId, view?: StreamingHubViewId) => void;
}

const cardButtonStyle: CSSProperties = {
    ...hubCardStyle,
    cursor: 'pointer',
    textAlign: 'left',
    font: 'inherit',
};

interface OverviewCardProps {
    label: string;
    title: string;
    meta: string;
}

const insightsStripStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: 10,
    marginBottom: 12,
};

const insightStatStyle: CSSProperties = {
    display: 'grid',
    gap: 2,
    padding: 10,
    borderRadius: 10,
    border: '1px solid var(--border-default, rgba(255,255,255,0.12))',
    background: 'var(--bg-input, rgba(255,255,255,0.04))',
};

const formatWatchTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const InsightStat = ({ label, value }: { label: string; value: string }): JSX.Element => (
    <div style={insightStatStyle}>
        <span
            style={{
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                color: 'var(--text-muted, #9ca3af)',
            }}
        >
            {label}
        </span>
        <span style={{ fontSize: 17, fontWeight: 700 }}>{value}</span>
    </div>
);

/**
 * 7-day audience numbers from the analytics warehouse. Renders nothing when
 * the deployment has no warehouse (`available: false`) — zeros would read as
 * "nobody watched" on installs that simply don't measure.
 */
const InsightsStrip = ({ summary }: { summary: CreatorInsightsSummary }): JSX.Element => (
    <div style={insightsStripStyle} data-testid="creator-hub-insights">
        <InsightStat label="Unique viewers · 7d" value={String(summary.uniqueViewers)} />
        <InsightStat label="Stream views · 7d" value={String(summary.streamViews)} />
        <InsightStat label="Watch time · 7d" value={formatWatchTime(summary.watchSeconds)} />
        <InsightStat label="Clip plays · 7d" value={String(summary.clipPlays)} />
        {summary.liveViewersNow !== null ? (
            <InsightStat label="Watching now" value={String(summary.liveViewersNow)} />
        ) : null}
    </div>
);

const CardInner = ({ label, title, meta }: OverviewCardProps): JSX.Element => (
    <>
        <span
            style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: 0.6,
                color: 'var(--text-muted, #9ca3af)',
            }}
        >
            {label}
        </span>
        <span style={hubCardTitleStyle}>{title}</span>
        <span style={hubCardMetaStyle}>{meta}</span>
    </>
);

/**
 * Creator Hub Overview — the hub's landing tab. Composes a deep-link
 * dashboard into the creator's existing surfaces (live directory, storefront
 * dashboard, earnings, coalitions, events) plus in-hub jumps to Clips and
 * Rewards. Reads live-stream counts and reward status via existing clients;
 * each fetch swallows its own error so one unavailable section still leaves
 * the rest usable (mirrors CreatorDashboard / CreatorStorefront).
 */
export const CreatorHubOverview = ({ onSelectTab }: CreatorHubOverviewProps): JSX.Element => {
    const [liveCount, setLiveCount] = useState<number | null>(null);
    const [referralCount, setReferralCount] = useState<number | null>(null);
    const [ambassadorTier, setAmbassadorTier] = useState<string | null>(null);
    const [activeSubscribers, setActiveSubscribers] = useState<number | null>(null);
    const [publishedContent, setPublishedContent] = useState<number | null>(null);
    const [insights, setInsights] = useState<CreatorInsightsSummary | null>(null);

    useEffect(() => {
        let cancelled = false;
        const token = readBlackoutApiToken();
        fetchCreatorInsights()
            .then((response) => {
                if (cancelled) return;
                if (response.available && response.summary) setInsights(response.summary);
            })
            .catch(() => undefined);
        listStreams({ state: 'live', limit: 60 })
            .then((response) => {
                if (cancelled) return;
                setLiveCount(response.items.length);
            })
            .catch(() => undefined);
        fetchMyReferrals()
            .then((response) => {
                if (cancelled) return;
                setReferralCount(response.items.length);
            })
            .catch(() => undefined);
        fetchMyAmbassador()
            .then((response) => {
                if (cancelled) return;
                setAmbassadorTier(response.ambassador?.tier ?? null);
            })
            .catch(() => undefined);
        creatorSubsApi
            .listMySubscribers(token)
            .then((response) => {
                if (cancelled) return;
                setActiveSubscribers(
                    response.subscriptions.filter((sub) => sub.status === 'active').length
                );
            })
            .catch(() => undefined);
        fetchMyContent('published', token)
            .then((response) => {
                if (cancelled) return;
                setPublishedContent(response.content.length);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

    const liveMeta =
        liveCount === null
            ? 'Browse the live directory'
            : liveCount === 0
            ? 'No streams live right now'
            : `${liveCount} live now`;

    const rewardMeta = ambassadorTier
        ? `Ambassador: ${ambassadorTier}`
        : referralCount && referralCount > 0
        ? `${referralCount} referrals tracked`
        : 'Track referrals, quests & credits';

    const earningsMeta =
        activeSubscribers && activeSubscribers > 0
            ? `${activeSubscribers} active subscriber${activeSubscribers === 1 ? '' : 's'}`
            : 'Subscriptions, tips & payouts';

    const dashboardMeta =
        publishedContent && publishedContent > 0
            ? `${publishedContent} published · listings & growth`
            : 'Listings, growth & storefront';

    return (
        <HubSection
            title="Creator Hub"
            subtitle="Your creator home base — streams, clips, communities, monetization, and rewards in one place."
            testId="creator-hub-overview"
            shellRegion="creator-hub-overview"
        >
            {insights ? <InsightsStrip summary={insights} /> : null}
            <div style={hubGridStyle} data-testid="creator-hub-overview-grid">
                <button
                    type="button"
                    style={cardButtonStyle}
                    onClick={() => onSelectTab?.('content', 'live')}
                    data-testid="creator-hub-overview-live"
                >
                    <CardInner label="Streaming" title="Live & replays" meta={liveMeta} />
                </button>
                <button
                    type="button"
                    style={cardButtonStyle}
                    onClick={() => onSelectTab?.('content', 'clips')}
                    data-testid="creator-hub-overview-clips"
                >
                    <CardInner
                        label="Short-form"
                        title="Clips"
                        meta="Highlights & vertical video"
                    />
                </button>
                <button
                    type="button"
                    style={cardButtonStyle}
                    onClick={() => onSelectTab?.('earnings', 'rewards')}
                    data-testid="creator-hub-overview-rewards"
                >
                    <CardInner label="Program" title="Rewards" meta={rewardMeta} />
                </button>
                <Link
                    to={CREATOR_DASHBOARD_PATH}
                    style={hubCardStyle}
                    data-testid="creator-hub-overview-dashboard"
                >
                    <CardInner label="Storefront" title="Creator dashboard" meta={dashboardMeta} />
                </Link>
                <Link
                    to={MONETIZATION_EARNINGS_PATH}
                    style={hubCardStyle}
                    data-testid="creator-hub-overview-earnings"
                >
                    <CardInner label="Monetization" title="Earnings" meta={earningsMeta} />
                </Link>
                <Link
                    to={COALITION_PATH}
                    style={hubCardStyle}
                    data-testid="creator-hub-overview-coalition"
                >
                    <CardInner label="Community" title="Coalitions" meta="Organize & collaborate" />
                </Link>
                <Link
                    to={EVENTS_PATH}
                    style={hubCardStyle}
                    data-testid="creator-hub-overview-events"
                >
                    <CardInner label="Real-world" title="Events" meta="Workshops & meetups" />
                </Link>
            </div>
        </HubSection>
    );
};

export default CreatorHubOverview;
