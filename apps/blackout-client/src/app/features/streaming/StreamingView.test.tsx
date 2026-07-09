// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider as JotaiProvider, createStore } from 'jotai';

// The hub mounts heavy, network-backed components per tab. Stub each one so the
// test exercises the tab routing without their data fetches.
vi.mock('../streams', () => ({
    LiveDirectory: () => <div data-testid="stub-live" />,
    ReplaysDirectory: () => <div data-testid="stub-replays" />,
}));
vi.mock('../settings/linked-accounts', () => ({
    LinkedAccounts: () => <div data-testid="stub-linked-accounts" />,
}));
vi.mock('../settings/simulcast-destinations', () => ({
    SimulcastDestinations: () => <div data-testid="stub-simulcast" />,
}));
vi.mock('../settings/obs-ws-passwords', () => ({
    ObsWsPasswords: () => <div data-testid="stub-obs" />,
}));
vi.mock('../settings/twitch-irc-bot-tokens', () => ({
    TwitchIrcBotTokens: () => <div data-testid="stub-irc" />,
}));
vi.mock('../settings/widget-alerts', () => ({
    WidgetAlertTokens: () => <div data-testid="stub-widget-alerts" />,
}));
vi.mock('../settings/twitch-chat-bridges', () => ({
    TwitchChatBridges: () => <div data-testid="stub-twitch-bridge" />,
}));
vi.mock('../settings/youtube-chat-bridges', () => ({
    YoutubeChatBridges: () => <div data-testid="stub-youtube-bridge" />,
}));
vi.mock('../settings/kick-chat-bridges', () => ({
    KickChatBridges: () => <div data-testid="stub-kick-bridge" />,
}));
vi.mock('../settings/discord-compat-webhooks', () => ({
    DiscordCompatWebhooks: () => <div data-testid="stub-discord-webhooks" />,
}));
vi.mock('../settings/outbound-event-webhooks', () => ({
    OutboundEventWebhooks: () => <div data-testid="stub-outbound-webhooks" />,
}));
vi.mock('../settings/integrations-health', () => ({
    IntegrationsHealth: () => <div data-testid="stub-health" />,
}));
// The Creator Hub sections are lazy-loaded and pull in the growth /
// monetization / Matrix-media clients; stub them so the test exercises tab
// routing without their fetches.
vi.mock('./sections/CreatorHubOverview', () => ({
    CreatorHubOverview: () => <div data-testid="stub-overview" />,
}));
vi.mock('./sections/ClipsDirectory', () => ({
    ClipsDirectory: () => <div data-testid="stub-clips" />,
}));
vi.mock('./sections/CreatorKits', () => ({
    CreatorKits: () => <div data-testid="stub-kits" />,
}));
vi.mock('./sections/RewardsSection', () => ({
    RewardsSection: () => <div data-testid="stub-rewards" />,
}));
vi.mock('./sections/CreatorHubListings', () => ({
    CreatorHubListings: () => <div data-testid="stub-listings" />,
}));
vi.mock('./sections/SplitContracts', () => ({
    SplitContracts: () => <div data-testid="stub-splits" />,
}));
vi.mock('./sections/CreatorHubContent', () => ({
    CreatorHubContent: () => <div data-testid="stub-creator-content" />,
}));
vi.mock('./sections/CreatorHubPostBounty', () => ({
    CreatorHubPostBounty: () => <div data-testid="stub-post-bounty" />,
}));
vi.mock('./sections/CreatorHubBounties', () => ({
    CreatorHubBounties: () => <div data-testid="stub-bounties" />,
}));

import StreamingView, { type StreamingViewProps } from './StreamingView';
import { resolveStreamingTab } from '../../state/streaming';

// Lazy sections resolve their dynamic import over a couple of microtask
// turns before Suspense swaps in the resolved component; flush several.
const flushLazy = async () => {
    await act(async () => {
        for (let i = 0; i < 5; i += 1) {
            await Promise.resolve();
        }
    });
};

