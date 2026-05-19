import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

const INVITATIONS_BASE = '/v1/invitations';

export interface InvitationRecord {
    id: string;
    label?: string;
    matrixRoomId?: string;
    maxUses: number;
    useCount: number;
    usesRemaining: number;
    expiresAt?: string;
    revokedAt?: string;
    createdAt: string;
}

export interface InvitationRedemptionSummary {
    userId: string;
    matrixInviteOk?: boolean;
    at: string;
}

export interface InvitationWithRedemptions extends InvitationRecord {
    redemptions: InvitationRedemptionSummary[];
}

export interface CreateInvitationInput {
    matrixRoomId?: string;
    label?: string;
    maxUses?: number;
    expiresInHours?: number;
}

export interface CreateInvitationResponse {
    invitation: InvitationRecord;
    token: string;
    url: string;
}

export interface ListInvitationsResponse {
    invitations: InvitationWithRedemptions[];
}

export type InvitationPreviewFailureReason =
    | 'invalid'
    | 'revoked'
    | 'exhausted'
    | 'expired';

export type InvitationPreviewResponse =
    | {
          valid: true;
          invitation: {
              inviter: { id: string; username: string };
              matrixRoomId?: string;
              label?: string;
              usesRemaining: number;
              expiresAt?: string;
          };
      }
    | { valid: false; reason: InvitationPreviewFailureReason };

export type InvitationRedeemFailureReason =
    | 'invalid'
    | 'revoked'
    | 'exhausted'
    | 'expired'
    | 'self_redeem';

export type InvitationRedeemResponse =
    | { ok: true; matrixRoomId?: string; matrixInvite?: { ok: boolean } }
    | { ok: false; reason: InvitationRedeemFailureReason };

const callJson = <T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body: unknown,
    token: string | null,
): Promise<T> =>
    createAuthorizedApiClient(token)({
        method,
        path,
        body,
    }) as Promise<T>;

export const createInvitation = (
    input: CreateInvitationInput = {},
    token: string | null = readBlackoutApiToken(),
): Promise<CreateInvitationResponse> =>
    callJson('POST', INVITATIONS_BASE, input, token);

export const listMyInvitations = (
    token: string | null = readBlackoutApiToken(),
): Promise<ListInvitationsResponse> =>
    callJson('GET', INVITATIONS_BASE, undefined, token);

export const revokeInvitation = (
    id: string,
    token: string | null = readBlackoutApiToken(),
): Promise<{ invitation: InvitationRecord }> =>
    callJson('DELETE', `${INVITATIONS_BASE}/${encodeURIComponent(id)}`, undefined, token);

/**
 * Public preview endpoint — no bearer token required, the URL token is the
 * only credential. Pass `null` so `createAuthorizedApiClient` omits the
 * authorization header; passing an expired bearer would otherwise turn a
 * valid public preview into a `session_revoked` 401.
 */
export const previewInvitation = (
    presentedToken: string,
): Promise<InvitationPreviewResponse> =>
    callJson(
        'GET',
        `${INVITATIONS_BASE}/preview/${encodeURIComponent(presentedToken)}`,
        undefined,
        null,
    );

export const redeemInvitation = (
    presentedToken: string,
    token: string | null = readBlackoutApiToken(),
): Promise<InvitationRedeemResponse> =>
    callJson('POST', `${INVITATIONS_BASE}/redeem`, { token: presentedToken }, token);
