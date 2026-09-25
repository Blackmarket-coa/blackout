// One reading of FBM_ENTITLEMENTS_BASE_URL for every consumer.
//
// FBM mounts everything Blackout calls with the service token under a single
// integration root, `/v1/integrations/blackout` (entitlements/*, coalitions/*,
// reputation/*). Operators have set the variable both as the bare origin
// (`https://api.freeblackmarket.com`) and as the full root
// (`https://api.freeblackmarket.com/v1/integrations/blackout`), and consumers
// used to disagree about which one they expected — so whichever was set, one
// family of calls 404'd. Both forms are accepted here and resolve to the root.

export const FBM_INTEGRATION_PATH = '/v1/integrations/blackout';

/**
 * Normalise a configured FBM base (bare origin, or origin + integration path;
 * trailing slashes tolerated) to the integration root with no trailing slash.
 * Any other path on the base (e.g. a reverse-proxy prefix) is kept and the
 * integration path is appended after it.
 */
export function resolveFbmIntegrationRoot(baseUrl: string): string {
    const trimmed = baseUrl.trim().replace(/\/+$/, '');
    if (trimmed.endsWith(FBM_INTEGRATION_PATH)) return trimmed;
    return `${trimmed}${FBM_INTEGRATION_PATH}`;
}

export interface FbmIntegrationTarget {
    /** Integration root, e.g. `https://api.freeblackmarket.com/v1/integrations/blackout`. */
    root: string;
    serviceToken: string;
}

/**
 * The configured service-token target, or `null` when either half of the
 * FBM_ENTITLEMENTS_BASE_URL / FBM_ENTITLEMENTS_SERVICE_TOKEN pair is unset
 * (a normal state in dev and self-host — callers no-op).
 */
export function fbmIntegrationTarget(env = process.env): FbmIntegrationTarget | null {
    const baseUrl = env.FBM_ENTITLEMENTS_BASE_URL?.trim();
    const serviceToken = env.FBM_ENTITLEMENTS_SERVICE_TOKEN;
    if (!baseUrl || !serviceToken) return null;
    return { root: resolveFbmIntegrationRoot(baseUrl), serviceToken };
}
