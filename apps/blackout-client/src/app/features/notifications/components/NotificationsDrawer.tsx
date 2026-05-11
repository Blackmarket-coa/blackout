import { useState } from 'react';
import { useAwaitsMe } from '../hooks/useAwaitsMe';
import { useAboutMe } from '../hooks/useAboutMe';
import { usePulse } from '../hooks/usePulse';
import { BLACKOUT_TERMS } from '../../../lib/blackoutTerminology';
import type { AwaitsMeItem } from '../../../../lib/bmc-core';

/**
 * Three-tab notifications drawer scoped to a single room. The brief is firm
 * that notifications should be *navigation* (what to look at next) not
 * *alerts* (what just happened), so the tab order leads with "Awaits me" —
 * decisions a member owes — then "About me" (mentions, replies), then
 * "Pulse" (ambient daily-digest signal, never push).
 *
 * Wiring this into the room shell is a follow-up — the component is
 * self-contained so callers can mount it in a right-panel slot or a
 * mobile bottom sheet without refactoring the rest of the page.
 */
export type NotificationsTab = 'awaits-me' | 'about-me' | 'pulse';

export interface NotificationsDrawerProps {
    roomId: string;
    initialTab?: NotificationsTab;
    /** Called when the user taps an item; caller routes (e.g. scroll to event). */
    onItemTap?: (item: AwaitsMeItem) => void;
}

const tabLabels: Record<NotificationsTab, string> = {
    'awaits-me': 'Awaits me',
    'about-me': 'About me',
    pulse: 'Pulse',
};

const styles = {
    root: {
        display: 'grid',
        gap: 12,
        padding: 12,
        border: '1px solid var(--border-default)',
        borderRadius: 12,
        background: 'var(--bg-surface)',
    } as const,
    tabs: { display: 'flex', gap: 6 } as const,
    tab: (active: boolean) => ({
        border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-default)'}`,
        background: active ? 'var(--accent-muted)' : 'var(--bg-input)',
        color: 'var(--text-primary)',
        borderRadius: 999,
        padding: '4px 10px',
        fontSize: 12,
        cursor: 'pointer',
    }),
    item: {
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        background: 'var(--bg-input)',
        padding: '8px 10px',
        textAlign: 'left' as const,
        color: 'var(--text-primary)',
        cursor: 'pointer',
        width: '100%',
    } as const,
    empty: {
        fontSize: 12,
        color: 'var(--text-muted)',
    } as const,
};

export function NotificationsDrawer({
    roomId,
    initialTab = 'awaits-me',
    onItemTap,
}: NotificationsDrawerProps) {
    const [tab, setTab] = useState<NotificationsTab>(initialTab);
    const awaitsMe = useAwaitsMe(roomId);
    const aboutMe = useAboutMe(roomId);
    const pulse = usePulse(roomId);

    return (
        <section data-testid="notifications-drawer" style={styles.root}>
            <header style={styles.tabs}>
                {(Object.keys(tabLabels) as NotificationsTab[]).map((key) => {
                    const count =
                        key === 'awaits-me'
                            ? awaitsMe.count
                            : key === 'about-me'
                              ? aboutMe.highlight
                              : pulse.count;
                    return (
                        <button
                            key={key}
                            type="button"
                            data-testid={`notifications-tab-${key}`}
                            style={styles.tab(tab === key)}
                            onClick={() => setTab(key)}
                        >
                            {tabLabels[key]}
                            {count > 0 ? <span style={{ marginLeft: 4 }}>{count}</span> : null}
                        </button>
                    );
                })}
            </header>

            {tab === 'awaits-me' && (
                <div style={{ display: 'grid', gap: 6 }}>
                    {awaitsMe.items.length === 0 ? (
                        <p style={styles.empty}>Nothing waits on you in this {BLACKOUT_TERMS.den.singular}.</p>
                    ) : (
                        awaitsMe.items.map((item) => (
                            <button
                                key={awaitsMeKey(item)}
                                type="button"
                                style={styles.item}
                                onClick={() => onItemTap?.(item)}
                            >
                                {renderAwaitsItem(item)}
                            </button>
                        ))
                    )}
                </div>
            )}

            {tab === 'about-me' && (
                <div style={{ display: 'grid', gap: 4 }}>
                    {aboutMe.highlight === 0 && aboutMe.total === 0 ? (
                        <p style={styles.empty}>No mentions or replies right now.</p>
                    ) : (
                        <p style={{ fontSize: 13 }}>
                            <strong>{aboutMe.highlight}</strong> mentions ·{' '}
                            <span style={styles.empty}>
                                {aboutMe.total} unread messages total
                            </span>
                        </p>
                    )}
                </div>
            )}

            {tab === 'pulse' && (
                <div style={{ display: 'grid', gap: 4 }}>
                    {pulse.count === 0 ? (
                        <p style={styles.empty}>
                            Quiet day — the {BLACKOUT_TERMS.den.singular} hasn't stirred in 24h.
                        </p>
                    ) : (
                        <p style={{ fontSize: 13 }}>
                            <strong>{pulse.count}</strong> events in the last 24 hours.
                        </p>
                    )}
                </div>
            )}
        </section>
    );
}

function awaitsMeKey(item: AwaitsMeItem): string {
    if (item.kind === 'consent') return `consent:${item.proposalEventId}`;
    if (item.kind === 'round') return `round:${item.roundEventId}`;
    return `role:${item.roleId}`;
}

function renderAwaitsItem(item: AwaitsMeItem): JSX.Element {
    if (item.kind === 'consent') {
        return (
            <>
                <strong>Consent: {item.title}</strong>
                <div style={styles.empty}>Tap to react with 🌱 / 🌾 / 🪨.</div>
            </>
        );
    }
    if (item.kind === 'round') {
        return (
            <>
                <strong>Round: {item.prompt}</strong>
                <div style={styles.empty}>You haven't spoken yet.</div>
            </>
        );
    }
    return (
        <>
            <strong>Role: {item.roleName}</strong>
            <div style={styles.empty}>Term ends {item.termEnd.slice(0, 10)}.</div>
        </>
    );
}

export default NotificationsDrawer;
