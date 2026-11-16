import MessageComposer from '../room/MessageComposer';
import { DEAD_DROP_NOT_BUILT_NOTICE } from './useDeadDrop';

/**
 * The composer for a room whose state has dead drop switched on.
 *
 * Until 2026-11-16 this showed "Dead Drop: message will be queued" and a
 * delivery-condition selector above the ordinary composer. Nothing queued
 * anything: the composer underneath sent the message to the room at once, and
 * the selector's value was read by nothing. It now says so, and the selector is
 * gone. See docs/security/trust-claims-2026-11-16.md, T8.
 */
export const DeadDropComposer = ({ roomId }: { roomId: string }) => (
    <div style={{ borderTop: '1px solid var(--border-default)' }}>
        <div
            role="note"
            data-testid="deaddrop-composer-notice"
            style={{
                borderBottom: '1px solid var(--border-default)',
                background: 'var(--bg-input)',
                padding: 10,
                fontSize: 13,
            }}
        >
            {DEAD_DROP_NOT_BUILT_NOTICE}
        </div>

        <MessageComposer roomId={roomId} />
    </div>
);

export default DeadDropComposer;
