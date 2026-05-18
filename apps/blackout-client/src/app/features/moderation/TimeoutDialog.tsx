import { useEffect, useId, useMemo, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import type { MatrixClient } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useLegacyRoomAdapter as useRoom } from '../../plugins/matrix-adapters/hooks/useLegacyRoomAdapter';
import { useDismissOnOutsideOrEscape } from '../room/useDismissOnOutsideOrEscape';
import { stopPropagation } from '../../utils/keyboard';

const POWER_EVENT = 'm.room.power_levels';
const TIMEOUT_EVENT = 'co.bmc.timeout';

type Preset = '5m' | '1h' | '1d' | '1w' | 'custom';

const PRESET_TO_MS: Record<Exclude<Preset, 'custom'>, number> = {
    '5m': 5 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000,
};

export interface TimeoutRecord {
    userId: string;
    by: string;
    expiresAt: number;
    reason: string;
    previousPower: number;
}

const parseTimeouts = (content: Record<string, unknown> | undefined): TimeoutRecord[] => {
    if (!content || !Array.isArray(content.entries)) return [];
    return content.entries
        .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const record = item as Record<string, unknown>;
            if (typeof record.userId !== 'string') return null;
            if (typeof record.by !== 'string') return null;
            if (typeof record.expiresAt !== 'number') return null;
            if (typeof record.reason !== 'string') return null;
            if (typeof record.previousPower !== 'number') return null;
            return {
                userId: record.userId,
                by: record.by,
                expiresAt: record.expiresAt,
                reason: record.reason,
                previousPower: record.previousPower,
            };
        })
        .filter((item): item is TimeoutRecord => item !== null);
};

export const TimeoutBadge = ({ userId, roomId }: { userId: string; roomId: string }) => {
    const room = useRoom(roomId);
    const activeTimeout = useMemo(() => {
        const event = room.data?.currentState.getStateEvents(TIMEOUT_EVENT, '');
        const entries = parseTimeouts(event?.getContent<Record<string, unknown>>());
        const now = Date.now();
        return entries.find((entry) => entry.userId === userId && entry.expiresAt > now) ?? null;
    }, [room.data, userId]);

    if (!activeTimeout) return null;

    return (
        <span
            title={`Timed out until ${new Date(activeTimeout.expiresAt).toLocaleString()}`}
            style={{
                fontSize: 10,
                border: '1px solid var(--danger)',
                color: 'var(--danger)',
                borderRadius: 999,
                padding: '1px 6px',
            }}
        >
            Timed out
        </span>
    );
};

