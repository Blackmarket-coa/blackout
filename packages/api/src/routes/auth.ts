import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/store';
import {
  MIN_PASSWORD_LENGTH,
  hashPassword,
  isAcceptablePassword,
  signJwt,
  signJwtWithMeta,
  verifyPasswordConstantTime,
} from '../services/auth';
import { matrixClient } from '../integrations/matrix-client';
import { authRateLimit } from '../middleware/rate-limit';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { issueRefreshToken, revokeRefreshToken, revokeAllForUser, rotateRefreshToken } from '../services/refreshToken';
import { consumePasswordResetToken, issuePasswordResetToken } from '../services/passwordReset';
import { getMailer } from '../services/mailer';
import { log } from '../telemetry/logger';
import { authFailuresTotal, refreshTokenReusesTotal } from '../telemetry/metrics';

const auth = new Hono();

auth.use('/login', authRateLimit);
auth.use('/register', authRateLimit);
auth.use('/password/reset/request', authRateLimit);
auth.use('/password/reset/confirm', authRateLimit);
auth.use('/password/change', authRateLimit);
auth.use('/token/refresh', authRateLimit);

const registerSchema = z.object({
  username: z.string().min(1),
  email: z.string().min(1),
  password: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

const issueSession = (userId: string, username: string, userAgent?: string) => {
  const access = signJwtWithMeta(userId, username);
  const refresh = issueRefreshToken({ userId, userAgent });
  return { access, refresh };
};

auth.post('/register', async (c) => {
  const parsed = await readJsonBody(c, registerSchema);
  if (parsed instanceof Response) return parsed;
  const { username, email, password } = parsed;

  if (!isAcceptablePassword(password)) {
    return c.json(
      { code: 'weak_password', message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      400,
    );
  }

  if (db.findUserByEmail(email) || db.findUserByUsername(username)) {
    return c.json({ code: 'user_exists', message: 'User already exists' }, 409);
  }

  const userId = crypto.randomUUID();
  const passwordHash = hashPassword(password);
  const pubkeyEd25519 = crypto.randomUUID().replace(/-/g, '');

  const user = db.createUser({
    id: userId,
    username,
    email,
    passwordHash,
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519,
  });

  let matrix: Awaited<ReturnType<typeof matrixClient.registerUser>>;
  try {
    matrix = await matrixClient.registerUser(username, password);
  } catch (error) {
    db.deleteUser(user.id);
    return c.json(
      { code: 'matrix_provisioning_failed', message: 'Failed to provision Matrix account', detail: (error as Error).message },
      502,
    );
  }

  // matrix_not_configured is expected in local/dev — keep the local user.
  // Any other !ok (HTTP error from Synapse) is a real failure: roll back so
  // the caller can retry with the same email/username.
  if (!matrix.ok && !('reason' in matrix && matrix.reason === 'matrix_not_configured')) {
    db.deleteUser(user.id);
    return c.json({ code: 'matrix_provisioning_failed', message: 'Failed to provision Matrix account', matrix }, 502);
  }

  const session = issueSession(user.id, user.username, c.req.header('user-agent'));

  return c.json(
    {
      token: session.access.token,
      refreshToken: session.refresh.token,
      userId: user.id,
      matrix,
    },
    201,
  );
});

auth.post('/login', async (c) => {
  const parsed = await readJsonBody(c, loginSchema);
  if (parsed instanceof Response) return parsed;
  const { email, password } = parsed;

  const user = db.findUserByEmail(email);

  // Run scrypt even when the user is missing so the two 401 branches have
  // equivalent timing and cannot be used to enumerate registered emails.
  if (!verifyPasswordConstantTime(password, user?.passwordHash)) {
    authFailuresTotal.inc({ reason: 'invalid_credentials' });
    return c.json({ code: 'invalid_credentials', message: 'Invalid credentials' }, 401);
  }

  const session = issueSession(user!.id, user!.username, c.req.header('user-agent'));
  return c.json({ token: session.access.token, refreshToken: session.refresh.token, userId: user!.id });
});

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

auth.post('/token/refresh', async (c) => {
  const parsed = await readJsonBody(c, refreshSchema);
  if (parsed instanceof Response) return parsed;

  const outcome = rotateRefreshToken(parsed.refreshToken, c.req.header('user-agent'));
  switch (outcome.kind) {
    case 'ok': {
      const user = db.getUserById(outcome.record.userId);
      if (!user) {
        return c.json({ code: 'invalid_refresh_token', message: 'User no longer exists' }, 401);
      }
      const access = signJwtWithMeta(user.id, user.username);
      return c.json({ token: access.token, refreshToken: outcome.rotated.token, userId: user.id });
    }
    case 'reuse_detected': {
      refreshTokenReusesTotal.inc();
      log.warn('refresh_token_reuse_detected', { userId: outcome.userId, familyId: outcome.familyId });
      return c.json(
        { code: 'refresh_token_reused', message: 'Refresh token reuse detected; all sessions revoked. Re-authenticate.' },
        401,
      );
    }
    case 'expired':
      return c.json({ code: 'refresh_token_expired', message: 'Refresh token expired' }, 401);
    case 'revoked':
      return c.json({ code: 'refresh_token_revoked', message: 'Refresh token revoked' }, 401);
    case 'invalid':
    default:
      return c.json({ code: 'invalid_refresh_token', message: 'Invalid refresh token' }, 401);
  }
});

const logoutSchema = z.object({ refreshToken: z.string().min(1).optional() });

auth.post('/logout', async (c) => {
  const userOrResp = requireUser(c, 'Sign in required to log out');
  if (userOrResp instanceof Response) return userOrResp;

  const parsed = await readJsonBody(c, logoutSchema);
  if (parsed instanceof Response) return parsed;

  const user = userOrResp;

  if (parsed.refreshToken) {
    revokeRefreshToken(parsed.refreshToken, 'logout');
  }
  // Always denylist the access token so its remaining TTL cannot be replayed.
  if (user.jti && user.exp) {
    db.revokeSession({
      jti: user.jti,
      userId: user.sub,
      expiresAt: new Date(user.exp * 1000).toISOString(),
      reason: 'logout',
    });
  }
  return c.json({ ok: true });
});

auth.post('/sessions/revoke', async (c) => {
  const userOrResp = requireUser(c, 'Sign in required to revoke sessions');
  if (userOrResp instanceof Response) return userOrResp;
  const user = userOrResp;
  const refreshCount = revokeAllForUser(user.sub, 'admin_revoke');
  return c.json({ ok: true, refreshTokensRevoked: refreshCount });
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH),
});

auth.post('/password/change', async (c) => {
  const userOrResp = requireUser(c, 'Sign in required to change password');
  if (userOrResp instanceof Response) return userOrResp;
  const user = userOrResp;
  const parsed = await readJsonBody(c, passwordChangeSchema);
  if (parsed instanceof Response) return parsed;

  const record = db.getUserById(user.sub);
  if (!record) return c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);

  if (!verifyPasswordConstantTime(parsed.currentPassword, record.passwordHash)) {
    return c.json({ code: 'invalid_credentials', message: 'Current password is incorrect' }, 401);
  }
  if (!isAcceptablePassword(parsed.newPassword)) {
    return c.json(
      { code: 'weak_password', message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      400,
    );
  }

  db.updateUserPassword(record.id, hashPassword(parsed.newPassword));
  // Force re-authentication on every other device.
  revokeAllForUser(record.id, 'password_change');
  return c.json({ ok: true });
});

const passwordResetRequestSchema = z.object({ email: z.string().min(1) });

auth.post('/password/reset/request', async (c) => {
  const parsed = await readJsonBody(c, passwordResetRequestSchema);
  if (parsed instanceof Response) return parsed;

  const issued = issuePasswordResetToken({
    email: parsed.email,
    ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim(),
    userAgent: c.req.header('user-agent'),
  });
  if (issued) {
    try {
      await getMailer().send({
        to: issued.user.email,
        subject: 'Reset your Blackout password',
        text: `Use this token to reset your password: ${issued.token}\n\nIt expires in 30 minutes. If you did not request this, ignore this email.`,
        kind: 'password_reset',
      });
    } catch (err) {
      log.warn('password_reset_mail_failed', { error: String(err) });
      // We deliberately do not surface this to the caller — keep the response
      // shape identical regardless of whether the email exists.
    }
  }
  // Always 202 to avoid leaking which addresses have accounts.
  return c.json({ ok: true }, 202);
});

const passwordResetConfirmSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH),
});

auth.post('/password/reset/confirm', async (c) => {
  const parsed = await readJsonBody(c, passwordResetConfirmSchema);
  if (parsed instanceof Response) return parsed;

  const outcome = consumePasswordResetToken(parsed.token, parsed.newPassword);
  switch (outcome.kind) {
    case 'ok':
      return c.json({ ok: true });
    case 'weak_password':
      return c.json(
        { code: 'weak_password', message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        400,
      );
    case 'expired':
      return c.json({ code: 'reset_token_expired', message: 'Reset token expired' }, 410);
    case 'consumed':
      return c.json({ code: 'reset_token_consumed', message: 'Reset token already used' }, 410);
    case 'invalid':
    default:
      return c.json({ code: 'reset_token_invalid', message: 'Reset token invalid' }, 400);
  }
});

// Re-export the legacy `signJwt` for callers that imported it from this module.
export { signJwt };
export default auth;
