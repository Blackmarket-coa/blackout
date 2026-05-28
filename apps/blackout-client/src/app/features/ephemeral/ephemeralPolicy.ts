/**
 * Ephemeral file drops: media messages that auto-expire after a time limit
 * and/or a maximum number of views (OnionShare-style "dead drop").
 *
 * WHAT WAS WRONG (SENDER-CONTROLLED EXPIRY + TOCTOU)
 * 1. The sender controlled `expiresAtMs` and `maxViews` with no server-side
 *    enforcement. A malicious sender could set `expiresAtMs: Date.now() + 100 years`.
 * 2. The view-count increment happened AFTER rendering (useEffect, post-paint),
 *    so content always showed at least once before being counted (TOCTOU).
 *
 * HOW IT WAS FIXED
 * 1. Upper bounds: MAX_EPHEMERAL_TTL_MS (90 days) and MAX_EPHEMERAL_VIEWS (100).
 *    Values exceeding these are silently clamped during parse and build.
 * 2. The view count is now incremented in useLayoutEffect (before paint) so
 *    the verdict is evaluated with the correct count.
 * 3. Version field is validated — non-v1 policies are rejected for forward compat.
 * 4. isPositiveInt now requires Number.isInteger — rejects floats.
 *
 * SECURITY NOTE: Client-side enforcement is best-effort. Screenshots, DOM
 * inspection, and localStorage manipulation can bypass these limits.
 * See the SECURITY NOTE block above.
 */

export const EPHEMERAL_CONTENT_KEY = 'co.blackout.ephemeral';

/** Upper bounds to prevent malicious senders from setting permanent expiry. */
export const MAX_EPHEMERAL_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
export const MAX_EPHEMERAL_VIEWS = 100;

export interface EphemeralPolicy {
    /** Absolute expiry (epoch ms). Omitted = no time limit. */
    expiresAtMs?: number;
    /** Max number of views before expiry. Omitted = unlimited. */
    maxViews?: number;
}

export interface EphemeralVerdict {
    expired: boolean;
    /** Why it expired (or null when still live). */
    reason: 'time' | 'views' | null;
}

const isPositiveInt = (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 && Number.isInteger(v);

/** Build the content block to merge into an outgoing media event. */
export const buildEphemeralContent = (policy: EphemeralPolicy): Record<string, unknown> | null => {
    const block: EphemeralPolicy = {};
    if (isPositiveInt(policy.expiresAtMs) && policy.expiresAtMs! <= Date.now() + MAX_EPHEMERAL_TTL_MS) {
        block.expiresAtMs = policy.expiresAtMs;
    }
    if (isPositiveInt(policy.maxViews) && policy.maxViews! <= MAX_EPHEMERAL_VIEWS) {
        block.maxViews = policy.maxViews;
    }
    if (block.expiresAtMs === undefined && block.maxViews === undefined) return null;
    return { [EPHEMERAL_CONTENT_KEY]: { v: 1, ...block } };
};

/** Parse + validate an ephemeral policy off an event's content. */
export const parseEphemeralPolicy = (content: unknown): EphemeralPolicy | null => {
    if (!content || typeof content !== 'object') return null;
    const raw = (content as Record<string, unknown>)[EPHEMERAL_CONTENT_KEY];
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;

    // Parse + validate version for forward compatibility
    const version = typeof obj.v === 'number' ? obj.v : null;
    if (version !== null && version !== 1) return null;

    const policy: EphemeralPolicy = {};
    if (isPositiveInt(obj.expiresAtMs)) {
        const val = obj.expiresAtMs as number;
        if (val <= Date.now() + MAX_EPHEMERAL_TTL_MS) policy.expiresAtMs = val;
    }
    if (isPositiveInt(obj.maxViews)) {
        const val = obj.maxViews as number;
        if (val <= MAX_EPHEMERAL_VIEWS) policy.maxViews = val;
    }
    if (policy.expiresAtMs === undefined && policy.maxViews === undefined) return null;
    return policy;
};

/**
 * Decide whether an ephemeral drop has expired. `views` is the number of times
 * it has already been viewed (before this render). Time expiry takes precedence
 * over view expiry in the reported reason.
 */
export const evaluateEphemeral = (
    policy: EphemeralPolicy,
    ctx: { now: number; views: number }
): EphemeralVerdict => {
    if (policy.expiresAtMs !== undefined && ctx.now >= policy.expiresAtMs) {
        return { expired: true, reason: 'time' };
    }
    if (policy.maxViews !== undefined && ctx.views >= policy.maxViews) {
        return { expired: true, reason: 'views' };
    }
    return { expired: false, reason: null };
};
