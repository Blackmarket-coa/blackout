import { useCallback, useEffect, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import { Button, Icon, IconButton, Icons, Text } from 'folds';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useAlive } from '../../../hooks/useAlive';
import { useKeyBackupStatusChange } from '../../../hooks/useKeyBackup';
import {
    KeyBackupGuardOverlay,
    useAnswerTurns,
    useKeyBackupSetupGuard,
    type KeyBackupGuardResult,
} from '../../../components/KeyBackupSetupGuard';
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
import { KEY_BACKUP_NUDGE_GUARD_TEXTS, selectKeyBackupNudge } from './encryptionPosture';

/**
 * Nudge shown while this device has no active key backup.
 *
 * A backup keeps copies of message keys on the homeserver, locked with a
 * recovery key: the keys of the device that set it up, and of any other
 * session that trusts it. Another Matrix app signed in with that key can
 * restore the messages those keys open. Blackout has no screen that restores
 * from a backup or verifies a device yet, so a Blackout session signed in
 * later neither restores from the backup nor adds to it, and a backup does
 * not bring older messages back after a new sign-in here. The text says so.
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
 * The banner's row can be stale: nothing refreshes it when another device of
 * the account sets up cross-signing and a backup (the SDK emits
 * `KeyBackupStatus` only for this device's own backup). So the button never
 * opens a flow from the stored row. It re-asks the homeserver at the click
 * (`useKeyBackupSetupGuard`) and opens the setup or the reset only on the
 * answer to the latest click; otherwise the overlay shows that answer's row
 * text. The banner shows the newest answer, from a click or a refresh: an
 * answer that arrives after a later one was asked for is dropped
 * (`useAnswerTurns`), and a refresh asked for while a click's check is in
 * flight waits for it, so the overlay never shows an answer older than the
 * banner's. The setup form checks once more before its first write.
 *
 * If a device check rejects (the crypto layer is closing, say), the nudge
 * renders nothing: this device's state is unknown, so nothing is offered and
 * nothing is claimed.
 *
 * Dismissing snoozes the nudge for a week; it hides the moment this device's
 * backup is active. The overlay is rendered apart from the banner, so a setup
 * under way (the recovery key on screen) stays up when the banner hides.
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
    const warned = useRef(false);
    const guard = useKeyBackupSetupGuard(mx, KEY_BACKUP_NUDGE_GUARD_TEXTS);
    const { open: openGuard } = guard;
    // The account's answer comes from refreshes and from clicks; this
    // device's backup state from refreshes only. Each keeps its own turns.
    const accountTurns = useAnswerTurns();
    const deviceTurns = useAnswerTurns();
    const clicksInFlight = useRef(0);
    const refreshWaiting = useRef(false);

    const refresh = useCallback(async () => {
        if (!crypto) return;
        // A click's check is in flight and its answer goes to the overlay. A
        // refresh started now could answer first and be newer, and the
        // overlay would then show an older answer than the banner. It runs
        // once the click's answer is in.
        if (clicksInFlight.current > 0) {
            refreshWaiting.current = true;
            return;
        }
        const accountTurn = accountTurns.next();
        const deviceTurn = deviceTurns.next();
        try {
            const [cs, backupVersion, account] = await Promise.all([
                crypto.isCrossSigningReady(),
                crypto.getActiveSessionBackupVersion(),
                checkAccountKeyState(mx),
            ]);
            if (!alive()) return;
            if (deviceTurns.isLatest(deviceTurn)) {
                setKeyBackupReady(typeof backupVersion === 'string');
                setLoaded(true);
            }
            if (accountTurns.isLatest(accountTurn)) {
                setCrossSigningReady(cs);
                setAccountState(accountKeyVerdict(account, cs));
            }
        } catch (error) {
            // Only the two device checks can reject (`checkAccountKeyState`
            // never throws). This device's state is then unknown, so the
            // nudge stays hidden rather than offer or claim anything.
            if (!alive() || !deviceTurns.isLatest(deviceTurn)) return;
            setLoaded(false);
            if (!warned.current) {
                warned.current = true;
                console.warn(
                    'KeyBackupNudge: this device’s crypto state could not be read; the nudge stays hidden',
                    error
                );
            }
        }
    }, [mx, crypto, alive, accountTurns, deviceTurns]);

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

    // The click asks the homeserver again and opens the overlay on the fresh
    // answer; the banner follows that answer too, so a button the answer
    // removed is gone. The click takes an account turn, so a refresh that
    // started before it and answers after it is dropped. `openGuard`
    // resolves null for an answer it dropped (a later click or a close came
    // first), and no refresh starts while the click's check is in flight, so
    // an answer it does return is the newest one asked for.
    const handleAction = useCallback(async () => {
        accountTurns.next();
        clicksInFlight.current += 1;
        let result: KeyBackupGuardResult | null;
        try {
            result = await openGuard();
        } finally {
            clicksInFlight.current -= 1;
        }
        if (result && alive()) {
            setCrossSigningReady(result.crossSigningReady);
            setAccountState(result.verdict);
        }
        if (clicksInFlight.current === 0 && refreshWaiting.current) {
            refreshWaiting.current = false;
            void refresh();
        }
    }, [openGuard, alive, accountTurns, refresh]);

    // Nothing renders until this device's state and the homeserver's answer
    // are both in, so no action can flash that the answer would remove.
    const verdict =
        crypto && loaded
            ? selectKeyBackupNudge({ crossSigningReady, keyBackupReady, accountState })
            : null;
    const showBanner = verdict !== null && Date.now() >= snoozeUntil;

    // Only the two rows that offer an action render the button.
    const action = verdict?.actions[0];

    return (
        <>
            {showBanner && (
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
                                onClick={() => void handleAction()}
                            >
                                <Text as="span" size="B300">
                                    {action.label}
                                </Text>
                            </Button>
                        )}
                    </div>
                </div>
            )}

            <KeyBackupGuardOverlay guard={guard} />
        </>
    );
}
