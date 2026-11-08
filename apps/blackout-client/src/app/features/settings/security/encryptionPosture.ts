/**
 * Pure functions that summarize a user's E2EE posture into a single verdict
 * suitable for room headers, DM banners, and onboarding gates. Keeping the
 * logic in pure functions lets it be unit-tested without React or matrix-js-sdk.
 */

export type DeviceVerificationVerdict = 'verified' | 'unverified' | 'unknown';

export interface DeviceSummary {
    deviceId: string;
    verification: DeviceVerificationVerdict;
}

export interface MemberSummary {
    userId: string;
    devices: DeviceSummary[];
}

export interface AccountPosture {
    /** Whether the local user has set up cross-signing. */
    crossSigningReady: boolean;
    /** Whether the current device is cross-signed-verified. */
    currentDeviceVerified: boolean;
    /** Other own sessions; used for "verify-from-existing-device" UX. */
    otherOwnDevices: DeviceSummary[];
    /** Members of the conversation in question (excluding self). */
    members: MemberSummary[];
}

export type PostureSeverity = 'ok' | 'info' | 'warn' | 'critical';

export interface PostureVerdict {
    severity: PostureSeverity;
    headline: string;
    detail: string;
    actions: PostureAction[];
}

export type PostureActionId =
    | 'enable_cross_signing'
    | 'verify_current_device'
    | 'review_unverified_members'
    | 'enable_key_backup';

export interface PostureAction {
    id: PostureActionId;
    label: string;
}

const countUnverified = (members: MemberSummary[]) =>
    members.reduce(
        (acc, m) => acc + m.devices.filter((d) => d.verification !== 'verified').length,
        0
    );

export const summarizePosture = (input: AccountPosture): PostureVerdict => {
    const { crossSigningReady, currentDeviceVerified, otherOwnDevices, members } = input;

    if (!crossSigningReady) {
        return {
            severity: 'critical',
            headline: 'End-to-end encryption is not set up',
            detail: 'Set up cross-signing so messages can be verified across your devices and shared with new sessions.',
            actions: [{ id: 'enable_cross_signing', label: 'Set up cross-signing' }],
        };
    }

    if (!currentDeviceVerified) {
        const hasOtherOwn = otherOwnDevices.some((d) => d.verification === 'verified');
        return {
            severity: 'critical',
            headline: 'This device is not verified',
            detail: hasOtherOwn
                ? 'Verify this device from another verified session, or use your recovery key.'
                : 'Verify with your recovery key — no other verified session is available.',
            actions: [{ id: 'verify_current_device', label: 'Verify this device' }],
        };
    }

    const unverifiedCount = countUnverified(members);
    if (unverifiedCount > 0) {
        return {
            severity: 'info',
            headline: `${unverifiedCount} unverified ${
                unverifiedCount === 1 ? 'device' : 'devices'
            } in this conversation`,
            detail: 'Messages remain end-to-end encrypted. Verify members to confirm their identity.',
            actions: [{ id: 'review_unverified_members', label: 'Review members' }],
        };
    }

    return {
        severity: 'ok',
        headline: 'End-to-end encrypted and verified',
        detail: 'Your device and every member in this conversation are verified.',
        actions: [],
    };
};

/**
 * What the account has on its homeserver, from `accountKeyVerdict` in
 * `src/client/keyBackupCheck.ts`. Kept as a plain union here so this module
 * stays free of matrix-js-sdk.
 */
export type KeyBackupAccountState = 'none' | 'backup' | 'cross_signing' | 'unknown';

/**
 * The key-backup nudge's text. What every line may say about a backup, and
 * why: a backup keeps copies of message keys on the homeserver, encrypted so
 * that only the recovery key (or its passphrase) opens them. The keys in it
 * are those of the device that set it up (every key it has when the backup is
 * turned on, and those it gets later) and of any other session that trusts
 * the backup. Another Matrix app signed in with that key can restore the
 * messages those keys open. Blackout has no screen that restores from a
 * backup or verifies a device, so a Blackout session signed in later neither
 * restores from the backup nor adds its keys to it (matrix-js-sdk 40.2.0,
 * `rust-crypto/backup.js` `doCheckKeyBackup`: an untrusted backup with no
 * matching key is not enabled, and `maybeUploadKey` uploads only to an
 * enabled one), and in Blackout a backup does not bring older messages back
 * after a new sign-in. None of these lines says or implies that it does.
 */
export const KEY_BACKUP_NUDGE_TEXT = {
    none: {
        headline: 'Turn on encrypted message backup',
        detail: 'A backup keeps copies of this device’s message keys, and those it gets later, on your homeserver, locked with a recovery key that you keep. Another Matrix app that you sign in to with that key can then restore those messages. Blackout can’t restore from a backup yet, and a Blackout session you sign in to later doesn’t add to it, so here it won’t bring older messages back after you sign in on a new device. Setting it up also turns on cross-signing for your account.',
    },
    crossSigningReady: {
        headline: 'Turn on encrypted message backup',
        detail: 'Your account has no message key backup. Turning one on here resets device verification and gives you a new recovery key. The backup keeps copies of this device’s message keys, and those it gets later; another Matrix app with the new key can then restore those messages. Blackout can’t restore from a backup yet, so here it won’t bring older messages back after you sign in on a new device.',
    },
    crossSigningNotReady: {
        headline: 'This device isn’t verified',
        detail: 'Your account has cross-signing set up, but Blackout has no screen that verifies this device. Setting up backup here would reset your cross-signing and secret storage, so Blackout doesn’t offer that here.',
    },
    backup: {
        headline: 'This device can’t use your key backup',
        detail: 'Your account has a key backup on your homeserver, but Blackout has no screen that restores keys from it, so older encrypted messages stay unreadable here. Another Matrix app that you sign in to with your recovery key or passphrase may be able to restore them. Setting up a new backup would delete the existing one, so Blackout doesn’t offer that here.',
    },
    unknown: {
        headline: 'Key backup',
        detail: 'Blackout couldn’t finish checking whether your account already has a key backup or cross-signing, so it doesn’t offer to set one up right now.',
    },
} as const;

