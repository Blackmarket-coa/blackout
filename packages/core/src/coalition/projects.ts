/**
 * Coalition Projects. A coalition launches concrete initiatives — a community
 * garden, a tool library, a food project, an open-source build — and tracks
 * them through a simple lifecycle. Canopy-scoped like {@link CoalitionTask};
 * may optionally reference a governance proposal so "launch a project" can
 * originate from a vote.
 */

export const PROJECT_STATUSES = ['proposed', 'active', 'paused', 'complete'] as const;
export type ProjectStatus = typeof PROJECT_STATUSES[number];

/** Suggested categories for UI affordances; the stored value is free-text. */
export const SUGGESTED_PROJECT_CATEGORIES = [
    'community_garden',
    'tool_library',
    'food',
    'open_source',
    'other',
] as const;

/**
 * A funding/progress milestone on a project. `thresholdCents` is the cumulative
 * `raisedCents` at which the milestone is considered reached; `reachedAt` is set
 * (once) when that threshold is first crossed. Milestones are the seam the future
 * Milestone Broadcast feature hangs off of.
 */
export interface ProjectMilestone {
    id: string;
    label: string;
    thresholdCents: number;
    reachedAt?: string;
}

export interface CoalitionProject {
    id: string;
    /** The coalition (Matrix space) this project belongs to. */
    canopyId: string;
    title: string;
    /** Free-text category (community_garden, tool_library, food, …). */
    category: string;
    description?: string;
    status: ProjectStatus;
    leadId: string;
    /** Optional link to a governance proposal state-event id. */
    proposalEventId?: string;
    /**
     * Funding goal in minor units (cents). When unset the project is a journey
     * with no donate button — the research is explicit that not everything needs
     * one, and that mix is what keeps the economic layer feeling non-extractive.
     */
    fundingGoalCents?: number;
    /** Cumulative captured support in minor units. Never decreases on capture. */
    raisedCents: number;
    /** ISO 4217-ish currency code for goal/raised (free-text, validated at the edge). */
    currency?: string;
    /** Distinct supporter count — a community-trust signal, surfaced as social proof. */
    supporterCount: number;
    /** Free-text "where the money goes" breakdown. */
    useOfFunds?: string;
    /** Optional funding deadline (ISO-8601). */
    deadlineAt?: string;
    /** Funding/progress milestones, ascending by threshold. */
    milestones: ProjectMilestone[];
    createdAt: string;
    updatedAt: string;
}

export function isProjectStatus(value: unknown): value is ProjectStatus {
    return typeof value === 'string' && (PROJECT_STATUSES as readonly string[]).includes(value);
}

function clamp01(value: number): number {
    if (Number.isNaN(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

/**
 * Funding progress in [0, 1]. A project with no goal (or a non-positive goal)
 * has no progress bar, so this returns 0 — callers should branch on
 * `fundingGoalCents` to decide whether to render a meter at all.
 */
export function projectProgress(
    project: Pick<CoalitionProject, 'fundingGoalCents' | 'raisedCents'>
): number {
    const goal = project.fundingGoalCents ?? 0;
    if (goal <= 0) return 0;
    return clamp01(project.raisedCents / goal);
}

/** The lowest-threshold milestone not yet reached, or undefined if all are reached. */
export function nextMilestone(
    project: Pick<CoalitionProject, 'milestones'>
): ProjectMilestone | undefined {
    return [...project.milestones]
        .filter((m) => !m.reachedAt)
        .sort((a, b) => a.thresholdCents - b.thresholdCents)[0];
}

/**
 * Evaluate milestones against a new cumulative `raisedCents`, returning a new
 * milestone array (input untouched) plus the milestones newly crossed by this
 * change. Pure: the caller supplies `nowIso` so the function stays deterministic
 * and testable. A milestone already `reachedAt` is never re-stamped.
 */
export function evaluateMilestones(
    milestones: ReadonlyArray<ProjectMilestone>,
    raisedCents: number,
    nowIso: string
): { milestones: ProjectMilestone[]; reached: ProjectMilestone[] } {
    const reached: ProjectMilestone[] = [];
    const next = milestones.map((m) => {
        if (!m.reachedAt && raisedCents >= m.thresholdCents) {
            const stamped = { ...m, reachedAt: nowIso };
            reached.push(stamped);
            return stamped;
        }
        return m;
    });
    return { milestones: next, reached };
}
