/**
 * Coalition Projects. A coalition launches concrete initiatives — a community
 * garden, a tool library, a food project, an open-source build — and tracks
 * them through a simple lifecycle. Canopy-scoped like {@link CoalitionTask};
 * may optionally reference a governance proposal so "launch a project" can
 * originate from a vote.
 */

export const PROJECT_STATUSES = ['proposed', 'active', 'paused', 'complete'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Suggested categories for UI affordances; the stored value is free-text. */
export const SUGGESTED_PROJECT_CATEGORIES = [
    'community_garden',
    'tool_library',
    'food',
    'open_source',
    'other',
] as const;

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
    createdAt: string;
    updatedAt: string;
}

export function isProjectStatus(value: unknown): value is ProjectStatus {
    return typeof value === 'string' && (PROJECT_STATUSES as readonly string[]).includes(value);
}
