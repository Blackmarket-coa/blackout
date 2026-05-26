/**
 * Plugin social primitives (Phase 6) — pure helpers.
 *
 * Ratings/reviews, forks, and showcases get their data model in the API layer;
 * this module holds the provider-agnostic value logic: rating bounds and the
 * aggregate (count + average) consumed by listing display and Phase 7
 * discovery ranking.
 */

export const MIN_PLUGIN_RATING = 1;
export const MAX_PLUGIN_RATING = 5;

export function isValidRating(rating: number): boolean {
    return (
        Number.isInteger(rating) && rating >= MIN_PLUGIN_RATING && rating <= MAX_PLUGIN_RATING
    );
}

export interface RatingAggregate {
    count: number;
    /** Mean rating rounded to 2 decimals; 0 when there are no ratings. */
    average: number;
}

export function aggregateRatings(ratings: readonly number[]): RatingAggregate {
    const valid = ratings.filter(isValidRating);
    if (valid.length === 0) return { count: 0, average: 0 };
    const sum = valid.reduce((acc, r) => acc + r, 0);
    return { count: valid.length, average: Math.round((sum / valid.length) * 100) / 100 };
}
