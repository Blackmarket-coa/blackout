import { DEAD_DROP_NOT_BUILT_NOTICE, type DeadDropConfig } from './useDeadDrop';

/**
 * Shown above the timeline of a room whose state has dead drop switched on.
 *
 * Until 2026-11-16 this showed a schedule ("delivers every 60 min"), a
 * countdown to the next delivery and a queue count. The countdown was the
 * interval counted down from the current second, so it never reached zero,
 * and no code ever wrote a queue count. It now says the one true thing.
 * `queueCount` stays in the props so callers need not change; it is not shown.
 */
export const DeadDropIndicator = ({ config }: { config: DeadDropConfig; queueCount?: number }) => {
    if (!config.enabled) return null;

    return (
        <aside
            role="note"
            data-testid="deaddrop-indicator"
            style={{
                border: '1px solid var(--border-default)',
                borderRadius: 10,
                background: 'var(--bg-input)',
                padding: '6px 10px',
                fontSize: 13,
            }}
        >
            {DEAD_DROP_NOT_BUILT_NOTICE}
        </aside>
    );
};

export default DeadDropIndicator;
