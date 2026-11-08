import React, { useCallback, useState } from 'react';
import {
    Box,
    Button,
    Dialog,
    Header,
    Icon,
    IconButton,
    Icons,
    Overlay,
    OverlayBackdrop,
    OverlayCenter,
    Text,
    config,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import type { MatrixClient } from 'matrix-js-sdk';
import { useAlive } from '../hooks/useAlive';
import {
    accountKeyVerdict,
    checkAccountKeyState,
    type AccountKeyVerdict,
} from '../../client/keyBackupCheck';
import { DeviceVerificationReset, DeviceVerificationSetup } from './DeviceVerificationSetup';

/**
 * The click-time half of the key-backup guard (S9,
 * `docs/security/key-backup-nudge-2026-11-02.md`), shared by the key-backup
 * nudge, the undecryptable-message chip and the legacy Devices page's Enable
 * button.
 *
 * A verdict a screen shows can be hours old. The SDK re-checks its own backup
 * only at start-up, on the user's own identity update and after an upload
 * failure of an active backup, and it emits `KeyBackupStatus` only when THIS
 * device enables or disables backup (matrix-js-sdk 40.2.0,
 * `lib/rust-crypto/backup.js`, `enableKeyBackup` and `disableKeyBackup`).
 * Another device of the account can create cross-signing and a backup while
 * the screen sits open, and nothing tells this one. So no entry opens the
 * from-scratch setup from a stored verdict: `open()` asks the homeserver again
 * at the click, with the overlay already up in a checking state, and only a
 * fresh `'none'` opens `DeviceVerificationSetup`; a fresh `'cross_signing'`
 * that this device trusts opens the warned `DeviceVerificationReset`; every
 * other answer shows the caller's text for that row, with Close. The setup
 * form then checks once more right before its first write
 * (`SetupVerification`), which closes the window between this check and the
 * submit.
 */

export type KeyBackupGuardPanel =
    | 'checking'
    | 'setup'
    | 'reset'
    | 'backup'
    | 'not_verified'
    | 'check_failed';

/** The caller's text for the wait and for the three rows that offer nothing. */
export interface KeyBackupGuardTexts {
    checking: string;
    backup: string;
    not_verified: string;
    check_failed: string;
}

export interface KeyBackupGuardResult {
    verdict: AccountKeyVerdict;
    /** Whether THIS device trusts the account's cross-signing. */
    crossSigningReady: boolean;
    panel: KeyBackupGuardPanel;
}

export const panelForVerdict = (
    verdict: AccountKeyVerdict,
    crossSigningReady: boolean
): KeyBackupGuardPanel => {
    switch (verdict) {
        case 'none':
            return 'setup';
        case 'cross_signing':
            return crossSigningReady ? 'reset' : 'not_verified';
        case 'backup':
            return 'backup';
        case 'unknown':
        default:
            return 'check_failed';
    }
};

const CHECK_FAILED: KeyBackupGuardResult = {
    verdict: 'unknown',
    crossSigningReady: false,
    panel: 'check_failed',
};

/**
 * The guard's inputs, fetched now: the homeserver's answer about the account
 * (`checkAccountKeyState`, which never throws) and this device's trust in the
 * account's cross-signing. Never throws: a device check that rejects (the
 * crypto layer closed during sign-out, say) makes the verdict `'unknown'`,
 * which offers nothing.
 */
export const checkForSetup = async (mx: MatrixClient): Promise<KeyBackupGuardResult> => {
    try {
        const crypto = mx.getCrypto();
        const [state, crossSigningReady] = await Promise.all([
            checkAccountKeyState(mx),
            crypto ? crypto.isCrossSigningReady() : Promise.resolve(false),
        ]);
        const verdict = accountKeyVerdict(state, crossSigningReady);
        return { verdict, crossSigningReady, panel: panelForVerdict(verdict, crossSigningReady) };
    } catch {
        return CHECK_FAILED;
    }
};

/**
 * `open()` runs the check and drives `panel`; it resolves with the fresh
 * answer so the caller can update what it shows too (a button the answer
 * removed should be gone). Resolves null when the component unmounted first.
 */
export function useKeyBackupSetupGuard(mx: MatrixClient | null) {
    const alive = useAlive();
    const [panel, setPanel] = useState<KeyBackupGuardPanel | null>(null);

    const open = useCallback(async (): Promise<KeyBackupGuardResult | null> => {
        if (!mx) return null;
        setPanel('checking');
        const result = await checkForSetup(mx);
        if (!alive()) return null;
        setPanel(result.panel);
        return result;
    }, [mx, alive]);

    const close = useCallback(() => setPanel(null), []);

    return { panel, open, close };
}

export function KeyBackupExplanation({ text, onClose }: { text: string; onClose: () => void }) {
    return (
        <Dialog>
            <Header
                style={{
                    padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                    borderBottomWidth: config.borderWidth.B300,
                }}
                variant="Surface"
                size="500"
            >
                <Box grow="Yes">
                    <Text size="H4">Key backup</Text>
                </Box>
                <IconButton size="300" radii="300" onClick={onClose} aria-label="Close">
                    <Icon src={Icons.Cross} />
                </IconButton>
            </Header>
            <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
                <Text size="T300">{text}</Text>
                <Button variant="Secondary" fill="Soft" onClick={onClose}>
                    <Text size="B400">Close</Text>
                </Button>
            </Box>
        </Dialog>
    );
}

type KeyBackupGuardOverlayProps = {
    panel: KeyBackupGuardPanel | null;
    texts: KeyBackupGuardTexts;
    onClose: () => void;
};

/**
 * The overlay for `useKeyBackupSetupGuard`: the setup, the reset, or the
 * caller's text for the row. Rendered whenever `panel` is set, independent of
 * whatever else the caller shows, so a setup that is under way (the recovery
 * key on screen) stays up when the caller's own banner goes away.
 */
export function KeyBackupGuardOverlay({ panel, texts, onClose }: KeyBackupGuardOverlayProps) {
    if (!panel) return null;
    return (
        <Overlay open backdrop={<OverlayBackdrop />}>
            <OverlayCenter>
                <FocusTrap
                    focusTrapOptions={{
                        initialFocus: false,
                        clickOutsideDeactivates: false,
                        escapeDeactivates: false,
                    }}
                >
                    {panel === 'setup' ? (
                        <DeviceVerificationSetup onCancel={onClose} />
                    ) : panel === 'reset' ? (
                        <DeviceVerificationReset onCancel={onClose} />
                    ) : (
                        <KeyBackupExplanation text={texts[panel]} onClose={onClose} />
                    )}
                </FocusTrap>
            </OverlayCenter>
        </Overlay>
    );
}
