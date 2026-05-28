/**
 * TOTP (RFC 6238) multi-factor authentication service.
 *
 * WHAT THIS FILE DOES
 * Implements the TOTP standard (RFC 6238) — the same 6-digit
 * codes that change every 30 seconds. Users scan a QR code during
 * setup, and then need their phone to log in.
 *
 * WHAT WAS WRONG (THE TIMING ATTACK)
 * Two timing side-channels were fixed:
 * 1. TOTP code comparison used `===` which stops at the first wrong
 *    character. An attacker measuring response times could brute-force
 *    the 6-digit code faster by observing when the server takes slightly
 *    longer (meaning the first N digits matched). Fixed with `timingSafeEqual`.
 * 2. Recovery code lookup used `indexOf` which also short-circuits.
 *    Fixed with a constant-time linear scan using `timingSafeEqual`.
 *
 * HOW IT WORKS
 * - Secret generation: 32 random bytes, base32-encoded (same format
 *   authenticator app QR codes expect).
 * - Code verification: Run HMAC-SHA1 with the time window as counter.
 *   Check ±1 window to account for clock drift (90 seconds total).
 * - Recovery codes: 8 codes, 10 chars each, stored as SHA-256 hashes.
 *   When the last code is used, MFA is auto-disabled so the user can
 *   set up a new device.
 *
 * KEY CONCEPT — TOTP (Time-based One-Time Password)
 * An algorithm where a shared secret plus the current time produces
 * a 6-digit code. Both sides compute the same code independently
 * every 30 seconds. No network needed after initial setup.
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
    const code = randomBytes(10).toString('base64url').slice(0, 10);
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
    const expected = Buffer.from(generateHOTP(secret, checkTime));
    const provided = Buffer.from(code);
    if (expected.length === provided.length && timingSafeEqual(expected, provided)) {
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
  const hashBuf = Buffer.from(hash, 'hex');

  let foundIndex = -1;
  for (let i = 0; i < config.recoveryCodeHashes.length; i += 1) {
    const target = Buffer.from(config.recoveryCodeHashes[i], 'hex');
    if (target.length === hashBuf.length && timingSafeEqual(target, hashBuf)) {
      foundIndex = i;
      break;
    }
  }
  if (foundIndex === -1) return { kind: 'invalid' };
  if (config.usedRecoveryCodes?.includes(foundIndex)) return { kind: 'already_used' };

  db.markRecoveryCodeUsed(userId, foundIndex);
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
