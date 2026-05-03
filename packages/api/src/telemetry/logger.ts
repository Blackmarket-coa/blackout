/**
 * Redaction-aware structured logger for the Blackout API.
 *
 * Goals:
 *   - Never log secrets (tokens, refresh tokens, passwords, recovery keys).
 *   - In production, drop or hash high-cardinality identifiers that can
 *     re-link a user (Matrix ID, room ID, IP, raw email) so aggregated logs
 *     do not become a metadata graph of who-talks-to-whom.
 *   - Stay dependency-free.
 */

import { createHash } from 'node:crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  [key: string]: unknown;
}

const SECRET_KEY_RE =
  /\b(authorization|cookie|set-cookie|password|passphrase|recovery|jwt|token|access[_-]?token|refresh[_-]?token|api[_-]?key|secret|otp|totp|client[_-]?secret)\b/i;

const PII_KEY_RE = /\b(email|phone|ip|ip[_-]?address|x[_-]?forwarded[_-]?for|user[_-]?agent)\b/i;

const ID_KEY_RE = /\b(matrix[_-]?id|user[_-]?id|mxid|room[_-]?id|event[_-]?id|device[_-]?id)\b/i;

const TOKEN_VALUE_RE = /\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g;

const REDACTED = '[REDACTED]';

const isProduction = () => process.env.NODE_ENV === 'production';

const hashSalt = (): string => process.env.LOG_HASH_SALT ?? 'blackout-log-salt';

/** One-way hash for high-cardinality identifiers — preserves uniqueness, removes the value. */
const pseudonymize = (value: string): string =>
  `h:${createHash('sha256').update(hashSalt()).update(value).digest('base64url').slice(0, 16)}`;

const redactString = (value: string): string => value.replace(TOKEN_VALUE_RE, REDACTED);

const redactValue = (key: string, value: unknown, depth = 0): unknown => {
  if (value == null) return value;
  if (depth > 5) return '[…]'; // bound recursion

  if (SECRET_KEY_RE.test(key)) return REDACTED;

  if (PII_KEY_RE.test(key)) {
    if (typeof value === 'string') return isProduction() ? pseudonymize(value) : value;
    return value;
  }

  if (ID_KEY_RE.test(key)) {
    if (typeof value === 'string') return isProduction() ? pseudonymize(value) : value;
    return value;
  }

  if (typeof value === 'string') return redactString(value);

  if (Array.isArray(value)) {
    return value.map((v, i) => redactValue(`${key}[${i}]`, v, depth + 1));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactValue(k, v, depth + 1);
    }
    return out;
  }

  return value;
};

export const redact = (fields: LogFields): LogFields => {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = redactValue(k, v);
  }
  return out;
};

const writers: Record<LogLevel, (line: string) => void> = {
  debug: (l) => console.debug(l),
  info: (l) => console.info(l),
  warn: (l) => console.warn(l),
  error: (l) => console.error(l),
};

const emit = (level: LogLevel, msg: string, fields: LogFields = {}) => {
  const safe = redact(fields);
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...safe,
  });
  writers[level](line);
};

export const log = {
  debug: (msg: string, fields?: LogFields) => emit('debug', msg, fields),
  info: (msg: string, fields?: LogFields) => emit('info', msg, fields),
  warn: (msg: string, fields?: LogFields) => emit('warn', msg, fields),
  error: (msg: string, fields?: LogFields) => emit('error', msg, fields),
};

export const __test__ = { pseudonymize, redactValue };
