/**
 * Redaction-aware structured logger for the Blackout API.
 *
 * Patterns live in @blackout/core/redaction so the client-side Sentry
 * `beforeSend` can reuse them. This module supplies the server-side
 * salted SHA-256 hasher for high-cardinality identifiers.
 */

import { createHash } from 'node:crypto';
import { redactString, redactObject, type Hasher } from '@blackout/core/redaction';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  [key: string]: unknown;
}

const isProduction = () => process.env.NODE_ENV === 'production';
const hashSalt = (): string => {
  const salt = process.env.LOG_HASH_SALT;
  if (!salt && isProduction()) {
    throw new Error('LOG_HASH_SALT is required in production. Set it to a random string to pseudonymize log fields.');
  }
  return salt ?? 'blackout-log-salt';
};

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
  const safeMsg = redactString(msg);
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), level, msg: safeMsg, ...safe });
    writers[level](line);
  } catch {
    console.error(`[logger:unserializable] level=${level} msg=${msg}`);
  }
};

export const log = {
  debug: (msg: string, fields?: LogFields) => emit('debug', msg, fields),
  info: (msg: string, fields?: LogFields) => emit('info', msg, fields),
  warn: (msg: string, fields?: LogFields) => emit('warn', msg, fields),
  error: (msg: string, fields?: LogFields) => emit('error', msg, fields),
};

export const __test__ = { pseudonymize };
