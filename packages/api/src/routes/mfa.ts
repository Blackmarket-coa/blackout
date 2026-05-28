/**
 * WHAT THIS FILE DOES
 * The API surface for multi-factor authentication (MFA). MFA means
 * even if someone steals your password, they still can't log in
 * because they also need a 6-digit code from your phone.
 *
 * The flow works like this:
 *   1. POST /totp/setup   → Get a QR code. Scan it with an authenticator
 *                            app (any authenticator: Authy, 1Password, Bitwarden, etc.).
 *   2. POST /totp/verify  → Enter the 6-digit code from the app to
 *                            prove you scanned correctly. MFA is now ON.
 *   3. POST /totp/disable → Enter a valid code to turn MFA OFF.
 *   4. POST /recovery/use → If you lose your phone, use one of the 8
 *                            recovery codes you saved during setup.
 *   5. GET /status         → Check if MFA is enabled and how many
 *                            recovery codes are left.
 *
 * WHY IT EXISTS (THE SECURITY PROBLEM)
 * Passwords alone are not enough. They can be guessed, stolen in a
 * breach, or phished. MFA adds a "second factor" — something you have
 * (your phone) in addition to something you know (your password). Even
 * if an attacker gets your password, they can't log in without the
 * current 6-digit code from your phone.
 *
 * HOW WE FIXED IT
 * - Dedicated `mfaRateLimit` bucket (5 req/min) prevents brute-force
 *   guessing of TOTP codes — a shared `authRateLimit` bucket would
 *   let an attacker exhaust your login rate limit by flooding MFA.
 * - Recovery code exhaustion auto-disables MFA so a user who used
 *   their last code isn't permanently locked out.
 * - Setup checks `verified` flag (not just `enabled`) so calling
 *   setup twice in a row doesn't silently overwrite your secret.
 *
 * KEY CONCEPTS EXPLAINED
 * - TOTP (Time-based One-Time Password): A shared secret between
 *   your app and the server. Every 30 seconds, both sides run the
 *   same math on the secret to generate the same 6-digit code.
 * - Recovery codes: One-time passwords printed during setup. Store
 *   them somewhere safe (like a password manager). Each can be used
 *   once to log in if your phone is lost. Server stores only SHA-256
 *   hashes of the codes, never the codes themselves.
 *
 * HOW TO VERIFY
 * 1. Call POST /totp/setup → get secret + URI + recovery codes. Scan
 *    QR code into any authenticator app.
 * 2. Call POST /totp/verify with the 6-digit code → MFA enabled.
 * 3. Call POST /login → returns { requiresMfa: true, mfaToken }.
 * 4. Call POST /login/mfa with mfaToken + code → get session.
 * 5. Call POST /recovery/use with a recovery code → logged in, MFA
 *    disabled since last code was used.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser } from '../middleware/require-user';
import { readJsonBody } from '../middleware/validate';
import { mfaRateLimit } from '../middleware/rate-limit';
import { db } from '../db/store';
import {
  enableMFA,
  generateTOTPSecret,
  verifyRecoveryCode,
  verifyTOTPCode,
} from '../services/totp';

const mfa = new Hono();

mfa.use('*', mfaRateLimit);

mfa.get('/status', (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const config = db.getMFAConfig(user.sub);
  if (!config?.enabled) {
    return c.json({ enabled: false });
  }

  const remainingCodes = (config.recoveryCodeHashes ?? []).length - (config.usedRecoveryCodes ?? []).length;
  return c.json({ enabled: true, type: 'totp', recoveryCodesRemaining: Math.max(0, remainingCodes) });
});

mfa.post('/totp/setup', (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const existing = db.getMFAConfig(user.sub);
  if (existing?.verified) {
    return c.json({ code: 'mfa_already_enabled', message: 'MFA is already enabled. Disable it first.' }, 409);
  }

  const secret = generateTOTPSecret(user.sub, 'Blackout');
  return c.json({ secret: secret.secretBase32, uri: secret.uri, recoveryCodes: secret.recoveryCodes }, 201);
});

const verifySchema = z.object({ code: z.string().min(6).max(6) });

mfa.post('/totp/verify', async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const config = db.getMFAConfig(user.sub);
  if (!config?.secretBase32) {
    return c.json({ code: 'mfa_not_setup', message: 'MFA is not set up. Call /totp/setup first.' }, 400);
  }

  const parsed = await readJsonBody(c, verifySchema);
  if (parsed instanceof Response) return parsed;

  const result = verifyTOTPCode(config.secretBase32, parsed.code);
  if (!result.ok) {
    return c.json({ code: 'invalid_code', message: result.reason ?? 'Invalid TOTP code' }, 400);
  }

  db.enableMFA(user.sub);
  return c.json({ ok: true });
});

mfa.post('/totp/disable', async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const config = db.getMFAConfig(user.sub);
  if (!config?.enabled) {
    return c.json({ code: 'mfa_not_enabled', message: 'MFA is not enabled' }, 400);
  }

  const parsed = await readJsonBody(c, verifySchema);
  if (parsed instanceof Response) return parsed;

  const result = verifyTOTPCode(config.secretBase32, parsed.code);
  if (!result.ok) {
    return c.json({ code: 'invalid_code', message: result.reason ?? 'Invalid TOTP code' }, 400);
  }

  db.disableMFA(user.sub);
  return c.json({ ok: true });
});

const recoverySchema = z.object({ code: z.string().min(1).max(20) });

mfa.post('/recovery/use', async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const parsed = await readJsonBody(c, recoverySchema);
  if (parsed instanceof Response) return parsed;

  const outcome = verifyRecoveryCode(user.sub, parsed.code);
  if (outcome.kind !== 'ok') {
    return c.json({ code: 'invalid_code', message: 'Invalid or already-used recovery code' }, 400);
  }

  const config = db.getMFAConfig(user.sub);
  const remainingCodes = (config?.recoveryCodeHashes?.length ?? 0) - (config?.usedRecoveryCodes?.length ?? 0);

  // When the last recovery code is used, disable MFA so the user can
  // set up a new TOTP device without being locked out.
  if (remainingCodes <= 0) {
    db.disableMFA(user.sub);
  }

  return c.json({ ok: true, recoveryCodesRemaining: Math.max(0, remainingCodes), mfaDisabled: remainingCodes <= 0 ? true : undefined });
});

export default mfa;