const mountView = async (props: StreamingViewProps = {}) => {
    const store = createStore();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(
            <JotaiProvider store={store}>
                <StreamingView {...props} />
            </JotaiProvider>
        );
        await Promise.resolve();
    });
    await flushLazy();
    return { container };
};

const clickTab = async (container: HTMLElement, tab: string) => {
    const button = container.querySelector<HTMLButtonElement>(`[data-streaming-tab="${tab}"]`);
    await act(async () => {
        button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
    });
    await flushLazy();
};

const clickSubTab = async (container: HTMLElement, view: string) => {
    const button = container.querySelector<HTMLButtonElement>(`[data-streaming-subtab="${view}"]`);
    await act(async () => {
        button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
    });
    await flushLazy();
};

describe('StreamingView', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
    });

    it('renders the consolidated hub tabs and defaults to the Overview tab', async () => {
        const { container } = await mountView();
        const tabs = Array.from(container.querySelectorAll('[data-streaming-tab]')).map((el) =>
            el.getAttribute('data-streaming-tab')
        );
        expect(tabs).toEqual(['overview', 'content', 'kits', 'earnings', 'integrations']);
        expect(container.querySelector('[data-testid="streaming-tab-overview"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="stub-overview"]')).not.toBeNull();
    });

    it('switches to Content (Live by default) and between the directory sub-views', async () => {
        const { container } = await mountView();
        await clickTab(container, 'content');
        expect(container.querySelector('[data-testid="streaming-tab-content"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="stub-live"]')).not.toBeNull();
        await clickSubTab(container, 'replays');
        expect(container.querySelector('[data-testid="stub-replays"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="stub-live"]')).toBeNull();
        await clickSubTab(container, 'clips');
        expect(container.querySelector('[data-testid="stub-clips"]')).not.toBeNull();
    });

    it('switches to Kits and mounts the kit catalog', async () => {
        const { container } = await mountView();
        await clickTab(container, 'kits');
        expect(container.querySelector('[data-testid="stub-kits"]')).not.toBeNull();
    });

    it('switches to Earnings (Rewards by default) and between its sub-views', async () => {
        const { container } = await mountView();
        await clickTab(container, 'earnings');
        expect(container.querySelector('[data-testid="streaming-tab-earnings"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="stub-rewards"]')).not.toBeNull();
        await clickSubTab(container, 'listings');
        expect(container.querySelector('[data-testid="stub-listings"]')).not.toBeNull();
        await clickSubTab(container, 'splits');
        expect(container.querySelector('[data-testid="stub-splits"]')).not.toBeNull();
    });

    it('opens Integrations on Broadcast and mounts the simulcast / OBS / IRC / widget tools', async () => {
        vi.useFakeTimers();
        try {
            const { container } = await mountView();
            await clickTab(container, 'integrations');
            expect(
                container.querySelector('[data-testid="streaming-subview-broadcast"]')
            ).not.toBeNull();
            // Panels mount on a stagger (StaggeredMount) to avoid a request burst;
            // advance past the schedule so every tool is present.
            await act(async () => {
                vi.advanceTimersByTime(2000);
                await Promise.resolve();
            });
            expect(container.querySelector('[data-testid="stub-simulcast"]')).not.toBeNull();
            expect(container.querySelector('[data-testid="stub-obs"]')).not.toBeNull();
            expect(container.querySelector('[data-testid="stub-irc"]')).not.toBeNull();
            expect(container.querySelector('[data-testid="stub-widget-alerts"]')).not.toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    it('switches to the Connections sub-view and mounts linked accounts', async () => {
        const { container } = await mountView();
        await clickTab(container, 'integrations');
        await clickSubTab(container, 'connections');
        expect(container.querySelector('[data-testid="stub-linked-accounts"]')).not.toBeNull();
    });

    it('switches to the Bridges sub-view and mounts every bridge + webhook surface', async () => {
        vi.useFakeTimers();
        try {
            const { container } = await mountView();
            await clickTab(container, 'integrations');
            await clickSubTab(container, 'bridges');
            // Bridge/webhook panels mount on a stagger; advance past the schedule.
            await act(async () => {
                vi.advanceTimersByTime(2000);
                await Promise.resolve();
            });
            expect(container.querySelector('[data-testid="stub-twitch-bridge"]')).not.toBeNull();
            expect(container.querySelector('[data-testid="stub-youtube-bridge"]')).not.toBeNull();
            expect(container.querySelector('[data-testid="stub-kick-bridge"]')).not.toBeNull();
            expect(container.querySelector('[data-testid="stub-discord-webhooks"]')).not.toBeNull();
            expect(
                container.querySelector('[data-testid="stub-outbound-webhooks"]')
            ).not.toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    it('honours the initialTab prop with a legacy tab id (health)', async () => {
        const { container } = await mountView({ initialTab: 'health' });
        expect(
            container.querySelector('[data-testid="streaming-tab-integrations"]')
        ).not.toBeNull();
        expect(container.querySelector('[data-testid="stub-health"]')).not.toBeNull();
    });

    it('remaps a legacy initialTab (replays) to the Content tab with the sub-view selected', async () => {
        const { container } = await mountView({ initialTab: 'replays' });
        expect(container.querySelector('[data-testid="streaming-tab-content"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="stub-replays"]')).not.toBeNull();
    });

    it('remaps a persisted legacy tab id (bridges) to Integrations with the sub-view selected', async () => {
        localStorage.setItem('bmc-streaming-tab', JSON.stringify('bridges'));
        const { container } = await mountView();
        expect(
            container.querySelector('[data-testid="streaming-tab-integrations"]')
        ).not.toBeNull();
        expect(container.querySelector('[data-testid="streaming-subview-bridges"]')).not.toBeNull();
        const bridgesSubTab = container.querySelector('[data-streaming-subtab="bridges"]');
        expect(bridgesSubTab?.getAttribute('aria-selected')).toBe('true');
    });

    it('falls back to Overview for a garbage persisted tab value', async () => {
        localStorage.setItem('bmc-streaming-tab', JSON.stringify('not-a-tab'));
        const { container } = await mountView();
        expect(container.querySelector('[data-testid="streaming-tab-overview"]')).not.toBeNull();
    });
});

describe('resolveStreamingTab', () => {
    it('passes current tab ids through', () => {
        expect(resolveStreamingTab('earnings')).toEqual({ tab: 'earnings' });
    });

    it('remaps every legacy tab id to its merged tab + sub-view', () => {
        expect(resolveStreamingTab('live')).toEqual({ tab: 'content', view: 'live' });
        expect(resolveStreamingTab('replays')).toEqual({ tab: 'content', view: 'replays' });
        expect(resolveStreamingTab('clips')).toEqual({ tab: 'content', view: 'clips' });
        expect(resolveStreamingTab('rewards')).toEqual({ tab: 'earnings', view: 'rewards' });
        expect(resolveStreamingTab('listings')).toEqual({ tab: 'earnings', view: 'listings' });
        expect(resolveStreamingTab('splits')).toEqual({ tab: 'earnings', view: 'splits' });
        expect(resolveStreamingTab('broadcast')).toEqual({
            tab: 'integrations',
            view: 'broadcast',
        });
        expect(resolveStreamingTab('connections')).toEqual({
            tab: 'integrations',
            view: 'connections',
        });
        expect(resolveStreamingTab('bridges')).toEqual({ tab: 'integrations', view: 'bridges' });
        expect(resolveStreamingTab('health')).toEqual({ tab: 'integrations', view: 'health' });
    });

    it('falls back to the default tab for unknown values', () => {
        expect(resolveStreamingTab('nonsense')).toEqual({ tab: 'overview' });
        expect(resolveStreamingTab(undefined)).toEqual({ tab: 'overview' });
    });
});
