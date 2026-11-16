import { useState } from 'react';
import { DEAD_DROP_NOT_BUILT_NOTICE, useDeadDrop, useSetDeadDrop } from './useDeadDrop';

/** What the panel says for a room that does not have dead drop switched on. */
export const DEAD_DROP_NOTHING_TO_CONFIGURE =
    "Dead drop for rooms (queued, scheduled and anonymized delivery) is planned and not built yet. There is nothing to switch on: messages in a room are delivered at once, under the sender's own name.";

/**
 * The dead-drop panel for a room.
 *
 * Until 2026-11-16 this was a form: schedule type, interval or cron
 * expression, "Anonymize delivery via bot account", queue size, retention,
 * "Flush queue" and "Clear queue", with a tier banner and prompts to upgrade
 * to Pro for scheduled flush and anonymized delivery. It wrote the room's
 * `co.bmc.deaddrop` state, which nothing but this client's UI reads; no
 * queue, schedule or cover sender exists on any tier.
 *
 * What is left is what is true: a statement that the feature is not built,
 * and, for a room that has the state switched on, a way to switch it off so
 * the notice goes away. The stored schedule and limits are kept as they are.
 *
 * `hideWhenOff` is for the room view, where a panel about a feature that does
 * not exist should not sit under every composer.
 */
export const DeadDropSettings = ({
    roomId,
    hideWhenOff = false,
}: {
    roomId: string;
    hideWhenOff?: boolean;
}) => {
    const deadDrop = useDeadDrop(roomId);
    const setDeadDrop = useSetDeadDrop(roomId);
    const [saving, setSaving] = useState(false);
    const [failed, setFailed] = useState(false);

    const enabled = deadDrop.data.enabled;
    if (!enabled && hideWhenOff) return null;

    const switchOff = async () => {
        setSaving(true);
        setFailed(false);
        try {
            await setDeadDrop({ ...deadDrop.data, enabled: false });
        } catch {
            setFailed(true);
        } finally {
            setSaving(false);
        }
    };

    return (
        <section
            data-testid="deaddrop-settings"
            style={{
                border: '1px solid var(--border-default)',
                borderRadius: 12,
                padding: 12,
                display: 'grid',
                gap: 10,
            }}
        >
            <h4 style={{ margin: 0 }}>Dead Drop</h4>
            <p role="note" data-testid="deaddrop-settings-notice" style={{ margin: 0 }}>
                {enabled ? DEAD_DROP_NOT_BUILT_NOTICE : DEAD_DROP_NOTHING_TO_CONFIGURE}
            </p>
            {enabled ? (
                <>
                    <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>
                        The setting does one thing: it shows this notice to everyone in the room.
                    </p>
                    <div>
                        <button
                            type="button"
                            onClick={() => void switchOff()}
                            disabled={saving}
                            data-testid="deaddrop-switch-off"
                        >
                            {saving ? 'Switching off…' : 'Switch off dead drop for this room'}
                        </button>
                    </div>
                    {failed ? (
                        <p
                            role="alert"
                            style={{ margin: 0, color: 'var(--color-danger, #e5484d)' }}
                        >
                            Could not switch it off. You may not have permission to change this
                            room&apos;s settings.
                        </p>
                    ) : null}
                </>
            ) : null}
        </section>
    );
};

export default DeadDropSettings;
