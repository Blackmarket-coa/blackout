import { useCallback, useEffect, useState } from 'react';
import { useAtom } from 'jotai';
import {
    Button,
    Icon,
    IconButton,
    Icons,
    Overlay,
    OverlayBackdrop,
    OverlayCenter,
    Text,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useAlive } from '../../../hooks/useAlive';
import { useKeyBackupStatusChange } from '../../../hooks/useKeyBackup';
import {
    DeviceVerificationReset,
    DeviceVerificationSetup,
} from '../../../components/DeviceVerificationSetup';
import {
    atomWithLocalStorage,
    getLocalStorageItem,
    setLocalStorageItem,
} from '../../../state/utils/atomWithLocalStorage';
import {
    accountKeyVerdict,
    checkAccountKeyState,
    type AccountKeyVerdict,
} from '../../../../client/keyBackupCheck';
import { selectKeyBackupNudge } from './encryptionPosture';

/**
 * Nudge shown while this device has no active key backup.
 *
 * A backup keeps copies of message keys on the homeserver, locked with a
 * recovery key. Another Matrix app signed in with that key can restore older
 * messages from it. Blackout has no screen that restores from a backup yet,
 * so here a backup does not bring older messages back after a new sign-in,
 * and the text says so.
 *
 * What it offers depends on what the ACCOUNT has on the homeserver, not on
 * this device: `isCrossSigningReady()` and `getActiveSessionBackupVersion()`
 * are false on every new device, whatever the account has, and the
 * from-scratch setup (`DeviceVerificationSetup`) replaces the account's secret
 * storage and cross-signing and deletes every backup version it has. So each
 * refresh also asks the homeserver (`checkAccountKeyState`) and the nudge
 * stays hidden until that answer is in, so it never flashes an action the
 * answer would remove. The setup is offered only when the homeserver answered
 * that the account has neither a backup nor cross-signing; the warned reset
 * (`DeviceVerificationReset`) only when it has cross-signing that this device
 * already trusts and no backup; otherwise nothing is offered and the text
 * says why (see `selectKeyBackupNudge` for the table).
 *
 * Dismissing snoozes the nudge for a week; it hides the moment this device's
 * backup is active.
 */

const SNOOZE_KEY = 'blackout.keyBackupNudge.snoozeUntil';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

const keyBackupNudgeSnoozeAtom = atomWithLocalStorage<number>(
    SNOOZE_KEY,
    (key) => getLocalStorageItem<number>(key, 0),
    setLocalStorageItem
);

export function KeyBackupNudge() {
    const mx = useMatrixClient();
    const crypto = mx.getCrypto();
    const alive = useAlive();

    const [loaded, setLoaded] = useState(false);
    const [crossSigningReady, setCrossSigningReady] = useState(false);
    const [keyBackupReady, setKeyBackupReady] = useState(false);
    const [accountState, setAccountState] = useState<AccountKeyVerdict>('unknown');
    const [snoozeUntil, setSnoozeUntil] = useAtom(keyBackupNudgeSnoozeAtom);
    const [setupOpen, setSetupOpen] = useState(false);

    const refresh = useCallback(async () => {
        if (!crypto) return;
        const [cs, backupVersion, account] = await Promise.all([
            crypto.isCrossSigningReady(),
            crypto.getActiveSessionBackupVersion(),
            checkAccountKeyState(mx),
        ]);
        if (!alive()) return;
        setCrossSigningReady(cs);
        setKeyBackupReady(typeof backupVersion === 'string');
        setAccountState(accountKeyVerdict(account, cs));
        setLoaded(true);
    }, [mx, crypto, alive]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    // Re-evaluate when the backup status changes (e.g. once setup completes),
    // so the banner hides itself without a reload.
    useKeyBackupStatusChange(
        useCallback(() => {
            void refresh();
        }, [refresh])
    );

    const handleSnooze = useCallback(() => {
        setSnoozeUntil(Date.now() + SNOOZE_MS);
    }, [setSnoozeUntil]);

    // Nothing renders until this device's state and the homeserver's answer
    // are both in, so no action can flash that the answer would remove.
    if (!crypto || !loaded) return null;

    const verdict = selectKeyBackupNudge({ crossSigningReady, keyBackupReady, accountState });
    if (!verdict) return null;
    if (Date.now() < snoozeUntil) return null;

    // Only the two rows that offer an action render the button and the flow.
    const action = verdict.actions[0];

    return (
        <>
            <div
                role="status"
                aria-live="polite"
                style={{
                    position: 'fixed',
                    left: '50%',
                    bottom: 16,
                    transform: 'translateX(-50%)',
                    zIndex: 40,
                    width: 'calc(100% - 32px)',
                    maxWidth: 520,
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 10,
                    boxShadow: '0 8px 24px rgba(0,0,0,.28)',
                    padding: 14,
                    display: 'grid',
                    gap: 12,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <span aria-hidden="true" style={{ fontSize: 18, lineHeight: '20px' }}>
                        🛟
                    </span>
                    <div style={{ flex: 1, display: 'grid', gap: 4 }}>
                        <Text size="T300">
                            <b>{verdict.headline}</b>
                        </Text>
                        <Text size="T200" style={{ color: 'var(--text-secondary)' }}>
                            {verdict.detail}
                        </Text>
                    </div>
                    <IconButton
                        size="300"
                        radii="300"
                        variant="Surface"
                        aria-label="Dismiss for now"
                        onClick={handleSnooze}
                    >
                        <Icon size="100" src={Icons.Cross} />
                    </IconButton>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <Button
                        size="300"
                        variant="Secondary"
                        fill="Soft"
                        radii="300"
                        onClick={handleSnooze}
                    >
                        <Text as="span" size="B300">
                            Not now
                        </Text>
                    </Button>
                    {action && (
                        <Button
                            size="300"
                            variant="Primary"
                            radii="300"
                            onClick={() => setSetupOpen(true)}
                        >
                            <Text as="span" size="B300">
                                {action.label}
                            </Text>
                        </Button>
                    )}
                </div>
            </div>

            {action && setupOpen && (
                <Overlay open backdrop={<OverlayBackdrop />}>
                    <OverlayCenter>
                        <FocusTrap
                            focusTrapOptions={{
                                initialFocus: false,
                                clickOutsideDeactivates: false,
                                escapeDeactivates: false,
                            }}
                        >
                            {crossSigningReady ? (
                                <DeviceVerificationReset onCancel={() => setSetupOpen(false)} />
                            ) : (
                                <DeviceVerificationSetup onCancel={() => setSetupOpen(false)} />
                            )}
                        </FocusTrap>
                    </OverlayCenter>
                </Overlay>
            )}
        </>
    );
}
