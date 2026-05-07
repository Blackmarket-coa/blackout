import { API_BASE_URL, createAuthorizedApiClient } from '../../../sdk/client';
import { readBlackoutApiToken } from '../../monetization/marketplace/useMarketplaceAuth';

/**
 * Frontend wrappers around /v1/integrations/widgets/alerts/tokens. Mirrors
 * packages/api/src/routes/widgetAlerts.ts — keep the shapes in sync when
 * the server contract moves.
 */

export interface WidgetAlertTokenSummary {
    id: string;
    label?: string;
    scopes: string[];
    createdAt: string;
    revokedAt?: string;
    revokedReason?: string;
    lastDeliveredAt?: string;
}

export interface ListTokensResponse {
    tokens: WidgetAlertTokenSummary[];
}

export interface CreateTokenBody {
    label?: string;
}

export interface CreateTokenResponse {
    /**
     * Plaintext bearer secret. Returned ONLY at creation; subsequent
     * GETs do not include it. Persist nowhere on the client beyond what
     * the user explicitly copies.
     */
    secret: string;
    token: WidgetAlertTokenSummary;
}

export interface RevokeTokenResponse {
    token: WidgetAlertTokenSummary;
}

export interface ApiCallOptions {
    token?: string | null;
    apiClient?: ReturnType<typeof createAuthorizedApiClient>;
}

const client = (options?: ApiCallOptions) =>
    options?.apiClient ?? createAuthorizedApiClient(options?.token ?? readBlackoutApiToken());

const BASE = '/v1/integrations/widgets/alerts/tokens';

export const listTokens = (options?: ApiCallOptions): Promise<ListTokensResponse> =>
    client(options)({ method: 'GET', path: BASE }) as Promise<ListTokensResponse>;

export const createToken = (
    body: CreateTokenBody,
    options?: ApiCallOptions,
): Promise<CreateTokenResponse> =>
    client(options)({ method: 'POST', path: BASE, body }) as Promise<CreateTokenResponse>;

export const revokeToken = (
    tokenId: string,
    options?: ApiCallOptions,
): Promise<RevokeTokenResponse> =>
    client(options)({
        method: 'DELETE',
        path: `${BASE}/${encodeURIComponent(tokenId)}`,
    }) as Promise<RevokeTokenResponse>;

// ----------------------------- SSE URL builder -----------------------------

const STREAM_PATH = '/v1/integrations/widgets/alerts/stream';

/**
 * Build the absolute SSE URL a creator pastes into OBS's "browser source".
 * Uses the configured `VITE_BLACKOUT_API_BASE_URL` when set; otherwise
 * builds a relative URL that the same-origin will resolve.
 *
 * Token is URL-encoded so secrets containing `+`, `=`, or `/` (the
 * base64url alphabet doesn't include the latter two but defense-in-depth)
 * round-trip through the browser address bar without mangling.
 */
export const buildSseUrl = (
    secret: string,
    options: { baseUrl?: string } = {},
): string => {
    const base = options.baseUrl ?? API_BASE_URL;
    const path = `${STREAM_PATH}?token=${encodeURIComponent(secret)}`;
    if (!base) return path;
    // `URL` resolves protocol-relative + absolute bases consistently.
    return new URL(path, base.endsWith('/') ? base : `${base}/`).toString();
};
