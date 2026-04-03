import { useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { joinedRoomsAtom } from '../../state/rooms';
import { userIdAtom } from '../../state/auth';
import { getMentionInboxItems } from '../right-panel/rightPanelUtils';
import GlobalMentionsInbox from './GlobalMentionsInbox';

export const GlobalHeaderInboxLauncher = () => {
  const rooms = useAtomValue(joinedRoomsAtom);
  const userId = useAtomValue(userIdAtom);
  const [open, setOpen] = useState(false);
  const [readState, setReadState] = useState<Record<string, boolean>>({});

  const items = useMemo(
    () =>
      getMentionInboxItems({ rooms, userId }).map((item) => ({
        ...item,
        unread: item.unread && !readState[item.eventId],
      })),
    [readState, rooms, userId],
  );

  if (!userId) return null;

  return (
    <div style={{ position: 'fixed', top: 8, left: 8, zIndex: 120 }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={{ border: '1px solid var(--border-default)', background: 'var(--bg-input)', borderRadius: 8, padding: '4px 8px', color: 'var(--text-primary)' }}
      >
        Global Inbox {items.length > 0 ? `(${items.length})` : ''}
      </button>
      {open ? (
        <GlobalMentionsInbox
          items={items}
          onClose={() => setOpen(false)}
          onMarkAllRead={async () => {
            setReadState((prev) => ({
              ...prev,
              ...Object.fromEntries(items.map((item) => [item.eventId, true])),
            }));
          }}
          onMarkReadLocal={(eventId) => setReadState((prev) => ({ ...prev, [eventId]: true }))}
        />
      ) : null}
    </div>
  );
};

export default GlobalHeaderInboxLauncher;
