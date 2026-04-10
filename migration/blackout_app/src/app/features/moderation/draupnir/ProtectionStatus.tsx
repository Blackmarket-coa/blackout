import { useState } from 'react';
import {
    useDraupnirClient,
    useDraupnirSnapshot,
    type DraupnirClientConfig,
} from './DraupnirClient';

const indicatorStyle = (enabled: boolean) => ({
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: enabled ? '#22C55E' : '#9CA3AF',
    display: 'inline-block',
});

export const ProtectionStatus = ({ config }: { config?: DraupnirClientConfig }) => {
    const draupnir = useDraupnirClient(config);
    const snapshot = useDraupnirSnapshot(config);
    const [pendingKey, setPendingKey] = useState<string | null>(null);

    const toggle = async (key: string, nextEnabled: boolean) => {
        if (!snapshot) return;
        setPendingKey(key);
        try {
            await draupnir.sendCommand(snapshot.roomId, 'protection', [
                nextEnabled ? 'enable' : 'disable',
                key,
            ]);
        } finally {
            setPendingKey(null);
        }
    };

    if (!snapshot)
        return (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                No Draupnir room found.
            </div>
        );

    return (
        <section style={{ display: 'grid', gap: 10 }}>
            <header>
                <h3 style={{ margin: 0 }}>Protection Status</h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                    Toggle protections through Draupnir commands in the management room.
                </p>
            </header>

            <div
                style={{
                    border: '1px solid var(--border-default)',
                    borderRadius: 10,
                    overflow: 'hidden',
                }}
            >
                {snapshot.protections.length === 0 ? (
                    <div style={{ padding: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
                        No protection status discovered yet.
                    </div>
                ) : (
                    snapshot.protections.map((protection, index) => (
                        <article
                            key={protection.sourceEventId}
                            style={{
                                padding: 10,
                                borderTop: index === 0 ? 'none' : '1px solid var(--border-default)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 8,
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={indicatorStyle(protection.enabled)} />
                                <strong>{protection.key}</strong>
                                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                    {protection.enabled ? 'active' : 'disabled'}
                                </span>
                            </div>
                            <button
                                type="button"
                                disabled={pendingKey === protection.key}
                                onClick={() => void toggle(protection.key, !protection.enabled)}
                                style={{
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 8,
                                    background: 'var(--bg-input)',
                                    padding: '4px 8px',
                                }}
                            >
                                {pendingKey === protection.key
                                    ? 'Sending…'
                                    : protection.enabled
                                      ? 'Disable'
                                      : 'Enable'}
                            </button>
                        </article>
                    ))
                )}
            </div>
        </section>
    );
};
