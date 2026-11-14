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
 * Where an attempt of the setup form stopped, once it had started writing the
 * account's secret storage (S9's sixth review). The form then keeps this
 * attempt's recovery key on screen and uses it again on the next Continue,
 * because from that point the account's secret storage may open only with it:
 *
 * - `'secret_storage'`: `bootstrapSecretStorage` itself failed. It writes the
 *   new key's description, then the default key, then the cross-signing
 *   secrets this device holds (`rust-crypto.js` `bootstrapSecretStorage`),
 *   and its error doesn't say how far it got, so the default key may or may
 *   not be the new one.
 * - `'cross_signing'`: secret storage was replaced; then the cross-signing
 *   step failed or its account confirmation (the password) was cancelled.
 *   `resetCrossSigning` makes new keys on this device and stores them in the
 *   new secret storage before it uploads them
 *   (`CrossSigningIdentity.js` `resetCrossSigning`), so after a cancel the
 *   secret storage holds keys the homeserver never received.
 * - `'backup_none'`: cross-signing is on; the backup step failed, and the
 *   homeserver then answered 404 `M_NOT_FOUND`: no backup exists.
 * - `'backup_unclear'`: cross-signing is on; the backup step failed, and the
 *   homeserver then answered that a backup exists, or didn't answer. The
 *   backup may be the one this attempt created: `resetKeyBackup` creates it
 *   (`POST /room_keys/version`) and only then stores its key in secret
 *   storage (`rust-crypto.js` `resetKeyBackup`), so its key may be on this
 *   device alone, or nowhere if the creation's answer was lost.
 *
 * The "When" above is a first attempt's. A later attempt of the same form
 * that stops at an earlier step undoes nothing an earlier one wrote, so the
 * form's stage is `partwayStageAfter`'s, which never moves back (seventh
 * review).
 *
 * Every `what` says "or the passphrase, if you entered one": a passphrase
 * typed on the first attempt is stored with the new key's description
 * (`createRecoveryKeyFromPassphrase` puts its pbkdf2 salt and iterations in
 * `keyInfo.passphrase`, `rust-crypto.js:915-934`), so it opens the new secret
 * storage too, and the next attempt reuses that key with its description.
 */
export type SetupPartwayStage =
    | 'secret_storage'
    | 'cross_signing'
    | 'backup_none'
    | 'backup_unclear';

/**
 * What the form says after an attempt stopped partway. `what` stays above the
 * recovery key for as long as the form holds that key; `next` is shown under
 * the error only while that attempt's failure is the latest, and only where
 * the next Continue can finish: `'backup_unclear'` has none, and the form
 * offers no Continue there, because the next check would find the backup and
 * refuse with `SETUP_REFUSED_TEXT.backup`, whose "may be able to restore"
 * isn't true of a backup whose key never reached secret storage.
 */
export const SETUP_PARTWAY_TEXT: Record<SetupPartwayStage, { what: string; next?: string }> = {
    secret_storage: {
        what: 'The setup stopped while Blackout was setting up new secret storage for your account, and it may already have done so. If it did, your secret storage now opens only with the recovery key below (or the passphrase, if you entered one), so save it. Cross-signing wasn’t changed, and no key backup was created.',
        next: 'Press Continue to try again with this same recovery key.',
    },
    cross_signing: {
        what: 'The setup stopped before it finished, but Blackout had already set up new secret storage for your account, which now opens only with the recovery key below (or the passphrase, if you entered one), so save it. Cross-signing wasn’t finished, and no key backup was created.',
        next: 'Press Continue to try the rest again with this same recovery key.',
    },
    backup_none: {
        what: 'Your account’s new cross-signing is on, and its new secret storage opens only with the recovery key below (or the passphrase, if you entered one), so save it. Creating the key backup didn’t finish, and your homeserver answered that it has no key backup.',
        next: 'Press Continue to create the backup with this same recovery key: this window keeps that cross-signing rather than replacing it.',
    },
    backup_unclear: {
        what: 'Your account’s new cross-signing is on, and its new secret storage opens only with the recovery key below (or the passphrase, if you entered one), so save it. The key backup step didn’t finish, and your homeserver may now have a key backup that this attempt created before it stopped. That backup’s key may not be in your secret storage, so this recovery key may not restore from it. Blackout won’t set up another backup here, because that would delete it.',
    },
};

