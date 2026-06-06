import {
    summarizeProductRating,
    type ProductRatingSummary,
    type ProductReview,
    type ProductVersion,
} from '@blackout/core';
import { db } from '../db/store';

const rand = () => `${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;

export function newReviewId(): string {
    return `rev_${rand()}`;
}
export function newVersionId(): string {
    return `pver_${rand()}`;
}

export function listReviews(providerId: string, listingId: string): ProductReview[] {
    return db.listProductReviews({ providerId, listingId });
}

export function ratingSummary(providerId: string, listingId: string): ProductRatingSummary {
    return summarizeProductRating(providerId, listingId, listReviews(providerId, listingId));
}

export function upsertReview(input: {
    providerId: string;
    listingId: string;
    authorId: string;
    rating: number;
    body?: string;
}): ProductReview {
    return db.upsertProductReview({ id: newReviewId(), ...input });
}

export function listVersions(providerId: string, listingId: string): ProductVersion[] {
    return db
        .listProductVersions({ providerId, listingId })
        .sort((a, b) => b.releasedAt.localeCompare(a.releasedAt));
}

export function addVersion(input: {
    providerId: string;
    listingId: string;
    version: string;
    notes?: string;
}): ProductVersion {
    return db.addProductVersion({ id: newVersionId(), ...input });
}
