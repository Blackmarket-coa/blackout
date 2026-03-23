import React from 'react';
import { ChannelPanel } from '../components/ChannelPanel';
import { MessageList } from '../components/MessageList';
import { MessageComposer } from '../components/MessageComposer';

export function ChatPage() {
  const channelId = 'general';

  return (
    <main>
      <ChannelPanel channels={[{ id: 'general', name: 'general' }]} />
      <MessageList channelId={channelId} />
      <MessageComposer channelId={channelId} />
    </main>
  );
}
