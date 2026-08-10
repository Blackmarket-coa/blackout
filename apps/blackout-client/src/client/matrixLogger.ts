import { logger as defaultMatrixLogger, type Logger } from 'matrix-js-sdk/lib/logger';

/**
 * matrix-js-sdk's `PushProcessor` emits ~20 WARN lines on every sync when the
 * homeserver's push-rule set doesn't exactly match the SDK's built-in defaults:
 *
 *   Missing default global override push rule .m.rule.master
 *   Adding default global override push rule .m.rule.is_room_mention
 *   …
 *
 * The SDK self-heals by patching the missing defaults locally, so the lines are
 * benign — but they flood the console on each sync. We drop only those, leaving
 * every other warning/error (and all levels, prefixes, and child loggers) intact
 * by delegating to the real default logger.
 */
export const PUSH_RULE_NOISE = /default global (?:override|underride) push rule/;

const isPushRuleNoise = (args: unknown[]): boolean =>
    typeof args[0] === 'string' && PUSH_RULE_NOISE.test(args[0]);

/**
 * matrix-js-sdk's `PerSessionKeyBackupDownloader` logs an INFO line on every
 * sync when no usable server-side key backup exists:
 *
 *   [PerSessionKeyBackupDownloader] Unsupported algorithm undefined
 *
 * This is the SDK probing for a backup and finding none — purely informational
 * and unactionable. It is the only `info`-level "Unsupported algorithm" line in
 * the SDK (the other occurrence is a thrown Error, not a log), so dropping it at
 * `info` is safe and leaves real decryption warnings/errors intact.
 */
export const KEY_BACKUP_PROBE_NOISE = /^Unsupported algorithm\b/;

const isKeyBackupProbeNoise = (args: unknown[]): boolean =>
    typeof args[0] === 'string' && KEY_BACKUP_PROBE_NOISE.test(args[0]);

/**
 * matrix-sdk-crypto (the rust layer) emits a WARN for every event it cannot
 * decrypt because the room key is missing:
 *
 *   Failed to decrypt a room event: Can't find the room key to decrypt the event, withheld code: None
 *
 * On a fresh device with no server-side key backup this fires for every
 * historical message — expected, unactionable, and a duplicate: the js-sdk
 * logs its own `DecryptionError` line per event (with room/event ids), and the
 * timeline shows a per-event "unable to decrypt" state. Dropping only the rust
 * duplicate keeps real UTD diagnostics visible while halving the flood.
 */
export const DECRYPT_UTD_NOISE = /Failed to decrypt a room event: Can't find the room key/;

const isDecryptUtdNoise = (args: unknown[]): boolean =>
    typeof args[0] === 'string' && DECRYPT_UTD_NOISE.test(args[0]);

/**
 * Tally of lines this wrapper dropped, by reason.
 *
 * Suppressing the decrypt-UTD warning is reasonable on its own — it is a
 * duplicate of the js-sdk's own `DecryptionError` line — but suppressing it
 * *and* the key-backup probe together meant the one signal that tells you how
 * often users cannot read their own history stopped being observable anywhere.
 * The 2026-08-10 encryption audit could not answer "how bad is the key-backup
 * DecryptionError problem?" for exactly this reason.
 *
 * Counting instead of re-logging keeps the console quiet while making the rate
 * measurable: read it from the bug-report payload or a diagnostics panel. A
 * non-zero and growing `decryptUtd` means devices are missing room keys, which
 * usually means key backup is not set up or not restoring.
 */
export interface SuppressedLogCounts {
    pushRule: number;
    keyBackupProbe: number;
    decryptUtd: number;
}

const suppressed: SuppressedLogCounts = { pushRule: 0, keyBackupProbe: 0, decryptUtd: 0 };

/** Snapshot of suppressed-line counts since page load (or the last reset). */
export const getSuppressedLogCounts = (): SuppressedLogCounts => ({ ...suppressed });

/** Reset the tally. Exposed for tests. */
export const resetSuppressedLogCounts = (): void => {
    suppressed.pushRule = 0;
    suppressed.keyBackupProbe = 0;
    suppressed.decryptUtd = 0;
};

/**
 * Wrap a matrix-js-sdk `Logger` so the benign push-rule (`warn`), key-backup
 * probe (`info`), and missing-room-key decrypt (`warn`) lines are dropped while
 * every other method delegates unchanged. Dropped lines are counted in
 * {@link getSuppressedLogCounts} so the rate stays visible.
 * `getChild` wraps recursively so namespaced child loggers (e.g. crypto) keep
 * the same filtering.
 */
export const wrapMatrixLogger = (base: Logger): Logger => ({
    trace: (...args: unknown[]) => base.trace(...args),
    debug: (...args: unknown[]) => base.debug(...args),
    info: (...args: unknown[]) => {
        if (isKeyBackupProbeNoise(args)) {
            suppressed.keyBackupProbe += 1;
            return;
        }
        base.info(...args);
    },
    warn: (...args: unknown[]) => {
        if (isPushRuleNoise(args)) {
            suppressed.pushRule += 1;
            return;
        }
        if (isDecryptUtdNoise(args)) {
            suppressed.decryptUtd += 1;
            return;
        }
        base.warn(...args);
    },
    error: (...args: unknown[]) => base.error(...args),
    getChild: (namespace: string) => wrapMatrixLogger(base.getChild(namespace)),
});

/** The shared filtered logger handed to `createClient({ logger })`. */
export const filteredMatrixLogger: Logger = wrapMatrixLogger(defaultMatrixLogger);
