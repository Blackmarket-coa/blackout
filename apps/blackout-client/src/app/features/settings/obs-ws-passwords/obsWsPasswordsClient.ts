import { createAuthorizedApiClient } from '../../../sdk/client';
import { readBlackoutApiToken } from '../../monetization/marketplace/useMarketplaceAuth';

/**
 * Frontend wrappers for /v1/integrations/obs-ws/passwords. Mirrors
 * packages/api/src/routes/obsWsPasswords.ts.
 *
 * Each row mints a password the creator pastes into Stream Deck /
 * Companion / Touch Portal, plus a path-only URL (`/obs-ws/<row-id>`)
 * the surface points at; prepend the API origin to make a `wss://...`.
 */

export interface ObsWsPassword {
    id: string;
    label?: string;
    isActive: boolean;
    revokedAt?: string;
    revokeReason?: string;
    lastUsedAt?: string;
    useCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface ListPasswordsResponse {
    passwords: ObsWsPassword[];
}

export interface MintBody {
    label?: string;
}

export interface MintResponse {
    password: ObsWsPassword;
    /** Plaintext password. Returned only at mint time. */
    plaintextPassword: string;
    /** Path-only URL the surface points at; prepend the API origin. */
    url: string;
}

export interface RevokeResponse {
    password: ObsWsPassword;
}

export interface ApiCallOptions {
    token?: string | null;
    apiClient?: ReturnType<typeof createAuthorizedApiClient>;
}

const client = (options?: ApiCallOptions) =>
    options?.apiClient ?? createAuthorizedApiClient(options?.token ?? readBlackoutApiToken());

const BASE = '/v1/integrations/obs-ws/passwords';

export const listPasswords = (options?: ApiCallOptions): Promise<ListPasswordsResponse> =>
    client(options)({ method: 'GET', path: BASE }) as Promise<ListPasswordsResponse>;

export const mintPassword = (
    body: MintBody,
    options?: ApiCallOptions,
): Promise<MintResponse> =>
    client(options)({ method: 'POST', path: BASE, body }) as Promise<MintResponse>;

export const revokePassword = (
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
