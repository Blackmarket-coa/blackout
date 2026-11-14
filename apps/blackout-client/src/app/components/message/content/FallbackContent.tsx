import { Box, Chip, Icon, Icons, Text, as, color, config } from 'folds';
import React from 'react';
import { useMatrixClientOrNull } from '../../../hooks/useMatrixClient';
import {
    KeyBackupGuardOverlay,
    useKeyBackupSetupGuard,
    type KeyBackupGuardTexts,
} from '../../KeyBackupSetupGuard';
import { KEY_BACKUP_NUDGE_TEXT } from '../../../features/settings/security/encryptionPosture';

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
 * The undecryptable-message chip. `CHIP_TEXT` is true of every event the SDK
 * marks `m.bad.encrypted`: usually this device lacks the key (the one cause
 * the chip can act on), and sometimes it has the key and refuses (a replayed
 * message index, a sender whose identity changed: `DecryptionFailureCode`'s
 * `UNKNOWN_ERROR` and sender-identity codes in `rust-crypto.js`
 * `onMegolmDecryptionError`). None of the lines promises a recovery Blackout
 * cannot do: it has no screen that restores keys from a backup or receives
 * them from another session.
 *
 * `Why?` explains in every row. Where the account check allows the setup
 * (row 1) or the warned reset (row 2), the overlay first says that setting up
 * a backup won't make this message readable, then what the backup does (the
 * nudge's text for the row), with a "Set up backup" button that asks the
 * homeserver again before it opens the flow (`texts.offer`).
 *
 * Where the chip is mounted (eighth review, corrected by the ninth): the
 * shipped app renders it only in message-search results (`SearchResultGroup`,
 * through `RenderMessageContent` and `Reply`). There it shows in practice in
 * a result's reply preview whose replied event fails to decrypt here: a
 * search hit itself is never encrypted, since Synapse indexes only
 * unencrypted messages, so `RenderMessageContent`'s branch is reached there
 * only by an event sent in the clear with that msgtype. The pinned-messages
 * popout (`RoomPinMenu`) would render it too, but only the room view renders
 * that popout, and the room view (`Room`, `RoomView`, `RoomViewHeader` in
 * `features/room`) is not mounted. The room timeline renders an undecryptable
 * message as plain text and has no chip. Inside a reply preview the chip sits
 * in `Reply`'s button, whose click opens the replied message and closes the
 * search panel, so the chip's own click stops at the chip (its `onClick`
 * below) and every click in its overlay stops at the overlay (`stopClick` in
 * `KeyBackupSetupGuard`). Its overlay lives as long as the chip does. While it
 * is up it covers the search panel, whose close and result Open are then out
 * of reach, so what takes it away is, for example, the screen going (a
 * browser's Back, a quick-switcher selection from the keyboard, or a route
 * change the app makes itself, such as a notification tap), the results list
 * shifting under it, or the message becoming readable. Nothing is lost before the setup's first write; after it, the
 * attempt runs on and `RecoveryKeyHandoffHost` shows its key.
 */
export const CHIP_TEXT = 'Can’t decrypt this message on this device.';
export const CHIP_LABEL = 'Why?';
export const CHIP_CHECKING = 'Checking your key backup on your homeserver…';
export const CHIP_BACKUP_EXISTS =
    'Your account has a key backup on your homeserver, but Blackout has no screen that restores keys from it. Setting up a new backup would delete it, so Blackout doesn’t offer that here. Another Matrix app that you sign in to with your recovery key or passphrase may be able to show this message.';
