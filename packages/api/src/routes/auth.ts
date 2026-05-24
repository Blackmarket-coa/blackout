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
import {
  consumeEmailVerificationToken,
  issueEmailVerificationToken,
  markVerificationTokenSent,
} from '../services/emailVerification';
import { redeemInvitation } from '../services/invitations';
import {
  confirmAccountDeletion,
  exportUserData,
  requestAccountDeletion,
} from '../services/accountLifecycle';
import { getMailer } from '../services/mailer';
import { log } from '../telemetry/logger';
import {
  authFailuresTotal,
  emailVerificationTokensConsumedTotal,
  emailVerificationTokensIssuedTotal,
  refreshTokenReusesTotal,
} from '../telemetry/metrics';

const auth = new Hono();

auth.use('/login', authRateLimit);
auth.use('/register', authRateLimit);
auth.use('/matrix/exchange', authRateLimit);
auth.use('/password/reset/request', authRateLimit);
auth.use('/password/reset/confirm', authRateLimit);
auth.use('/password/change', authRateLimit);
auth.use('/token/refresh', authRateLimit);
auth.use('/email/verify/request', authRateLimit);
auth.use('/email/verify/confirm', authRateLimit);
auth.use('/account/delete/request', authRateLimit);
auth.use('/account/delete/confirm', authRateLimit);

const buildVerificationLink = (token: string): string => {
  const base = (process.env.PUBLIC_APP_URL ?? 'http://localhost:8080').replace(/\/+$/, '');
  return `${base}/auth/verify-email?token=${encodeURIComponent(token)}`;
};

const dispatchVerificationEmail = async (
  email: string,
  token: string,
  tokenId: string,
): Promise<{ ok: boolean; reason?: string }> => {
  const link = buildVerificationLink(token);
  try {
    await getMailer().send({
      to: email,
      subject: 'Confirm your Blackout email address',
      text:
        `Confirm your email address to finish setting up your Blackout account:\n\n${link}\n\n` +
        `The link expires in 24 hours. If you did not create an account, ignore this email.`,
      kind: 'email_verification',
    });
    markVerificationTokenSent(tokenId);
    return { ok: true };
  } catch (err) {
    log.warn('email_verification_mail_failed', { error: String(err) });
    return { ok: false, reason: 'mail_send_failed' };
  }
};

const matrixHomeserverDomain = (): string =>
  (process.env.MATRIX_HOMESERVER_DOMAIN ?? 'blackout.local').replace(/^@+/, '');

/**
 * Auto-join a freshly-registered user into the community welcome room so every
 * new contributor lands somewhere on first login. Best-effort: a configured
 * room id wins, otherwise we resolve `WELCOME_MATRIX_ROOM_ALIAS`
 * (default `#welcome:<domain>`). Joins via the Synapse admin API so it works
 * even though the new account hasn't synced yet. Any failure (including
 * matrix_not_configured in local/dev) is swallowed — registration already
 * succeeded and must not roll back over a welcome-room miss.
 */
const autoJoinWelcomeRoom = async (username: string): Promise<void> => {
  const configuredId = process.env.WELCOME_MATRIX_ROOM_ID?.trim();
  const alias = process.env.WELCOME_MATRIX_ROOM_ALIAS?.trim() || `#welcome:${matrixHomeserverDomain()}`;

  let roomId = configuredId || undefined;
  if (!roomId) {
    const resolved = await matrixClient.resolveRoomAlias(alias);
    if (!resolved.ok || !resolved.roomId) {
      if (resolved.reason !== 'matrix_not_configured') {
        log.warn('register.welcome_room.resolve_failed', { alias, reason: resolved.reason });
      }
      return;
    }
    roomId = resolved.roomId;
  }

  const userId = `@${username}:${matrixHomeserverDomain()}`;
  const joined = await matrixClient.adminJoinUserToRoom(roomId, userId);
  if (!joined.ok && (!('reason' in joined) || joined.reason !== 'matrix_not_configured')) {
    log.warn('register.welcome_room.join_failed', {
      roomId,
      userId,
      status: 'status' in joined ? joined.status : undefined,
      reason: 'reason' in joined ? joined.reason : undefined,
    });
  }
};

