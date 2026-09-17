/**
 * What a coalition asks of someone before it admits them.
 *
 * The platform has no opinion here. A coalition sets none of these and admits
 * on its join mode alone, which is the default; a coalition that wants a bar
 * picks one for its own mission. Every requirement is optional, every one is
 * additive, and the answer is a list of verdicts rather than a boolean so the
 * joiner can be told which one they did not clear and by how much.
 *
 * Two kinds of requirement live here, and they fail differently:
 *
 *   - **Local** (account age, verified email, reputation, contributions) are
 *     read from Blackout's own tables, synchronously. They always have an
 *     answer. "Not met" means not met.
 *   - **The tier** comes from FBM over HTTP and may be genuinely unanswerable:
 *     the member may have no FBM identity, or the service may be down. That
 *     resolves `unverified`, which is never "not met" — it routes to a human.
 *
 * Nothing here refuses anyone. An unmet requirement files a join request for
 * the steward queue, because a steward reading a request can see what a
 * threshold cannot. The failure mode being avoided is the one this replaced: a
 * gate that could not tell "hasn't earned it yet" from "the lookup never
 * worked", and so silently queued every joiner of every gated coalition while
 * telling their founders nothing.
 */
import { tierSatisfies, type Coalition, type CoalitionJoinRequirementCheck } from '@blackout/core';
import { db } from '../db/store';
import { getUserReputation } from './reputationStore';
import { resolveMemberTier, type TierResolution } from './coalitionTierGate';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days since an ISO timestamp, floored at 0. */
function daysSince(iso: string | undefined, now: number): number | null {
    if (!iso) return null;
    const then = Date.parse(iso);
    if (!Number.isFinite(then)) return null;
    return Math.max(0, Math.floor((now - then) / DAY_MS));
}

/**
 * Captured contributions this member has made to any coalition drive.
 *
 * Deliberately a count of captured contributions, not dollars: what the
 * requirement expresses is "has shown up before", and scaling it with money
 * would make membership purchasable by the largest cheque.
 */
export function coalitionContributionCount(userId: string): number {
    return db.listCoalitionCampaignContributions({ supporterUserId: userId }).length;
}

export interface JoinRequirementEvaluation {
    checks: CoalitionJoinRequirementCheck[];
    /** Any requirement the joiner did not clear, including unverifiable ones. */
    unmet: CoalitionJoinRequirementCheck[];
    /** True when nothing stands between this member and the join mode. */
    clear: boolean;
}

/**
 * Evaluate every requirement a coalition has set against one member.
 *
 * The tier lookup is the only await, and it is skipped entirely when no tier
 * gate is set — the common case must not pay for a cross-service call.
 */
export async function evaluateJoinRequirements(
    coalition: Coalition,
    userId: string,
    now = Date.now()
): Promise<JoinRequirementEvaluation> {
    const checks: CoalitionJoinRequirementCheck[] = [];
    const requirements = coalition.joinRequirements;

    if (requirements?.minAccountAgeDays !== undefined) {
        const required = requirements.minAccountAgeDays;
        const user = db.getUserById(userId);
        const age = daysSince(user?.createdAt, now);
        checks.push({
            key: 'account_age',
            met: age !== null && age >= required,
            required: `${required} day${required === 1 ? '' : 's'} old`,
            ...(age !== null ? { actual: `${age} day${age === 1 ? '' : 's'}` } : {}),
        });
    }

    if (requirements?.requireVerifiedEmail) {
        const user = db.getUserById(userId);
        checks.push({
            key: 'verified_email',
            met: Boolean(user?.emailVerifiedAt),
            required: 'a verified email address',
        });
    }

    if (requirements?.minReputationScore !== undefined) {
        const required = requirements.minReputationScore;
        const score = getUserReputation(userId).overall.score;
        checks.push({
            key: 'reputation',
            met: score >= required,
            required: `${required} reputation`,
            actual: String(score),
        });
    }

    if (requirements?.minCoalitionContributions !== undefined) {
        const required = requirements.minCoalitionContributions;
        const count = coalitionContributionCount(userId);
        checks.push({
            key: 'contributions',
            met: count >= required,
            required: `${required} past contribution${required === 1 ? '' : 's'}`,
            actual: String(count),
        });
    }

    if (coalition.minTierToJoin !== undefined) {
        const gate = coalition.minTierToJoin;
        const resolution: TierResolution = await resolveMemberTier(userId);
        checks.push(
            resolution.known
                ? {
                      key: 'tier',
                      met: tierSatisfies(resolution.tier, gate),
                      required: `${gate} tier or above`,
                      actual: resolution.tier,
                  }
                : {
                      // Unverifiable, not unmet. The steward decides, and the
                      // joiner is never told their standing is too low on the
                      // strength of a lookup that did not happen.
                      key: 'tier',
                      met: false,
                      unverified: true,
                      required: `${gate} tier or above`,
                  }
        );
    }

    const unmet = checks.filter((check) => !check.met);
    return { checks, unmet, clear: unmet.length === 0 };
}

/**
 * One line a joiner can read, or null when they cleared everything.
 *
 * Phrased so an unverifiable tier reads as a referral to a person rather than
 * a judgement — "sent to a steward", never "your reputation is too low".
 */
export function describeUnmet(unmet: readonly CoalitionJoinRequirementCheck[]): string | null {
    if (unmet.length === 0) return null;
    if (unmet.every((check) => check.unverified)) {
        return 'A steward will review your request — we could not check your standing automatically.';
    }
    const parts = unmet
        .filter((check) => !check.unverified)
        .map((check) =>
            check.actual ? `${check.required} (you have ${check.actual})` : check.required
        );
    return `This coalition asks for ${parts.join(', ')}. A steward will review your request.`;
}
