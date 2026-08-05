/**
 * Coalition Needs Board. Members post what their coalition needs — compost,
 * seedlings, a creator, a developer — and the post moves from open to fulfilled
 * as the community (or, later, an FBM listing) satisfies it. Kept deliberately
 * close to {@link CoalitionTask}: a canopy-scoped record with a small status
 * lifecycle. `kind` is free-text so new need categories never require a schema
 * change, and `fulfilledByListingId` is the seam the future FBM opportunity
 * system hangs off of.
 */

import type { CoalitionPlace } from './place';

export const NEED_STATUSES = ['open', 'claimed', 'fulfilled', 'closed'] as const;
export type NeedStatus = typeof NEED_STATUSES[number];

/** Suggested kinds for UI affordances; the stored value is free-text. */
export const SUGGESTED_NEED_KINDS = [
    'compost',
    'seedlings',
    'creator',
    'developer',
    'tools',
    'funding',
    'other',
] as const;

export interface CoalitionNeed {
    id: string;
    /** The coalition (Matrix space) this need belongs to. */
    canopyId: string;
    /** Free-text category (compost, seedlings, creator, developer, …). */
    kind: string;
    title: string;
    description?: string;
    status: NeedStatus;
    authorId: string;
    /** Set when an FBM listing fulfils the need — the FBM-opportunity seam. */
    fulfilledByListingId?: string;
    /**
     * Where the need is, so it can be a map pin. Optional: plenty of needs are
     * genuinely placeless ("we need a developer"), and forcing a location on
     * those would put fictional pins on the map.
     */
    place?: CoalitionPlace;
    createdAt: string;
    updatedAt: string;
}

export function isNeedStatus(value: unknown): value is NeedStatus {
    return typeof value === 'string' && (NEED_STATUSES as readonly string[]).includes(value);
}
