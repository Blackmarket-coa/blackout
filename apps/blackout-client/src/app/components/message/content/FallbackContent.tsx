import {
    Box,
    Button,
    Chip,
    Dialog,
    Header,
    Icon,
    IconButton,
    Icons,
    Overlay,
    OverlayBackdrop,
    OverlayCenter,
    Text,
    as,
    color,
    config,
} from 'folds';
import React, { useState } from 'react';
import FocusTrap from 'focus-trap-react';
import { useMatrixClientOrNull } from '../../../hooks/useMatrixClient';
import { useAlive } from '../../../hooks/useAlive';
import { DeviceVerificationReset, DeviceVerificationSetup } from '../../DeviceVerificationSetup';
import { accountKeyVerdict, checkAccountKeyState } from '../../../../client/keyBackupCheck';

const warningStyle = { color: color.Warning.Main, opacity: config.opacity.P300 };
const criticalStyle = { color: color.Critical.Main, opacity: config.opacity.P300 };

export const MessageDeletedContent = as<'div', { children?: never; reason?: string }>(
    ({ reason, ...props }, ref) => (
        <Box as="span" alignItems="Center" gap="100" style={warningStyle} {...props} ref={ref}>
            <Icon size="50" src={Icons.Delete} />
            {reason ? (
                <i>This message has been deleted. {reason}</i>
            ) : (
                <i>This message has been deleted</i>
            )}
        </Box>
    )
);

export const MessageUnsupportedContent = as<'div', { children?: never }>(({ ...props }, ref) => (
    <Box as="span" alignItems="Center" gap="100" style={criticalStyle} {...props} ref={ref}>
        <Icon size="50" src={Icons.Warning} />
        <i>Unsupported message</i>
    </Box>
));

export const MessageFailedContent = as<'div', { children?: never }>(({ ...props }, ref) => (
    <Box as="span" alignItems="Center" gap="100" style={criticalStyle} {...props} ref={ref}>
        <Icon size="50" src={Icons.Warning} />
        <i>Failed to load message</i>
    </Box>
));

/**
 * The undecryptable-message chip. Every line here is true of every message
 * this device cannot decrypt, whatever the cause, and none promises a recovery
 * Blackout cannot do: it has no screen that restores keys from a backup or
 * receives them from another session.
 */
export const CHIP_TEXT = 'Can’t decrypt this message: this device doesn’t have its key.';
export const CHIP_LABEL = 'Why?';
export const CHIP_CHECKING = 'Checking your key backup on your homeserver…';
export const CHIP_BACKUP_EXISTS =
    'Your account has a key backup on your homeserver, but Blackout has no screen that restores keys from it. Setting up a new backup would delete it, so Blackout doesn’t offer that here. Another Matrix app that you sign in to with your recovery key or passphrase may be able to show this message.';
export const CHIP_NOT_VERIFIED =
    'This device isn’t verified, and Blackout has no screen that verifies it or restores keys, so it can’t get this message’s key. Another of your sessions that has the key can still read it.';
export const CHIP_CHECK_FAILED =
    'Blackout couldn’t check whether your account has a key backup, so it doesn’t offer to set one up right now.';

type ChipPanel = 'checking' | 'setup' | 'reset' | 'backup' | 'not_verified' | 'check_failed';

const panelText: Record<Exclude<ChipPanel, 'setup' | 'reset'>, string> = {
    checking: CHIP_CHECKING,
    backup: CHIP_BACKUP_EXISTS,
    not_verified: CHIP_NOT_VERIFIED,
    check_failed: CHIP_CHECK_FAILED,
};

function ChipExplanation({ text, onClose }: { text: string; onClose: () => void }) {
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

export const MessageBadEncryptedContent = as<'div', { children?: never }>(({ ...props }, ref) => {
    // The chip explains; it does not always offer setup. A click asks the
    // homeserver what the ACCOUNT has (`checkAccountKeyState`) and this device
    // whether it trusts the account's cross-signing, then opens the
    // from-scratch setup only when the account has neither a backup nor
    // cross-signing, the warned reset only when this device trusts the
    // account's cross-signing and no backup exists, and otherwise a short
    // explanation. Account data alone (`useCrossSigningActive`) is not used to
    // choose: it says cross-signing exists but not whether this device is
    // verified, and never says whether a backup exists. The from-scratch setup
    // replaces the account's secret storage and cross-signing and deletes
    // every backup version it has (S9,
    // `docs/security/key-backup-nudge-2026-11-02.md`), so "couldn't check"
    // never opens it.
    const [panel, setPanel] = useState<ChipPanel | null>(null);
    const mx = useMatrixClientOrNull();
    const alive = useAlive();

    const close = () => setPanel(null);

    const explain = async () => {
        if (!mx) return;
        setPanel('checking');
        const crypto = mx.getCrypto();
        const [state, crossSigningReady] = await Promise.all([
            checkAccountKeyState(mx),
            crypto ? crypto.isCrossSigningReady() : Promise.resolve(false),
        ]);
        if (!alive()) return;
        const verdict = accountKeyVerdict(state, crossSigningReady);
        if (verdict === 'none') setPanel('setup');
        else if (verdict === 'cross_signing')
            setPanel(crossSigningReady ? 'reset' : 'not_verified');
        else if (verdict === 'backup') setPanel('backup');
        else setPanel('check_failed');
    };

    return (
        <Box as="span" alignItems="Center" gap="100" style={warningStyle} {...props} ref={ref}>
            <Icon size="50" src={Icons.Lock} />
            <i>{CHIP_TEXT}</i>
            {mx && (
                <Chip
                    as="button"
                    type="button"
                    size="400"
                    variant="Warning"
                    radii="Pill"
                    onClick={() => void explain()}
                >
                    <Text as="span" size="B300">
                        {CHIP_LABEL}
                    </Text>
                </Chip>
            )}
            {panel && (
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
                                <DeviceVerificationSetup onCancel={close} />
                            ) : panel === 'reset' ? (
                                <DeviceVerificationReset onCancel={close} />
                            ) : (
                                <ChipExplanation text={panelText[panel]} onClose={close} />
                            )}
                        </FocusTrap>
                    </OverlayCenter>
                </Overlay>
            )}
        </Box>
    );
});

export const MessageNotDecryptedContent = as<'div', { children?: never }>(({ ...props }, ref) => (
    <Box as="span" alignItems="Center" gap="100" style={warningStyle} {...props} ref={ref}>
        <Icon size="50" src={Icons.Lock} />
        <i>This message is not decrypted yet</i>
    </Box>
));

export const MessageBrokenContent = as<'div', { children?: never }>(({ ...props }, ref) => (
    <Box as="span" alignItems="Center" gap="100" style={criticalStyle} {...props} ref={ref}>
        <Icon size="50" src={Icons.Warning} />
        <i>Broken message</i>
    </Box>
));

export const MessageEmptyContent = as<'div', { children?: never }>(({ ...props }, ref) => (
    <Box as="span" alignItems="Center" gap="100" style={criticalStyle} {...props} ref={ref}>
        <Icon size="50" src={Icons.Warning} />
        <i>Empty message</i>
    </Box>
));

export const MessageEditedContent = as<'span', { children?: never }>(({ ...props }, ref) => (
    <Text as="span" size="T200" priority="300" {...props} ref={ref}>
        {' (edited)'}
    </Text>
));
