/**
 * Optional Sentry integration. Activated when SENTRY_DSN is set.
 *
 * The Sentry SDK is loaded dynamically so the api workspace stays slim when
 * error tracking is not configured. If the SDK is missing we surface a single
 * warning and continue — the rest of the API runs identically.
 *
 * All breadcrumbs and event scrubbing rely on the same secret/PII patterns as
 * the structured logger so we don't accidentally ship pseudonymized payloads
 * out of the secrets boundary.
 */

import { createHash } from 'node:crypto';
import { redactObject, type Hasher } from '@blackout/core/redaction';
import { log } from './logger';

export interface ErrorReporter {
    capture(error: unknown, context?: Record<string, unknown>): void;
    flush(timeoutMs?: number): Promise<boolean>;
}

class NoopReporter implements ErrorReporter {
    capture(error: unknown): void {
        log.warn('errors:noop', { error: error instanceof Error ? error.message : String(error) });
    }
    async flush(): Promise<boolean> {
        return true;
    }
}

let cached: ErrorReporter = new NoopReporter();
let initPromise: Promise<void> | null = null;

const hashSalt = (): string => process.env.LOG_HASH_SALT ?? 'blackout-log-salt';

const pseudonymize: Hasher = (value: string) =>
    `h:${createHash('sha256').update(hashSalt()).update(value).digest('base64url').slice(0, 16)}`;

/**
 * Scrub a whole Sentry payload with the shared redaction rules.
 *
 * This module used to keep a hand-copied `SECRET_KEY_RE` and apply it only to
 * top-level breadcrumb keys and `event.request.headers`, while the file header
 * claimed it used "the same secret/PII patterns as the structured logger". It
 * did not: the copy had drifted and was missing `set-cookie`, `access_token`
 * and `refresh_token`, and nothing walked nested objects — so an exception
 * carrying context several levels deep went out unscrubbed. The browser client
 * already ran `redactObject` over the entire event
 * (`apps/blackout-client/src/app/lib/sentry/init.ts`); the server now matches it.
 */
const scrubEvent = <T>(event: T): T =>
    redactObject(event, { hash: pseudonymize, pseudonymize: true });

const initSentry = async (): Promise<void> => {
    const dsn = process.env.SENTRY_DSN?.trim();
    if (!dsn) return;

    let sentry: typeof import('@sentry/node') | null = null;
    try {
        sentry = (await import('@sentry/node')) as typeof import('@sentry/node');
    } catch (err) {
        log.warn('errors: SENTRY_DSN set but @sentry/node not installed', { error: String(err) });
        return;
    }

    sentry.init({
        dsn,
        release: process.env.SENTRY_RELEASE,
        environment: process.env.NODE_ENV ?? 'development',
        tracesSampleRate: Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
        beforeBreadcrumb: (breadcrumb: unknown) => scrubEvent(breadcrumb),
        beforeSend: (event: unknown) => scrubEvent(event),
    });

    cached = {
        capture(error, context) {
            sentry!.captureException(error, context ? { extra: context } : undefined);
        },
        async flush(timeoutMs = 2_000) {
            return sentry!.close(timeoutMs);
        },
    };

    log.info('errors:sentry-initialized', { release: process.env.SENTRY_RELEASE ?? 'unknown' });
};

export const initErrorReporter = async (): Promise<void> => {
    if (initPromise) return initPromise;
    initPromise = initSentry();
    return initPromise;
};

export const errorReporter = (): ErrorReporter => cached;

/** Test-only: replace the active reporter. */
export const __test__ = {
    setReporter(reporter: ErrorReporter): void {
        cached = reporter;
        initPromise = Promise.resolve();
    },
    reset(): void {
        cached = new NoopReporter();
        initPromise = null;
    },
};