export const TimeoutDialog = ({
    roomId,
    targetUserId,
    open,
    onClose,
    onApplied,
}: {
    roomId: string;
    targetUserId: string;
    open: boolean;
    onClose: () => void;
    onApplied?: () => void;
}) => {
    const client = useMatrixClient();
    const room = useRoom(roomId);
    const [preset, setPreset] = useState<Preset>('5m');
    const [customMinutes, setCustomMinutes] = useState(30);
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const titleId = useId();

    useDismissOnOutsideOrEscape(open && !saving, null, onClose);

    const durationMs =
        preset === 'custom' ? Math.max(1, customMinutes) * 60 * 1000 : PRESET_TO_MS[preset];

    useEffect(() => {
        if (!open || !room.data) return;

        const event = room.data.currentState.getStateEvents(TIMEOUT_EVENT, '');
        const entries = parseTimeouts(event?.getContent<Record<string, unknown>>());
        const now = Date.now();

        entries
            .filter((entry) => entry.expiresAt > now)
            .forEach((entry) => {
                const delay = entry.expiresAt - now;
                window.setTimeout(() => {
                    void restoreTimeout(roomId, entry.userId, entry.previousPower, client);
                }, delay);
            });
    }, [client, open, room.data, roomId]);

    if (!open) return null;

    const applyTimeout = async () => {
        setSaving(true);
        setError(null);
        try {
            const roomRef = client.getRoom(roomId);
            if (!roomRef) throw new Error('Room not available.');

            const powerEvent = roomRef.currentState.getStateEvents(POWER_EVENT, '');
            const content = (powerEvent?.getContent<Record<string, unknown>>() ?? {}) as Record<
                string,
                unknown
            >;
            const currentUsers = (
                content.users && typeof content.users === 'object' ? content.users : {}
            ) as Record<string, number>;
            const previousPower =
                typeof currentUsers[targetUserId] === 'number' ? currentUsers[targetUserId] : 0;

            const nextUsers = { ...currentUsers, [targetUserId]: 0 };
            await client.sendStateEvent(
                roomId,
                POWER_EVENT as never,
                { ...content, users: nextUsers } as never,
                '',
            );

            const timeoutEvent = roomRef.currentState.getStateEvents(TIMEOUT_EVENT, '');
            const existing = parseTimeouts(
                timeoutEvent?.getContent<Record<string, unknown>>(),
            ).filter((entry) => !(entry.userId === targetUserId && entry.expiresAt > Date.now()));

            const expiresAt = Date.now() + durationMs;
            const me = client.getUserId() ?? 'unknown';

            const nextEntries: TimeoutRecord[] = [
                ...existing,
                {
                    userId: targetUserId,
                    by: me,
                    expiresAt,
                    reason,
                    previousPower,
                },
            ];

            await client.sendStateEvent(
                roomId,
                TIMEOUT_EVENT as never,
                { entries: nextEntries } as never,
                '',
            );

            window.setTimeout(() => {
                void restoreTimeout(roomId, targetUserId, previousPower, client);
            }, durationMs);

            onApplied?.();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to apply timeout.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <FocusTrap
            focusTrapOptions={{
                onDeactivate: onClose,
                clickOutsideDeactivates: true,
                escapeDeactivates: stopPropagation,
                tabbableOptions: { displayCheck: 'none' },
            }}
        >
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            data-testid="modal-timeout"
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 40 }}
            onClick={onClose}
        >
            <div
                style={{
                    width: 420,
                    maxWidth: '95vw',
                    margin: '12vh auto',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 12,
                    padding: 12,
                    display: 'grid',
                    gap: 10,
                    position: 'relative',
                }}
                onClick={(event) => event.stopPropagation()}
            >
                <button
                    type="button"
                    aria-label="Close"
                    onClick={onClose}
                    disabled={saving}
                    style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        fontSize: 22,
                        lineHeight: 1,
                        cursor: 'pointer',
                        padding: 4,
                    }}
                >
                    ×
                </button>
                <h3 id={titleId} style={{ margin: 0 }}>
                    Timeout user
                </h3>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                    {targetUserId}
                </p>

                <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                    Duration
                    <select
                        value={preset}
                        onChange={(event) => setPreset(event.target.value as Preset)}
                    >
                        <option value="5m">5 minutes</option>
                        <option value="1h">1 hour</option>
                        <option value="1d">1 day</option>
                        <option value="1w">1 week</option>
                        <option value="custom">Custom</option>
                    </select>
                </label>

                {preset === 'custom' ? (
                    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                        Custom duration (minutes)
                        <input
                            type="number"
                            min={1}
                            value={customMinutes}
                            onChange={(event) =>
                                setCustomMinutes(Math.max(1, Number(event.target.value) || 1))
                            }
                        />
                    </label>
                ) : null}

                <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                    Reason
                    <textarea
                        rows={3}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Optional reason"
                    />
                </label>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: 'var(--bg-input)',
                            padding: '6px 10px',
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => void applyTimeout()}
                        disabled={saving}
                        style={{
                            border: '1px solid var(--border-default)',
                            borderRadius: 8,
                            background: 'var(--danger)',
                            color: '#fff',
                            padding: '6px 10px',
                        }}
                    >
                        {saving ? 'Applying…' : 'Apply timeout'}
                    </button>
                </div>

                {error ? <div style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</div> : null}
            </div>
        </div>
        </FocusTrap>
    );
};

const restoreTimeout = async (
    roomId: string,
    userId: string,
    previousPower: number,
    client: MatrixClient,
) => {
    const room = client.getRoom(roomId);
    if (!room) return;

    const powerEvent = room.currentState.getStateEvents(POWER_EVENT, '');
    const content = (powerEvent?.getContent<Record<string, unknown>>() ?? {}) as Record<
        string,
        unknown
    >;
    const users = (
        content.users && typeof content.users === 'object' ? content.users : {}
    ) as Record<string, number>;
    if (users[userId] === previousPower) return;

    await client.sendStateEvent(
        roomId,
        POWER_EVENT as never,
        { ...content, users: { ...users, [userId]: previousPower } } as never,
        '',
    );

    const timeoutEvent = room.currentState.getStateEvents(TIMEOUT_EVENT, '');
    const entries = parseTimeouts(timeoutEvent?.getContent<Record<string, unknown>>()).filter(
        (entry) => !(entry.userId === userId && entry.expiresAt <= Date.now()),
    );

    await client.sendStateEvent(roomId, TIMEOUT_EVENT as never, { entries } as never, '');
};
