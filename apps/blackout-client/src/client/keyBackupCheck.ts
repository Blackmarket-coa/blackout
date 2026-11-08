import { ClientPrefix, HTTPError, MatrixError, Method, type MatrixClient } from 'matrix-js-sdk';

/**
 * What the account has on its homeserver: a key backup, cross-signing keys,
 * or neither. The one place the key-backup nudge, the undecryptable-message
 * chip and the legacy Devices page learn it (S9,
 * `docs/security/key-backup-nudge-2026-11-02.md`).
 *
 * Why the SDK's own answers are not used: `isCrossSigningReady()` and
 * `getActiveSessionBackupVersion()` describe THIS device, and both are false
 * on every new device, whatever the account has. `getKeyBackupInfo()` resolves
 * `null` when its own request failed (`rust-crypto/backup.js`,
 * `doCheckKeyBackup` catches the error and leaves `serverBackupInfo`
 * undefined; `rust-crypto.js` `getKeyBackupInfo` turns that into `null`), as
 * it does when the server has no backup. A successful answer is kept until
 * the SDK's next forced check: at start-up, on the user's own identity
 * update, after `resetKeyBackup`, after an upload failure of an active
 * backup, or when the app calls `checkKeyBackupAndEnable`
 * (`rust-crypto.js:124,1872,1244,1215`, `backup.js:439`). After a failed
 * request the next call asks again, because `checkedForBackup` is set only
 * when a check succeeds (`backup.js:88-95,122-125,259-266`). So "no backup"
 * and "couldn't check" look the same, and a successful answer can be hours
 * old.
 *
 * Both requests here are reads, sent every time (no cache). Only a 404
 * `M_NOT_FOUND` from `GET /room_keys/version` means "no backup": Synapse
 * answers that exactly when the account has no current backup version. Any
 * other failure, a timeout or an odd answer is `'unknown'`, and `'unknown'`
 * never lets a screen offer the from-scratch setup, because that setup
 * deletes every backup version the account has
 * (`rust-crypto/backup.js` `setupKeyBackup` → `deleteAllKeyBackupVersions`).
 */

export type BackupState = 'backup' | 'none' | 'unknown';
export type CrossSigningState = 'yes' | 'no' | 'unknown';

export interface AccountKeyState {
    backup: BackupState;
    crossSigning: CrossSigningState;
    /**
     * The account's master cross-signing public key as the homeserver gave
     * it, when `crossSigning` is `'yes'` and the answer carried one. The setup
     * form compares it with the key its own earlier attempt uploaded.
     */
    masterKey?: string;
    /** Why a check came back `'unknown'`, for diagnostics. Never shown as-is. */
    detail?: string;
}

/**
 * - `'backup'`: the homeserver holds a key backup for the account.
 * - `'cross_signing'`: no backup (the check answered), but cross-signing keys
 *   exist on the server or this device already trusts them.
 * - `'none'`: the homeserver answered that the account has neither.
 * - `'unknown'`: a check failed, so nothing is known for sure.
 */
export type AccountKeyVerdict = 'none' | 'backup' | 'cross_signing' | 'unknown';

export const ACCOUNT_KEY_CHECK_TIMEOUT_MS = 10_000;

const describeFailure = (error: unknown): string => {
    if (error instanceof MatrixError) {
        return `it answered ${error.httpStatus ?? '?'} ${error.errcode ?? ''}`.trimEnd();
    }
    if (error instanceof HTTPError) {
        return `it answered ${error.httpStatus ?? '?'}`;
    }
    return 'no answer';
};

type BackupVersionAnswer = { version?: unknown } | null | undefined;

type KeysQueryAnswer =
    | {
          master_keys?: Record<string, unknown>;
      }
    | null
    | undefined;

/** The bare public key in a `/keys/query` master key's `keys` (`{ "ed25519:<key>": "<key>" }`). */
const masterPublicKey = (master: object): string | undefined => {
    const { keys } = master as { keys?: unknown };
    if (!keys || typeof keys !== 'object') return undefined;
    return Object.values(keys).find(
        (key): key is string => typeof key === 'string' && key.length > 0
    );
};

const requestOpts = {
    prefix: ClientPrefix.V3,
    localTimeoutMs: ACCOUNT_KEY_CHECK_TIMEOUT_MS,
};

export const checkBackupState = async (
    mx: MatrixClient
): Promise<{ backup: BackupState; detail?: string }> => {
    let answer: BackupVersionAnswer;
    try {
        answer = await mx.http.authedRequest<BackupVersionAnswer>(
            Method.Get,
            '/room_keys/version',
            undefined,
            undefined,
            requestOpts
        );
    } catch (error) {
        if (
            error instanceof MatrixError &&
            error.httpStatus === 404 &&
            error.errcode === 'M_NOT_FOUND'
        ) {
            return { backup: 'none' };
        }
        return { backup: 'unknown', detail: describeFailure(error) };
    }
    if (answer && typeof answer.version === 'string' && answer.version.length > 0) {
        return { backup: 'backup' };
    }
    return { backup: 'unknown', detail: 'it answered 200 without a version' };
};

