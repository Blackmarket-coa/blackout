/**
 * WHAT THIS FILE DOES
 * Authorization layer — checks "is this user allowed to do this action?"
 * Works alongside authentication ("who are you?") by reading the JWT
 * claims from the middleware context.
 *
 * WHY IT EXISTS (THE SECURITY PROBLEM)
 * Two separate issues were fixed here:
 * 1. (CRITICAL) The `x-blackout-capabilities` header was a backdoor:
 *    in ANY non-production environment, anyone could send this header
 *    with `admin.*` and gain full admin access. Now gated behind
 *    explicit opt-in (`BLACKOUT_DEV_CAPABILITY_HEADER=1`) AND
 *    `NODE_ENV !== 'production'` — double guard.
 * 2. The `requireAuthenticatedUser` function was added as a central
 *    place to extract the authenticated user's ID from the JWT. This
 *    is used by governance routes to replace untrusted body fields
 *    (e.g., `parsed.userId`) with the verified JWT identity.
 *
 * KEY CONCEPT — Authentication vs Authorization
 * - Authentication: Who are you? (JWT validation, password check)
 * - Authorization: What are you allowed to do? (capability checks)
 * You need BOTH. The governance IDOR fix (see governance.ts) is an
 * authorization failure — the user was authenticated but the code
 * didn't check WHO they were acting as.
 */

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

export function canAccessDomain(c: Context, domain: 'governance' | 'forum' | 'deaddrop' | 'deadman' | 'moderation' | 'streaming' | 'discovery' | 'profile' | 'stego' | 'growth', action: 'read' | 'write'): boolean {
  const claims = getClaims(c);
  const claimCapabilities = Array.isArray(claims?.capabilities) ? claims.capabilities : [];
  const capabilities = new Set(claimCapabilities);

  const devCapHeader = process.env.BLACKOUT_DEV_CAPABILITY_HEADER;
  if (process.env.NODE_ENV !== 'production' && (devCapHeader === '1' || devCapHeader === 'true')) {
    const headerCapabilities = (c.req.header('x-blackout-capabilities') ?? '')
      .split(',')
      .map((cap) => cap.trim())
      .filter(Boolean);
    if (headerCapabilities.length > 0) {
      for (const cap of headerCapabilities) capabilities.add(cap);
    }
  }

  return capabilities.has(`${domain}.${action}`) || capabilities.has(`${domain}.*`) || capabilities.has('admin.*');
}

export function requireDomainCapability(c: Context, domain: 'governance' | 'forum' | 'deaddrop' | 'deadman' | 'moderation' | 'streaming' | 'discovery' | 'profile' | 'stego' | 'growth', action: 'read' | 'write'): Response | null {
  const userId = requireAuthenticatedUser(c);
  if (!userId) {
    return c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);
  }

  if (!canAccessDomain(c, domain, action)) {
    return c.json({ code: 'missing_capability', message: `Missing capability: ${domain}.${action}` }, 403);
  }

  return null;
}

export function getAuthenticatedUserId(c: Context): string | null {
  return requireAuthenticatedUser(c);
}
