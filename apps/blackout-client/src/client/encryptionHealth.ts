import type { MatrixClient } from 'matrix-js-sdk';
import { CryptoEvent } from 'matrix-js-sdk/lib/crypto-api';

/**
 * BO-1 root-cause classifier.
 *
 * `matrixLogger` counts how OFTEN a device hits undecryptable history
 * (`decryptUtd`), and the diagnostics surfaces carry that count — but the
 * count alone cannot say WHY. KNOWN_ISSUES.md records the open question as
 * three hypotheses: backup setup never completing, restore failing, or
 * cross-signing state. This module keeps a passively-updated snapshot of
 * exactly the state that distinguishes them, so a bug report from an affected
 * device classifies its own cause:
 *
 *   - `serverBackup: 'no'`                       → backup was never set up
 *   - backup exists but `activeBackup: 'no'`,
 *     `decryptionKeyCached: 'no'`, or
 *     `backupFailures > 0`                       → restore is failing
 *   - `backupTrusted: 'no'` or
 *     `crossSigningReady: 'no'`                  → cross-signing/trust state
 *
 * The snapshot is module-level and synchronous to read, mirroring
 * `getSuppressedLogCounts()` in ./matrixLogger — `collectDiagnostics()` is
 * synchronous and React-free, so it cannot await the CryptoApi directly.
 * Tracking starts when the client boots and refreshes on the key-backup
 * CryptoEvents; these states do not flap, so event-driven freshness is enough.
 *
 * Privacy: tristates and small integers only — no room/user/device/session
 * identifiers, no error strings — safe to carry in a report that may end up
 * on a public issue tracker. Do NOT add SDK error messages here; classify
 * them into counts instead.
 */

export type HealthTristate = 'yes' | 'no' | 'unknown';

export interface EncryptionHealthSnapshot {
    /** A key-backup version exists on the homeserver. */
    serverBackup: HealthTristate;
    /** This device trusts that backup (valid signature from a trusted device). */
    backupTrusted: HealthTristate;
    /** This session is actively connected to a backup version. */
    activeBackup: HealthTristate;
    /** The backup decryption key is cached locally, so restore is possible. */
    decryptionKeyCached: HealthTristate;
    /** Cross-signing is set up and ready on this device. */
    crossSigningReady: HealthTristate;
    /** KeyBackupFailed events observed since tracking started. */
    backupFailures: number;
    /** False until a refresh has completed at least once (or tracking never started). */
    sampled: boolean;
}

const UNSAMPLED: EncryptionHealthSnapshot = {
    serverBackup: 'unknown',
    backupTrusted: 'unknown',
    activeBackup: 'unknown',
    decryptionKeyCached: 'unknown',
    crossSigningReady: 'unknown',
    backupFailures: 0,
    sampled: false,
};

let snapshot: EncryptionHealthSnapshot = { ...UNSAMPLED };
let trackedClient: MatrixClient | null = null;

const toTristate = (value: boolean | null): HealthTristate => {
    if (value === null) return 'unknown';
    return value ? 'yes' : 'no';
};

/**
 * Re-read every field from the CryptoApi. Each read is independently
 * try/caught: one failing API (e.g. the server unreachable for
 * `getKeyBackupInfo`) must not blank the locally-answerable fields.
 */
