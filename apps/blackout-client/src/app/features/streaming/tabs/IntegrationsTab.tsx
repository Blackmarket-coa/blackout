import React, { type CSSProperties, useCallback, useState } from 'react';
import { useAtom } from 'jotai';
import {
    INTEGRATIONS_VIEW_HINTS,
    INTEGRATIONS_VIEW_LABELS,
    INTEGRATIONS_VIEW_ORDER,
    streamingIntegrationsViewAtom,
    type IntegrationsViewId,
} from '../../../state/streaming';
import HubSubTabs from '../components/HubSubTabs';
import StaggeredMount from '../StaggeredMount';
import { LinkedAccounts } from '../../settings/linked-accounts';
import { SimulcastDestinations } from '../../settings/simulcast-destinations';
import { ObsWsPasswords } from '../../settings/obs-ws-passwords';
import { TwitchIrcBotTokens } from '../../settings/twitch-irc-bot-tokens';
import { TwitchExtensions } from '../../settings/twitch-extensions';
import { WidgetAlertTokens } from '../../settings/widget-alerts';
import { TwitchChatBridges } from '../../settings/twitch-chat-bridges';
import { YoutubeChatBridges } from '../../settings/youtube-chat-bridges';
import { KickChatBridges } from '../../settings/kick-chat-bridges';
import { DiscordCompatWebhooks } from '../../settings/discord-compat-webhooks';
import { OutboundEventWebhooks } from '../../settings/outbound-event-webhooks';
import { IntegrationsHealth } from '../../settings/integrations-health';

const sectionStackStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 28,
    padding: 16,
};

export interface IntegrationsTabProps {
    /** Deep-link override (legacy tab ids remap here). Cleared on first click. */
    initialView?: IntegrationsViewId;
}

/**
 * Consolidated Integrations tab: broadcast tooling, linked accounts, chat
 * bridges + webhooks, and the integrations-health dashboard. Each view keeps
 * its own StaggeredMount so the panels never fetch as one burst.
 */
export function IntegrationsTab({ initialView }: IntegrationsTabProps) {
    const [storedView, setView] = useAtom(streamingIntegrationsViewAtom);
    const [override, setOverride] = useState<IntegrationsViewId | undefined>(initialView);
    const activeView = override ?? storedView;

    const handleSelect = useCallback(
        (view: IntegrationsViewId) => {
            setOverride(undefined);
            setView(view);
        },
        [setView]
    );

    return (
        <div data-testid="streaming-tab-integrations">
            <HubSubTabs
                views={INTEGRATIONS_VIEW_ORDER}
                labels={INTEGRATIONS_VIEW_LABELS}
                hints={INTEGRATIONS_VIEW_HINTS}
                active={activeView}
                onSelect={handleSelect}
                ariaLabel="Integrations views"
            />
            {activeView === 'broadcast' ? (
                <div style={sectionStackStyle} data-testid="streaming-subview-broadcast">
                    <StaggeredMount>
                        <SimulcastDestinations />
                        <ObsWsPasswords />
                        <TwitchIrcBotTokens />
                        <TwitchExtensions />
                        <WidgetAlertTokens />
                    </StaggeredMount>
                </div>
            ) : null}
            {activeView === 'connections' ? (
                <div style={sectionStackStyle} data-testid="streaming-subview-connections">
                    <LinkedAccounts />
                </div>
            ) : null}
            {activeView === 'bridges' ? (
                <div style={sectionStackStyle} data-testid="streaming-subview-bridges">
                    <StaggeredMount>
                        <TwitchChatBridges />
                        <YoutubeChatBridges />
                        <KickChatBridges />
                        <DiscordCompatWebhooks />
                        <OutboundEventWebhooks />
                    </StaggeredMount>
                </div>
            ) : null}
            {activeView === 'health' ? (
                <div style={sectionStackStyle} data-testid="streaming-subview-health">
                    <IntegrationsHealth />
                </div>
            ) : null}
        </div>
    );
}

export default IntegrationsTab;
