/**
 * Plugin social service (Phase 6): ratings/reviews, forks, showcases.
 *
 * Reviews are one-per-(plugin,user) and aggregate to a rating used by listing
 * display and Phase 7 discovery. Forks record provenance; showcases let a user
 * highlight a plugin within a scope. All behind a default-off
 * BLACKOUT_PLUGIN_SOCIAL flag.
 */

import crypto from 'node:crypto';
import { aggregateRatings, isValidRating, type RatingAggregate } from '@blackout/core';
import { db } from '../db/store';
import type {
    PluginForkRecord,
    PluginReviewRecord,
    PluginShowcaseRecord,
} from '../db/types';

/** Default-off gate. Flip `BLACKOUT_PLUGIN_SOCIAL=true` to enable. */
export function pluginSocialEnabled(): boolean {
    return process.env.BLACKOUT_PLUGIN_SOCIAL === 'true';
}

export interface PluginReview {
    id: string;
    pluginId: string;
    providerListingId: string | null;
    userId: string;
    rating: number;
    body: string;
    createdAt: string;
    updatedAt: string;
}

function reviewToModel(r: PluginReviewRecord): PluginReview {
    return { ...r };
}

export class PluginSocialError extends Error {
    constructor(message: string, public readonly code: string) {
        super(message);
        this.name = 'PluginSocialError';
    }
}

export function submitReview(input: {
    pluginId: string;
    userId: string;
    rating: number;
    body?: string;
    providerListingId?: string | null;
}): PluginReview {
    if (!isValidRating(input.rating)) {
        throw new PluginSocialError('rating must be an integer 1..5', 'invalid_rating');
    }
    const record = db.upsertPluginReview({
        pluginId: input.pluginId,
        userId: input.userId,
        rating: input.rating,
        body: input.body ?? '',
        providerListingId: input.providerListingId ?? null,
    });
    return reviewToModel(record);
}

export function listReviews(pluginId: string): PluginReview[] {
    return db.listPluginReviews(pluginId).map(reviewToModel);
}

export function ratingFor(pluginId: string): RatingAggregate {
    return aggregateRatings(db.listPluginReviews(pluginId).map((r) => r.rating));
}

export function recordFork(input: {
    forkedFromPluginId: string;
    newPluginId: string;
    ownerUserId: string;
    note?: string;
}): PluginForkRecord {
    return db.createPluginFork({
        id: crypto.randomUUID(),
        pluginId: input.newPluginId,
        forkedFromPluginId: input.forkedFromPluginId,
        ownerUserId: input.ownerUserId,
        note: input.note ?? '',
    });
}

export function listForks(forkedFromPluginId: string): PluginForkRecord[] {
    return db.listPluginForks(forkedFromPluginId);
}

export function createShowcase(input: {
    pluginId: string;
    userId: string;
    scopeType: string;
    scopeId: string;
    title: string;
    body?: string;
}): PluginShowcaseRecord {
    if (!input.title.trim()) {
        throw new PluginSocialError('title is required', 'invalid_showcase');
    }
    return db.createPluginShowcase({
        id: crypto.randomUUID(),
        pluginId: input.pluginId,
        userId: input.userId,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        title: input.title,
        body: input.body ?? '',
    });
}

export function listShowcasesForScope(
    scopeType: string,
    scopeId: string,
): PluginShowcaseRecord[] {
    return db.listPluginShowcasesForScope(scopeType, scopeId);
}
