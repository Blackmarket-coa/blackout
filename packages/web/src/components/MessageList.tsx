import React, { useEffect } from 'react';
import { useMessages } from '../hooks/useMessages';
import { Poll } from './Poll';

export function MessageList({ channelId }: { channelId: string }) {
  const { messages, subscribe } = useMessages(channelId);

  useEffect(() => {
    const unsubscribe = subscribe();
    return unsubscribe;
  }, [subscribe]);

  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id}>
          <strong>{msg.username}</strong> {msg.content}
          {msg.governance?.type === 'poll' ? <Poll poll={msg.governance.data} /> : null}
        </div>
      ))}
    </div>
  );
}
