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

export function canAccessDomain(c: Context, domain: 'governance' | 'forum' | 'deaddrop' | 'moderation' | 'streaming' | 'discovery', action: 'read' | 'write'): boolean {
  const claims = getClaims(c);
  const claimCapabilities = Array.isArray(claims?.capabilities) ? claims.capabilities : [];
  const headerCapabilities = (c.req.header('x-blackout-capabilities') ?? '')
    .split(',')
    .map((cap) => cap.trim())
    .filter(Boolean);

  const capabilities = new Set([...claimCapabilities, ...headerCapabilities]);

  return capabilities.has(`${domain}.${action}`) || capabilities.has(`${domain}.*`) || capabilities.has('admin.*');
}

export function requireDomainCapability(c: Context, domain: 'governance' | 'forum' | 'deaddrop' | 'moderation' | 'streaming' | 'discovery', action: 'read' | 'write'): Response | null {
  if (!requireAuthenticatedUser(c)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  if (!canAccessDomain(c, domain, action)) {
    return c.json({ error: `Missing capability: ${domain}.${action}` }, 403);
  }

  return null;
}