const registerSchema = z.object({
  username: z.string().min(1),
  email: z.string().min(1),
  password: z.string().min(1),
  /** Plaintext invite token from a /v1/invitations link. Optional unless
   *  REQUIRE_INVITE_TOKEN=1, in which case registration is closed without one. */
  inviteToken: z.string().min(1).max(512).optional(),
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
  const { username, email, password, inviteToken } = parsed;

  if (!isAcceptablePassword(password)) {
    return c.json(
      { code: 'weak_password', message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      400,
    );
  }

  // Invite-gated mode: when REQUIRE_INVITE_TOKEN=1 the public /register
  // route is closed unless the caller presents a valid token. We do the
  // up-front lookup so we never create a user we're about to roll back.
  if (process.env.REQUIRE_INVITE_TOKEN === '1' && !inviteToken) {
    return c.json(
      { code: 'invite_required', message: 'Registration requires an invitation token' },
      403,
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

  // Redeem the invitation, if one was presented. Done after Matrix
  // provisioning so the auto-room-invite can target the freshly-minted
  // Matrix account. A bad token rolls back the local + Matrix accounts so
  // the caller can retry with a corrected link.
  let inviteRedemption:
    | { ok: true; matrixInvite?: { ok: boolean } }
    | { ok: false; reason: string }
    | undefined;
  if (inviteToken) {
    const outcome = await redeemInvitation(inviteToken, user);
    if (outcome.kind === 'ok') {
      inviteRedemption = { ok: true, matrixInvite: outcome.matrixInvite };
    } else {
      db.deleteUser(user.id);
      return c.json(
        { code: 'invite_token_invalid', message: 'Invitation token is not usable', reason: outcome.kind },
        400,
      );
    }
  } else if (process.env.REQUIRE_INVITE_TOKEN === '1') {
    // Defence in depth: the up-front gate above already rejects this,
    // but if a future code path skips it we still refuse to issue a session.
    db.deleteUser(user.id);
    return c.json(
      { code: 'invite_required', message: 'Registration requires an invitation token' },
      403,
    );
  }

  // Land every new contributor in the community welcome room. Best-effort and
  // independent of any invite-bound room join above.
  await autoJoinWelcomeRoom(user.username);

  const session = issueSession(user.id, user.username, c.req.header('user-agent'));

  // Mint and dispatch the verification email. Registration succeeds even
  // if the dispatch fails — the caller can retry through
  // POST /auth/email/verify/request. Failures are logged but not surfaced
  // because the user is already past the credential-check step.
  const issued = issueEmailVerificationToken({
    userId: user.id,
    email: user.email,
    ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim(),
    userAgent: c.req.header('user-agent'),
  });
  let emailVerificationSent = false;
  if (issued.kind === 'ok') {
    emailVerificationTokensIssuedTotal.inc({ outcome: 'register' });
    const dispatch = await dispatchVerificationEmail(user.email, issued.token, issued.record.id);
    emailVerificationSent = dispatch.ok;
  }

  return c.json(
    {
      token: session.access.token,
      refreshToken: session.refresh.token,
      userId: user.id,
      emailVerificationSent,
      matrix,
      invite: inviteRedemption,
    },
    201,
  );
});

const emailVerifyRequestSchema = z.object({ email: z.string().min(1).optional() });

auth.post('/email/verify/request', async (c) => {
  const parsed = await readJsonBody(c, emailVerifyRequestSchema);
  if (parsed instanceof Response) return parsed;

  const presentedUser = requireUser(c, 'Sign in required to request a verification email');
  if (presentedUser instanceof Response) return presentedUser;

  const userRecord = db.getUserById(presentedUser.sub);
  if (!userRecord) {
    return c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);
  }

  // If the caller supplied an email, require it to match — prevents a
  // logged-in attacker from triggering verification mails to an arbitrary
  // address.
  const target = parsed.email ?? userRecord.email;
  const issued = issueEmailVerificationToken({
    userId: userRecord.id,
    email: target,
    ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim(),
    userAgent: c.req.header('user-agent'),
  });
  switch (issued.kind) {
    case 'ok': {
      emailVerificationTokensIssuedTotal.inc({ outcome: 'resend' });
      const dispatch = await dispatchVerificationEmail(target, issued.token, issued.record.id);
      if (!dispatch.ok) {
        return c.json({ code: 'mail_send_failed', message: 'Could not send verification email' }, 502);
      }
      return c.json({ ok: true });
    }
    case 'already_verified':
      emailVerificationTokensIssuedTotal.inc({ outcome: 'already_verified' });
      return c.json({ code: 'already_verified', message: 'Email already verified' }, 409);
    case 'email_mismatch':
      return c.json({ code: 'email_mismatch', message: 'Email does not match account' }, 400);
    case 'cooldown':
      emailVerificationTokensIssuedTotal.inc({ outcome: 'cooldown' });
      c.header('retry-after', String(issued.retryAfterSeconds));
      return c.json(
        { code: 'cooldown', message: 'Verification email recently sent; please wait.' },
        429,
      );
    case 'user_missing':
    default:
      return c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);
  }
});

const emailVerifyConfirmSchema = z.object({ token: z.string().min(1) });

auth.post('/email/verify/confirm', async (c) => {
  const parsed = await readJsonBody(c, emailVerifyConfirmSchema);
  if (parsed instanceof Response) return parsed;

  const outcome = consumeEmailVerificationToken(parsed.token);
  emailVerificationTokensConsumedTotal.inc({ outcome: outcome.kind });
  switch (outcome.kind) {
    case 'ok':
      return c.json({ ok: true, userId: outcome.user.id, emailVerifiedAt: outcome.user.emailVerifiedAt });
    case 'expired':
      return c.json({ code: 'token_expired', message: 'Verification token expired' }, 410);
    case 'consumed':
      return c.json({ code: 'token_consumed', message: 'Verification token already used' }, 410);
    case 'revoked':
      return c.json({ code: 'token_revoked', message: 'Verification token revoked' }, 410);
    case 'email_changed':
      return c.json({ code: 'email_changed', message: 'Email address changed since this link was issued' }, 410);
    case 'invalid':
    default:
      return c.json({ code: 'token_invalid', message: 'Verification token invalid' }, 400);
  }
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

// Matrix localpart per the spec's historical grammar: lowercase alnum plus
// a small set of separators. We bound the length so a hostile homeserver
// response can't be used to wedge an oversized username into the store.
const MATRIX_LOCALPART_RE = /^[a-z0-9._=/+-]{1,255}$/;

/**
 * Bridge a live Matrix session into a Blackout API JWT. The client sends
 * its Matrix access token (in `x-matrix-access-token`, NOT `Authorization`,
 * so it doesn't collide with the JWT bearer path in authMiddleware); we
 * validate it against the homeserver via whoami, then look up or
 * auto-provision the matching Blackout user and issue a session. This is
 * what lets users who signed up through the Matrix UI use `/v1/*` features
 * like invitations and marketplace entitlements.
 */
auth.post('/matrix/exchange', async (c) => {
  const matrixToken = c.req.header('x-matrix-access-token') ?? '';
  if (!matrixToken) {
    return c.json({ code: 'matrix_token_missing', message: 'Missing Matrix access token' }, 401);
  }

  const whoami = await matrixClient.whoami(matrixToken);
  if (!whoami.ok) {
    if (whoami.reason === 'matrix_not_configured') {
      return c.json(
        { code: 'matrix_not_configured', message: 'Matrix homeserver is not configured' },
        503,
      );
    }
    authFailuresTotal.inc({ reason: 'matrix_token_invalid' });
    return c.json({ code: 'matrix_token_invalid', message: 'Matrix access token is not valid' }, 401);
  }

  const localpart = whoami.userId.replace(/^@/, '').split(':')[0] ?? '';
  if (!MATRIX_LOCALPART_RE.test(localpart)) {
    return c.json({ code: 'matrix_user_invalid', message: 'Unsupported Matrix user id' }, 400);
  }

  let user = db.findUserByUsername(localpart);
  if (!user) {
    // Auto-provision: the Matrix account already exists (whoami just
    // confirmed it), so there's no second account to create — we only
    // need a Blackout-side row to hang sessions, invitations, and
    // entitlements off of. Mirrors the register flow minus the Matrix call.
    user = db.createUser({
      id: crypto.randomUUID(),
      username: localpart,
      email: '',
      passwordHash: '',
      reputationScore: 0,
      reputationTier: 'member',
      pubkeyEd25519: crypto.randomUUID().replace(/-/g, ''),
    });
  }

  const session = issueSession(user.id, user.username, c.req.header('user-agent'));
  return c.json({ token: session.access.token, refreshToken: session.refresh.token, userId: user.id });
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

// --- Account lifecycle: data export + deletion ---

auth.get('/account/export', (c) => {
  const userOrResp = requireUser(c, 'Sign in required to export account data');
  if (userOrResp instanceof Response) return userOrResp;
  const user = userOrResp;

  const data = exportUserData(user.sub);
  if (!data) return c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);
  // Use a stable filename hint so the client can save it directly.
  c.header(
    'content-disposition',
    `attachment; filename="blackout-export-${user.sub}-${data.exportedAt}.json"`,
  );
  return c.json(data);
});

auth.post('/account/delete/request', async (c) => {
  const userOrResp = requireUser(c, 'Sign in required to delete account');
  if (userOrResp instanceof Response) return userOrResp;
  const user = userOrResp;

  const issued = requestAccountDeletion({
    userId: user.sub,
    ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim(),
    userAgent: c.req.header('user-agent'),
  });
  if (!issued) return c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);

  try {
    await getMailer().send({
      to: issued.user.email,
      subject: 'Confirm Blackout account deletion',
      text: `You (or someone with access to your account) requested account deletion.\n\nUse this token to confirm deletion: ${issued.token}\n\nIt expires in 30 minutes. If this was not you, change your password immediately and ignore this email — no data has been deleted.`,
      kind: 'account_deletion',
    });
  } catch (err) {
    log.warn('account_deletion_mail_failed', { error: String(err) });
  }
  return c.json({ ok: true, expiresAt: issued.expiresAt }, 202);
});

const accountDeleteConfirmSchema = z.object({ token: z.string().min(1) });

auth.post('/account/delete/confirm', async (c) => {
  const userOrResp = requireUser(c, 'Sign in required to delete account');
  if (userOrResp instanceof Response) return userOrResp;
  const user = userOrResp;

  const parsed = await readJsonBody(c, accountDeleteConfirmSchema);
  if (parsed instanceof Response) return parsed;

  const outcome = confirmAccountDeletion(parsed.token, user.sub);
  switch (outcome.kind) {
    case 'ok':
      // After deletion the JWT still cryptographically validates — denylist
      // it so the holder can't replay until expiry.
      if (user.jti && user.exp) {
        db.revokeSession({
          jti: user.jti,
          userId: user.sub,
          expiresAt: new Date(user.exp * 1000).toISOString(),
          reason: 'account_deleted',
        });
      }
      return c.json({ ok: true });
    case 'expired':
      return c.json({ code: 'delete_token_expired', message: 'Deletion token expired' }, 410);
    case 'consumed':
      return c.json({ code: 'delete_token_consumed', message: 'Deletion token already used' }, 410);
    case 'user_mismatch':
      return c.json(
        { code: 'delete_token_user_mismatch', message: 'Deletion token does not belong to the authenticated user' },
        403,
      );
    case 'invalid':
    default:
      return c.json({ code: 'delete_token_invalid', message: 'Deletion token invalid' }, 400);
  }
});

// Re-export the legacy `signJwt` for callers that imported it from this module.
export { signJwt };
export default auth;
