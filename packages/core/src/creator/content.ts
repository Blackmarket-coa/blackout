/**
 * Creator content lifecycle. A creator drafts a piece of content (a video, an
 * article, or a guide), optionally schedules it, publishes it, and fans it out
 * to one or more surfaces (Home feed, Coliseum, a Coalition, or a Den). Modeled
 * on the same small-record + status-lifecycle convention as CoalitionTask and
 * Bounty so it persists through the write-behind store.
 */

export const CONTENT_KINDS = ['video', 'article', 'guide'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export const CONTENT_STATUSES = ['draft', 'scheduled', 'published', 'archived'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/** Surfaces a published piece of content can be distributed to. */
export const DISTRIBUTION_TARGETS = ['home', 'coliseum', 'coalition', 'den'] as const;
export type DistributionTarget = (typeof DISTRIBUTION_TARGETS)[number];

export interface CreatorContent {
    id: string;
    creatorId: string;
    kind: ContentKind;
    title: string;
    /** Rich-text/markdown body for articles and guides. */
    body?: string;
    /** Matrix mxc:// URI or https URL for a video's media. */
    mediaUrl?: string;
    status: ContentStatus;
    /** ISO timestamp a scheduled piece should auto-publish at. */
    scheduledFor?: string;
    /** ISO timestamp the piece went live. */
    publishedAt?: string;
    createdAt: string;
    updatedAt: string;
}

/** A fan-out record linking a piece of content to one distribution surface. */
export interface ContentDistribution {
    id: string;
    contentId: string;
    target: DistributionTarget;
    /** Canopy/den/topic id for non-home targets; omitted for the global home feed. */
    targetId?: string;
    createdAt: string;
}

export function isContentKind(value: unknown): value is ContentKind {
    return typeof value === 'string' && (CONTENT_KINDS as readonly string[]).includes(value);
}

export function isContentStatus(value: unknown): value is ContentStatus {
    return typeof value === 'string' && (CONTENT_STATUSES as readonly string[]).includes(value);
}

export function isDistributionTarget(value: unknown): value is DistributionTarget {
    return (
        typeof value === 'string' && (DISTRIBUTION_TARGETS as readonly string[]).includes(value)
    );
}
