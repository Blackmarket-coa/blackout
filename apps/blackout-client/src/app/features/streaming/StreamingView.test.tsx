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

import StreamingView, { type StreamingViewProps } from './StreamingView';

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

describe('StreamingView', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
    });

    it('renders every hub tab and defaults to the Overview tab', async () => {
        const { container } = await mountView();
        const tabs = Array.from(container.querySelectorAll('[data-streaming-tab]')).map((el) =>
            el.getAttribute('data-streaming-tab')
        );
        expect(tabs).toEqual([
            'overview',
            'live',
            'replays',
            'clips',
            'kits',
            'listings',
            'rewards',
            'splits',
            'broadcast',
            'connections',
            'bridges',
            'health',
        ]);
        expect(container.querySelector('[data-testid="streaming-tab-overview"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="stub-overview"]')).not.toBeNull();
    });

    it('switches to the Listings tab and mounts the creator listings section', async () => {
        const { container } = await mountView();
        await clickTab(container, 'listings');
        expect(container.querySelector('[data-testid="streaming-tab-listings"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="stub-listings"]')).not.toBeNull();
    });

    it('switches to Live and mounts the live directory', async () => {
        const { container } = await mountView();
        await clickTab(container, 'live');
        expect(container.querySelector('[data-testid="streaming-tab-live"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="stub-live"]')).not.toBeNull();
    });

    it('switches to Replays and mounts the replay archive', async () => {
        const { container } = await mountView();
        await clickTab(container, 'replays');
        expect(container.querySelector('[data-testid="streaming-tab-replays"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="stub-replays"]')).not.toBeNull();
    });

    it('switches to Clips, Kits, and Rewards and mounts each section', async () => {
        const { container } = await mountView();
        await clickTab(container, 'clips');
        expect(container.querySelector('[data-testid="stub-clips"]')).not.toBeNull();
        await clickTab(container, 'kits');
        expect(container.querySelector('[data-testid="stub-kits"]')).not.toBeNull();
        await clickTab(container, 'rewards');
        expect(container.querySelector('[data-testid="stub-rewards"]')).not.toBeNull();
    });

    it('switches to Broadcast and mounts the simulcast / OBS / IRC / widget tools', async () => {
        vi.useFakeTimers();
        try {
            const { container } = await mountView();
            await clickTab(container, 'broadcast');
            expect(
                container.querySelector('[data-testid="streaming-tab-broadcast"]')
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

    it('switches to Connections and mounts linked accounts', async () => {
        const { container } = await mountView();
        await clickTab(container, 'connections');
        expect(container.querySelector('[data-testid="stub-linked-accounts"]')).not.toBeNull();
    });

    it('switches to Bridges and mounts every bridge + webhook surface', async () => {
        vi.useFakeTimers();
        try {
            const { container } = await mountView();
            await clickTab(container, 'bridges');
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

    it('honours the initialTab prop (Health)', async () => {
        const { container } = await mountView({ initialTab: 'health' });
        expect(container.querySelector('[data-testid="stub-health"]')).not.toBeNull();
    });
});
