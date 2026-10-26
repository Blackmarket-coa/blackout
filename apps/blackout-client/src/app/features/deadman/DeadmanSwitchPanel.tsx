import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DeadmanSwitchPayload, DeadmanSwitchStatus } from '@blackout/protocol';
import { applyDeadmanSwitchUpdate, canCheckIn, createDeadmanActions } from '@blackout/sdk';
import type { ApiClient } from '@blackout/sdk';

export type DeadmanSwitchPanelProps = {
    /** API client, injected so the panel can be rendered in tests/storybook. */
    apiClient: ApiClient;
};

/**
 * Times come from the API as ISO-8601 in UTC; people read them in their own
 * time zone. An unparseable value is shown as it came, never hidden.
 */
export const formatLocalTime = (iso: string): string => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
        date
    );
};

const formatStatus = (status: DeadmanSwitchStatus): string => {
    switch (status) {
        case 'armed':
            return 'Armed';
        case 'grace':
            return 'Grace period';
        case 'triggered':
            return 'Released';
        case 'cancelled':
            return 'Cancelled';
    }
};

/**
 * Every switch in the store today was armed through the API before Blackout
 * could release a message, so this is what each one does when it fires. The
 * wording is the one `docs/security/deadman-release-design-2026-10-24.md` §7
 * gives for an existing switch; the sentence about arming a new one is left
 * out because arming is not available yet.
 */
export const EXISTING_SWITCH_NOTE =
    'Armed before Blackout could release messages. When it fires, nobody is notified, and ' +
    'people named by Blackout account can read the text you supplied, through the API only.';

export const ARMING_CLOSED_NOTE = "You can't arm a new switch yet.";

/**
 * What the owner's list says about a switch: the sentences §7 of the release
 * design allows, and nothing stronger. The server keeps the timer and changes
 * a status; it notifies nobody and delivers nothing. A cancelled switch's
 * message is gone from the database only when the API no longer returns it:
 * switches cancelled before cancel cleared payloads still hold theirs.
 */
export const describeSwitch = (entry: DeadmanSwitchPayload): string => {
    switch (entry.status) {
        case 'armed':
            return (
                `Armed. Check in by ${formatLocalTime(entry.triggerAt)}. ` +
                `If you don't, it releases at ${formatLocalTime(entry.releaseAt)}.`
            );
        case 'grace':
            return `Grace period. Check in before ${formatLocalTime(
                entry.releaseAt
            )} or it releases.`;
        case 'triggered':
            return (
                `Released ${formatLocalTime(entry.updatedAt)}. Nobody was notified. ` +
                'People named by Blackout account can read the text you supplied, through the API only.'
            );
        case 'cancelled':
            return entry.encryptedPayload
                ? "Cancelled. The text you supplied is still in Blackout's database."
                : "Cancelled. The text you supplied was removed from Blackout's database.";
    }
};

/**
 * The owner's switches, with check-in and cancel. There is no arming form:
 * the API refuses to arm a switch until it can release a message to the
 * people the owner names, and the panel says so rather than pointing at an
 * SDK call.
 */
export const DeadmanSwitchPanel = ({ apiClient }: DeadmanSwitchPanelProps) => {
    const [switches, setSwitches] = useState<DeadmanSwitchPayload[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [busySwitchId, setBusySwitchId] = useState<string | null>(null);

    // Memoized on the injected client. A new actions object on every render
    // gave `refresh` a new identity each time, so the mount effect re-ran after
    // every fetch: a request loop that used up the API rate limit in seconds
    // and cleared any error alert as soon as it appeared.
    const actions = useMemo(() => createDeadmanActions(apiClient), [apiClient]);

    const refresh = useCallback(async () => {
        try {
            const response = await actions.listSwitches();
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
                setSwitches((current) => applyDeadmanSwitchUpdate(current, envelope.payload));
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
                // The server's view replaces ours rather than merging into it:
                // a cancel removes `encryptedPayload`, and a merge would keep
                // the copy we loaded earlier and say the message is still there.
                setSwitches((current) =>
                    current.map((entry) =>
                        entry.switchId === envelope.payload.switchId ? envelope.payload : entry
                    )
                );
            } catch (cause) {
                setError(cause instanceof Error ? cause.message : 'Cancel failed');
            } finally {
                setBusySwitchId(null);
            }
        },
        [actions]
    );

    return (
        <section style={{ padding: 12 }}>
            <header
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
                <h2 style={{ margin: 0 }}>Dead-man switches</h2>
                <button type="button" onClick={() => void refresh()}>
                    Refresh
                </button>
            </header>

            {error && (
                <p role="alert" style={{ color: 'tomato' }}>
                    {error}
                </p>
            )}

            <p>{ARMING_CLOSED_NOTE}</p>

            {switches.length === 0 ? (
                <p>You have no switches.</p>
            ) : (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {switches.map((entry) => {
                        const busy = busySwitchId === entry.switchId;
                        const open = canCheckIn(entry.status);
                        const holdsCancelledText =
                            entry.status === 'cancelled' && Boolean(entry.encryptedPayload);
                        return (
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
                                <p style={{ margin: '8px 0' }}>{describeSwitch(entry)}</p>
                                {open && (
                                    <p style={{ margin: '8px 0', opacity: 0.8 }}>
                                        {EXISTING_SWITCH_NOTE}
                                    </p>
                                )}
                                <small>{entry.recipients.length} recipient(s) named</small>
                                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                                    <button
                                        type="button"
                                        disabled={!open || busy}
                                        onClick={() => void handleCheckIn(entry.switchId)}
                                    >
                                        Check in
                                    </button>
                                    {holdsCancelledText ? (
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => void handleCancel(entry.switchId)}
                                        >
                                            Remove message
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            disabled={!open || busy}
                                            onClick={() => void handleCancel(entry.switchId)}
                                        >
                                            Cancel
                                        </button>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
};

export default DeadmanSwitchPanel;
