import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db } from '../db/store';
import type { InvitationTokenRecord, UserRecord } from '../db/types';
import { matrixClient } from '../integrations/matrix-client';
import { log } from '../telemetry/logger';
import { followUser } from './follows';

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
  /** 1..MAX_USES_CEILING; defaults to 1 (single-use link). Ignored when `unlimited`. */
  maxUses?: number;
  /** Hours from now until expiry. 0 = never expire. Defaults to 7 days. */
  expiresInHours?: number;
  /** Reusable-forever link: mints an unlimited Synapse token and never exhausts. */
  unlimited?: boolean;
  /** Marks (and persists the plaintext of) the single per-user personal link. */
  personal?: boolean;
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
  const unlimited = input.unlimited === true;
  const maxUses = clampMaxUses(input.maxUses ?? DEFAULT_MAX_USES);
  const ttlHours = clampTtlHours(input.expiresInHours ?? DEFAULT_TTL_HOURS);
  const expiresAt =
    unlimited || ttlHours === 0
      ? undefined
      : new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();

  const mint = await matrixClient.mintRegistrationToken({
    // null = unlimited Synapse registrations, so a reusable bio link keeps working.
    usesAllowed: unlimited ? null : maxUses,
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
      unlimited: unlimited || undefined,
      personal: input.personal || undefined,
      // Personal links are public by design; keep the plaintext so the
      // get-or-create endpoint can return a stable URL.
      personalToken: input.personal ? token : undefined,
      synapseRegistrationToken: mint.token,
      synapseRegistrationTokenExpiresAt:
        typeof mint.expiresAtMs === 'number'
          ? new Date(mint.expiresAtMs).toISOString()
          : undefined,
    });
    // For a room-scoped invite, ensure the bot is a member of the CANOPY (the
    // den's parent space). Dens are created `restricted` to their canopy, so a
    // bot must belong to the canopy to admit redeemers — putting it in the den
    // alone doesn't satisfy the restricted rule. The creator's client invites
    // the bot to the canopy before calling this (only the creator has power);
    // here we force-join it, valid now that it holds that invite. Falls back to
    // the den itself when there's no canopy (orphan den / den is a space).
    // Best-effort: a failure just means redemption falls back to its own admit.
    if (record.matrixRoomId) {
      const botUserId = await matrixClient.botUserId();
      if (botUserId) {
        const parent = await matrixClient.getRoomParentSpace(record.matrixRoomId);
        const target = parent.ok && parent.canopyId ? parent.canopyId : record.matrixRoomId;
        const joined = await matrixClient.adminJoinUserToRoom(target, botUserId);
        if (!joined.ok) {
          log.warn('invite.create.bot_join_failed', {
            target,
            roomId: record.matrixRoomId,
            botUserId,
            status: 'status' in joined ? joined.status : undefined,
            reason: 'reason' in joined ? joined.reason : undefined,
            detail: 'detail' in joined ? joined.detail : undefined,
          });
        }
      }
    }
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

/**
 * Returns the Synapse registration token for a **personal** share link so the
 * public OG page can carry it through to the SPA register flow. Scoped to
 * `personal` links (public by design) — room invites never expose their token
 * via the unauthenticated preview page.
 */
export const resolvePersonalRegistrationToken = (presentedToken: string): string | undefined => {
  const record = db.findInvitationTokenByHash(sha256(presentedToken));
  if (!record || !record.personal || record.revokedAt) return undefined;
  return record.synapseRegistrationToken;
};

export type PreviewOutcome =
  | {
      kind: 'ok';
      record: InvitationTokenRecord;
      inviter: { id: string; username: string };
      usesRemaining: number | null;
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
    usesRemaining: record.unlimited ? null : Math.max(0, record.maxUses - record.useCount),
  };
};

