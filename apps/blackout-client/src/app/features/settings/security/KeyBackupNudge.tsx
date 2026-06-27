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
import { DeviceVerificationSetup } from '../../../components/DeviceVerificationSetup';
import {
    atomWithLocalStorage,
    getLocalStorageItem,
    setLocalStorageItem,
} from '../../../state/utils/atomWithLocalStorage';
import { selectKeyBackupNudge } from './encryptionPosture';

/**
 * Discoverable nudge prompting users who have no encrypted message backup to
 * set one up, so message history is recoverable on future devices. This is the
 * forward fix for the "no key backup on the server" decryption errors — keys
 * for messages sent before a backup exists can never be recovered, but turning
 * on backup makes everything from here on recoverable.
 *
 * Safety: it only appears (and only offers the from-scratch DeviceVerificationSetup
 * flow) when cross-signing is NOT yet set up — see `selectKeyBackupNudge`. The
 * action reuses the exact overlay flow from Settings → Security so no crypto is
 * driven directly from here. Dismissing snoozes the nudge for a week; it hides
 * permanently the moment a backup exists.
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
    const [snoozeUntil, setSnoozeUntil] = useAtom(keyBackupNudgeSnoozeAtom);
    const [setupOpen, setSetupOpen] = useState(false);

    const refresh = useCallback(async () => {
        if (!crypto) return;
        const [cs, backupVersion] = await Promise.all([
            crypto.isCrossSigningReady(),
            crypto.getActiveSessionBackupVersion(),
        ]);
        if (!alive()) return;
        setCrossSigningReady(cs);
        setKeyBackupReady(typeof backupVersion === 'string');
        setLoaded(true);
    }, [crypto, alive]);

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

    // Avoid a flash before the async crypto checks resolve.
    if (!crypto || !loaded) return null;

    const verdict = selectKeyBackupNudge({ crossSigningReady, keyBackupReady });
    if (!verdict) return null;
    if (Date.now() < snoozeUntil) return null;

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
                    <Button size="300" variant="Primary" radii="300" onClick={() => setSetupOpen(true)}>
                        <Text as="span" size="B300">
                            {action?.label ?? 'Set up backup'}
                        </Text>
                    </Button>
                </div>
            </div>

            {setupOpen && (
                <Overlay open backdrop={<OverlayBackdrop />}>
                    <OverlayCenter>
                        <FocusTrap
                            focusTrapOptions={{
                                initialFocus: false,
                                clickOutsideDeactivates: false,
                                escapeDeactivates: false,
                            }}
                        >
                            <DeviceVerificationSetup onCancel={() => setSetupOpen(false)} />
                        </FocusTrap>
                    </OverlayCenter>
                </Overlay>
            )}
        </>
    );
}
