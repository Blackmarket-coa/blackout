import { useState } from 'react';
import type { MentionInboxItem } from '../right-panel/rightPanelUtils';
import type { InboxSection } from './inboxTriage';
import { buildMentionDeepLink, useMentionNavigation } from './useMentionNavigation';

interface GlobalMentionsInboxProps {
    sections: InboxSection[];
    snoozedItems: MentionInboxItem[];
    resolvedItems: MentionInboxItem[];
    onClose: () => void;
    onMarkAllRead: () => Promise<void>;
    onMarkReadLocal: (eventId: string) => void;
    onToggleResolved: (eventId: string, resolved: boolean) => void;
    onSnooze: (eventId: string) => void;
    onUnsnooze: (eventId: string) => void;
}

export const GlobalMentionsInbox = ({
    sections,
    snoozedItems,
    resolvedItems,
    onClose,
    onMarkAllRead,
    onMarkReadLocal,
    onToggleResolved,
    onSnooze,
    onUnsnooze,
}: GlobalMentionsInboxProps) => {
    const { openMentionItem } = useMentionNavigation();
    const [pendingMarkAll, setPendingMarkAll] = useState(false);

    return (
        <aside
            style={{
                position: 'absolute',
                top: 44,
                right: 8,
                width: 380,
                maxHeight: '65vh',
                overflowY: 'auto',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 10,
                boxShadow: '-2px 4px 16px rgba(0,0,0,.2)',
                zIndex: 5,
            }}
        >
            <header
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 10,
                    borderBottom: '1px solid var(--border-default)',
                }}
            >
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
                    <button type="button" onClick={onClose}>
                        Close
                    </button>
                </div>
            </header>

            <div style={{ padding: 8, display: 'grid', gap: 10 }}>
                {sections.length === 0 && snoozedItems.length === 0 ? (
                    <small style={{ color: 'var(--text-secondary)' }}>No triage items.</small>
                ) : null}

                {sections.map((section) => (
                    <section key={section.priority} style={{ display: 'grid', gap: 6 }}>
                        <strong style={{ fontSize: 12, textTransform: 'uppercase' }}>{section.label}</strong>
                        {section.items.map((item) => (
                            <article
                                key={item.eventId}
                                style={{
                                    border: item.unread
                                        ? '1px solid var(--accent-primary)'
                                        : '1px solid var(--border-default)',
                                    borderRadius: 8,
                                    background: item.unread
                                        ? 'var(--accent-muted)'
                                        : 'var(--bg-input)',
                                    padding: 8,
                                    display: 'grid',
                                    gap: 6,
                                }}
                            >
                                <a
                                    href={buildMentionDeepLink(item)}
                                    onClick={(event) => {
                                        event.preventDefault();
                                        void openMentionItem(item).then(() => onMarkReadLocal(item.eventId));
                                        onClose();
                                    }}
                                    style={{ color: 'inherit', textDecoration: 'none' }}
                                >
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                        {item.roomName} {item.unread ? '• Unread' : '• Read'}
                                    </div>
                                    <div
                                        style={{
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {item.body}
                                    </div>
                                </a>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button
                                        type="button"
                                        onClick={() => onToggleResolved(item.eventId, true)}
                                    >
                                        Resolve
                                    </button>
                                    <button type="button" onClick={() => onSnooze(item.eventId)}>
                                        Remind later
                                    </button>
                                </div>
                            </article>
                        ))}
                    </section>
                ))}

                {snoozedItems.length > 0 ? (
                    <section style={{ display: 'grid', gap: 6 }}>
                        <strong style={{ fontSize: 12, textTransform: 'uppercase' }}>Snoozed</strong>
                        {snoozedItems.map((item) => (
                            <div key={item.eventId} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>{item.body}</span>
                                <button type="button" onClick={() => onUnsnooze(item.eventId)}>
                                    Unsnooze
                                </button>
                            </div>
                        ))}
                    </section>
                ) : null}

                {resolvedItems.length > 0 ? (
                    <section style={{ display: 'grid', gap: 6 }}>
                        <strong style={{ fontSize: 12, textTransform: 'uppercase' }}>Resolved</strong>
                        {resolvedItems.map((item) => (
                            <div key={item.eventId} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>{item.body}</span>
                                <button type="button" onClick={() => onToggleResolved(item.eventId, false)}>
                                    Re-open
                                </button>
                            </div>
                        ))}
                    </section>
                ) : null}
            </div>
        </aside>
    );
};

export default GlobalMentionsInbox;
