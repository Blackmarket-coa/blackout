import { createAuthorizedApiClient } from '../../../sdk/client';
import { readBlackoutApiToken } from '../../monetization/marketplace/useMarketplaceAuth';

/**
 * Frontend wrappers around the /v1/linked-accounts API surface defined in
 * packages/api/src/routes/linkedAccounts.ts. The shapes here mirror the
 * server response bodies — keep them in sync if the server contract moves.
 */

export type LinkedAccountProvider =
    | 'twitch'
    | 'youtube'
    | 'discord'
    | 'patreon'
    | 'tiktok'
    | 'kick';

/**
 * Providers the server currently has an OAuth dispatch entry for. Mirrors
 * `PROVIDER_OAUTH` in packages/api/src/routes/linkedAccounts.ts. The server
 * still returns 501 for the others; they appear in the UI as "Coming soon".
 */
export const IMPLEMENTED_PROVIDERS: readonly LinkedAccountProvider[] = [
    'twitch',
    'discord',
    'patreon',
] as const;

export interface LinkedAccountSummary {
    id: string;
    provider: LinkedAccountProvider;
    providerUserId: string;
    providerUsername?: string;
    scopes: string[];
    expiresAt?: string;
    createdAt: string;
    updatedAt: string;
}

export interface ListLinkedAccountsResponse {
    providers: readonly LinkedAccountProvider[];
    accounts: LinkedAccountSummary[];
}

export interface ConnectResponse {
    authorizeUrl: string;
    state: string;
    expiresAt: string;
}

export interface CallbackSuccessResponse {
    ok: true;
    provider: LinkedAccountProvider;
    providerUserId: string;
    providerUsername?: string;
    scopes: string[];
    expiresAt?: string;
}

export interface ApiCallOptions {
    /** Override the auth token (defaults to localStorage lookup). */
    token?: string | null;
    /** Override the API client for tests. */
    apiClient?: ReturnType<typeof createAuthorizedApiClient>;
}

const client = (options?: ApiCallOptions) =>
    options?.apiClient ?? createAuthorizedApiClient(options?.token ?? readBlackoutApiToken());

const BASE = '/v1/linked-accounts';

export const listLinkedAccounts = (
    options?: ApiCallOptions,
): Promise<ListLinkedAccountsResponse> =>
    client(options)({ method: 'GET', path: BASE }) as Promise<ListLinkedAccountsResponse>;

export const beginConnect = (
    provider: LinkedAccountProvider,
    options?: ApiCallOptions,
): Promise<ConnectResponse> =>
    client(options)({
        method: 'POST',
        path: `${BASE}/${provider}/connect`,
        body: {},
    }) as Promise<ConnectResponse>;

export const completeCallback = (
    provider: LinkedAccountProvider,
    body: { code: string; state: string },
    options?: ApiCallOptions,
): Promise<CallbackSuccessResponse> =>
    client(options)({
        method: 'POST',
        path: `${BASE}/${provider}/callback`,
        body,
    }) as Promise<CallbackSuccessResponse>;

export const unlinkAccount = (
    provider: LinkedAccountProvider,
    options?: ApiCallOptions,
): Promise<{ ok: true }> =>
    client(options)({ method: 'DELETE', path: `${BASE}/${provider}` }) as Promise<{ ok: true }>;

/**
 * Parse a redirected OAuth callback URL (the URL the provider redirected
 * the user to after they granted consent) into the `{ code, state }` pair
 * the server callback endpoint expects. Returns null if the URL is
 * malformed or carries an `error` param instead of a `code`.
 */
export const parseCallbackUrl = (
    raw: string,
): { code: string; state: string } | { error: string; description?: string } | null => {
    let url: URL;
    try {
        url = new URL(raw.trim());
    } catch {
        return null;
    }
    const error = url.searchParams.get('error');
    if (error) {
        return {
            error,
            description: url.searchParams.get('error_description') ?? undefined,
        };
    }
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state) return null;
    return { code, state };
};
