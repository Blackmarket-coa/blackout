/**
 * Ephemeral file drops: a media message that auto-expires after a time limit
 * and/or a maximum number of views (OnionShare-style "dead drop"). The policy
 * rides on the event content under `co.blackout.ephemeral`; expiry is enforced
 * client-side at render time (the file is hidden once expired) and the sender's
 * client best-effort redacts the event when it observes expiry.
 *
 * Pure + dependency-free so it's fully unit-testable.
 */

export const EPHEMERAL_CONTENT_KEY = 'co.blackout.ephemeral';

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
    typeof v === 'number' && Number.isFinite(v) && v > 0;

/** Build the content block to merge into an outgoing media event. */
export const buildEphemeralContent = (policy: EphemeralPolicy): Record<string, unknown> | null => {
    const block: EphemeralPolicy = {};
    if (isPositiveInt(policy.expiresAtMs)) block.expiresAtMs = policy.expiresAtMs;
    if (isPositiveInt(policy.maxViews)) block.maxViews = policy.maxViews;
    if (block.expiresAtMs === undefined && block.maxViews === undefined) return null;
    return { [EPHEMERAL_CONTENT_KEY]: { v: 1, ...block } };
};

/** Parse + validate an ephemeral policy off an event's content. */
export const parseEphemeralPolicy = (content: unknown): EphemeralPolicy | null => {
    if (!content || typeof content !== 'object') return null;
    const raw = (content as Record<string, unknown>)[EPHEMERAL_CONTENT_KEY];
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    const policy: EphemeralPolicy = {};
    if (isPositiveInt(obj.expiresAtMs)) policy.expiresAtMs = obj.expiresAtMs;
    if (isPositiveInt(obj.maxViews)) policy.maxViews = obj.maxViews;
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
