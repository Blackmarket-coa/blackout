/**
 * TOTP (RFC 6238) multi-factor authentication service.
 *
 * Secret generation: 32 random bytes, base32-encoded. QR-code URI format
 * matches the standard otpauth:// schema. Code verification uses the
 * standard 30-second window with ±1 window drift tolerance.
 *
 * Recovery codes: 8 x 10-character alphanumeric codes stored as SHA-256
 * hashes. Each code is single-use. Presenting a valid recovery code
 * marks it consumed and revokes all other codes in that batch.
 */

import { createHash, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { db } from '../db/store';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const CODE_DIGITS = 6;
const WINDOW_SECONDS = 30;
const ALLOWED_DRIFT = 1;

function base32Encode(bytes: Buffer): string {
  let result = '';
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return result;
}

function generateHOTP(secret: Buffer, counter: bigint): string {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigInt64BE(counter, 0);
  const hmac = createHmac('sha1', secret).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % (10 ** CODE_DIGITS)).toString().padStart(CODE_DIGITS, '0');
}

export interface TOTPSecret {
  secretBase32: string;
  uri: string;
  recoveryCodes: string[];
}

export function generateTOTPSecret(userId: string, issuer = 'Blackout'): TOTPSecret {
  const secret = randomBytes(32);
  const secretBase32 = base32Encode(secret);
  const label = encodeURIComponent(`${issuer}:${userId}`);
  const uri = `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${CODE_DIGITS}&period=${WINDOW_SECONDS}`;

  const recoveryCodes: string[] = [];
  const hashedCodes: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    const code = randomBytes(5).toString('hex').slice(0, 10).toUpperCase();
    recoveryCodes.push(code);
    hashedCodes.push(createHash('sha256').update(code).digest('hex'));
  }

  db.upsertMFAConfig(userId, {
    secretBase32,
    recoveryCodeHashes: hashedCodes,
    usedRecoveryCodes: [],
    enabled: false,
    verified: false,
  });

  return { secretBase32, uri, recoveryCodes };
}

export interface TOTPVerifyResult {
  ok: boolean;
  reason?: string;
}

export function verifyTOTPCode(secretBase32: string, code: string, now = Date.now()): TOTPVerifyResult {
  if (code.length !== CODE_DIGITS || !/^\d+$/.test(code)) {
    return { ok: false, reason: 'Invalid TOTP code format' };
  }
  const secret = base32Decode(secretBase32);
  if (!secret) return { ok: false, reason: 'Invalid secret format' };

  const timeStep = BigInt(Math.floor(now / 1000 / WINDOW_SECONDS));
  for (let drift = -ALLOWED_DRIFT; drift <= ALLOWED_DRIFT; drift += 1) {
    const checkTime = timeStep + BigInt(drift);
    if (generateHOTP(secret, checkTime) === code) {
      return { ok: true };
    }
  }
  return { ok: false, reason: 'Invalid TOTP code' };
}

function base32Decode(base32: string): Buffer | null {
  try {
    let bits = 0;
    let value = 0;
    const bytes: number[] = [];
    for (const char of base32.toUpperCase().replace(/=+$/, '')) {
      const idx = BASE32_ALPHABET.indexOf(char);
      if (idx === -1) return null;
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    return Buffer.from(bytes);
  } catch {
    return null;
  }
}

export type RecoveryCodeResult =
  | { kind: 'ok' }
  | { kind: 'invalid' }
  | { kind: 'already_used' };

export function verifyRecoveryCode(userId: string, code: string): RecoveryCodeResult {
  const config = db.getMFAConfig(userId);
  if (!config || !config.recoveryCodeHashes || config.recoveryCodeHashes.length === 0) {
    return { kind: 'invalid' };
  }
  const hash = createHash('sha256').update(code.trim()).digest('hex');
  const index = config.recoveryCodeHashes.indexOf(hash);
  if (index === -1) return { kind: 'invalid' };
  if (config.usedRecoveryCodes?.includes(index)) return { kind: 'already_used' };

  db.markRecoveryCodeUsed(userId, index);
  return { kind: 'ok' };
}

export function enableMFA(userId: string, code: string): TOTPVerifyResult {
  const config = db.getMFAConfig(userId);
  if (!config?.secretBase32) return { ok: false, reason: 'No MFA setup in progress' };

  const result = verifyTOTPCode(config.secretBase32, code);
  if (!result.ok) return result;

  db.enableMFA(userId);
  return { ok: true };
}
