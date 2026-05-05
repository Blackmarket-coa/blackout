import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { userIdAtom } from '../../state/auth';
import GlobalMentionsInbox from './GlobalMentionsInbox';
import { useInboxModel } from './useInboxModel';

export const GlobalHeaderInboxLauncher = () => {
    const userId = useAtomValue(userIdAtom);
    const [open, setOpen] = useState(false);
    const { items, markAllRead, markReadLocal } = useInboxModel();

    if (!userId) return null;

    return (
        <div style={{ position: 'fixed', top: 8, left: 8, zIndex: 120 }}>
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                style={{
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-input)',
                    borderRadius: 8,
                    padding: '4px 8px',
                    color: 'var(--text-primary)',
                }}
            >
                Global Inbox {items.length > 0 ? `(${items.length})` : ''}
            </button>
            {open ? (
                <GlobalMentionsInbox
                    items={items}
                    onClose={() => setOpen(false)}
                    onMarkAllRead={markAllRead}
                    onMarkReadLocal={markReadLocal}
                />
            ) : null}
        </div>
    );
};

export default GlobalHeaderInboxLauncher;