/**
 * Shown when the account has cross-signing and no backup, and this device
 * doesn't trust the account's cross-signing: usually a new device looking at
 * a message sent before it signed in. What is closed to this device: a backup
 * (there is none, and Blackout has no screen to restore from one) and asking
 * the account's other sessions (room-key requests are off,
 * `lib/rust-crypto/index.js:87` `roomKeyRequestsEnabled = false`). A key the
 * sender's device sends later is tried at once (`rust-crypto.js:1790-1822`,
 * `onRoomKeysUpdated` retries every event waiting for that session), but a
 * retry is not a decryption: a Megolm session shared later starts at its
 * current index and can't open an earlier message (`rust-crypto.js:2151-2152`,
 * `UnknownMessageIndex`), and a sender that withholds keys from unverified
 * devices never sends one (`:2145`). So the text promises only what a delayed
 * key can do (S9, sixth review; the fourth review's "If the sender's device
 * sends the key later, the message becomes readable here" promised more).
 */
export const CHIP_NOT_VERIFIED =
    'This device isn’t verified, and Blackout has no screen that verifies it or restores keys, so it can’t get this message’s key from a backup or from your other sessions. If this message’s key was only delayed, it becomes readable here when the key arrives; a message sent before this device signed in stays unreadable here. Another of your sessions that has the key can still read it.';
export const CHIP_CHECK_FAILED =
    'Blackout couldn’t finish checking whether your account already has a key backup or cross-signing, so it doesn’t offer to set one up right now.';
/**
 * True whether this device lacks the message's key or has it and refuses it:
 * a backup set up now starts with the keys this device already has, and the
 * device still can't decrypt the message. "By itself": once this device has
 * the backup, the SDK asks it for a missing key at each failed attempt to
 * decrypt (`rust-crypto.js` `onMegolmDecryptionError` →
 * `PerSessionKeyBackupDownloader`), so the message can become readable later
 * if another session uploads its key to that backup.
 */
export const CHIP_SETUP_WONT_FIX =
    'Setting up a backup won’t, by itself, make this message readable: a new backup starts with only the keys this device already has.';
export const CHIP_OFFER_SETUP = `${CHIP_SETUP_WONT_FIX} ${KEY_BACKUP_NUDGE_TEXT.none.detail}`;
export const CHIP_OFFER_RESET = `${CHIP_SETUP_WONT_FIX} ${KEY_BACKUP_NUDGE_TEXT.crossSigningReady.detail}`;

export const CHIP_GUARD_TEXTS: KeyBackupGuardTexts = {
    checking: CHIP_CHECKING,
    backup: CHIP_BACKUP_EXISTS,
    not_verified: CHIP_NOT_VERIFIED,
    check_failed: CHIP_CHECK_FAILED,
    offer: { setup: CHIP_OFFER_SETUP, reset: CHIP_OFFER_RESET },
};

export const MessageBadEncryptedContent = as<'div', { children?: never }>(({ ...props }, ref) => {
    // The chip explains; it does not always offer setup. A click asks the
    // homeserver what the ACCOUNT has and this device whether it trusts the
    // account's cross-signing, right then (`useKeyBackupSetupGuard`). It
    // offers the from-scratch setup only when the account has neither a
    // backup nor cross-signing, the warned reset only when this device trusts
    // the account's cross-signing and no backup exists, each behind its
    // explanation and a button that checks again; otherwise it shows a short
    // explanation. Account data alone (`useCrossSigningActive`) is not used to
    // choose: it says cross-signing exists but not whether this device is
    // verified, and never says whether a backup exists. The from-scratch setup
    // replaces the account's secret storage and cross-signing and deletes
    // every backup version it has (S9,
    // `docs/security/key-backup-nudge-2026-11-02.md`), so "couldn't check"
    // never opens it.
    const mx = useMatrixClientOrNull();
    const guard = useKeyBackupSetupGuard(mx, CHIP_GUARD_TEXTS);
    const { open } = guard;

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
                    onClick={(event) => {
                        // Not the reply preview's open around it (eighth review).
                        event.stopPropagation();
                        void open();
                    }}
                >
                    <Text as="span" size="B300">
                        {CHIP_LABEL}
                    </Text>
                </Chip>
            )}
            <KeyBackupGuardOverlay guard={guard} />
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
