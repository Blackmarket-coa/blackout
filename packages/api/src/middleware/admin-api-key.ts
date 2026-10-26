import { createHash, timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';

/**
 * The operator's admin API key: the `x-admin-api-key` request header, checked
 * against `BLACKOUT_ADMIN_API_KEY`. It guards the money-path admin routes that
 * predate session-based admin (`routes/admin.ts`, `BLACKOUT_ADMIN_USERS`):
 * ad-revenue periods and shares (`routes/adRevenue.ts`), tip,
 * creator-subscription and boost-pledge capture and refund (`routes/tips.ts`,
 * `routes/creatorSubs.ts`, `routes/communityBoosts.ts`), and manual
 * subscription comps, refund syncs and the audit timeline
 * (`routes/subscriptions.ts`).
 *
 * There is no default. Until 2026-10-26 each of those files fell back to a
 * literal printed in this repository when the variable was unset, so a
 * deployment that never set it let anyone, signed in or not, create and
 * allocate ad-revenue periods, mark shares paid, capture and refund payments
 * and comp any account a subscription (F8 in
 * docs/security/api-findings-triage-2026-10-25.md). Unset or blank, the
 * header opens nothing: every request is refused 503, so an operator can tell
 * "not configured" from a wrong or missing header (403).
 *
 * Both sides are hashed before the constant-time comparison, so it neither
 * throws on a length mismatch nor leaks the configured value's length.
 */
const configuredAdminApiKey = (): string | null => {
    const configured = process.env.BLACKOUT_ADMIN_API_KEY;
    return configured && configured.trim().length > 0 ? configured : null;
};

const sameSecret = (presented: string, expected: string): boolean =>
    timingSafeEqual(
        createHash('sha256').update(presented, 'utf8').digest(),
        createHash('sha256').update(expected, 'utf8').digest()
    );

/** Whether the request carries the configured admin API key; never true when none is configured. */
export function hasAdminApiKey(c: Context): boolean {
    const expected = configuredAdminApiKey();
    const presented = c.req.header('x-admin-api-key');
    return Boolean(expected && presented && sameSecret(presented, expected));
}

/** `null` when the request carries the configured admin API key; otherwise the refusal to return. */
export function requireAdminApiKey(c: Context): Response | null {
    if (!configuredAdminApiKey()) {
        return c.json(
            {
                code: 'admin_api_key_not_configured',
                message: 'BLACKOUT_ADMIN_API_KEY is not set on this server.',
            },
            503
        );
    }
    if (!hasAdminApiKey(c)) {
        return c.json({ code: 'forbidden', message: 'Admin API key required' }, 403);
    }
    return null;
}
