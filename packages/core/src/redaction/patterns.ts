/**
 * Runtime-agnostic redaction primitives shared between the API logger
 * (`packages/api/src/telemetry/logger.ts`) and the client-side Sentry
 * `beforeSend` (`apps/blackout-client/src/app/lib/sentry/init.ts`).
 *
 * No node:crypto, no DOM. Callers inject a `hash` function so the server
 * can pass createHash('sha256') and the browser can pass a Web Crypto
 * wrapper.
 */

export const REDACTED = '[REDACTED]';

export const SECRET_KEY_RE =
    /\b(authorization|cookie|set-cookie|password|passphrase|recovery|jwt|token|access[_-]?token|refresh[_-]?token|api[_-]?key|secret|otp|totp|client[_-]?secret)\b/i;

export const PII_KEY_RE =
    /\b(email|phone|ip|ip[_-]?address|x[_-]?forwarded[_-]?for|user[_-]?agent)\b/i;

export const ID_KEY_RE =
    /\b(matrix[_-]?id|user[_-]?id|mxid|room[_-]?id|event[_-]?id|device[_-]?id)\b/i;

/**
 * Message-content-shaped keys. Nothing logs these today — the 2026-08-10
 * encryption audit checked — and this exists so that stays true by accident as
 * well as by intent. Blackout's whole claim is that the server never sees
 * message plaintext; a single well-meaning `log.debug('event', { content })`
 * added later would quietly falsify it, and reviewers do not reliably catch
 * that. Treated as hard secrets rather than pseudonymized, because a hashed
 * message body is no more useful than a redacted one.
 *
 * Deliberately excludes `text`, which is overwhelmingly used for benign labels.
 * Note `\bbody\b` does not match `bodyExcerpt`, so upstream HTTP error
 * excerpts stay loggable under that name.
 */
export const CONTENT_KEY_RE =
    /\b(body|formatted[_-]?body|content|plaintext|message[_-]?body|decrypted)\b/i;

const TOKEN_VALUE_RE = /\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g;

const MX_ROOM_ID_RE = /![A-Za-z0-9._=/+-]+:[A-Za-z0-9.\-]+/g;
const MX_USER_ID_RE = /@[A-Za-z0-9._=/+-]+:[A-Za-z0-9.\-]+/g;

export type Hasher = (value: string) => string;

const noopHash: Hasher = (v) => `h:${v.length}`;

export interface RedactOptions {
    /** Hash function for high-cardinality IDs. Required when `pseudonymize` is true. */
    hash?: Hasher;
    /** When true, hash PII/ID values found by key or inline. Default false (dev). */
    pseudonymize?: boolean;
    /** Bound recursion. */
    maxDepth?: number;
}

const redactInlineStrings = (value: string, opts: RedactOptions): string => {
    let out = value.replace(TOKEN_VALUE_RE, REDACTED);
    if (opts.pseudonymize) {
        const hash = opts.hash ?? noopHash;
        out = out.replace(MX_ROOM_ID_RE, (m) => hash(m)).replace(MX_USER_ID_RE, (m) => hash(m));
    }
    return out;
};

export const redactString = (value: string, opts: RedactOptions = {}): string =>
    redactInlineStrings(value, opts);

const redactValue = (key: string, value: unknown, opts: RedactOptions, depth: number): unknown => {
    if (value == null) return value;
    if (depth > (opts.maxDepth ?? 5)) return '[…]';

    if (SECRET_KEY_RE.test(key) || CONTENT_KEY_RE.test(key)) return REDACTED;

    if (PII_KEY_RE.test(key) || ID_KEY_RE.test(key)) {
        if (typeof value === 'string') {
            if (opts.pseudonymize) {
                const hash = opts.hash ?? noopHash;
                return hash(value);
            }
            return value;
        }
        return value;
    }

    if (typeof value === 'string') return redactInlineStrings(value, opts);

    if (Array.isArray(value)) {
        return value.map((v, i) => redactValue(`${key}[${i}]`, v, opts, depth + 1));
    }

    if (typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = redactValue(k, v, opts, depth + 1);
        }
        return out;
    }

    return value;
};

export const redactObject = <T>(obj: T, opts: RedactOptions = {}): T =>
    redactValue('$', obj, opts, 0) as T;
