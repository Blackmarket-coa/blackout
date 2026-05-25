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

const SECRET_KEY_RE =
  /\b(authorization|cookie|password|passphrase|recovery|jwt|token|api[_-]?key|secret|otp|totp|client[_-]?secret)\b/i;

const sanitizeBreadcrumb = (breadcrumb: unknown): unknown => {
  if (!breadcrumb || typeof breadcrumb !== 'object') return breadcrumb;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(breadcrumb as Record<string, unknown>)) {
    if (SECRET_KEY_RE.test(key)) out[key] = '[REDACTED]';
    else out[key] = value;
  }
  return out;
};

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
    beforeBreadcrumb: (breadcrumb: { data?: Record<string, unknown> }) => ({
      ...breadcrumb,
      data: sanitizeBreadcrumb(breadcrumb.data),
    }),
    beforeSend: (event: { request?: { headers?: Record<string, string> } }) => {
      if (event.request?.headers) {
        for (const key of Object.keys(event.request.headers)) {
          if (SECRET_KEY_RE.test(key)) {
            (event.request.headers as Record<string, string>)[key] = '[REDACTED]';
          }
        }
      }
      return event;
    },
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
