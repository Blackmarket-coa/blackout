import React from 'react';

export function ChannelPanel({ channels }: { channels: Array<{ id: string; name: string }> }) {
  return (
    <aside>
      {channels.map((channel) => (
        <div key={channel.id}># {channel.name}</div>
      ))}
    </aside>
  );
}
