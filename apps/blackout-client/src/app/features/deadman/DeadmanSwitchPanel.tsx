import { useCallback, useEffect, useState } from 'react';
import {
    type DeadmanSwitchPayload,
    type DeadmanSwitchStatus,
} from '@blackout/protocol';
import {
    applyDeadmanSwitchUpdate,
    canCheckIn,
    createDeadmanActions,
    type ArmDeadmanSwitchInput,
} from '@blackout/sdk';
import type { ApiClient } from '@blackout/sdk';

export type DeadmanSwitchPanelProps = {
    /** API client, injected so the panel can be rendered in tests/storybook. */
    apiClient: ApiClient;
    /** Active room id. The panel is read-only when no room is selected. */
    roomId: string | null;
};

const formatStatus = (status: DeadmanSwitchStatus): string => {
    switch (status) {
        case 'armed':
            return 'Armed';
        case 'grace':
            return 'Grace window';
        case 'triggered':
            return 'Triggered';
        case 'cancelled':
            return 'Cancelled';
    }
};

/**
 * Minimal management surface for deadman switches. Surfaces the
 * currently armed switches, exposes a check-in button, and supports
 * cancelling. Arming flow is intentionally narrow — payload encryption
 * is the caller's responsibility, so this panel only wires the API.
 */
export const DeadmanSwitchPanel = ({
    apiClient,
    roomId,
}: DeadmanSwitchPanelProps) => {
    const [switches, setSwitches] = useState<DeadmanSwitchPayload[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [busySwitchId, setBusySwitchId] = useState<string | null>(null);

    const actions = createDeadmanActions(apiClient);

    const refresh = useCallback(async () => {
        try {
            const response = await actions.listSwitches('owner');
            setSwitches(response.switches);
            setError(null);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Failed to load switches');
        }
    }, [actions]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const handleCheckIn = useCallback(
        async (switchId: string) => {
            setBusySwitchId(switchId);
            try {
                const envelope = await actions.checkIn(switchId);
                setSwitches((current) =>
                    applyDeadmanSwitchUpdate(current, envelope.payload)
                );
            } catch (cause) {
                setError(cause instanceof Error ? cause.message : 'Check-in failed');
            } finally {
                setBusySwitchId(null);
            }
        },
        [actions]
    );

    const handleCancel = useCallback(
        async (switchId: string) => {
            setBusySwitchId(switchId);
            try {
                const envelope = await actions.cancelSwitch(switchId);
                setSwitches((current) =>
                    applyDeadmanSwitchUpdate(current, envelope.payload)
                );
            } catch (cause) {
                setError(cause instanceof Error ? cause.message : 'Cancel failed');
            } finally {
                setBusySwitchId(null);
            }
        },
        [actions]
    );

    const handleArm = useCallback(
        async (input: Omit<ArmDeadmanSwitchInput, 'ownerId' | 'roomId'>) => {
            if (!roomId) return;
            try {
                const envelope = await actions.armSwitch({
                    ...input,
                    roomId,
                });
                setSwitches((current) =>
                    applyDeadmanSwitchUpdate(current, envelope.payload)
                );
            } catch (cause) {
                setError(cause instanceof Error ? cause.message : 'Arming failed');
            }
        },
        [actions, roomId]
    );

    return (
        <section style={{ padding: 12 }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>Deadman switches</h2>
                <button type="button" onClick={() => void refresh()}>
                    Refresh
                </button>
            </header>

            {error && (
                <p role="alert" style={{ color: 'tomato' }}>
                    {error}
                </p>
            )}

            {switches.length === 0 ? (
                <p>No switches armed.</p>
            ) : (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {switches.map((entry) => (
                        <li
                            key={entry.switchId}
                            style={{
                                border: '1px solid var(--border-color, #444)',
                                padding: 12,
                                marginTop: 8,
                                borderRadius: 6,
                            }}
                        >
                            <div>
                                <strong>{entry.headline ?? entry.switchId}</strong>
                                {' — '}
                                <span>{formatStatus(entry.status)}</span>
                            </div>
                            <small>
                                Trigger {entry.triggerAt} · Release {entry.releaseAt} ·{' '}
                                {entry.recipients.length} recipient(s)
                            </small>
                            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                                <button
                                    type="button"
                                    disabled={!canCheckIn(entry.status) || busySwitchId === entry.switchId}
                                    onClick={() => void handleCheckIn(entry.switchId)}
                                >
                                    Check in
                                </button>
                                <button
                                    type="button"
                                    disabled={!canCheckIn(entry.status) || busySwitchId === entry.switchId}
                                    onClick={() => void handleCancel(entry.switchId)}
                                >
                                    Cancel
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            <p style={{ opacity: 0.7, marginTop: 16 }}>
                {roomId
                    ? 'Use @blackout/sdk createDeadmanActions().armSwitch to arm a new switch tied to this room.'
                    : 'Select a room to arm a new deadman switch.'}
            </p>
            {/* Exposed for callers that wire their own arm UI; keeps this panel composable. */}
            <DeadmanArmingHint onArm={handleArm} disabled={!roomId} />
        </section>
    );
};

const DeadmanArmingHint = ({
    onArm,
    disabled,
}: {
    onArm: (input: Omit<ArmDeadmanSwitchInput, 'ownerId' | 'roomId'>) => Promise<void>;
    disabled: boolean;
}) => {
    void onArm;
    return (
        <details style={{ marginTop: 12 }} aria-disabled={disabled}>
            <summary>About arming</summary>
            <p style={{ opacity: 0.7 }}>
                The arming form lives in feature integrations that own payload
                encryption. This panel exposes the management surface only so the
                shell stays free of cryptographic decisions.
            </p>
        </details>
    );
};

export default DeadmanSwitchPanel;
