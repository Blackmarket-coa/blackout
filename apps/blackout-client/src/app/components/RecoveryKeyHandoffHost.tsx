import React, { useEffect } from 'react';
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
import { useMatrixClientOrNull } from '../hooks/useMatrixClient';
import { SETUP_KEY_ELSEWHERE_TEXT } from '../../client/keyBackupCheck';
import { RecoveryKeyDisplay } from './DeviceVerificationSetup';
import {
    clearHandedOffRecoveryKeys,
    dismissHandedOffRecoveryKey,
    useHandedOffRecoveryKeys,
} from './recoveryKeyHandoff';

/**
 * Shows the recovery key of a key-backup setup or reset whose window went away
 * while the attempt was writing (`recoveryKeyHandoff.ts`; S9,
 * `docs/security/key-backup-nudge-2026-11-02.md`, eighth review).
 *
 * Mounted once, beside the app's router (`main.tsx`), so that neither a route
 * change nor the router being rebuilt takes it away; it unmounts only with
 * the signed-in session, and then drops what it was holding. It shows only
 * keys of the account signed in now, one at a time, until each is closed.
 */
export function RecoveryKeyHandoffHost() {
    const mx = useMatrixClientOrNull();
    const userId = mx?.getUserId() ?? null;
    const entries = useHandedOffRecoveryKeys();
    const entry = entries.find((candidate) => candidate.userId === userId);

    useEffect(() => clearHandedOffRecoveryKeys, []);

    if (!entry) return null;
    const close = () => dismissHandedOffRecoveryKey(entry.id);

    return (
        <Overlay open backdrop={<OverlayBackdrop />}>
            <OverlayCenter>
                <FocusTrap
                    key={entry.id}
                    focusTrapOptions={{
                        initialFocus: false,
                        clickOutsideDeactivates: false,
                        escapeDeactivates: false,
                    }}
                >
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
                                <Text size="H4">Recovery Key</Text>
                            </Box>
                            <IconButton size="300" radii="300" onClick={close} aria-label="Close">
                                <Icon src={Icons.Cross} />
                            </IconButton>
                        </Header>
                        <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
                            <Text size="T300">{SETUP_KEY_ELSEWHERE_TEXT}</Text>
                            <RecoveryKeyDisplay recoveryKey={entry.recoveryKey} lead={entry.lead} />
                            <Button variant="Secondary" fill="Soft" onClick={close}>
                                <Text size="B400">Close</Text>
                            </Button>
                        </Box>
                    </Dialog>
                </FocusTrap>
            </OverlayCenter>
        </Overlay>
    );
}
