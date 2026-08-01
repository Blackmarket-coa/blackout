import {
    Box,
    Chip,
    Icon,
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
import { useCrossSigningActive } from '../../../hooks/useCrossSigning';
import { DeviceVerificationReset, DeviceVerificationSetup } from '../../DeviceVerificationSetup';

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

export const MessageBadEncryptedContent = as<'div', { children?: never }>(({ ...props }, ref) => {
    // Plain-language replacement for the bare "Unable to decrypt" text. The
    // underlying cause is almost always "this message arrived before this device
    // had the encrypted-message backup, and there is no backup on the server to
    // pull the key from" — so we say that, and offer the one action that fixes it
    // going forward: set up / restore the key backup. We never drive crypto from
    // here; the button opens the same guarded flow the KeyBackupNudge uses
    // (from-scratch setup when cross-signing isn't configured yet, otherwise the
    // reset flow, which has its own confirm step so existing secret storage isn't
    // silently wiped).
    const [recoverOpen, setRecoverOpen] = useState(false);
    const mx = useMatrixClientOrNull();
    const crossSigningActive = useCrossSigningActive();

    return (
        <Box as="span" alignItems="Center" gap="100" style={warningStyle} {...props} ref={ref}>
            <Icon size="50" src={Icons.Lock} />
            <i>
                Can’t decrypt this message — it was sent before this device had your
                encrypted‑message backup.
            </i>
            {mx && (
                <Chip
                    as="button"
                    type="button"
                    size="400"
                    variant="Warning"
                    radii="Pill"
                    onClick={() => setRecoverOpen(true)}
                >
                    <Text as="span" size="B300">
                        Set up backup
                    </Text>
                </Chip>
            )}
            {recoverOpen && (
                <Overlay open backdrop={<OverlayBackdrop />}>
                    <OverlayCenter>
                        <FocusTrap
                            focusTrapOptions={{
                                initialFocus: false,
                                clickOutsideDeactivates: false,
                                escapeDeactivates: false,
                            }}
                        >
                            {crossSigningActive ? (
                                <DeviceVerificationReset onCancel={() => setRecoverOpen(false)} />
                            ) : (
                                <DeviceVerificationSetup onCancel={() => setRecoverOpen(false)} />
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