/**
 * Shown while an attempt is writing, when the dialog's close button is
 * disabled (seventh review). It claims no more than holds (eighth review):
 * the ✕, Escape, a click outside and Android's back press don't take the
 * window away, but a browser's Back or another way off the screen can, and
 * then the attempt's key is shown in a window of its own
 * (`SETUP_KEY_ELSEWHERE_TEXT`); a reload or a quit loses it, since the key
 * exists only in this page's memory until it is shown.
 */
export const SETUP_WRITING_TEXT =
    'Blackout is changing your account’s keys now. Wait here until it shows the recovery key: reloading or quitting Blackout before then would lose that key.';

/**
 * Above the recovery key of an attempt whose window went away after its first
 * write, before the attempt settled (eighth review): a browser's Back, the
 * search panel closing around the chip, the chip's message becoming readable.
 * The attempt runs on until it settles, to its end or at an account
 * confirmation still unanswered, and its key (finished, or partway with that
 * stage's text) is shown here, from a host mounted outside the app's routes,
 * so that no write is left whose recovery key nobody was shown.
 */
export const SETUP_KEY_ELSEWHERE_TEXT =
    'The window where Blackout was changing your account’s keys went away before it showed the recovery key, so the key is shown here.';

/**
 * The error line when Continue is pressed while another setup or reset of the
 * same account is still writing (its window went away and it runs on, eighth
 * review): two attempts at once would each replace what the other wrote.
 */
export const SETUP_BUSY_TEXT =
    'Another key backup setup is still changing your account’s keys. Wait until Blackout shows its recovery key, then try again.';

/**
 * The error line when the person closes the account confirmation (the
 * password, or single sign-on) that the cross-signing upload asks for. The
 * cancel used to reject with the click event, which has no message, so the
 * error line was empty.
 */
export const SETUP_CONFIRM_CANCELLED_TEXT =
    'The account confirmation step was cancelled, so the setup stopped there.';

/**
 * The error line when the homeserver asks the cross-signing upload for an
 * account confirmation that Blackout cannot do in the app (anything but the
 * password or single sign-on, `SUPPORTED_IN_APP_UIA_STAGES`): for example
 * `org.matrix.cross_signing_reset`, which a Synapse that delegates sign-in to
 * Matrix Authentication Service asks for when cross-signing already exists.
 * Before the seventh review the form showed "Authentication steps to perform
 * this action are not supported by client." with no way to cancel, so the
 * attempt never settled and its recovery key never appeared, although secret
 * storage had already been replaced. It now stops there (stage
 * `'cross_signing'`) and names the stages it was asked for.
 */
export const setupConfirmUnsupportedText = (stages: readonly string[]): string =>
    `Your homeserver asked for a kind of account confirmation that Blackout can’t do${
        stages.length > 0 ? ` (${stages.join(', ')})` : ''
    }, so the setup stopped there.`;

/**
 * Shown under that error in place of the stage's `next`: Continue tries again
 * with the same key, and the homeserver will answer the same way until it
 * stops asking for that confirmation.
 */
export const SETUP_CONFIRM_UNSUPPORTED_NEXT =
    'Continue tries the rest again with this same recovery key, and stops at the same step for as long as your homeserver asks for that confirmation.';

const PARTWAY_RANK: Record<SetupPartwayStage, number> = {
    secret_storage: 0,
    cross_signing: 1,
    backup_none: 2,
    backup_unclear: 3,
};

/**
 * The stage the form shows after an attempt stopped at `attempt`, when an
 * earlier attempt of the same form had stopped at `held` (seventh review).
 *
 * A retry that stops at an earlier step than the last attempt did undoes
 * nothing: after `'backup_none'` the account's cross-signing is still the
 * one this form uploaded, and its secret storage has opened only with this
 * key since the first attempt. So the stage never moves back, and a retry
 * that fails in secret storage after `'backup_none'` keeps that stage's text,
 * not `'secret_storage'`'s "Cross-signing wasn't changed". One exception: a
 * `'backup_*'` text says the form's new cross-signing is on, which holds only
 * when this attempt kept it or made it (`ownCrossSigningOn`). A warned reset
 * whose next attempt found another device's master key and failed at its own
 * cross-signing step shows `'cross_signing'`.
 */
export const partwayStageAfter = (
    attempt: SetupPartwayStage,
    held: SetupPartwayStage | null | undefined,
    ownCrossSigningOn: boolean
): SetupPartwayStage => {
    const later = held && PARTWAY_RANK[held] > PARTWAY_RANK[attempt] ? held : attempt;
    if ((later === 'backup_none' || later === 'backup_unclear') && !ownCrossSigningOn) {
        return 'cross_signing';
    }
    return later;
};

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
