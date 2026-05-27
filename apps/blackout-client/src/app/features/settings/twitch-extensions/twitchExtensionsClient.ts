import { createAuthorizedApiClient } from '../../../sdk/client';
import { readBlackoutApiToken } from '../../monetization/marketplace/useMarketplaceAuth';

/**
 * Frontend wrappers for /v1/streaming/extensions — the creator-owned Twitch
 * extension registry. Mirrors packages/api/src/modules/streaming.ts. Panels a
 * creator registers surface on all of their streams (the stream response
 * `extensions[]`) and render in the livestream viewer's sandboxed panel stack.
 */

/** The `twitch.ext.*` capability scopes a panel may be granted. */
export const EXTENSION_CAPABILITIES = [
    'twitch.ext.identityShare',
    'twitch.ext.subscriptionStatus',
] as const;
export type ExtensionCapability = (typeof EXTENSION_CAPABILITIES)[number];

export interface ExtensionPanel {
    id: string;
    creatorId: string;
    label: string;
    bundleUrl: string;
    capabilities: string[];
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface ListExtensionsResponse {
    items: ExtensionPanel[];
}

export interface CreateExtensionBody {
    label: string;
    bundleUrl: string;
    capabilities?: ExtensionCapability[];
}

export interface UpdateExtensionBody {
    label?: string;
    bundleUrl?: string;
    capabilities?: ExtensionCapability[];
    isActive?: boolean;
}

export interface ApiCallOptions {
    token?: string | null;
    apiClient?: ReturnType<typeof createAuthorizedApiClient>;
}

const client = (options?: ApiCallOptions) =>
    options?.apiClient ?? createAuthorizedApiClient(options?.token ?? readBlackoutApiToken());

const BASE = '/v1/streaming/extensions';

export const listExtensions = (options?: ApiCallOptions): Promise<ListExtensionsResponse> =>
    client(options)({ method: 'GET', path: BASE }) as Promise<ListExtensionsResponse>;

export const createExtension = (
    body: CreateExtensionBody,
    options?: ApiCallOptions,
): Promise<ExtensionPanel> =>
    client(options)({ method: 'POST', path: BASE, body }) as Promise<ExtensionPanel>;

export const updateExtension = (
    id: string,
    body: UpdateExtensionBody,
    options?: ApiCallOptions,
): Promise<ExtensionPanel> =>
    client(options)({
        method: 'PATCH',
        path: `${BASE}/${encodeURIComponent(id)}`,
        body,
    }) as Promise<ExtensionPanel>;

export const deleteExtension = (
    id: string,
    options?: ApiCallOptions,
): Promise<{ ok: boolean }> =>
    client(options)({
        method: 'DELETE',
        path: `${BASE}/${encodeURIComponent(id)}`,
    }) as Promise<{ ok: boolean }>;

// ----------------------------- input validators -----------------------------

export const isValidExtensionLabel = (raw: string): boolean => {
    const t = raw.trim();
    return t.length > 0 && t.length <= 120;
};

/** The API only accepts https bundle URLs (the client sandbox fetches them). */
export const isValidBundleUrl = (raw: string): boolean => {
    const t = raw.trim();
    if (t.length === 0 || t.length > 2048) return false;
    try {
        return new URL(t).protocol === 'https:';
    } catch {
        return false;
    }
};
