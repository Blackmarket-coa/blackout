import React, { useState } from 'react';
import { Box, Chip, Text, IconButton, Icon, Icons, Scroll } from 'folds';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { MatrixId } from './MatrixId';
import { Profile } from './Profile';
import { ContactInformation } from './ContactInfo';
import { IgnoredUserList } from './IgnoredUserList';
import { LinkedAccounts } from '../linked-accounts';
import { TwitchChatBridges } from '../twitch-chat-bridges';
import { YoutubeChatBridges } from '../youtube-chat-bridges';
import { KickChatBridges } from '../kick-chat-bridges';
import { DiscordCompatWebhooks } from '../discord-compat-webhooks';
import { OutboundEventWebhooks } from '../outbound-event-webhooks';
import { TwitchIrcBotTokens } from '../twitch-irc-bot-tokens';
import { ObsWsPasswords } from '../obs-ws-passwords';
import { WidgetAlertTokens } from '../widget-alerts';
import { SimulcastDestinations } from '../simulcast-destinations';
import { IntegrationsHealth } from '../integrations-health';

type AccountTab = 'identity' | 'bridges' | 'health';

const TABS: ReadonlyArray<{ id: AccountTab; label: string }> = [
  { id: 'identity', label: 'Identity' },
  { id: 'bridges', label: 'Bridges & webhooks' },
  { id: 'health', label: 'Health' },
];

type AccountProps = {
  requestClose: () => void;
};
export function Account({ requestClose }: AccountProps) {
  const [tab, setTab] = useState<AccountTab>('identity');

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              Account
            </Text>
          </Box>
          <Box shrink="No">
            <IconButton onClick={requestClose} variant="Surface">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box
              role="tablist"
              aria-label="Account sections"
              direction="Row"
              gap="200"
              style={{ paddingBottom: 12, flexWrap: 'wrap' }}
            >
              {TABS.map((entry) => (
                <Chip
                  key={entry.id}
                  variant={tab === entry.id ? 'Primary' : 'SurfaceVariant'}
                  radii="Pill"
                  outlined
                  role="tab"
                  aria-selected={tab === entry.id}
                  onClick={() => setTab(entry.id)}
                >
                  <Text size="B300">{entry.label}</Text>
                </Chip>
              ))}
            </Box>
            <Box direction="Column" gap="700">
              {tab === 'identity' && (
                <>
                  <Profile />
                  <MatrixId />
                  <ContactInformation />
                  <LinkedAccounts />
                  <IgnoredUserList />
                </>
              )}
              {tab === 'bridges' && (
                <>
                  <TwitchChatBridges />
                  <YoutubeChatBridges />
                  <KickChatBridges />
                  <DiscordCompatWebhooks />
                  <OutboundEventWebhooks />
                  <TwitchIrcBotTokens />
                  <ObsWsPasswords />
                  <WidgetAlertTokens />
                  <SimulcastDestinations />
                </>
              )}
              {tab === 'health' && <IntegrationsHealth />}
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
