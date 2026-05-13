import React, { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type {
    PresenceDigestActivity,
    PresenceDigestPayload,
} from '@blackout/protocol';
import {
    acknowledgePresenceDigest as acknowledgePresenceDigestDefault,
    fetchPresenceDigest as fetchPresenceDigestDefault,
} from './notificationsClient';

export interface PresenceDigestPageProps {
    fetchPresenceDigest?: typeof fetchPresenceDigestDefault;
    acknowledgePresenceDigest?: typeof acknowledgePresenceDigestDefault;
}

const containerStyle: CSSProperties = { display: 'grid', gap: 16, padding: 16 };
const cardStyle: CSSProperties = {
    display: 'grid',
    gap: 8,
    padding: 12,
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    background: 'var(--bg-surface)',
};
const chipStyle = (active: boolean): CSSProperties => ({
    border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-default)'}`,
    background: active ? 'var(--accent-muted)' : 'var(--bg-input)',
    color: 'var(--text-primary)',
    borderRadius: 999,
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
});

const WINDOW_PRESETS: ReadonlyArray<{ id: 'default' | string; label: string; windowMinutes?: number }> = [
    { id: 'default', label: 'Default' },
    { id: '15m', label: '15 min', windowMinutes: 15 },
    { id: '60m', label: '1 hour', windowMinutes: 60 },
    { id: '240m', label: '4 hours', windowMinutes: 240 },
];

export function PresenceDigestPage({
    fetchPresenceDigest = fetchPresenceDigestDefault,
    acknowledgePresenceDigest = acknowledgePresenceDigestDefault,
}: PresenceDigestPageProps = {}) {
    const [digest, setDigest] = useState<PresenceDigestPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [ackPending, setAckPending] = useState(false);
    const [ackError, setAckError] = useState<string | null>(null);
    const [ackedAt, setAckedAt] = useState<string | null>(null);
    const [windowSel, setWindowSel] = useState<string>('default');

    const refresh = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const preset = WINDOW_PRESETS.find((p) => p.id === windowSel);
            const event = await fetchPresenceDigest(
                typeof preset?.windowMinutes === 'number'
                    ? { windowMinutes: preset.windowMinutes }
                    : {},
            );
            setDigest(event.payload);
            setAckedAt(null);
        } catch (error) {
            setDigest(null);
            setLoadError(
                error instanceof Error ? error.message : 'Failed to load presence digest.',
            );
        } finally {
            setLoading(false);
        }
    }, [fetchPresenceDigest, windowSel]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const onAck = useCallback(async () => {
        if (!digest) return;
        const targetId = digest.digestId;
        setAckPending(true);
        setAckError(null);
        // Optimistic move to read state: record the local ack timestamp before
        // the SDK call completes so the UI reacts immediately.
        const optimisticAckedAt = new Date().toISOString();
        setAckedAt(optimisticAckedAt);
        try {
            const event = await acknowledgePresenceDigest(targetId);
            setAckedAt(event.payload.acknowledgedAt);
        } catch (error) {
            // Roll back the optimistic update on failure.
            setAckedAt(null);
            setAckError(
                error instanceof Error
                    ? error.message
                    : 'Failed to acknowledge presence digest.',
            );
        } finally {
            setAckPending(false);
        }
    }, [acknowledgePresenceDigest, digest]);

    return (
        <main style={containerStyle} data-testid="presence-digest-page">
            <header>
                <h1 style={{ margin: 0 }}>Presence digest</h1>
                <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>
                    Latest digest of recent activity. Pick a window or stick with the server
                    default; acknowledge to clear unread state.
                </p>
            </header>

            <section
                role="group"
                aria-label="Digest window"
                style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
            >
                {WINDOW_PRESETS.map((preset) => (
                    <button
                        key={preset.id}
                        type="button"
                        data-testid={`presence-digest-window-${preset.id}`}
                        aria-pressed={windowSel === preset.id}
                        onClick={() => setWindowSel(preset.id)}
                        style={chipStyle(windowSel === preset.id)}
                    >
                        {preset.label}
                    </button>
                ))}
                <button
                    type="button"
                    data-testid="presence-digest-refresh"
                    onClick={() => void refresh()}
                    disabled={loading}
                    style={chipStyle(false)}
                >
                    Refresh
                </button>
            </section>

            <section style={cardStyle} data-testid="presence-digest-summary">
                {loadError ? (
                    <p
                        role="alert"
                        data-testid="presence-digest-load-error"
                        style={{ color: 'var(--danger)', margin: 0 }}
                    >
                        {loadError}
                    </p>
                ) : loading && !digest ? (
                    <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Loading digest…</p>
                ) : !digest ? (
                    <p
                        data-testid="presence-digest-empty"
                        style={{ color: 'var(--text-secondary)', margin: 0 }}
                    >
                        No presence digest available yet.
                    </p>
                ) : (
                    <>
                        <header
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <strong>
                                {digest.activities.length}{' '}
                                {digest.activities.length === 1 ? 'activity' : 'activities'} in
                                last {digest.windowMinutes} min
                            </strong>
                            <small style={{ color: 'var(--text-secondary)' }}>
                                {new Date(digest.generatedAt).toLocaleString()} ·{' '}
                                {digest.digestId}
                            </small>
                        </header>
                        {ackError ? (
                            <p
                                role="alert"
                                data-testid="presence-digest-ack-error"
                                style={{ color: 'var(--danger)', margin: 0 }}
                            >
                                {ackError}
                            </p>
                        ) : null}
                        <button
                            type="button"
                            data-testid="presence-digest-ack"
                            onClick={() => void onAck()}
                            disabled={ackPending || ackedAt !== null}
                            data-acked={ackedAt !== null ? 'true' : 'false'}
                            style={{
                                alignSelf: 'flex-start',
                                padding: '6px 14px',
                                borderRadius: 8,
                                border: '1px solid var(--accent-primary, #1ABC9C)',
                                background:
                                    ackedAt !== null
                                        ? 'var(--bg-input)'
                                        : 'var(--accent-primary, #1ABC9C)',
                                color: ackedAt !== null ? 'var(--text-secondary)' : '#fff',
                                cursor: ackPending ? 'progress' : 'pointer',
                            }}
                        >
                            {ackedAt !== null
                                ? `Acknowledged ${new Date(ackedAt).toLocaleTimeString()}`
                                : ackPending
                                ? 'Acknowledging…'
                                : 'Acknowledge digest'}
                        </button>
                    </>
                )}
            </section>

            {digest && digest.activities.length > 0 ? (
                <section style={{ display: 'grid', gap: 8 }}>
                    <strong>Activities</strong>
                    <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 6 }}>
                        {digest.activities.map((activity: PresenceDigestActivity) => (
                            <li
                                key={`${activity.userId}-${activity.lastActiveAt}`}
                                style={cardStyle}
                                data-testid={`presence-digest-activity-${activity.userId}`}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                    }}
                                >
                                    <strong>{activity.userId}</strong>
                                    <small style={{ color: 'var(--text-secondary)' }}>
                                        {new Date(activity.lastActiveAt).toLocaleString()}
                                    </small>
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
        </main>
    );
}

export default PresenceDigestPage;
