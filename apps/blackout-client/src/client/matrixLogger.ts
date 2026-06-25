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
 * Wrap a matrix-js-sdk `Logger` so `warn` drops the benign push-rule lines and
 * every other method delegates unchanged. `getChild` wraps recursively so
 * namespaced child loggers (e.g. crypto) keep the same filtering.
 */
export const wrapMatrixLogger = (base: Logger): Logger => ({
    trace: (...args: unknown[]) => base.trace(...args),
    debug: (...args: unknown[]) => base.debug(...args),
    info: (...args: unknown[]) => base.info(...args),
    warn: (...args: unknown[]) => {
        if (isPushRuleNoise(args)) return;
        base.warn(...args);
    },
    error: (...args: unknown[]) => base.error(...args),
    getChild: (namespace: string) => wrapMatrixLogger(base.getChild(namespace)),
});

/** The shared filtered logger handed to `createClient({ logger })`. */
export const filteredMatrixLogger: Logger = wrapMatrixLogger(defaultMatrixLogger);
