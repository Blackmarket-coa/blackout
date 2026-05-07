import React from 'react';
import { Box, Text, IconButton, Icon, Icons, Scroll } from 'folds';
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

type AccountProps = {
  requestClose: () => void;
};
export function Account({ requestClose }: AccountProps) {
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
            <Box direction="Column" gap="700">
              <Profile />
              <MatrixId />
              <ContactInformation />
              <LinkedAccounts />
              <TwitchChatBridges />
              <YoutubeChatBridges />
              <KickChatBridges />
              <DiscordCompatWebhooks />
              <OutboundEventWebhooks />
              <TwitchIrcBotTokens />
              <ObsWsPasswords />
              <WidgetAlertTokens />
              <SimulcastDestinations />
              <IntegrationsHealth />
              <IgnoredUserList />
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