const refresh = async (mx: MatrixClient): Promise<void> => {
    const crypto = mx.getCrypto();
    if (!crypto) return;

    const [serverBackup, backupTrusted] = await crypto
        .getKeyBackupInfo()
        .then(async (info) => {
            if (!info) return ['no', 'no'] as const;
            try {
                const trust = await crypto.isKeyBackupTrusted(info);
                return ['yes', toTristate(trust.trusted)] as const;
            } catch {
                return ['yes', 'unknown'] as const;
            }
        })
        .catch(() => ['unknown', 'unknown'] as const);

    const activeBackup = await crypto
        .getActiveSessionBackupVersion()
        .then((v) => toTristate(typeof v === 'string'))
        .catch((): HealthTristate => 'unknown');

    const decryptionKeyCached = await crypto
        .getSessionBackupPrivateKey()
        .then((key) => toTristate(key !== null))
        .catch((): HealthTristate => 'unknown');

    const crossSigningReady = await crypto
        .isCrossSigningReady()
        .then((ready) => toTristate(ready))
        .catch((): HealthTristate => 'unknown');

    // The tracked client may have been stopped (logout) while the reads were
    // in flight; a stale session's answers must not overwrite the reset state.
    if (trackedClient !== mx) return;

    snapshot = {
        ...snapshot,
        serverBackup,
        backupTrusted,
        activeBackup,
        decryptionKeyCached,
        crossSigningReady,
        sampled: true,
    };
};

const onBackupStatus = (): void => {
    if (trackedClient) void refresh(trackedClient);
};

const onBackupFailed = (): void => {
    snapshot = { ...snapshot, backupFailures: snapshot.backupFailures + 1 };
    if (trackedClient) void refresh(trackedClient);
};

const onDecryptionKeyCached = (): void => {
    if (trackedClient) void refresh(trackedClient);
};

const detach = (mx: MatrixClient): void => {
    mx.removeListener(CryptoEvent.KeyBackupStatus, onBackupStatus);
    mx.removeListener(CryptoEvent.KeyBackupFailed, onBackupFailed);
    mx.removeListener(CryptoEvent.KeyBackupDecryptionKeyCached, onDecryptionKeyCached);
};

/**
 * Begin tracking a client's encryption health. Called once the rust crypto
 * layer is initialized; replaces any previously tracked client (session
 * switch). The initial refresh is fire-and-forget — boot must not wait on it.
 */
export const startEncryptionHealthTracking = (mx: MatrixClient): void => {
    if (trackedClient) detach(trackedClient);
    trackedClient = mx;
    snapshot = { ...UNSAMPLED };

    mx.on(CryptoEvent.KeyBackupStatus, onBackupStatus);
    mx.on(CryptoEvent.KeyBackupFailed, onBackupFailed);
    mx.on(CryptoEvent.KeyBackupDecryptionKeyCached, onDecryptionKeyCached);

    void refresh(mx);
};

/**
 * Stop tracking and reset to unsampled. A report filed after logout must say
 * "unknown" rather than carry another session's stale posture. No-op unless
 * the stopped client is the one being tracked — a session switch stops the
 * old client after the new one is already registered.
 */
export const stopEncryptionHealthTracking = (mx: MatrixClient | null): void => {
    if (!mx || mx !== trackedClient) return;
    detach(trackedClient);
    trackedClient = null;
    snapshot = { ...UNSAMPLED };
};

/** Synchronous snapshot for diagnostics collection; never throws. */
export const getEncryptionHealthSnapshot = (): EncryptionHealthSnapshot => ({ ...snapshot });

/**
 * One-line rendering for the bug-widget metadata table, attached only when a
 * report already carries a non-zero UTD count (see widgetReportState). Example:
 * `backup=yes trusted=no active=no key_cached=no cross_signing=yes failures=2`.
 */
export const formatEncryptionHealth = (s: EncryptionHealthSnapshot): string => {
    if (!s.sampled) return 'unsampled';
    return [
        `backup=${s.serverBackup}`,
        `trusted=${s.backupTrusted}`,
        `active=${s.activeBackup}`,
        `key_cached=${s.decryptionKeyCached}`,
        `cross_signing=${s.crossSigningReady}`,
        `failures=${s.backupFailures}`,
    ].join(' ');
};

/** Reset module state. Exposed for tests. */
export const resetEncryptionHealthForTests = (): void => {
    if (trackedClient) detach(trackedClient);
    trackedClient = null;
    snapshot = { ...UNSAMPLED };
};
