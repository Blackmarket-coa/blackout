/**
 * Coalition support mechanics — the prosocial counterpart to Coliseum's "Heat".
 *
 * Where Coliseum ranks on conflict velocity (arguments + votes per hour, see
 * `coliseum/feed.ts` `computeTopicHeat`), Coalition ranks on *Momentum*: the
 * velocity of support (tips/contributions) toward a shared goal. The shape is
 * deliberately a mirror — clamped [0,1] scores, an HN-style recency decay, and a
 * normalized velocity term — so the two feeds stay legible as opposites.
 *
 * Plus the single highest-leverage retention framing in the crowdfunding
 * literature: Nunes & Drèze's endowed-progress effect, expressed as
 * {@link endowedProgressFraming}. Coalition shows every contribution as a share
 * of what is *already* enabled ("you're part of X%"), with a stated reason,
 * rather than what's left.
 *
 * All functions here are pure and zero-I/O.
 */

function clamp01(value: number): number {
    if (Number.isNaN(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

function recencyScore(createdAtIso: string, halfLifeHours: number, nowMs: number): number {
    const createdMs = Date.parse(createdAtIso);
    if (Number.isNaN(createdMs)) return 0;
    const ageHours = Math.max(0, (nowMs - createdMs) / 3_600_000);
    return Math.pow(0.5, ageHours / halfLifeHours);
}

export interface ProjectMomentumInput {
    /** When the project was created (ISO-8601) — drives the recency term. */
    createdAt: string;
    /** Number of support events in the trailing 24h window. */
    supportsLast24h: number;
    /** Number of support events in the 24h window before that (for surge detection). */
    supportsPrev24h: number;
    /** Captured support amount per hour over the trailing window, in cents. */
    raisedVelocityCentsPerHour?: number;
    nowMs?: number;
    /** Half-life for the recency term. Default 24h — slower than Coliseum's heat. */
    recencyHalfLifeHours?: number;
    /** Support events/hour that map to a full velocity score. Default 2/hr. */
    velocityNormalizationPerHour?: number;
}

export interface ProjectMomentum {
    /** 0..1 — time decay since creation. */
    recencyScore: number;
    /** 0..1 — normalized support velocity over the trailing window. */
    velocityScore: number;
    /**
     * 0..1 — how much the current window outpaces the prior one. 0.5 means
     * steady; >0.5 means accelerating (a Surge candidate); <0.5 cooling.
     */
    surgeFactor: number;
    /** 0..1 — the blended Momentum signal used to rank the feed. */
    momentum: number;
}

/**
 * Compute a project's Momentum. Mirror of `computeTopicHeat`: a clamped blend of
 * recency and velocity, with an added `surgeFactor` (the seam the future Surge
 * feature reads) that nudges accelerating projects up. The blend weights recency
 * and velocity evenly, then lifts the result by up to 20% when support is surging.
 */
export function computeProjectMomentum(input: ProjectMomentumInput): ProjectMomentum {
    const nowMs = input.nowMs ?? Date.now();
    const halfLife = input.recencyHalfLifeHours ?? 24;
    const norm = input.velocityNormalizationPerHour ?? 2;

    const recency = recencyScore(input.createdAt, halfLife, nowMs);

    const perHour = input.supportsLast24h / 24;
    const velocity = clamp01(perHour / norm);

    // Surge: current vs. prior window. Laplace-smoothed ratio mapped to [0,1] so
    // a quiet→busy transition reads high without dividing by zero.
    const cur = input.supportsLast24h;
    const prev = input.supportsPrev24h;
    const surgeFactor = clamp01((cur + 1) / (cur + prev + 2));

    const base = 0.5 * recency + 0.5 * velocity;
    const momentum = clamp01(base * (0.8 + 0.4 * surgeFactor));

    return {
        recencyScore: clamp01(recency),
        velocityScore: velocity,
        surgeFactor,
        momentum,
    };
}

export interface EndowedProgressInput {
    /** Cumulative raised after (or before) the framed contribution, in cents. */
    raisedCents: number;
    /** Funding goal in cents. Non-positive goals yield a null framing. */
    goalCents: number;
    /** This supporter's contribution in cents, if framing a specific gift. */
    contributionCents?: number;
}

export interface EndowedProgressFraming {
    /**
     * 0..1 — the share of the goal already enabled. This is the "head start"
     * presented to the supporter ("you're already part of X%").
     */
    percentAlreadyEnabled: number;
    /** 0..1 — how much this supporter's gift moved the bar. */
    contributionPercent: number;
    /** A stated reason for the head start — Nunes & Drèze show it's required. */
    headStartReason: string;
}

/**
 * Frame progress the endowed way: lead with what's *already* done, not what's
 * left. Returns null when there's no positive goal to frame against (a journey
 * with no donate button).
 */
export function endowedProgressFraming(input: EndowedProgressInput): EndowedProgressFraming | null {
    if (input.goalCents <= 0) return null;
    const percentAlreadyEnabled = clamp01(input.raisedCents / input.goalCents);
    const contributionPercent = clamp01((input.contributionCents ?? 0) / input.goalCents);
    return {
        percentAlreadyEnabled,
        contributionPercent,
        headStartReason:
            'Supporters before you already moved this forward — you join a project that is underway, not one starting from zero.',
    };
}
