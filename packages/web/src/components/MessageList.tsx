import React, { useEffect, useState } from 'react';
import { useMessages } from '../hooks/useMessages';
import { runQuickAction, type QuickAction, type ReasonCode } from '../lib/moderation';
import { Poll } from './Poll';

export function MessageList({ channelId, communityId = 'main', actorId = 'mod-1' }: { channelId: string; communityId?: string; actorId?: string }) {
  const { messages, subscribe } = useMessages(channelId);
  const [reasonCode, setReasonCode] = useState<ReasonCode>('spam');
  const [note, setNote] = useState('');

  useEffect(() => {
    const unsubscribe = subscribe();
    return unsubscribe;
  }, [subscribe]);

  async function doQuickAction(targetId: string, action: QuickAction) {
    if (!note.trim()) return;
    await runQuickAction({
      communityId,
      actorId,
      targetId,
      action,
      reasonCode,
      reasonText: note,
    });
  }

  return (
    <div>
      <h3>Message moderation context</h3>
      <label>
        Reason code:
        <select value={reasonCode} onChange={(event) => setReasonCode(event.target.value as ReasonCode)} style={{ marginLeft: 8 }}>
          <option value="spam">spam</option>
          <option value="harassment">harassment</option>
          <option value="illegal_content">illegal_content</option>
          <option value="evasion">evasion</option>
          <option value="other">other</option>
        </select>
      </label>
      <input
        placeholder="Required reason note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        style={{ marginLeft: 8, width: 240 }}
      />

      {messages.map((msg) => (
        <div key={msg.id} style={{ borderBottom: '1px solid #333', padding: '8px 0' }}>
          <strong>{msg.username ?? msg.userId}</strong> {msg.content}
          {msg.governance?.type === 'poll' ? <Poll poll={msg.governance.data} /> : null}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {(['warn', 'timeout', 'mute', 'ban', 'redact'] as QuickAction[]).map((action) => (
              <button key={action} onClick={() => void doQuickAction(msg.userId, action)}>
                {action}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