export const KEY_BACKUP_NUDGE_ACTION_LABEL = 'Set up backup';

/** Shown in the overlay while a click re-asks the homeserver. */
export const KEY_BACKUP_NUDGE_CHECKING =
    'Checking what your account already has on your homeserver…';

/**
 * The nudge's texts for `KeyBackupSetupGuard`'s overlay: the wait, and the
 * three rows that offer nothing, each the same sentence the banner shows for
 * that row. The verdict the banner shows can be stale (another device can set
 * things up while it sits open), so a click re-asks the homeserver and shows
 * the fresh row's text when the answer removed the action.
 */
export const KEY_BACKUP_NUDGE_GUARD_TEXTS = {
    checking: KEY_BACKUP_NUDGE_CHECKING,
    backup: KEY_BACKUP_NUDGE_TEXT.backup.detail,
    not_verified: KEY_BACKUP_NUDGE_TEXT.crossSigningNotReady.detail,
    check_failed: KEY_BACKUP_NUDGE_TEXT.unknown.detail,
} as const;

/**
 * Focused selector for the key-backup nudge.
 *
 * `keyBackupReady` and `crossSigningReady` describe THIS device (the SDK's
 * `getActiveSessionBackupVersion` and `isCrossSigningReady`); both are false
 * on every new device, whatever the account has. `accountState` is the
 * homeserver's answer about the ACCOUNT, and it decides whether an action is
 * offered at all, because every setup and reset path replaces the account's
 * secret storage and cross-signing and deletes every backup version it has
 * (S9, `docs/security/key-backup-nudge-2026-11-02.md`).
 *
 * | accountState      | crossSigningReady | action offered | flow                      |
 * |-------------------|-------------------|----------------|---------------------------|
 * | `'none'`          | any               | Set up backup  | DeviceVerificationSetup   |
 * | `'cross_signing'` | true              | Set up backup  | DeviceVerificationReset   |
 * | `'cross_signing'` | false             | none           | —                         |
 * | `'backup'`        | any               | none           | —                         |
 * | `'unknown'`       | any               | none           | —                         |
 *
 * Row 1 is safe because the homeserver answered 404 `M_NOT_FOUND` for the
 * backup and has no master key for the account: there is nothing to replace.
 * Row 2 deletes no backup (the check answered "none") and the reset flow
 * carries its own warning and confirm step. A `'backup'` or `'unknown'`
 * answer offers nothing: a setup would delete the existing backup, and
 * "couldn't check" must never be read as "nothing to lose". `'unknown'` also
 * covers a backup check that answered "none" while the cross-signing check
 * failed, so its text names both checks.
 *
 * The row decides only what the banner shows. The click re-asks the
 * homeserver (`KeyBackupSetupGuard`) and the setup form checks once more
 * before its first write, so a stale row never opens the setup by itself.
 *
 * Returns null once this device's backup is active (nothing to nudge about).
 */
export const selectKeyBackupNudge = (input: {
    crossSigningReady: boolean;
    keyBackupReady: boolean;
    accountState: KeyBackupAccountState;
}): PostureVerdict | null => {
    const { crossSigningReady, keyBackupReady, accountState } = input;
    if (keyBackupReady) return null;

    const action: PostureAction = { id: 'enable_key_backup', label: KEY_BACKUP_NUDGE_ACTION_LABEL };

    switch (accountState) {
        case 'none':
            return { severity: 'warn', ...KEY_BACKUP_NUDGE_TEXT.none, actions: [action] };
        case 'cross_signing':
            return crossSigningReady
                ? {
                      severity: 'warn',
                      ...KEY_BACKUP_NUDGE_TEXT.crossSigningReady,
                      actions: [action],
                  }
                : { severity: 'warn', ...KEY_BACKUP_NUDGE_TEXT.crossSigningNotReady, actions: [] };
        case 'backup':
            return { severity: 'warn', ...KEY_BACKUP_NUDGE_TEXT.backup, actions: [] };
        case 'unknown':
        default:
            return { severity: 'info', ...KEY_BACKUP_NUDGE_TEXT.unknown, actions: [] };
    }
};

/**
 * Onboarding gate. Returns true when the operator policy requires the user
 * to set up cross-signing before they can send their first encrypted message.
 */
export interface OnboardingPolicy {
    requireCrossSigning: boolean;
}

export const DEFAULT_ONBOARDING_POLICY: OnboardingPolicy = {
    requireCrossSigning: true,
};

export const onboardingBlocked = (
    posture: Pick<AccountPosture, 'crossSigningReady'>,
    policy: OnboardingPolicy = DEFAULT_ONBOARDING_POLICY
): boolean => policy.requireCrossSigning && !posture.crossSigningReady;
