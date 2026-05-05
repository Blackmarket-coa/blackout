import { useMemo, useState } from 'react';
import type { MatrixEvent } from 'matrix-js-sdk';
import { useLegacyRoomAdapter as useRoom } from '../../plugins/matrix-adapters/hooks/useLegacyRoomAdapter';

export interface ModActionEntry {
    eventId: string;
    action: string;
    moderator: string;
    target: string;
    reason: string;
    timestamp: number;
}

const parseEvent = (event: MatrixEvent): ModActionEntry | null => {
    const content = event.getContent<Record<string, unknown>>();
    const type = event.getType();

    const action =
        (typeof content.action === 'string' ? content.action : null) ??
        (typeof content.recommendation === 'string' ? content.recommendation : null) ??
        (typeof content.outcome === 'string' ? content.outcome : null);

    if (!action && type !== 'm.room.message') return null;

    const moderator = event.getSender() ?? 'unknown';
    const target =
        (typeof content.target === 'string' ? content.target : null) ??
        (typeof content.user_id === 'string' ? content.user_id : null) ??
        (typeof content.entity === 'string' ? content.entity : null) ??
        'unknown';

    const reason =
        (typeof content.reason === 'string' ? content.reason : null) ??
        (typeof content.description === 'string' ? content.description : null) ??
        (typeof content.body === 'string' ? content.body : null) ??
        '';

    const timestamp = event.getTs();

    return {
        eventId: event.getId() ?? `${timestamp}-${moderator}`,
        action: action ?? 'message',
        moderator,
        target,
        reason,
        timestamp,
    };
};

export const ModActionLog = ({ managementRoomId }: { managementRoomId: string }) => {
    const room = useRoom(managementRoomId);
    const [actionFilter, setActionFilter] = useState('all');
    const [moderatorFilter, setModeratorFilter] = useState('');
    const [targetFilter, setTargetFilter] = useState('');
    const [query, setQuery] = useState('');

    const entries = useMemo(() => {
        const events = room.data?.getLiveTimeline().getEvents() ?? [];
        return events
            .map(parseEvent)
            .filter((item): item is ModActionEntry => item !== null)
            .sort((a, b) => b.timestamp - a.timestamp);
    }, [room.data]);

    const actionOptions = useMemo(
        () => ['all', ...new Set(entries.map((entry) => entry.action))],
        [entries],
    );

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return entries.filter((entry) => {
            if (actionFilter !== 'all' && entry.action !== actionFilter) return false;
            if (
                moderatorFilter &&
                !entry.moderator.toLowerCase().includes(moderatorFilter.toLowerCase())
            )
                return false;
            if (targetFilter && !entry.target.toLowerCase().includes(targetFilter.toLowerCase()))
                return false;
            if (!q) return true;
            return `${entry.action} ${entry.moderator} ${entry.target} ${entry.reason}`
                .toLowerCase()
                .includes(q);
        });
    }, [actionFilter, entries, moderatorFilter, query, targetFilter]);

    return (
        <section style={{ display: 'grid', gap: 10 }}>
            <header>
                <h3 style={{ margin: 0 }}>Moderation Action Log</h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                    Timeline of Draupnir management room actions.
                </p>
            </header>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 8,
                }}
            >
                <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                    Action type
                    <select
                        value={actionFilter}
                        onChange={(event) => setActionFilter(event.target.value)}
                    >
                        {actionOptions.map((option) => (
                            <option key={option} value={option}>
                                {option}
                            </option>
                        ))}
                    </select>
                </label>
                <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                    Moderator
                    <input
                        value={moderatorFilter}
                        onChange={(event) => setModeratorFilter(event.target.value)}
                        placeholder="@mod:server"
                    />
                </label>
                <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                    Target user
                    <input
                        value={targetFilter}
                        onChange={(event) => setTargetFilter(event.target.value)}
                        placeholder="@target:server"
                    />
                </label>
                <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                    Search
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="reason or action"
                    />
                </label>
            </div>

            <div
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 10,
                    overflow: 'hidden',
                }}
            >
                {filtered.length === 0 ? (
                    <div style={{ padding: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
                        No moderation log entries found.
                    </div>
                ) : (
                    filtered.map((entry, index) => (
                        <article
                            key={entry.eventId}
                            style={{
                                padding: 10,
                                borderTop: index === 0 ? 'none' : '1px solid var(--border-default)',
                                display: 'grid',
                                gap: 4,
                                background: 'var(--bg-input)',
                            }}
                        >
                            <div
                                style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}
                            >
                                <strong>{entry.action}</strong>
                                <time style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                    {new Date(entry.timestamp).toLocaleString()}
                                </time>
                            </div>
                            <div style={{ fontSize: 12 }}>
                                <strong>Who:</strong> {entry.moderator}
                            </div>
                            <div style={{ fontSize: 12 }}>
                                <strong>Target:</strong> {entry.target}
                            </div>
                            {entry.reason ? (
                                <div style={{ fontSize: 12 }}>
                                    <strong>Reason:</strong> {entry.reason}
                                </div>
                            ) : null}
                        </article>
                    ))
                )}
            </div>
        </section>
    );
};
