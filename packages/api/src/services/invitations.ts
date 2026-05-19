import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db } from '../db/store';
import type { InvitationTokenRecord, UserRecord } from '../db/types';
import { matrixClient } from '../integrations/matrix-client';

const INVITATION_TOKEN_BYTES = 32;
const DEFAULT_MAX_USES = 1;
const DEFAULT_TTL_HOURS = 24 * 7; // 7 days
export const MAX_USES_CEILING = 1000;
export const MAX_TTL_HOURS = 24 * 365; // one year

const sha256 = (input: string): string => createHash('sha256').update(input).digest('hex');

const matrixUserIdFor = (username: string): string => {
  const domain = (process.env.MATRIX_HOMESERVER_DOMAIN ?? 'blackout.local').replace(/^@+/, '');
  return `@${username}:${domain}`;
};

export interface CreateInvitationInput {
  createdBy: string;
  matrixRoomId?: string;
  label?: string;
  /** 1..MAX_USES_CEILING; defaults to 1 (single-use link). */
  maxUses?: number;
  /** Hours from now until expiry. 0 = never expire. Defaults to 7 days. */
  expiresInHours?: number;
}

export interface CreateInvitationResult {
  token: string;
  record: InvitationTokenRecord;
}

export const createInvitation = (input: CreateInvitationInput): CreateInvitationResult => {
  const maxUses = clampMaxUses(input.maxUses ?? DEFAULT_MAX_USES);
  const ttlHours = clampTtlHours(input.expiresInHours ?? DEFAULT_TTL_HOURS);
  const expiresAt = ttlHours === 0
    ? undefined
    : new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();

  const token = randomBytes(INVITATION_TOKEN_BYTES).toString('base64url');
  const record = db.createInvitationToken({
    id: randomUUID(),
    createdBy: input.createdBy,
    tokenHash: sha256(token),
    matrixRoomId: input.matrixRoomId,
    label: input.label,
    maxUses,
    expiresAt,
  });
  return { token, record };
};

export type PreviewOutcome =
  | {
      kind: 'ok';
      record: InvitationTokenRecord;
      inviter: { id: string; username: string };
      usesRemaining: number;
    }
  | { kind: 'invalid' }
  | { kind: 'revoked' }
  | { kind: 'exhausted' }
  | { kind: 'expired' };

/** Looks the token up without consuming it; used by the landing page to
 *  show the recipient who invited them and whether the link still works. */
export const previewInvitation = (presentedToken: string): PreviewOutcome => {
  const record = db.findInvitationTokenByHash(sha256(presentedToken));
  if (!record) return { kind: 'invalid' };
  const status = evaluateInvitation(record);
  if (status.kind !== 'ok') return status;
  const inviter = db.getUserById(record.createdBy);
  if (!inviter) return { kind: 'invalid' };
  return {
    kind: 'ok',
    record,
    inviter: { id: inviter.id, username: inviter.username },
    usesRemaining: record.maxUses - record.useCount,
  };
};

export type RedeemOutcome =
  | { kind: 'ok'; record: InvitationTokenRecord; matrixInvite?: { ok: boolean } }
  | { kind: 'invalid' }
  | { kind: 'revoked' }
  | { kind: 'exhausted' }
  | { kind: 'expired' }
  | { kind: 'self_redeem' };

/**
 * Atomically redeem the token for the supplied user. The useCount is
 * incremented via the DB layer so two concurrent redemptions on the last
 * remaining slot can't both win. If the token is bound to a Matrix room,
 * a best-effort invite is sent for the redeemer's Matrix ID after the
 * redemption is durable — Matrix failure does not roll back the redemption,
 * matching how registration tolerates `matrix_not_configured`.
 */
export const redeemInvitation = async (
  presentedToken: string,
  redeemer: UserRecord,
): Promise<RedeemOutcome> => {
  const tokenRecord = db.findInvitationTokenByHash(sha256(presentedToken));
  if (!tokenRecord) return { kind: 'invalid' };

  const status = evaluateInvitation(tokenRecord);
  if (status.kind !== 'ok') return status;

  if (tokenRecord.createdBy === redeemer.id) {
    return { kind: 'self_redeem' };
  }

  const updated = db.incrementInvitationTokenUseCount(tokenRecord.id);
  if (!updated) {
    // Lost the race — re-evaluate to surface the right reason.
    const refreshed = db.getInvitationTokenById(tokenRecord.id);
    if (!refreshed) return { kind: 'invalid' };
    return evaluateInvitation(refreshed) as RedeemOutcome;
  }

  let matrixInvite: { ok: boolean } | undefined;
  if (updated.matrixRoomId) {
    const result = await matrixClient.inviteToRoom(
      updated.matrixRoomId,
      matrixUserIdFor(redeemer.username),
      'Invitation link redeemed',
    );
    matrixInvite = { ok: result.ok };
  }

  db.createInvitationRedemption({
    id: randomUUID(),
    invitationTokenId: updated.id,
    redeemedByUserId: redeemer.id,
    matrixInviteOk: matrixInvite?.ok,
  });

  return { kind: 'ok', record: updated, matrixInvite };
};

export const revokeInvitation = (
  id: string,
  byUserId: string,
): { kind: 'ok'; record: InvitationTokenRecord } | { kind: 'not_found' } | { kind: 'forbidden' } => {
  const existing = db.getInvitationTokenById(id);
  if (!existing) return { kind: 'not_found' };
  if (existing.createdBy !== byUserId) return { kind: 'forbidden' };
  const updated = db.revokeInvitationToken(id, 'revoked_by_creator');
  if (!updated) return { kind: 'not_found' };
  return { kind: 'ok', record: updated };
};

export const listInvitationsForUser = (userId: string): InvitationTokenRecord[] =>
  db.listInvitationTokensByCreator(userId);

const evaluateInvitation = (
  record: InvitationTokenRecord,
):
  | { kind: 'ok' }
  | { kind: 'revoked' }
  | { kind: 'exhausted' }
  | { kind: 'expired' } => {
  if (record.revokedAt) return { kind: 'revoked' };
  if (record.useCount >= record.maxUses) return { kind: 'exhausted' };
  if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
    return { kind: 'expired' };
  }
  return { kind: 'ok' };
};

const clampMaxUses = (n: number): number => {
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > MAX_USES_CEILING) return MAX_USES_CEILING;
  return Math.floor(n);
};

const clampTtlHours = (n: number): number => {
  if (!Number.isFinite(n) || n < 0) return DEFAULT_TTL_HOURS;
  if (n > MAX_TTL_HOURS) return MAX_TTL_HOURS;
  return Math.floor(n);
};

export const __test__ = { sha256, evaluateInvitation, clampMaxUses, clampTtlHours, matrixUserIdFor };
