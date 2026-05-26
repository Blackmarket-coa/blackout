import React, { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
    COALITION_STATE_EVENT_TYPE,
    type CoalitionKit,
    type CoalitionStateEventContent,
} from '@blackout/core';
import { useCoalitionKits, type CoalitionScopeQuery } from '../hooks/useCoalitionFeed';
import { applyKit, fetchAppliedKits, type KitApplication } from '../coalitionClient';
import { useMatrixClientOrNull } from '../../../hooks/useMatrixClient';

export interface KitsTabProps {
    scope: CoalitionScopeQuery;
}

const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
    height: '100%',
    minHeight: 0,
    overflowY: 'auto',
};
const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 12,
    borderRadius: 10,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-surface)',
};
const buttonStyle: CSSProperties = {
    padding: '6px 12px',
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    background: 'var(--accent-primary, #1ABC9C)',
    color: '#04201b',
    fontWeight: 600,
    cursor: 'pointer',
};
const labelStyle: CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 };
const rowStyle: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' };

export default function KitsTab({ scope }: KitsTabProps): React.ReactElement {
    const { data, loading, error } = useCoalitionKits();
    const mx = useMatrixClientOrNull();
    const [applied, setApplied] = useState<KitApplication[]>([]);
    const [busyKit, setBusyKit] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const denId = scope.denId;

    // After applying a kit, write the den's co.bmc.coalition state so the kit's
    // recommended tabs actually turn on (merging with any existing config).
    const writeEnabledTabs = useCallback(
        async (kit: CoalitionKit) => {
            if (!mx || !denId) return;
            const existing = mx
                .getRoom(denId)
                ?.currentState?.getStateEvents(COALITION_STATE_EVENT_TYPE, '')
                ?.getContent<CoalitionStateEventContent>();
            const merged: CoalitionStateEventContent = {
                ...(existing ?? {}),
                enabled: true,
                enabledTabs: kit.enabledTabs,
            };
            await mx.sendStateEvent(denId, COALITION_STATE_EVENT_TYPE as never, merged as never, '');
        },
        [mx, denId],
    );

    const reloadApplied = useCallback(async () => {
        if (!denId) return;
        try {
            const res = await fetchAppliedKits('den', denId);
            setApplied(res.applications);
        } catch {
            setApplied([]);
        }
    }, [denId]);

    useEffect(() => {
        void reloadApplied();
    }, [reloadApplied]);

    const apply = useCallback(
        async (kit: CoalitionKit) => {
            if (!denId) return;
            setBusyKit(kit.id);
            setMessage(null);
            try {
                await applyKit(kit.id, { scopeType: 'den', scopeId: denId });
                try {
                    await writeEnabledTabs(kit);
                    setMessage(`Applied "${kit.name}" and enabled its tabs.`);
                } catch {
                    setMessage(
                        `Applied "${kit.name}". Enable these tabs manually: ${kit.enabledTabs.join(', ')}.`,
                    );
                }
                void reloadApplied();
            } catch (err) {
                setMessage(err instanceof Error ? err.message : 'Could not apply kit.');
            } finally {
                setBusyKit(null);
            }
        },
        [denId, reloadApplied, writeEnabledTabs],
    );

    const kits = data?.kits ?? [];
    const appliedKitIds = new Set(applied.map((a) => a.kitId));

    return (
        <div style={containerStyle}>
            <strong style={{ fontSize: 18 }}>Setup kits</strong>
            {!denId ? (
                <span style={labelStyle}>Open this Coalition inside a den to apply a kit.</span>
            ) : null}
            {message ? <span style={{ fontSize: 13 }}>{message}</span> : null}
            {loading ? <span style={labelStyle}>Loading kits…</span> : null}
            {error ? <span style={{ color: 'var(--danger, #e74c3c)' }}>{error}</span> : null}

            {kits.map((kit) => (
                <div key={kit.id} style={cardStyle}>
                    <div style={rowStyle}>
                        <strong style={{ flex: 1 }}>{kit.name}</strong>
                        {appliedKitIds.has(kit.id) ? <span style={labelStyle}>applied</span> : null}
                    </div>
                    <p style={{ margin: 0, fontSize: 14 }}>{kit.description}</p>
                    <span style={labelStyle}>Tabs: {kit.enabledTabs.join(' · ')}</span>
                    <div style={rowStyle}>
                        <button
                            type="button"
                            style={buttonStyle}
                            onClick={() => apply(kit)}
                            disabled={!denId || busyKit === kit.id}
                        >
                            {busyKit === kit.id ? 'Applying…' : 'Apply to this den'}
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
