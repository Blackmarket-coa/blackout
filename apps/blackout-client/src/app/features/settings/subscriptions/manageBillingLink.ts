/**
 * Client-side pin for the FBM manage-billing link.
 *
 * The Blackout API mints the link and the client opens it in a new tab or the
 * system browser. The client does not take the server's word for where that
 * link points: it opens a URL only when its origin is on a pinned FBM
 * allowlist and its path is FBM's manage-session page. A compromised or
 * misconfigured API therefore cannot use this button to send a member to an
 * arbitrary site.
 *
 * The allowlist is fixed at build time. `VITE_FBM_MANAGE_ORIGINS` (comma
 * separated https origins) replaces the default; it is how staging or a local
 * FBM is pointed at. Unset, only FBM's production API origin is accepted,
 * which matches the API's default `FREEBLACKMARKET_BASE_URL`.
 */

export const DEFAULT_FBM_MANAGE_ORIGINS: readonly string[] = ['https://api.freeblackmarket.com'];

/** FBM's page route: `/…/manage-sessions/{token}/page` (manage-session contract). */
const MANAGE_PAGE_PATH =
    /^\/v1\/integrations\/blackout\/commerce\/subscriptions\/manage-sessions\/[^/]+\/page$/;

const readConfiguredOrigins = (): string | undefined => {
    try {
        return (import.meta.env?.VITE_FBM_MANAGE_ORIGINS as string | undefined) ?? undefined;
    } catch {
        return undefined;
    }
};

const isLocalHttp = (url: URL): boolean =>
    url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);

/**
 * The origins a manage-billing link may point at. Entries that are not a bare
 * https origin (or a plain-http localhost origin for local dev) are ignored;
 * an override that leaves nothing valid falls back to the default rather than
 * allowing everything.
 */
export function resolveManageBillingOrigins(
    raw: string | undefined = readConfiguredOrigins()
): string[] {
    if (!raw || raw.trim().length === 0) return [...DEFAULT_FBM_MANAGE_ORIGINS];
    const origins = raw
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => {
            try {
                const parsed = new URL(entry);
                return (
                    parsed.origin === entry && (parsed.protocol === 'https:' || isLocalHttp(parsed))
                );
            } catch {
                return false;
            }
        });
    return origins.length > 0 ? origins : [...DEFAULT_FBM_MANAGE_ORIGINS];
}

/**
 * True when `url` is an FBM manage page on a pinned origin. The contract puts
 * the token in the path and nothing in a query or fragment, so a link that
 * carries either (say `?next=https://elsewhere`) is refused too.
 */
export function isAllowedManageBillingUrl(
    url: string,
    allowedOrigins: readonly string[] = resolveManageBillingOrigins()
): boolean {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }
    if (parsed.protocol !== 'https:' && !isLocalHttp(parsed)) return false;
    if (parsed.username || parsed.password) return false;
    if (parsed.search || parsed.hash) return false;
    if (!allowedOrigins.includes(parsed.origin)) return false;
    return MANAGE_PAGE_PATH.test(parsed.pathname);
}
