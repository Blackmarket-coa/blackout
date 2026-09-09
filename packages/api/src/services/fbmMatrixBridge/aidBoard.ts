// FBM → Coalition board. The one bridge family that does not post to a Matrix
// room: a mutual-aid ask from FreeBlackMarket lands on Blackout's own
// `coalition_aid_posts`, which is the surface a member actually browses.
//
// Everything here is shaped by one fact: Blackout's `GET /v1/coalition/mutual-aid`
// returns rows verbatim, with no projection of its own, while FBM publishes
// through a whitelist (`lib/aid-location.ts`) that emits a coarse `locality` and
// never coordinates. So the mirror may hold only what already crossed that
// projection — anything reconstructed on this side would be published.

import {
    AID_POST_CATEGORIES,
    type AidPost,
    type AidPostCategory,
    type AidPostStatus,
} from '@blackout/core';
import { newAidId, upsertMirroredAidPost } from '../coalitionStore';
import type { FbmAidRequestEvent } from './events';

/** The origin tag written to every row that came across this seam. */
export const FBM_AID_SOURCE = 'freeblackmarket';

/**
 * Mirrored posts are not owned by any Blackout account.
 *
 * `customer_id` is NOT NULL and FBM's `requester_id` is exactly what its
 * projection withholds — publishing a stand-in that looked like a user id would
 * be worse than one that plainly is not.
 */
export const FBM_AID_CUSTOMER_ID = 'system:freeblackmarket';

const CATEGORIES: ReadonlySet<string> = new Set(AID_POST_CATEGORIES);

/**
 * FBM's category is free text; Blackout's is a closed set of ten. Anything
 * unrecognised becomes `other` rather than being dropped — the ask still needs
 * to be readable, and a wrong category is recoverable where a missing post is
 * not.
 */
export function mapAidCategory(raw: string | undefined): AidPostCategory {
    if (!raw) return 'other';
    const normalized = raw
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
    return CATEGORIES.has(normalized) ? (normalized as AidPostCategory) : 'other';
}

/**
 * FBM's AidRequestStatus onto Blackout's AidPostStatus.
 *
 * `MATCHED` is `in_progress`: someone has taken it on but nothing has arrived.
 * `WITHDRAWN` is `cancelled` — Blackout has no separate withdrawn state, and
 * cancelled is the honest neighbour: the ask is off the board by the asker's
 * choice, not because it lapsed.
 */
export function mapAidStatus(raw: string | undefined): AidPostStatus {
    switch (raw?.toUpperCase()) {
        case 'MATCHED':
            return 'in_progress';
        case 'FULFILLED':
            return 'fulfilled';
        case 'EXPIRED':
            return 'expired';
        case 'WITHDRAWN':
            return 'cancelled';
        default:
            return 'open';
    }
}

/**
 * Build the board row for a mirrored ask.
 *
 * `location` is absent, not a zeroed pin: the projection carried no
 * coordinates, and a `{0, 0}` would put every mirrored need in the Gulf of
 * Guinea. `displayRadiusMeters` is 0 for the same reason — there is no centre
 * for a radius to be around. `urgency` is `medium` because FBM's projection
 * does not publish urgency at all, and inventing one on a board people read
 * when they need help is the wrong direction to guess in.
 */
export function buildMirroredAidPost(
    event: FbmAidRequestEvent,
    localId: string
): AidPost & { source: string; externalId: string } {
    const status =
        event.type === 'aid.request.fulfilled' ? 'fulfilled' : mapAidStatus(event.status);

    return {
        id: localId,
        customerId: FBM_AID_CUSTOMER_ID,
        type: 'need',
        category: mapAidCategory(event.category),
        title: event.title,
        description: event.description,
        ...(event.locality ? { locality: event.locality } : {}),
        displayRadiusMeters: 0,
        urgency: 'medium',
        status,
        source: FBM_AID_SOURCE,
        externalId: event.requestId,
        metadata: {
            quantity: event.quantity ?? null,
            unitOfMeasure: event.unitOfMeasure ?? null,
            originCreatedAt: event.createdAt ?? null,
        },
    };
}

/**
 * Apply one `aid.request.*` event to the board.
 *
 * Upserts on (source, externalId) rather than creating: webhook delivery is
 * at-least-once, and `aid.request.fulfilled` for a request whose `opened` also
 * arrived has to close the row already there instead of putting a second copy
 * of the same person's need on the board.
 */
export function applyAidRequestEvent(event: FbmAidRequestEvent): AidPost {
    return upsertMirroredAidPost(buildMirroredAidPost(event, newAidId()));
}
