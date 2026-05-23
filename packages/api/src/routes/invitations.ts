import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/store';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { authRateLimit } from '../middleware/rate-limit';
import {
  MAX_TTL_HOURS,
  MAX_USES_CEILING,
  createInvitation,
  listInvitationsForUser,
  previewInvitation,
  redeemInvitation,
  revokeInvitation,
} from '../services/invitations';
import type { InvitationTokenRecord } from '../db/types';
import { matrixClient } from '../integrations/matrix-client';
import {
  invitationsCreatedTotal,
  invitationsMatrixMintFailuresTotal,
  invitationsRedeemedTotal,
} from '../telemetry/metrics';

const invitations = new Hono();

// Token enumeration is cheap to attempt; rate-limit the public preview and
// the authed redeem endpoint to blunt brute-force scans without locking
// out a legitimate landing page.
invitations.use('/preview/*', authRateLimit);
invitations.use('/redeem', authRateLimit);

const redeemSchema = z.object({
  token: z.string().min(1).max(512),
});

const createSchema = z.object({
  matrixRoomId: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[!#][^\s:]+:[^\s:]+$/, 'must look like a Matrix room id or alias')
    .optional(),
  label: z.string().min(1).max(120).optional(),
  maxUses: z.number().int().min(1).max(MAX_USES_CEILING).optional(),
  expiresInHours: z.number().int().min(0).max(MAX_TTL_HOURS).optional(),
});

const listQuerySchema = z.object({
  state: z.enum(['active', 'revoked', 'exhausted', 'expired']).optional(),
  label: z.string().trim().min(1).max(120).optional(),
});

/**
 * Build the shareable invite URL. The Synapse registration token rides
 * in the URL fragment so it never reaches the server (fragments aren't
 * sent on HTTP requests). The recipient's browser parses the fragment
 * on the landing page and stashes it for RegisterForm to pre-fill.
 */
const buildInviteUrl = (token: string, synapseRegistrationToken?: string): string => {
  const base = (process.env.PUBLIC_APP_URL ?? 'http://localhost:8080').replace(/\/+$/, '');
  const path = `${base}/invite/${encodeURIComponent(token)}`;
  if (!synapseRegistrationToken) return path;
  return `${path}#registrationToken=${encodeURIComponent(synapseRegistrationToken)}`;
};

const publicShape = (record: InvitationTokenRecord) => ({
  id: record.id,
  label: record.label,
  matrixRoomId: record.matrixRoomId,
  maxUses: record.maxUses,
  useCount: record.useCount,
  usesRemaining: Math.max(0, record.maxUses - record.useCount),
  expiresAt: record.expiresAt,
  revokedAt: record.revokedAt,
  createdAt: record.createdAt,
});

invitations.post('/', async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const parsed = await readJsonBody(c, createSchema);
  if (parsed instanceof Response) return parsed;

  const outcome = await createInvitation({
    createdBy: user.sub,
    matrixRoomId: parsed.matrixRoomId,
    label: parsed.label,
    maxUses: parsed.maxUses,
    expiresInHours: parsed.expiresInHours,
  });

  if (outcome.kind === 'matrix_mint_failed') {
    invitationsMatrixMintFailuresTotal.inc({ reason: outcome.reason });
    return c.json(
      {
        code: 'matrix_mint_failed',
        message:
          'Could not mint a Matrix registration token. Check that MATRIX_HOMESERVER and MATRIX_BOT_TOKEN are configured and the bot has admin rights.',
        reason: outcome.reason,
        detail: outcome.detail,
      },
      503,
    );
  }

  invitationsCreatedTotal.inc({
    scoped: outcome.record.matrixRoomId ? 'room' : 'global',
  });

  return c.json(
    {
      invitation: publicShape(outcome.record),
      // Plaintext token is returned exactly once; the inviter is responsible
      // for capturing the URL before navigating away.
      token: outcome.token,
      // Synapse registration token is also returned exactly once. Embedded
      // in the URL fragment, never echoed in list/preview responses.
      synapseRegistrationToken: outcome.synapseRegistrationToken,
      url: buildInviteUrl(outcome.token, outcome.synapseRegistrationToken),
    },
    201,
  );
});

/**
 * Owner-only diagnostic for a room-scoped invite: reports the resolved bot
 * MXID, whether the bot is actually a member of the den, and the exact Synapse
 * result of a fresh force-join attempt. Lets us see *why* redeemers can't be
 * admitted (wrong bot id, 403 reason, bot absent) without server-log access.
 */
