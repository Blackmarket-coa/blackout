import { useEffect, useState } from 'react';
import {
    useDeadDrop,
    useDeadDropQueueActions,
    useSetDeadDrop,
    type DeadDropConfig,
    type DeadDropScheduleType,
} from './useDeadDrop';
import { useDeadDropQuota } from './useDeadDropQuota';

export const DeadDropSettings = ({ roomId }: { roomId: string }) => {
    const deadDrop = useDeadDrop(roomId);
    const setDeadDrop = useSetDeadDrop(roomId);
    const queueActions = useDeadDropQueueActions(roomId);
    const quota = useDeadDropQuota();
    const [saving, setSaving] = useState(false);
    const [draft, setDraft] = useState<DeadDropConfig>(deadDrop.data);

    useEffect(() => {
        setDraft(deadDrop.data);
    }, [deadDrop.data]);

    const retentionExceeded = draft.retentionHours > quota.quotas.maxRetentionHours;
    const cantSchedule = !quota.canUseScheduledFlush && draft.schedule.type !== 'manual';
    const cantAnonymize = draft.anonymize && !quota.canUseCoverSender;

    const onScheduleTypeChange = (type: DeadDropScheduleType) => {
        setDraft((prev) => ({
            ...prev,
            schedule: {
                ...prev.schedule,
                type,
            },
        }));
    };

    const save = async () => {
        setSaving(true);
        try {
            await setDeadDrop(draft);
        } finally {
            setSaving(false);
        }
    };

    return (
        <section
            style={{
                border: '1px solid var(--border-default)',
                borderRadius: 12,
                padding: 12,
                display: 'grid',
                gap: 10,
            }}
        >
            <h4 style={{ margin: 0 }}>Dead Drop Settings</h4>

            <div
                data-testid="deaddrop-tier-banner"
                style={{
                    border: '1px dashed var(--border-default)',
                    borderRadius: 8,
                    padding: 8,
                    fontSize: 12,
                    opacity: 0.85,
                }}
            >
                <strong>Tier: {quota.tier}</strong> — max payload{' '}
                {quota.quotas.maxPayloadBytes.toLocaleString()} bytes · max retention{' '}
                {quota.quotas.maxRetentionHours} h · recipients{' '}
                {quota.quotas.maxRecipients === -1 ? 'unlimited' : quota.quotas.maxRecipients} ·
                decoys per fetch {quota.quotas.decoysPerFetch}
                {quota.canUseQuorum ? ' · quorum opens enabled' : ''}
            </div>

            {retentionExceeded ? (
                <p
                    role="alert"
                    data-testid="deaddrop-retention-warning"
                    style={{ margin: 0, color: 'var(--accent-warning)' }}
                >
                    Retention exceeds your tier limit ({quota.quotas.maxRetentionHours} h). Lower it
                    or upgrade.
                </p>
            ) : null}
            {cantSchedule ? (
                <p
                    role="alert"
                    data-testid="deaddrop-schedule-warning"
                    style={{ margin: 0, color: 'var(--accent-warning)' }}
                >
                    Scheduled flush requires the Pro tier or higher. Switch to Manual or upgrade.
                </p>
            ) : null}
            {cantAnonymize ? (
                <p
                    role="alert"
                    data-testid="deaddrop-anonymize-warning"
                    style={{ margin: 0, color: 'var(--accent-warning)' }}
                >
                    Anonymized delivery (cover sender) requires the Pro tier or higher.
                </p>
            ) : null}

            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(event) =>
                        setDraft((prev) => ({ ...prev, enabled: event.target.checked }))
                    }
                />
                Enabled
            </label>

            <label>
                Schedule type
                <select
                    value={draft.schedule.type}
                    onChange={(event) =>
                        onScheduleTypeChange(event.target.value as DeadDropScheduleType)
                    }
                    style={{ marginLeft: 8 }}
                >
                    <option value="interval">Interval</option>
                    <option value="cron">Cron</option>
                    <option value="manual">Manual</option>
                </select>
            </label>

            {draft.schedule.type === 'interval' ? (
                <label>
                    Interval minutes
                    <input
                        type="number"
                        min={1}
                        value={draft.schedule.intervalMinutes ?? 60}
                        onChange={(event) =>
                            setDraft((prev) => ({
                                ...prev,
                                schedule: {
                                    ...prev.schedule,
                                    intervalMinutes: Number(event.target.value),
                                },
                            }))
                        }
                        style={{ marginLeft: 8 }}
                    />
                </label>
            ) : null}

            {draft.schedule.type === 'cron' ? (
                <label>
                    Cron expression
                    <input
                        value={draft.schedule.cronExpression ?? '0 * * * *'}
                        onChange={(event) =>
                            setDraft((prev) => ({
                                ...prev,
                                schedule: { ...prev.schedule, cronExpression: event.target.value },
                            }))
                        }
                        style={{ marginLeft: 8, width: 180 }}
                    />
                </label>
            ) : null}

            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                    type="checkbox"
                    checked={draft.anonymize}
                    onChange={(event) =>
                        setDraft((prev) => ({ ...prev, anonymize: event.target.checked }))
                    }
                />
                Anonymize delivery via bot account
            </label>

            <label>
                Max queue size
                <input
                    type="number"
                    min={1}
                    value={draft.maxQueueSize}
                    onChange={(event) =>
                        setDraft((prev) => ({ ...prev, maxQueueSize: Number(event.target.value) }))
                    }
                    style={{ marginLeft: 8 }}
                />
            </label>

            <label>
                Retention hours
                <input
                    type="number"
                    min={1}
                    value={draft.retentionHours}
                    onChange={(event) =>
                        setDraft((prev) => ({
                            ...prev,
                            retentionHours: Number(event.target.value),
                        }))
                    }
                    style={{ marginLeft: 8 }}
                />
            </label>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => void save()} disabled={saving}>
                    {saving ? 'Saving…' : 'Save dead drop config'}
                </button>
                <button type="button" onClick={() => void queueActions.flush()}>
                    Flush queue
                </button>
                <button type="button" onClick={() => void queueActions.clear()}>
                    Clear queue
                </button>
            </div>

            <small style={{ opacity: 0.8 }}>Current queue count: {deadDrop.queueCount}</small>
            <small style={{ opacity: 0.8 }}>
                Schema v{deadDrop.diagnostics.schemaVersion} • migrated:{' '}
                {String(deadDrop.diagnostics.migrated)} • invalid events:{' '}
                {deadDrop.diagnostics.invalidStateEvents}
            </small>
        </section>
    );
};

export default DeadDropSettings;
