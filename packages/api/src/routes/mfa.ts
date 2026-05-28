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