invitations.get('/:id/matrix-status', async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const record = db.getInvitationTokenById(c.req.param('id'));
  if (!record || record.createdBy !== user.sub) {
    return c.json({ code: 'not_found', message: 'Invitation not found' }, 404);
  }
  if (!record.matrixRoomId) {
    return c.json({ scoped: 'global', message: 'This invite is not bound to a den.' });
  }

  const roomId = record.matrixRoomId;
  const botUserId = await matrixClient.botUserId();
  if (!botUserId) {
    return c.json({ code: 'matrix_not_configured', message: 'Matrix bot is not configured.' }, 503);
  }

  const members = await matrixClient.getRoomMembers(roomId);
  const botInRoom = members.ok ? members.members.includes(botUserId) : undefined;

  // Re-run the force-join so the response carries the exact Synapse outcome.
  const join = await matrixClient.adminJoinUserToRoom(roomId, botUserId);
  const parent = await matrixClient.getRoomParentSpace(roomId);

  return c.json({
    scoped: 'room',
    roomId,
    botUserId,
    botInRoom,
    membersLookup: {
      ok: members.ok,
      status: 'status' in members ? members.status : undefined,
      reason: 'reason' in members ? members.reason : undefined,
      detail: 'detail' in members ? members.detail : undefined,
    },
    botJoinAttempt: {
      ok: join.ok,
      status: 'status' in join ? join.status : undefined,
      reason: 'reason' in join ? join.reason : undefined,
      detail: 'detail' in join ? join.detail : undefined,
    },
    canopyId: parent.ok ? parent.canopyId : undefined,
  });
});

invitations.get('/', (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const parsedQuery = listQuerySchema.safeParse(c.req.query());
  if (!parsedQuery.success) {
    return c.json(
      { code: 'bad_request', message: 'Invalid list filters', issues: parsedQuery.error.issues },
      400,
    );
  }

  const rows = listInvitationsForUser(user.sub, parsedQuery.data);
  return c.json({
    invitations: rows.map((r) => ({
      ...publicShape(r),
      redemptions: db.listInvitationRedemptionsByToken(r.id).map((red) => ({
        userId: red.redeemedByUserId,
        username: db.getUserById(red.redeemedByUserId)?.username ?? red.redeemedByUserId,
        matrixInviteOk: red.matrixInviteOk,
        at: red.createdAt,
      })),
    })),
  });
});

invitations.delete('/:id', async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const outcome = await revokeInvitation(c.req.param('id'), user.sub);
  switch (outcome.kind) {
    case 'ok':
      return c.json({
        invitation: publicShape(outcome.record),
        synapseRevoke: outcome.synapseRevoke,
      });
    case 'not_found':
      return c.json({ code: 'not_found', message: 'Invitation not found' }, 404);
    case 'forbidden':
      return c.json({ code: 'forbidden', message: 'Only the inviter can revoke this invitation' }, 403);
  }
});

/**
 * Redeem an invitation token as the authenticated caller. Used by the
 * client invite-landing page after the recipient has signed up (or signed
 * in to an existing account) via the standard Matrix UIA flow. Pairs with
 * the `inviteToken` field on `POST /auth/register` for the API-mediated
 * sign-up path; both ultimately call `redeemInvitation` from the service.
 */
invitations.post('/redeem', async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const parsed = await readJsonBody(c, redeemSchema);
  if (parsed instanceof Response) return parsed;

  const redeemer = db.getUserById(user.sub);
  if (!redeemer) {
    return c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);
  }

  const outcome = await redeemInvitation(parsed.token, redeemer);
  invitationsRedeemedTotal.inc({ outcome: outcome.kind });
  switch (outcome.kind) {
    case 'ok':
      return c.json({
        ok: true,
        matrixRoomId: outcome.record.matrixRoomId,
        matrixInvite: outcome.matrixInvite,
        canopyId: outcome.canopyId,
      });
    case 'self_redeem':
      return c.json({ ok: false, reason: 'self_redeem' }, 400);
    case 'invalid':
      return c.json({ ok: false, reason: 'invalid' }, 404);
    case 'revoked':
      return c.json({ ok: false, reason: 'revoked' }, 410);
    case 'exhausted':
      return c.json({ ok: false, reason: 'exhausted' }, 410);
    case 'expired':
      return c.json({ ok: false, reason: 'expired' }, 410);
  }
});

invitations.get('/preview/:token', (c) => {
  const outcome = previewInvitation(c.req.param('token'));
  switch (outcome.kind) {
    case 'ok':
      return c.json({
        valid: true,
        invitation: {
          inviter: outcome.inviter,
          matrixRoomId: outcome.record.matrixRoomId,
          label: outcome.record.label,
          usesRemaining: outcome.usesRemaining,
          expiresAt: outcome.record.expiresAt,
        },
      });
    case 'invalid':
      return c.json({ valid: false, reason: 'invalid' }, 404);
    case 'revoked':
      return c.json({ valid: false, reason: 'revoked' }, 410);
    case 'exhausted':
      return c.json({ valid: false, reason: 'exhausted' }, 410);
    case 'expired':
      return c.json({ valid: false, reason: 'expired' }, 410);
  }
});

export default invitations;
