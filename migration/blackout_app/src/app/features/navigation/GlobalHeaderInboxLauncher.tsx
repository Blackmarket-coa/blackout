import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { userIdAtom } from '../../state/bmc-auth';
import GlobalMentionsInbox from './GlobalMentionsInbox';
import { useInboxModel } from './useInboxModel';

export const GlobalHeaderInboxLauncher = () => {
    const userId = useAtomValue(userIdAtom);
    const [open, setOpen] = useState(false);
    const {
        prioritySections,
        snoozedItems,
        resolvedItems,
        markAllRead,
        markReadLocal,
        toggleResolved,
        snoozeItem,
        clearSnooze,
    } = useInboxModel();

    if (!userId) return null;

    const unresolvedCount = prioritySections.reduce((acc, section) => acc + section.items.length, 0);

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
                Global Inbox {unresolvedCount > 0 ? `(${unresolvedCount})` : ''}
            </button>
            {open ? (
                <GlobalMentionsInbox
                    sections={prioritySections}
                    snoozedItems={snoozedItems}
                    resolvedItems={resolvedItems}
                    onClose={() => setOpen(false)}
                    onMarkAllRead={markAllRead}
                    onMarkReadLocal={markReadLocal}
                    onToggleResolved={toggleResolved}
                    onSnooze={snoozeItem}
                    onUnsnooze={clearSnooze}
                />
            ) : null}
        </div>
    );
};

export default GlobalHeaderInboxLauncher;
