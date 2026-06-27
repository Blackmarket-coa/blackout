import React, { lazy, Suspense, type CSSProperties, useCallback, useMemo } from 'react';
import { useAtom } from 'jotai';
import {
    isValidStreamingTab,
    streamingTabAtom,
    STREAMING_TAB_ORDER,
    type StreamingTabId,
} from '../../state/streaming';
import { runtimeFeatureFlags } from '../../core/features/featureFlags';
import StreamingTabStrip from './StreamingTabStrip';
import StaggeredMount from './StaggeredMount';
import { LiveDirectory, ReplaysDirectory } from '../streams';
import { LinkedAccounts } from '../settings/linked-accounts';
import { SimulcastDestinations } from '../settings/simulcast-destinations';
import { ObsWsPasswords } from '../settings/obs-ws-passwords';
import { TwitchIrcBotTokens } from '../settings/twitch-irc-bot-tokens';
import { TwitchExtensions } from '../settings/twitch-extensions';
import { ChannelPointsRewards } from '../settings/channel-points';
import { WidgetAlertTokens } from '../settings/widget-alerts';
import { TwitchChatBridges } from '../settings/twitch-chat-bridges';
import { YoutubeChatBridges } from '../settings/youtube-chat-bridges';
import { KickChatBridges } from '../settings/kick-chat-bridges';
import { DiscordCompatWebhooks } from '../settings/discord-compat-webhooks';
import { OutboundEventWebhooks } from '../settings/outbound-event-webhooks';
import { IntegrationsHealth } from '../settings/integrations-health';

// Hub sections are lazy-loaded so the registry-load path stays
// jsdom-independent (the clip viewer pulls in Matrix media helpers; the
// rewards/overview sections pull in the growth/monetization clients).
const CreatorHubOverview = lazy(() =>
    import('./sections/CreatorHubOverview').then((mod) => ({ default: mod.CreatorHubOverview }))
);
const ClipsDirectory = lazy(() =>
    import('./sections/ClipsDirectory').then((mod) => ({ default: mod.ClipsDirectory }))
);
const CreatorKits = lazy(() =>
    import('./sections/CreatorKits').then((mod) => ({ default: mod.CreatorKits }))
);
const RewardsSection = lazy(() =>
    import('./sections/RewardsSection').then((mod) => ({ default: mod.RewardsSection }))
);
const CreatorHubBounties = lazy(() =>
    import('./sections/CreatorHubBounties').then((mod) => ({ default: mod.CreatorHubBounties }))
);
const CreatorHubPostBounty = lazy(() =>
    import('./sections/CreatorHubPostBounty').then((mod) => ({ default: mod.CreatorHubPostBounty }))
);
const CreatorHubBountyRewards = lazy(() =>
    import('./sections/CreatorHubBountyRewards').then((mod) => ({
        default: mod.CreatorHubBountyRewards,
    }))
);
const CreatorHubCreatorDrivenSales = lazy(() =>
    import('./sections/CreatorHubCreatorDrivenSales').then((mod) => ({
        default: mod.CreatorHubCreatorDrivenSales,
    }))
);
const CreatorHubContent = lazy(() =>
    import('./sections/CreatorHubContent').then((mod) => ({ default: mod.CreatorHubContent }))
);
const CreatorHubListings = lazy(() =>
    import('./sections/CreatorHubListings').then((mod) => ({ default: mod.CreatorHubListings }))
);
const SplitContracts = lazy(() =>
    import('./sections/SplitContracts').then((mod) => ({ default: mod.SplitContracts }))
);

const contentStyle: CSSProperties = { minHeight: 0, overflow: 'auto' };

const sectionStackStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 28,
    padding: 16,
};

export interface StreamingViewProps {
    /** Force a specific tab (used in tests). Falls back to the persisted tab. */
    initialTab?: StreamingTabId;
}

