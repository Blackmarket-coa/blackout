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
  revokeInvitation,
} from '../services/invitations';
import type { InvitationTokenRecord } from '../db/types';

const invitations = new Hono();

// Token enumeration is cheap to attempt; rate-limit the public preview to
// blunt brute-force scans without locking out a legitimate landing page.
invitations.use('/preview/*', authRateLimit);

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

const buildInviteUrl = (token: string): string => {
  const base = (process.env.PUBLIC_APP_URL ?? 'http://localhost:8080').replace(/\/+$/, '');
  return `${base}/invite/${encodeURIComponent(token)}`;
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

  const { token, record } = createInvitation({
    createdBy: user.sub,
    matrixRoomId: parsed.matrixRoomId,
    label: parsed.label,
    maxUses: parsed.maxUses,
    expiresInHours: parsed.expiresInHours,
  });

  return c.json(
    {
      invitation: publicShape(record),
      // Plaintext token is returned exactly once; the inviter is responsible
      // for capturing the URL before navigating away.
      token,
      url: buildInviteUrl(token),
    },
    201,
  );
});

invitations.get('/', (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const rows = listInvitationsForUser(user.sub);
  return c.json({
    invitations: rows.map((r) => ({
      ...publicShape(r),
      redemptions: db.listInvitationRedemptionsByToken(r.id).map((red) => ({
        userId: red.redeemedByUserId,
        matrixInviteOk: red.matrixInviteOk,
        at: red.createdAt,
      })),
    })),
  });
});

invitations.delete('/:id', (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const outcome = revokeInvitation(c.req.param('id'), user.sub);
  switch (outcome.kind) {
    case 'ok':
      return c.json({ invitation: publicShape(outcome.record) });
    case 'not_found':
      return c.json({ code: 'not_found', message: 'Invitation not found' }, 404);
    case 'forbidden':
      return c.json({ code: 'forbidden', message: 'Only the inviter can revoke this invitation' }, 403);
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
