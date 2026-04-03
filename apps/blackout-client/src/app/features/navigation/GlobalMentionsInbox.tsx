import { useState } from 'react';
import type { MentionInboxItem } from '../right-panel/rightPanelUtils';
import { useMentionNavigation } from './useMentionNavigation';

interface GlobalMentionsInboxProps {
  items: MentionInboxItem[];
  onClose: () => void;
  onMarkAllRead: () => Promise<void>;
  onMarkReadLocal: (eventId: string) => void;
}

export const GlobalMentionsInbox = ({ items, onClose, onMarkAllRead, onMarkReadLocal }: GlobalMentionsInboxProps) => {
  const { openMentionItem } = useMentionNavigation();
  const [pendingMarkAll, setPendingMarkAll] = useState(false);

  return (
    <aside style={{ position: 'absolute', top: 44, right: 8, width: 360, maxHeight: '55vh', overflowY: 'auto', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, boxShadow: '-2px 4px 16px rgba(0,0,0,.2)', zIndex: 5 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderBottom: '1px solid var(--border-default)' }}>
        <strong>Mentions Inbox</strong>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            disabled={pendingMarkAll}
            onClick={() => {
              setPendingMarkAll(true);
              void onMarkAllRead().finally(() => setPendingMarkAll(false));
            }}
          >
            Mark all read
          </button>
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </header>

      <div style={{ padding: 8, display: 'grid', gap: 6 }}>
        {items.length === 0 ? <small style={{ color: 'var(--text-secondary)' }}>No mentions yet.</small> : null}
        {items.map((item) => (
          <button
            key={item.eventId}
            type="button"
            onClick={() => {
              void openMentionItem(item).then(() => onMarkReadLocal(item.eventId));
              onClose();
            }}
            style={{ textAlign: 'left', border: item.unread ? '1px solid var(--accent-primary)' : '1px solid var(--border-default)', borderRadius: 8, background: item.unread ? 'var(--accent-muted)' : 'var(--bg-input)', padding: 8 }}
          >
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {item.roomName} {item.unread ? '• Unread' : '• Read'}
            </div>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.body}</div>
          </button>
        ))}
      </div>
    </aside>
  );
};

export default GlobalMentionsInbox;