export function StreamingView({ initialTab }: StreamingViewProps) {
    const [storedTab, setTab] = useAtom(streamingTabAtom);

    // The Listings tab is gated by the `creatorsListings` flag; filter it out of
    // the strip (and treat it as invalid) when the flag is off.
    const visibleTabs = useMemo<StreamingTabId[]>(
        () =>
            STREAMING_TAB_ORDER.filter(
                (tab) => tab !== 'listings' || runtimeFeatureFlags.creatorsListings
            ),
        []
    );

    const activeTab = useMemo<StreamingTabId>(() => {
        if (initialTab && visibleTabs.includes(initialTab)) return initialTab;
        if (isValidStreamingTab(storedTab) && visibleTabs.includes(storedTab)) return storedTab;
        return visibleTabs[0];
    }, [initialTab, storedTab, visibleTabs]);

    const handleSelect = useCallback(
        (tab: StreamingTabId) => {
            setTab(tab);
        },
        [setTab]
    );

    return (
        <section
            style={{ display: 'grid', gridTemplateRows: 'auto 1fr', height: '100%', minHeight: 0 }}
            data-testid="streaming-view"
        >
            <StreamingTabStrip
                activeTab={activeTab}
                onSelectTab={handleSelect}
                tabs={visibleTabs}
            />
            <div style={contentStyle}>
                {activeTab === 'overview' ? (
                    <div data-testid="streaming-tab-overview">
                        <Suspense fallback={null}>
                            <CreatorHubOverview onSelectTab={handleSelect} />
                        </Suspense>
                        {runtimeFeatureFlags.creatorContent ? (
                            <Suspense fallback={null}>
                                <div style={{ padding: 16 }}>
                                    <CreatorHubContent />
                                </div>
                            </Suspense>
                        ) : null}
                        {runtimeFeatureFlags.homeBountyBoard ? (
                            <Suspense fallback={null}>
                                <CreatorHubPostBounty />
                                <CreatorHubBounties />
                            </Suspense>
                        ) : null}
                    </div>
                ) : null}
                {activeTab === 'live' ? (
                    <div data-testid="streaming-tab-live">
                        <LiveDirectory />
                    </div>
                ) : null}
                {activeTab === 'replays' ? (
                    <div data-testid="streaming-tab-replays">
                        <ReplaysDirectory />
                    </div>
                ) : null}
                {activeTab === 'clips' ? (
                    <div data-testid="streaming-tab-clips">
                        <Suspense fallback={null}>
                            <ClipsDirectory />
                        </Suspense>
                    </div>
                ) : null}
                {activeTab === 'kits' ? (
                    <div data-testid="streaming-tab-kits">
                        <Suspense fallback={null}>
                            <CreatorKits />
                        </Suspense>
                    </div>
                ) : null}
                {activeTab === 'listings' ? (
                    <div data-testid="streaming-tab-listings">
                        <Suspense fallback={null}>
                            <CreatorHubListings />
                        </Suspense>
                    </div>
                ) : null}
                {activeTab === 'rewards' ? (
                    <div style={sectionStackStyle} data-testid="streaming-tab-rewards">
                        <Suspense fallback={null}>
                            <RewardsSection />
                        </Suspense>
                        {runtimeFeatureFlags.homeBountyBoard ? (
                            <Suspense fallback={null}>
                                <CreatorHubCreatorDrivenSales />
                                <CreatorHubBountyRewards />
                            </Suspense>
                        ) : null}
                        <ChannelPointsRewards />
                    </div>
                ) : null}
                {activeTab === 'splits' ? (
                    <div data-testid="streaming-tab-splits-wrap">
                        <Suspense fallback={null}>
                            <SplitContracts />
                        </Suspense>
                    </div>
                ) : null}
                {activeTab === 'broadcast' ? (
                    <div style={sectionStackStyle} data-testid="streaming-tab-broadcast">
                        <StaggeredMount>
                            <SimulcastDestinations />
                            <ObsWsPasswords />
                            <TwitchIrcBotTokens />
                            <TwitchExtensions />
                            <WidgetAlertTokens />
                        </StaggeredMount>
                    </div>
                ) : null}
                {activeTab === 'connections' ? (
                    <div style={sectionStackStyle} data-testid="streaming-tab-connections">
                        <LinkedAccounts />
                    </div>
                ) : null}
                {activeTab === 'bridges' ? (
                    <div style={sectionStackStyle} data-testid="streaming-tab-bridges">
                        <StaggeredMount>
                            <TwitchChatBridges />
                            <YoutubeChatBridges />
                            <KickChatBridges />
                            <DiscordCompatWebhooks />
                            <OutboundEventWebhooks />
                        </StaggeredMount>
                    </div>
                ) : null}
                {activeTab === 'health' ? (
                    <div style={sectionStackStyle} data-testid="streaming-tab-health">
                        <IntegrationsHealth />
                    </div>
                ) : null}
            </div>
        </section>
    );
}

export default StreamingView;
