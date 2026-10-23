import type { Context } from 'hono';
import { isAdminUser } from '../services/auth';

type Claims = { sub?: string; username?: string; capabilities?: string[] } | null;

/** Every domain a session capability names: `<domain>.read`, `<domain>.write`, `<domain>.*`. */
export const CAPABILITY_DOMAINS = [
    'governance',
    'channels',
    'forum',
    'deaddrop',
    'deadman',
    'moderation',
    'streaming',
    'discovery',
    'profile',
    'stego',
    'growth',
] as const;

export type CapabilityDomain = typeof CAPABILITY_DOMAINS[number];
export type CapabilityAction = 'read' | 'write';

/**
 * Scopes no session token carries (`deriveUserCapabilities` in
 * `services/auth.ts`) because a route behind them changes shared state with no
 * ownership or role check (`channels.read`: the list returns every community's
 * channels, private ones included; `deaddrop.write`: a drop can be addressed
 * to any account, and appears in that account's export). Until a community
 * role model exists, an operator-allowlisted admin (`BLACKOUT_ADMIN_USERS`,
 * `isAdminUser`) holds them. `deadman.write` is not here: whether the app may
 * arm a dead-man switch is an open product decision (N2 in
 * `docs/security/deadman-and-feeds-triage-2026-10-12.md`).
 */
export const ADMIN_ONLY_SCOPES: ReadonlySet<string> = new Set([
    'governance.write',
    'moderation.write',
    'forum.write',
    'channels.read',
    'channels.write',
    'growth.write',
    'deaddrop.write',
]);

function getClaims(c: Context): Claims {
    return c.get('user') as Claims;
}

export function requireAuthenticatedUser(c: Context): string | null {
    const claims = getClaims(c);
    if (!claims?.sub) {
        return null;
    }

    return claims.sub;
}

/** Whether the caller is an operator-allowlisted admin (`BLACKOUT_ADMIN_USERS`). */
export function isAdminCaller(c: Context): boolean {
    const claims = getClaims(c);
    if (!claims?.sub) return false;
    return isAdminUser(claims.sub, claims.username ?? '');
}

const grants = (
    capabilities: ReadonlySet<string>,
    domain: CapabilityDomain,
    action: CapabilityAction
): boolean => capabilities.has(`${domain}.${action}`) || capabilities.has(`${domain}.*`);

/**
 * The scopes listed in the `x-blackout-capabilities` header, or `null` when it
 * lists none. `admin.*` and `*` entries are dropped: those grants come from
 * the session claims only.
 */
function headerCapabilities(c: Context): ReadonlySet<string> | null {
    const listed = (c.req.header('x-blackout-capabilities') ?? '')
        .split(',')
        .map((cap) => cap.trim())
        .filter(Boolean)
        .filter((cap) => cap !== 'admin.*' && !cap.startsWith('*'));
    return listed.length > 0 ? new Set(listed) : null;
}

export function canAccessDomain(
    c: Context,
    domain: CapabilityDomain,
    action: CapabilityAction
): boolean {
    const claims = getClaims(c);
    const claimCapabilities = new Set(
        Array.isArray(claims?.capabilities) ? claims.capabilities : []
    );

    // What the caller holds: the capabilities minted into the session token
    // (`admin.*` there is the superuser grant), plus the admin-only scopes when
    // the caller is an allowlisted admin.
    const held =
        grants(claimCapabilities, domain, action) ||
        claimCapabilities.has('admin.*') ||
        (ADMIN_ONLY_SCOPES.has(`${domain}.${action}`) && isAdminCaller(c));
    if (!held) return false;

    // The `x-blackout-capabilities` header can only narrow that: when it lists
    // scopes, this request may use only those, and only as far as the caller
    // holds them. It never adds a scope, so a signed-in account cannot grant
    // itself one by sending it.
    const requested = headerCapabilities(c);
    return requested === null || grants(requested, domain, action);
}

export function requireDomainCapability(
    c: Context,
    domain: CapabilityDomain,
    action: CapabilityAction
): Response | null {
    if (!requireAuthenticatedUser(c)) {
        return c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);
    }

    if (!canAccessDomain(c, domain, action)) {
        return c.json(
            { code: 'missing_capability', message: `Missing capability: ${domain}.${action}` },
            403
        );
    }

    return null;
}

/**
 * For a route whose scope session tokens carry, because the other routes
 * behind it check ownership, while this route changes shared state with no
 * ownership or role check: the scope, and an allowlisted admin.
 */
export function requireAdminDomainCapability(
    c: Context,
    domain: CapabilityDomain,
    action: CapabilityAction
): Response | null {
    const denied = requireDomainCapability(c, domain, action);
    if (denied) return denied;

    if (!isAdminCaller(c)) {
        return c.json({ code: 'forbidden', message: 'Admin privileges required' }, 403);
    }

    return null;
}
