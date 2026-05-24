import React, { type CSSProperties, useCallback, useMemo } from 'react';
import { useAtom } from 'jotai';
import {
    isValidStreamingTab,
    streamingTabAtom,
    STREAMING_TAB_ORDER,
    type StreamingTabId,
} from '../../state/streaming';
import StreamingTabStrip from './StreamingTabStrip';
import StaggeredMount from './StaggeredMount';
import { LiveDirectory } from '../streams';
import { LinkedAccounts } from '../settings/linked-accounts';
import { SimulcastDestinations } from '../settings/simulcast-destinations';
import { ObsWsPasswords } from '../settings/obs-ws-passwords';
import { TwitchIrcBotTokens } from '../settings/twitch-irc-bot-tokens';
import { WidgetAlertTokens } from '../settings/widget-alerts';
import { TwitchChatBridges } from '../settings/twitch-chat-bridges';
import { YoutubeChatBridges } from '../settings/youtube-chat-bridges';
import { KickChatBridges } from '../settings/kick-chat-bridges';
import { DiscordCompatWebhooks } from '../settings/discord-compat-webhooks';
import { OutboundEventWebhooks } from '../settings/outbound-event-webhooks';
import { IntegrationsHealth } from '../settings/integrations-health';

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

    const activeTab = useMemo<StreamingTabId>(() => {
        if (initialTab && isValidStreamingTab(initialTab)) return initialTab;
        if (isValidStreamingTab(storedTab)) return storedTab;
        return STREAMING_TAB_ORDER[0];
    }, [initialTab, storedTab]);

    const handleSelect = useCallback(
        (tab: StreamingTabId) => {
            setTab(tab);
        },
        [setTab],
    );

    return (
        <section
            style={{ display: 'grid', gridTemplateRows: 'auto 1fr', height: '100%', minHeight: 0 }}
            data-testid="streaming-view"
        >
            <StreamingTabStrip activeTab={activeTab} onSelectTab={handleSelect} />
            <div style={contentStyle}>
                {activeTab === 'live' ? (
                    <div data-testid="streaming-tab-live">
                        <LiveDirectory />
                    </div>
                ) : null}
                {activeTab === 'broadcast' ? (
                    <div style={sectionStackStyle} data-testid="streaming-tab-broadcast">
                        <StaggeredMount>
                            <SimulcastDestinations />
                            <ObsWsPasswords />
                            <TwitchIrcBotTokens />
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
