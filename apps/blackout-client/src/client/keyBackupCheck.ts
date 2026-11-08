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
 * undefined; `rust-crypto.js` `getKeyBackupInfo` turns that into `null`) and
 * caches a success for the life of the client (`checkKeyBackupAndEnable`
 * returns early once `checkedForBackup` is set), so "no backup" and "couldn't
 * check" look the same and the answer can be old.
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
): Promise<{ crossSigning: CrossSigningState; detail?: string }> => {
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
    return { crossSigning: master && typeof master === 'object' ? 'yes' : 'no' };
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
