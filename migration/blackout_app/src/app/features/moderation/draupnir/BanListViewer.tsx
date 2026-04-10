import { useMemo, useState } from 'react';
import {
    useDraupnirClient,
    useDraupnirSnapshot,
    type DraupnirBanEntry,
    type DraupnirClientConfig,
} from './DraupnirClient';

const formatEntity = (entry: DraupnirBanEntry): string => {
    if (entry.entityType === 'user') return `User: ${entry.value}`;
    if (entry.entityType === 'server') return `Server: ${entry.value}`;
    if (entry.entityType === 'pattern') return `Pattern: ${entry.value}`;
    return entry.value;
};

export const BanListViewer = ({ config }: { config?: DraupnirClientConfig }) => {
    const draupnir = useDraupnirClient(config);
    const snapshot = useDraupnirSnapshot(config);
    const [busyValue, setBusyValue] = useState<string | null>(null);
    const [filter, setFilter] = useState('');

    const filtered = useMemo(() => {
        const q = filter.toLowerCase().trim();
        if (!snapshot) return [];
        if (!q) return snapshot.banEntries;
        return snapshot.banEntries.filter((entry) => {
            return `${entry.value} ${entry.reason ?? ''} ${entry.sourceRoomId ?? ''}`
                .toLowerCase()
                .includes(q);
        });
    }, [filter, snapshot]);

    const unban = async (entry: DraupnirBanEntry) => {
        if (!snapshot) return;

        setBusyValue(entry.value);
        try {
            await draupnir.sendCommand(snapshot.roomId, 'unban', [entry.value]);
        } finally {
            setBusyValue(null);
        }
    };

    if (!snapshot) {
        return (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Draupnir management room not found.
            </div>
        );
    }

    return (
        <section style={{ display: 'grid', gap: 10 }}>
            <header style={{ display: 'grid', gap: 4 }}>
                <h3 style={{ margin: 0 }}>Ban List Viewer</h3>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Policy list rooms watched:{' '}
                    {snapshot.policyListRooms.length > 0
                        ? snapshot.policyListRooms.join(', ')
                        : 'none discovered'}
                </div>
            </header>

            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                Search bans
                <input
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    placeholder="user/server/pattern/reason"
                />
            </label>

            <div
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 10,
                    overflow: 'hidden',
                }}
            >
                {filtered.length === 0 ? (
                    <div style={{ padding: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
                        No ban entries detected from Draupnir output.
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
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 8,
                                    alignItems: 'center',
                                }}
                            >
                                <strong>{formatEntity(entry)}</strong>
                                <button
                                    type="button"
                                    disabled={busyValue === entry.value}
                                    onClick={() => void unban(entry)}
                                    style={{
                                        border: '1px solid var(--border-default)',
                                        borderRadius: 8,
                                        background: 'var(--bg-input)',
                                        padding: '4px 8px',
                                    }}
                                >
                                    {busyValue === entry.value ? 'Unbanning…' : 'Unban'}
                                </button>
                            </div>
                            {entry.reason ? (
                                <div style={{ fontSize: 12 }}>
                                    <strong>Reason:</strong> {entry.reason}
                                </div>
                            ) : null}
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                <span>{new Date(entry.timestamp).toLocaleString()}</span>
                                {entry.sourceRoomId ? ` · Policy room: ${entry.sourceRoomId}` : ''}
                            </div>
                        </article>
                    ))
                )}
            </div>
        </section>
    );
};
