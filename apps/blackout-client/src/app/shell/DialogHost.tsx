import { useCallback, useEffect, useState } from 'react';
import { LogoutDialog } from '../components/LogoutDialog';
import { TimeoutDialog } from '../features/moderation/TimeoutDialog';
import { registerModalOpener } from './modalOpenerRegistry';

/**
 * Audit-only host that mounts modals which otherwise lack a persistent
 * mount point in the AppShell. Production logout/timeout flows continue
 * to render their own dialog instances from feature contexts (Settings,
 * moderation surfaces); this host exists so the navigation audit can
 * reach those dialogs deterministically via `window.__openModal(name)`.
 *
 * Gated on `window.__BLACKOUT_AUDIT__ === true` so the host is inert in
 * regular dev/production sessions and adds zero behavioral risk to the
 * existing logout flow.
 */

type AuditTimeoutArgs = {
    roomId?: string;
    targetUserId?: string;
};

const AUDIT_ROOM_ID = '!audit:example.com';
const AUDIT_USER_ID = '@audit:example.com';

export const DialogHost = () => {
    const [auditEnabled, setAuditEnabled] = useState(false);
    const [logoutOpen, setLogoutOpen] = useState(false);
    const [timeout, setTimeout] = useState<{ roomId: string; targetUserId: string } | null>(
        null
    );

    useEffect(() => {
        const win = window as unknown as { __BLACKOUT_AUDIT__?: boolean };
        setAuditEnabled(win.__BLACKOUT_AUDIT__ === true);
    }, []);

    const openLogout = useCallback(() => setLogoutOpen(true), []);
    const closeLogout = useCallback(() => setLogoutOpen(false), []);
    const openTimeout = useCallback((args?: Record<string, unknown>) => {
        const next = (args ?? {}) as AuditTimeoutArgs;
        setTimeout({
            roomId: next.roomId ?? AUDIT_ROOM_ID,
            targetUserId: next.targetUserId ?? AUDIT_USER_ID,
        });
    }, []);
    const closeTimeout = useCallback(() => setTimeout(null), []);

    useEffect(() => {
        if (!auditEnabled) return undefined;
        const unregisterLogout = registerModalOpener('logout', openLogout, closeLogout);
        const unregisterTimeout = registerModalOpener('timeout', openTimeout, closeTimeout);
        return () => {
            unregisterLogout();
            unregisterTimeout();
        };
    }, [auditEnabled, openLogout, closeLogout, openTimeout, closeTimeout]);

    if (!auditEnabled) return null;

    return (
        <>
            {logoutOpen ? <LogoutDialog handleClose={closeLogout} /> : null}
            {timeout ? (
                <TimeoutDialog
                    roomId={timeout.roomId}
                    targetUserId={timeout.targetUserId}
                    open
                    onClose={closeTimeout}
                />
            ) : null}
        </>
    );
};

export default DialogHost;
