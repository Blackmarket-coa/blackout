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

export type CreateInvitationOutcome =
  | {
      kind: 'ok';
      token: string;
      record: InvitationTokenRecord;
      /** Synapse registration token. Returned ONCE at create time; the
       *  HTTP route surfaces it in the URL fragment so the recipient's
       *  RegisterForm can pre-fill the `m.login.registration_token`
       *  UIA stage. Never returned from list/preview endpoints. */
      synapseRegistrationToken: string;
    }
  | { kind: 'matrix_mint_failed'; reason: string; detail?: string };

/**
 * Create a Blackout invitation AND a matching Synapse registration
 * token, atomically.
 *
 * Order matters: mint the Synapse token first so we never persist a
 * Blackout invite without its credential. If the local DB write fails
 * after a successful mint, best-effort revoke the Synapse token so we
 * don't leak orphaned tokens that Synapse will honor.
 */
export const createInvitation = async (
  input: CreateInvitationInput,
): Promise<CreateInvitationOutcome> => {
  const maxUses = clampMaxUses(input.maxUses ?? DEFAULT_MAX_USES);
  const ttlHours = clampTtlHours(input.expiresInHours ?? DEFAULT_TTL_HOURS);
  const expiresAt =
    ttlHours === 0
      ? undefined
      : new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();

  const mint = await matrixClient.mintRegistrationToken({
    usesAllowed: maxUses,
    expiresAtMs: expiresAt ? Date.parse(expiresAt) : null,
  });
  if (!mint.ok) {
    return {
      kind: 'matrix_mint_failed',
      reason: mint.reason,
      detail: 'detail' in mint ? mint.detail : undefined,
    };
  }

  const token = randomBytes(INVITATION_TOKEN_BYTES).toString('base64url');
  try {
    const record = db.createInvitationToken({
      id: randomUUID(),
      createdBy: input.createdBy,
      tokenHash: sha256(token),
      matrixRoomId: input.matrixRoomId,
      label: input.label,
      maxUses,
      expiresAt,
      synapseRegistrationToken: mint.token,
      synapseRegistrationTokenExpiresAt:
        typeof mint.expiresAtMs === 'number'
          ? new Date(mint.expiresAtMs).toISOString()
          : undefined,
    });
    return { kind: 'ok', token, record, synapseRegistrationToken: mint.token };
  } catch (err) {
    // Local persistence failed after a successful mint. Best-effort
    // revoke so the orphaned Synapse token can't outlive this attempt.
    void matrixClient.revokeRegistrationToken(mint.token).catch(() => {
      /* logged by the caller if needed */
    });
    throw err;
  }
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

/**
 * Revoke an invitation. The local row is marked revoked first; if a
 * Synapse registration token was minted with the invite we fire a
 * best-effort delete against Synapse afterwards. Synapse failure does
 * not roll back the local revoke (we'd rather have an orphaned Synapse
 * token sitting around than an "I revoked this and it's still
 * working" UX bug); the caller is expected to log such cases.
 */
export const revokeInvitation = async (
  id: string,
  byUserId: string,
): Promise<
  | { kind: 'ok'; record: InvitationTokenRecord; synapseRevoke?: { ok: boolean } }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
> => {
  const existing = db.getInvitationTokenById(id);
  if (!existing) return { kind: 'not_found' };
  if (existing.createdBy !== byUserId) return { kind: 'forbidden' };
  const updated = db.revokeInvitationToken(id, 'revoked_by_creator');
  if (!updated) return { kind: 'not_found' };

  let synapseRevoke: { ok: boolean } | undefined;
  if (updated.synapseRegistrationToken) {
    const result = await matrixClient.revokeRegistrationToken(updated.synapseRegistrationToken);
    synapseRevoke = { ok: result.ok };
  }
  return { kind: 'ok', record: updated, synapseRevoke };
};

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

export type InvitationListState = 'active' | 'revoked' | 'exhausted' | 'expired';

export interface InvitationListFilters {
  state?: InvitationListState;
  label?: string;
}

// TODO: when pagination lands, push state+label filtering into the DB layer
// (`db.listInvitationTokensByCreator`) so we don't load the whole set per call.
export const listInvitationsForUser = (
  userId: string,
  filters: InvitationListFilters = {},
): InvitationTokenRecord[] => {
  const rows = db.listInvitationTokensByCreator(userId);
  if (!filters.state && !filters.label) return rows;

  const wantedKind = filters.state === 'active' ? 'ok' : filters.state;
  const needle = filters.label?.toLowerCase();

  return rows.filter((row) => {
    if (wantedKind && evaluateInvitation(row).kind !== wantedKind) return false;
    if (needle && !(row.label ?? '').toLowerCase().includes(needle)) return false;
    return true;
  });
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
