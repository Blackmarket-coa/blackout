// Sentry client init with redaction.
//
// Lazy-imports @sentry/browser so the app boots even if the package isn't
// installed (operators add it when they want crash capture). When the DSN
// is empty, init silently no-ops. `beforeSend` reuses the shared redaction
// patterns from @blackout/core/redaction with a small synchronous hasher
// for matrix IDs / room IDs.

import { redactObject } from '@blackout/core/redaction';

// djb2 — fast, deterministic, non-crypto. Sufficient for "this is a hashed
// identifier" log-joinability on the client side. Server logs use a salted
// SHA-256 with a different shape, so the two namespaces are distinguishable.
const djb2 = (input: string): string => {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return `cli:${(hash >>> 0).toString(36)}`;
};

interface SentryLike {
  init: (opts: Record<string, unknown>) => void;
}

const scrubEvent = (event: unknown): unknown =>
  redactObject(event, { pseudonymize: true, hash: djb2 });

export interface InitSentryOptions {
  readonly dsn: string | undefined;
  readonly release?: string;
  readonly environment?: string;
}

let initialized = false;

export const initSentry = async (opts: InitSentryOptions): Promise<void> => {
  if (initialized || !opts.dsn) return;
  initialized = true;
  let sentry: SentryLike | null = null;
  try {
    // Spelled as a runtime-resolved specifier so TypeScript doesn't try to
    // resolve `@sentry/browser` at typecheck time. Operators install the
    // package separately when they want crash capture.
    const specifier = '@sentry/browser';
    sentry = (await import(/* @vite-ignore */ specifier)) as SentryLike;
  } catch {
    // Package not installed — leave crash capture disabled. The bug-report
    // form still works; only the automatic Sentry capture is off.
    return;
  }
  sentry.init({
    dsn: opts.dsn,
    release: opts.release,
    environment: opts.environment,
    // Keep the SDK lean. Operators can broaden via patching, but defaults
    // here avoid shipping autoSessionTracking, replays, and other features
    // that have heavier privacy implications.
    autoSessionTracking: false,
    sendDefaultPii: false,
    beforeSend: (event: unknown) => scrubEvent(event),
    beforeBreadcrumb: (crumb: unknown) => scrubEvent(crumb),
  });
};

export const __test__ = { scrubEvent, djb2, reset: () => { initialized = false; } };
