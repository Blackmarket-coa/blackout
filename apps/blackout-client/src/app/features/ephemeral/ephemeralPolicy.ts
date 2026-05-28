/**
 * Ephemeral file drops: a media message that auto-expires after a time limit
 * and/or a maximum number of views (OnionShare-style "dead drop"). The policy
 * rides on the event content under `co.blackout.ephemeral`; expiry is enforced
 * client-side at render time (the file is hidden once expired) and the sender's
 * client best-effort redacts the event when it observes expiry.
 *
 * Pure + dependency-free so it's fully unit-testable.
 *
 * SECURITY NOTE: Client-side enforcement is best-effort. A determined recipient
 * can bypass view-count limits via DOM inspection, screenshot, or localStorage
 * manipulation. The TOCTOU window on first render means content is always shown
 * at least once. Do not use for truly sensitive material.
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
