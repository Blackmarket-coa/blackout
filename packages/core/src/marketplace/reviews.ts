/**
 * Marketplace product pages: ratings, reviews, and version history. A listing is
 * addressed by its provider + listing id (the same pair the marketplace detail
 * route uses). Reviews are one-per-author-per-listing; versions are an
 * append-only changelog. Modeled like the other small write-through records.
 */

export const MIN_PRODUCT_RATING = 1;
export const MAX_PRODUCT_RATING = 5;

export interface ProductReview {
    id: string;
    providerId: string;
    listingId: string;
    authorId: string;
    /** Integer 1–5. */
    rating: number;
    body?: string;
    createdAt: string;
    updatedAt: string;
}

export interface ProductVersion {
    id: string;
    providerId: string;
    listingId: string;
    /** Free-text version label, e.g. "1.2.0". */
    version: string;
    notes?: string;
    releasedAt: string;
}

/** Aggregate rating for a listing's detail page. */
export interface ProductRatingSummary {
    providerId: string;
    listingId: string;
    count: number;
    /** Mean rating rounded to one decimal; 0 when there are no reviews. */
    average: number;
}

/**
 * Version-string rule for published listing versions (W3): SemVer
 * `X.Y.Z` with an optional leading `v`, prerelease, and build metadata.
 * Mirrors the FBM plugin registry's write rule (`SEMVER_WRITE_RE` in
 * free-black-market `backend/src/modules/plugin-registry/compat.ts`) so a
 * version accepted here is also recordable on the registry side.
 */
export const PRODUCT_VERSION_RE = /^v?\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?(?:\+[a-z0-9.-]+)?$/i;

export function isValidProductVersion(input: string | null | undefined): boolean {
    return typeof input === 'string' && PRODUCT_VERSION_RE.test(input.trim());
}

export function isValidProductRating(value: unknown): value is number {
    return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= MIN_PRODUCT_RATING &&
        value <= MAX_PRODUCT_RATING
    );
}

/** Compute the aggregate rating from a listing's reviews. */
export function summarizeProductRating(
    providerId: string,
    listingId: string,
    reviews: readonly ProductReview[]
): ProductRatingSummary {
    if (reviews.length === 0) {
        return { providerId, listingId, count: 0, average: 0 };
    }
    const total = reviews.reduce((sum, review) => sum + review.rating, 0);
    return {
        providerId,
        listingId,
        count: reviews.length,
        average: Math.round((total / reviews.length) * 10) / 10,
    };
}
