import { createFetchApiClient } from '@blackout/sdk';

// FreeBlackMarket public store API. Zero-auth, cross-origin reads of vendor
// storefronts/catalogs, surfaced on the public creator profile.
const FBM_API = 'https://api.freeblackmarket.com';

// No baseUrl: the FBM endpoints are passed as absolute URLs (the SDK fetch
// client resolves absolute `https?://` paths verbatim).
const fbmClient = createFetchApiClient({
    defaultRetry: { attempts: 2, backoffMs: 120 },
});

// --- Loose FBM vendor/catalog shapes (public /store API) ---
export interface FbmVendor {
    id?: string;
    name?: string;
    handle?: string;
    description?: string;
    photo?: string;
}

export interface FbmProduct {
    id: string;
    title: string;
    description?: string;
    handle?: string;
    thumbnail?: string;
    status?: string;
    type?: { value?: string };
    metadata?: {
        event_date?: string;
        event_time?: string;
        venue_name?: string;
        venue_location?: string;
        recurring?: string | boolean;
    };
    variants?: Array<{ id: string; prices?: Array<{ amount?: number; currency_code?: string }> }>;
}

export interface FbmVendorResponse {
    vendor: FbmVendor;
    catalog?: {
        events?: FbmProduct[];
        digital?: FbmProduct[];
        services?: FbmProduct[];
        physical?: FbmProduct[];
        all?: FbmProduct[];
    };
}

/**
 * Public FBM store vendor + catalog read. Resolves to `null` on any failure
 * (404 for an unknown handle, transport error, non-JSON) so callers can render
 * partial profiles without crashing on an absent FBM connection.
 */
export const fetchFbmVendor = async (handle: string): Promise<FbmVendorResponse | null> => {
    if (!handle) return null;
    try {
        return await fbmClient<FbmVendorResponse>({
            method: 'GET',
            path: `${FBM_API}/store/vendors/${encodeURIComponent(handle)}`,
        });
    } catch {
        return null;
    }
};

/** Verify an FBM vendor handle resolves on the public store API. */
export const verifyFbmHandle = async (handle: string): Promise<boolean> =>
    (await fetchFbmVendor(handle)) !== null;
