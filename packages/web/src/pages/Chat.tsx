import React from 'react';
import { ChannelPanel } from '../components/ChannelPanel';
import { MessageList } from '../components/MessageList';
import { MessageComposer } from '../components/MessageComposer';
import { VoicePanel } from '../components/VoicePanel';

export function ChatPage() {
  const channelId = 'general';
  const canopyId = 'main';

  return (
    <section>
      <ChannelPanel channels={[{ id: 'general', name: 'general' }]} />
      <VoicePanel canopyId={canopyId} channelId={channelId} role="admin" />
      <MessageList channelId={channelId} />
      <MessageComposer channelId={channelId} />
    </section>
  );
}
