import type { Context } from 'hono';

type Claims = { sub?: string; capabilities?: string[] } | null;

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

export function canAccessDomain(
    c: Context,
    domain:
        | 'governance'
        | 'channels'
        | 'forum'
        | 'deaddrop'
        | 'deadman'
        | 'moderation'
        | 'streaming'
        | 'discovery'
        | 'profile'
        | 'stego'
        | 'growth',
    action: 'read' | 'write'
): boolean {
    const claims = getClaims(c);
    const claimCapabilities = new Set(
        Array.isArray(claims?.capabilities) ? claims.capabilities : []
    );

    // Capabilities asserted by the caller via the `x-blackout-capabilities` header
    // may widen access to concrete per-domain scopes (e.g. `governance.write`,
    // `moderation.*`) that the client legitimately opts into, but must NEVER be
    // able to confer the blanket `admin.*` grant or a cross-domain `*` wildcard.
    // Those privileged grants are honored only when minted into the authenticated
    // session (JWT claims), so a caller cannot self-escalate to admin over the
    // whole mutation surface by setting a header. (A real per-user/per-community
    // role model — the full fix — is tracked separately.)
    const headerCapabilities = (c.req.header('x-blackout-capabilities') ?? '')
        .split(',')
        .map((cap) => cap.trim())
        .filter(Boolean)
        .filter((cap) => cap !== 'admin.*' && !cap.startsWith('*'));

    const capabilities = new Set([...claimCapabilities, ...headerCapabilities]);

    if (capabilities.has(`${domain}.${action}`) || capabilities.has(`${domain}.*`)) {
        return true;
    }

    // `admin.*` is a superuser grant: accept it only from the authenticated
    // session claims, never from the request header.
    return claimCapabilities.has('admin.*');
}

export function requireDomainCapability(
    c: Context,
    domain:
        | 'governance'
        | 'channels'
        | 'forum'
        | 'deaddrop'
        | 'deadman'
        | 'moderation'
        | 'streaming'
        | 'discovery'
        | 'profile'
        | 'stego'
        | 'growth',
    action: 'read' | 'write'
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
