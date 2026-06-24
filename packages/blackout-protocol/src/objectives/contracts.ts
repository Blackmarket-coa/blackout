/**
 * Den shared-objective contracts (System 5 — cooperative gamification).
 *
 * A "shared objective" is a collective goal a den (or a freshly-formed party)
 * advances *together*: e.g. "log 40 mutual-aid hours" or "complete 12 tasks".
 * Members log increments toward the goal and the den renders a single
 * aggregate "thermometer" that fills as the group contributes.
 *
 * Banlist carve-out (the binding design constraint for all System-5 mechanics,
 * matching `quests/contracts.ts` and the party hook): this surface is
 * "personal not comparative, identity-forming not status-conferring." Progress
 * is **aggregate-only** — a total plus a distinct-contributor *count*. No
 * per-member ranking, no leaderboard, no party level, and no XP/reputation is
 * ever awarded for contributing. Objectives never trade for governance
 * privileges; they are a shared *goal*, deliberately not a shared *reward*
 * (Qiao et al.: shared rewards without shared goals breed rank-fixation).
 */

import type { PlaybookAccentToken } from '../playbook/contracts';

export const OBJECTIVE_PROTOCOL_VERSION = 1 as const;

export const OBJECTIVE_STATUSES = ['active', 'met', 'archived'] as const;
export type ObjectiveStatus = (typeof OBJECTIVE_STATUSES)[number];

/**
 * The state-event payload written to `co.bmc.den.objective` (state key =
 * `objectiveId`). One state event per objective; a den may run several.
 */
export interface DenObjectivePayload {
    /** Stable id; doubles as the Matrix state key. */
    objectiveId: string;
    /** Short human-readable goal, e.g. "Log mutual-aid hours". */
    title: string;
    /** Optional one-line context. */
    description?: string;
    /** Free-text unit of effort, e.g. "hours", "tasks", "meals". */
    unit: string;
    /** Target the den is advancing toward. Must be > 0. */
    target: number;
    status: ObjectiveStatus;
    /** Accent drawn from the shared playbook palette; not a free RGB picker. */
    accent?: PlaybookAccentToken;
    /** ISO-8601 timestamp the objective was created. */
    createdAt: string;
    /** ISO-8601 timestamp the objective was marked met, if it has been. */
    metAt?: string;
}

/**
 * The timeline-event payload written to `co.bmc.den.objective.contribution`.
 * One event per logged increment. The contributor identity is the Matrix
 * event sender — it is used only for a privacy-preserving *distinct count*,
 * never attributed or ranked in any surface.
 */
export interface DenObjectiveContributionPayload {
    /** The `objectiveId` this increment advances. */
    objectiveId: string;
    /** Amount logged toward the goal, in the objective's unit. Must be > 0. */
    amount: number;
    /** Optional free-text note ("brought 6 meals"). */
    note?: string;
}

export const isObjectiveStatus = (value: unknown): value is ObjectiveStatus =>
    typeof value === 'string' && (OBJECTIVE_STATUSES as readonly string[]).includes(value);

export const isDenObjectivePayload = (value: unknown): value is DenObjectivePayload => {
    if (!value || typeof value !== 'object') return false;
    const p = value as Record<string, unknown>;
    if (typeof p.objectiveId !== 'string' || p.objectiveId.length === 0) return false;
    if (typeof p.title !== 'string') return false;
    if (p.description !== undefined && typeof p.description !== 'string') return false;
    if (typeof p.unit !== 'string') return false;
    if (typeof p.target !== 'number' || !Number.isFinite(p.target) || p.target <= 0) return false;
    if (!isObjectiveStatus(p.status)) return false;
    if (p.accent !== undefined && typeof p.accent !== 'string') return false;
    if (typeof p.createdAt !== 'string') return false;
    if (p.metAt !== undefined && typeof p.metAt !== 'string') return false;
    return true;
};

export const isDenObjectiveContributionPayload = (
    value: unknown,
): value is DenObjectiveContributionPayload => {
    if (!value || typeof value !== 'object') return false;
    const p = value as Record<string, unknown>;
    if (typeof p.objectiveId !== 'string' || p.objectiveId.length === 0) return false;
    if (typeof p.amount !== 'number' || !Number.isFinite(p.amount) || p.amount <= 0) return false;
    if (p.note !== undefined && typeof p.note !== 'string') return false;
    return true;
};

export interface ObjectivesProtocolSurface {
    owner: '@blackout/protocol';
    version: typeof OBJECTIVE_PROTOCOL_VERSION;
    policy: 'additive-only-minor';
}

export const OBJECTIVES_PROTOCOL_SURFACE: ObjectivesProtocolSurface = {
    owner: '@blackout/protocol',
    version: OBJECTIVE_PROTOCOL_VERSION,
    policy: 'additive-only-minor',
};