export const checkCrossSigningState = async (
    mx: MatrixClient
): Promise<{ crossSigning: CrossSigningState; masterKey?: string; detail?: string }> => {
    const userId = mx.getUserId();
    if (!userId) return { crossSigning: 'unknown', detail: 'no user id' };
    let answer: KeysQueryAnswer;
    try {
        answer = await mx.http.authedRequest<KeysQueryAnswer>(
            Method.Post,
            '/keys/query',
            undefined,
            { device_keys: { [userId]: [] } },
            requestOpts
        );
    } catch (error) {
        return { crossSigning: 'unknown', detail: describeFailure(error) };
    }
    if (!answer || typeof answer !== 'object') {
        return { crossSigning: 'unknown', detail: 'it answered 200 without a body' };
    }
    const master = answer.master_keys?.[userId];
    if (!master || typeof master !== 'object') return { crossSigning: 'no' };
    const masterKey = masterPublicKey(master);
    return { crossSigning: 'yes', ...(masterKey ? { masterKey } : {}) };
};

/** Asks the homeserver, every time, what the account has. Never throws. */
export const checkAccountKeyState = async (mx: MatrixClient): Promise<AccountKeyState> => {
    const [backup, crossSigning] = await Promise.all([
        checkBackupState(mx),
        checkCrossSigningState(mx),
    ]);
    const detail = [
        backup.detail && `backup: ${backup.detail}`,
        crossSigning.detail && `cross-signing: ${crossSigning.detail}`,
    ]
        .filter(Boolean)
        .join('; ');
    return {
        backup: backup.backup,
        crossSigning: crossSigning.crossSigning,
        ...(crossSigning.masterKey ? { masterKey: crossSigning.masterKey } : {}),
        ...(detail ? { detail } : {}),
    };
};

/**
 * Precedence: a backup wins; then a failed backup check (never "nothing to
 * lose" when the check didn't answer); then cross-signing, from the server or
 * from this device; then the server's "no"; else unknown.
 *
 * Only `'none'` lets any screen open the from-scratch setup.
 */
export const accountKeyVerdict = (
    state: AccountKeyState,
    crossSigningReady: boolean
): AccountKeyVerdict => {
    if (state.backup === 'backup') return 'backup';
    if (state.backup === 'unknown') return 'unknown';
    if (state.crossSigning === 'yes' || crossSigningReady) return 'cross_signing';
    if (state.crossSigning === 'no') return 'none';
    return 'unknown';
};

/** Which flow is about to write: the from-scratch setup, or the warned reset. */
export type SetupMode = 'setup' | 'reset';

/**
 * Why the setup form itself refused, shown in its error slot. Each line says
 * what the check found and what Blackout did: stopped before any write.
 */
export const SETUP_REFUSED_TEXT = {
    backup: 'Your account already has a key backup on your homeserver. Setting up a new one here would delete it, so Blackout stopped before changing anything. Another Matrix app that you sign in to with your recovery key or passphrase may be able to restore from it.',
    crossSigning:
        'Your account already has cross-signing set up. Setting up here would replace it, and every device and contact that verified you would see a new identity, so Blackout stopped before changing anything.',
    unknown:
        'Blackout couldn’t finish checking whether your account already has a key backup or cross-signing, so it stopped before changing anything. Try again later.',
} as const;

/**
 * Shown under the error when a step failed after this form's own
 * cross-signing reached the homeserver (the backup's creation, say). The
 * next Continue in the same form keeps that cross-signing (`setupRefusal`'s
 * `ownMasterKey`, and `SetupVerification` skips the cross-signing step).
 */
export const SETUP_STOPPED_PARTWAY_TEXT =
    'Cross-signing is now on for your account, but the rest of the setup didn’t finish. Press Continue to try the rest again: this window keeps that cross-signing rather than replacing it.';

/**
 * The last check before the setup writes anything. Every entry re-checks at
 * its click (`KeyBackupSetupGuard`); this closes the window between that click
 * and the submit, in which another device of the account can create
 * cross-signing and a backup.
 *
 * - `'setup'` (the from-scratch `DeviceVerificationSetup`) goes on only when
 *   the homeserver answered that the account has neither a backup nor
 *   cross-signing, or has no backup and, as its master key, `ownMasterKey`:
 *   the key this same form uploaded in an earlier attempt that failed at a
 *   later step. That identity is the form's own, and the form keeps it
 *   rather than make another.
 * - `'reset'` (the warned `DeviceVerificationReset`) exists to replace
 *   cross-signing, so it goes on whatever the cross-signing check says, but
 *   only when the backup check answered "none": it never deletes a backup and
 *   never goes on after a failed backup check.
 *
 * Returns the message to show, or null to go on.
 */
export const setupRefusal = (
    state: AccountKeyState,
    mode: SetupMode,
    ownMasterKey?: string | null
): string | null => {
    if (state.backup === 'backup') return SETUP_REFUSED_TEXT.backup;
    if (state.backup === 'unknown') return SETUP_REFUSED_TEXT.unknown;
    if (mode === 'reset') return null;
    if (state.crossSigning === 'yes') {
        return ownMasterKey && state.masterKey === ownMasterKey
            ? null
            : SETUP_REFUSED_TEXT.crossSigning;
    }
    if (state.crossSigning === 'unknown') return SETUP_REFUSED_TEXT.unknown;
    return null;
};
