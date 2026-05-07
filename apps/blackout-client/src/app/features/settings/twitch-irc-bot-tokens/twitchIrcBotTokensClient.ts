import { createAuthorizedApiClient } from '../../../sdk/client';
import { readBlackoutApiToken } from '../../monetization/marketplace/useMarketplaceAuth';

/**
 * Frontend wrappers for /v1/integrations/twitch-compat/bot-tokens. Mirrors
 * packages/api/src/routes/twitchIrcBotTokens.ts.
 *
 * These tokens are pasted into 3rd-party Twitch chat bots' "OAuth Token"
 * field as `oauth:<plaintext>`. The bot connects to the (forthcoming)
 * Blackout-side IRC shim and runs unmodified.
 */

export interface TwitchIrcBotToken {
    id: string;
    label?: string;
    scopes: string[];
    isActive: boolean;
    revokedAt?: string;
    revokeReason?: string;
    lastUsedAt?: string;
    useCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface ListTokensResponse {
    tokens: TwitchIrcBotToken[];
}

export interface MintBody {
    label?: string;
    scopes?: string[];
}

export interface MintResponse {
    token: TwitchIrcBotToken;
    /** Plaintext bearer. Returned only at mint time. */
    secret: string;
    /** Pre-formatted `oauth:<plaintext>` string for direct paste into bot config. */
    passLine: string;
}

export interface RevokeResponse {
    token: TwitchIrcBotToken;
}

export interface ApiCallOptions {
    token?: string | null;
    apiClient?: ReturnType<typeof createAuthorizedApiClient>;
}

const client = (options?: ApiCallOptions) =>
    options?.apiClient ?? createAuthorizedApiClient(options?.token ?? readBlackoutApiToken());

const BASE = '/v1/integrations/twitch-compat/bot-tokens';

export const listTokens = (options?: ApiCallOptions): Promise<ListTokensResponse> =>
    client(options)({ method: 'GET', path: BASE }) as Promise<ListTokensResponse>;

export const mintToken = (
    body: MintBody,
    options?: ApiCallOptions,
): Promise<MintResponse> =>
    client(options)({ method: 'POST', path: BASE, body }) as Promise<MintResponse>;

export const revokeToken = (
    id: string,
    reason: string | undefined,
    options?: ApiCallOptions,
): Promise<RevokeResponse> => {
    const path = reason
        ? `${BASE}/${encodeURIComponent(id)}?reason=${encodeURIComponent(reason)}`
        : `${BASE}/${encodeURIComponent(id)}`;
    return client(options)({ method: 'DELETE', path }) as Promise<RevokeResponse>;
};

// ----------------------------- input validators -----------------------------

export const isValidLabel = (raw: string): boolean => {
    const t = raw.trim();
    return t.length === 0 || t.length <= 80;
};

export const isValidScopeEntry = (raw: string): boolean => {
    const t = raw.trim();
    return t.length > 0 && t.length <= 255;
};
