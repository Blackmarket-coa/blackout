import { createAuthorizedApiClient, API_BASE_URL } from '../../sdk/client';
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
    username: string;
    matrixInviteOk?: boolean;
    at: string;
}

export type InvitationListState = 'active' | 'revoked' | 'exhausted' | 'expired';

export interface InvitationListFilters {
    state?: InvitationListState;
    label?: string;
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

/**
 * Statuses the preview/redeem endpoints use to report *expected* invitation
 * outcomes (invalid / revoked / exhausted / expired / self_redeem). The server
 * returns a typed JSON body ({valid|ok: false, reason}) with these, so we read
 * the body and resolve it instead of throwing — that's what lets the landing
 * page show a specific reason rather than a generic failure. See
 * `packages/api/src/routes/invitations.ts`.
 */
const INVITATION_OUTCOME_STATUSES = new Set([400, 404, 410]);

/**
 * Fetch wrapper for the preview/redeem endpoints. Unlike the shared SDK client
 * (which throws on any non-2xx and hides the body), this surfaces the typed
 * outcome body for the documented business-failure statuses and supports an
 * AbortSignal so callers can apply a timeout to an otherwise-hung request.
 * Rejects only on transport errors, aborts, or unexpected statuses (e.g. 401,
 * 5xx).
 */
const invitationFetch = async <T>(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    token: string | null,
    signal?: AbortSignal,
): Promise<T> => {
    const url = API_BASE_URL ? new URL(path, API_BASE_URL).toString() : path;
    const hasBody = body !== undefined;
    const response = await fetch(url, {
        method,
        headers: {
            Accept: 'application/json',
            ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: hasBody ? JSON.stringify(body) : undefined,
        signal,
    });

    if (response.ok || INVITATION_OUTCOME_STATUSES.has(response.status)) {
        try {
            return (await response.json()) as T;
        } catch {
            throw new Error(
                `Expected JSON from ${path} but got a non-JSON response (${response.status}).`,
            );
        }
    }

    throw new Error(`Request failed (${response.status}) for ${path}`);
};

export const createInvitation = (
    input: CreateInvitationInput = {},
    token: string | null = readBlackoutApiToken(),
): Promise<CreateInvitationResponse> =>
    callJson('POST', INVITATIONS_BASE, input, token);

const buildListPath = (filters?: InvitationListFilters): string => {
    if (!filters) return INVITATIONS_BASE;
    const params = new URLSearchParams();
    if (filters.state) params.set('state', filters.state);
    if (filters.label) params.set('label', filters.label);
    const qs = params.toString();
    return qs ? `${INVITATIONS_BASE}?${qs}` : INVITATIONS_BASE;
};

export const listMyInvitations = (
    filters?: InvitationListFilters,
    token: string | null = readBlackoutApiToken(),
): Promise<ListInvitationsResponse> =>
    callJson('GET', buildListPath(filters), undefined, token);

export const revokeInvitation = (
    id: string,
    token: string | null = readBlackoutApiToken(),
): Promise<{ invitation: InvitationRecord }> =>
    callJson('DELETE', `${INVITATIONS_BASE}/${encodeURIComponent(id)}`, undefined, token);

/**
 * Public preview endpoint — no bearer token required, the URL token is the
 * only credential. We send no authorization header (an expired bearer would
 * otherwise turn a valid public preview into a `session_revoked` 401), and use
 * `invitationFetch` so the typed `{valid:false,reason}` body the server returns
 * with a 404/410 surfaces to the caller instead of throwing a generic error.
 */
export const previewInvitation = (
    presentedToken: string,
    signal?: AbortSignal,
): Promise<InvitationPreviewResponse> =>
    invitationFetch(
        'GET',
        `${INVITATIONS_BASE}/preview/${encodeURIComponent(presentedToken)}`,
        undefined,
        null,
        signal,
    );

/**
 * Redeem an invitation. Requires the Blackout API JWT; callers should resolve
 * it via `ensureBlackoutApiToken()` before calling so the request isn't sent
 * unauthenticated. Resolves the typed `{ok:false,reason}` body for expected
 * failures (revoked / expired / exhausted / self_redeem / invalid) so the UI
 * can show a specific message; rejects on transport errors, aborts, or 401/5xx.
 */
export const redeemInvitation = (
    presentedToken: string,
    token: string | null = readBlackoutApiToken(),
    signal?: AbortSignal,
): Promise<InvitationRedeemResponse> =>
    invitationFetch(
        'POST',
        `${INVITATIONS_BASE}/redeem`,
        { token: presentedToken },
        token,
        signal,
    );
