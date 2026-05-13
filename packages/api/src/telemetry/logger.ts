/**
 * Redaction-aware structured logger for the Blackout API.
 *
 * Patterns live in @blackout/core/redaction so the client-side Sentry
 * `beforeSend` can reuse them. This module supplies the server-side
 * salted SHA-256 hasher for high-cardinality identifiers.
 */

import { createHash } from 'node:crypto';
import { redactObject, type Hasher } from '@blackout/core/redaction';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  [key: string]: unknown;
}

const isProduction = () => process.env.NODE_ENV === 'production';
const hashSalt = (): string => process.env.LOG_HASH_SALT ?? 'blackout-log-salt';

const pseudonymize: Hasher = (value: string) =>
  `h:${createHash('sha256').update(hashSalt()).update(value).digest('base64url').slice(0, 16)}`;

export const redact = (fields: LogFields): LogFields =>
  redactObject(fields, { hash: pseudonymize, pseudonymize: isProduction() });

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

export const __test__ = { pseudonymize };