export type RedeemOutcome =
  | {
      kind: 'ok';
      record: InvitationTokenRecord;
      matrixInvite?: { ok: boolean };
      /** Parent space (canopy) of the invited room, resolved server-side so
       *  the client can route the recipient into onboarding without waiting
       *  for their own Matrix sync to populate the space hierarchy. */
      canopyId?: string;
    }
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
  let canopyId: string | undefined;
  if (updated.matrixRoomId) {
    const matrixUserId = matrixUserIdFor(redeemer.username);

    // Resolve the canopy (parent space) FIRST: dens are created `restricted`
    // to their canopy, so the redeemer must be admitted to the CANOPY before
    // the den is joinable. A Synapse admin-join does NOT bypass the restricted
    // rule — membership in the canopy is what unlocks the den.
    const parent = await matrixClient.getRoomParentSpace(updated.matrixRoomId);
    if (parent.ok) {
      canopyId = parent.canopyId;
    } else {
      log.warn('invite.redeem.canopy_unresolved', {
        roomId: updated.matrixRoomId,
        status: 'status' in parent ? parent.status : undefined,
        reason: 'reason' in parent ? parent.reason : undefined,
      });
    }

    // 1) Admit the redeemer to the canopy (the bot was force-joined to the
    //    canopy at link-creation, so it can invite/admit here). Skipped when
    //    the den has no distinct canopy (orphan den, or the den is the space).
    let canopyJoin: Awaited<ReturnType<typeof matrixClient.adminJoinUserToRoom>> | undefined;
    if (canopyId && canopyId !== updated.matrixRoomId) {
      canopyJoin = await matrixClient.adminJoinUserToRoom(canopyId, matrixUserId);
      if (!canopyJoin.ok) {
        log.warn('invite.redeem.canopy_join_failed', {
          canopyId,
          userId: matrixUserId,
          status: 'status' in canopyJoin ? canopyJoin.status : undefined,
          reason: 'reason' in canopyJoin ? canopyJoin.reason : undefined,
          detail: 'detail' in canopyJoin ? canopyJoin.detail : undefined,
        });
      }
    }

    // 2) Admit to the den itself — now allowed by the restricted rule once the
    //    redeemer is in the canopy. Fall back to a bot invite if admin-join fails.
    const join = await matrixClient.adminJoinUserToRoom(updated.matrixRoomId, matrixUserId);
    let invite: Awaited<ReturnType<typeof matrixClient.inviteToRoom>> | undefined;
    if (join.ok) {
      matrixInvite = { ok: true };
    } else {
      invite = await matrixClient.inviteToRoom(
        updated.matrixRoomId,
        matrixUserId,
        'Invitation link redeemed',
      );
      matrixInvite = { ok: invite.ok };
    }

    // Redemption survives Matrix failure, but if we couldn't admit the redeemer
    // they'll be stranded. Log the exact Synapse status/body for each step so
    // the failure mode (e.g. bot not a member of the canopy) is visible.
    if (!matrixInvite.ok) {
      log.warn('invite.redeem.matrix_admit_failed', {
        roomId: updated.matrixRoomId,
        canopyId,
        userId: matrixUserId,
        canopyJoinStatus: canopyJoin && 'status' in canopyJoin ? canopyJoin.status : undefined,
        canopyJoinDetail: canopyJoin && 'detail' in canopyJoin ? canopyJoin.detail : undefined,
        adminJoinStatus: 'status' in join ? join.status : undefined,
        adminJoinReason: 'reason' in join ? join.reason : undefined,
        adminJoinDetail: 'detail' in join ? join.detail : undefined,
        inviteStatus: invite && 'status' in invite ? invite.status : undefined,
        inviteReason: invite && 'reason' in invite ? invite.reason : undefined,
        inviteDetail: invite && 'detail' in invite ? invite.detail : undefined,
      });
    } else {
      log.info('invite.redeem.matrix_admitted', {
        roomId: updated.matrixRoomId,
        canopyId,
        canopyJoined: canopyJoin?.ok,
        via: join.ok ? 'admin_join' : 'invite',
      });
    }
  }

  db.createInvitationRedemption({
    id: randomUUID(),
    invitationTokenId: updated.id,
    redeemedByUserId: redeemer.id,
    matrixInviteOk: matrixInvite?.ok,
  });

  // The redeemer follows the inviter (one-way). Best-effort: a follow failure
  // must never roll back a durable redemption.
  try {
    followUser(redeemer.id, updated.createdBy);
  } catch (err) {
    log.warn('invite.redeem.follow_failed', {
      inviterId: updated.createdBy,
      redeemerId: redeemer.id,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  return { kind: 'ok', record: updated, matrixInvite, canopyId };
};

/**
 * Get-or-create the caller's single reusable personal share link: unlimited
 * uses, no expiry, no room. Returns the same stable URL on every call (we
 * persist the plaintext for personal links — see `personalToken`).
 */
export const getOrCreatePersonalInvitation = async (
  userId: string,
): Promise<
  | { kind: 'ok'; record: InvitationTokenRecord; token: string; synapseRegistrationToken?: string }
  | { kind: 'matrix_mint_failed'; reason: string; detail?: string }
> => {
  const existing = db
    .listInvitationTokensByCreator(userId)
    .find((r) => r.personal && !r.revokedAt && r.personalToken);
  if (existing?.personalToken) {
    return {
      kind: 'ok',
      record: existing,
      token: existing.personalToken,
      synapseRegistrationToken: existing.synapseRegistrationToken,
    };
  }

  const outcome = await createInvitation({
    createdBy: userId,
    unlimited: true,
    personal: true,
    label: 'Personal link',
  });
  if (outcome.kind !== 'ok') return outcome;
  return {
    kind: 'ok',
    record: outcome.record,
    token: outcome.token,
    synapseRegistrationToken: outcome.synapseRegistrationToken,
  };
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
  if (!record.unlimited && record.useCount >= record.maxUses) return { kind: 'exhausted' };
  if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
    return { kind: 'expired' };
  }
  return { kind: 'ok' };
};

export type InvitationListState = 'active' | 'revoked' | 'exhausted' | 'expired';

export interface InvitationListFilters {
  state?: InvitationListState;
  label?: string;
  /** Opaque cursor — the `${createdAt}|${id}` of the last row of the prior page. */
  before?: string;
  /** Max rows for this page. Omit for the (legacy) unbounded listing. */
  limit?: number;
}

export interface InvitationListPage {
  rows: InvitationTokenRecord[];
  nextCursor: string | null;
  hasMore: boolean;
}

const invitationCursor = (row: InvitationTokenRecord): string => `${row.createdAt}|${row.id}`;

const paginateInvitations = (
  rows: InvitationTokenRecord[],
  limit?: number,
): InvitationListPage => {
  if (typeof limit !== 'number') return { rows, nextCursor: null, hasMore: false };
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return { rows: page, nextCursor: hasMore && last ? invitationCursor(last) : null, hasMore };
};

export const listInvitationsForUser = (
  userId: string,
  filters: InvitationListFilters = {},
): InvitationListPage => {
  const { state, label, before, limit } = filters;
  const wantedKind = state === 'active' ? 'ok' : state;

  // The cheap filters (label substring + the createdAt|id cursor) push down to
  // the store. The derived `state` filter can't — expired/exhausted depend on
  // the current time + use-count — so when it's active we fetch the
  // label/cursor-filtered set and apply state in memory, then paginate AFTER
  // the state filter so a page never comes back short while more matching rows
  // remain. With no derived filter, the store does the limiting (fetching one
  // extra row so we can detect a further page cheaply).
  if (wantedKind) {
    const rows = db
      .listInvitationTokensByCreator(userId, { label, before })
      .filter((row) => evaluateInvitation(row).kind === wantedKind);
    return paginateInvitations(rows, limit);
  }

  const fetched = db.listInvitationTokensByCreator(userId, {
    label,
    before,
    limit: typeof limit === 'number' ? limit + 1 : undefined,
  });
  return paginateInvitations(fetched, limit);
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
