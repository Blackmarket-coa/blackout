export const AID_POST_TYPES = ['need', 'offer'] as const;
export const AID_POST_CATEGORIES = [
    'food',
    'transport',
    'labor',
    'materials',
    'care',
    'housing',
    'childcare',
    'eldercare',
    'tech_support',
    'other',
] as const;
export const AID_POST_URGENCY = ['low', 'medium', 'high', 'critical'] as const;
export const AID_POST_STATUS = [
    'open',
    'in_progress',
    'fulfilled',
    'expired',
    'cancelled',
] as const;

export type AidPostType = typeof AID_POST_TYPES[number];
export type AidPostCategory = typeof AID_POST_CATEGORIES[number];
export type AidPostUrgency = typeof AID_POST_URGENCY[number];
export type AidPostStatus = typeof AID_POST_STATUS[number];

export interface AidPostLocation {
    latitude: number;
    longitude: number;
    address?: string;
}

export interface AidPost {
    id: string;
    customerId: string;
    type: AidPostType;
    category: AidPostCategory;
    title: string;
    description: string;
    /**
     * Absent on a mirrored post. FreeBlackMarket publishes its aid board
     * through a whitelist projection that emits a coarse place name and never
     * coordinates — precise ones describe where a person in need actually
     * lives — so a post from there has a `locality` and no pin. Anything
     * reading this must handle its absence; the map drops such a post from the
     * pins and lists it instead.
     */
    location?: AidPostLocation;
    /** Coarse place name. The only thing a post with no coordinates can say. */
    locality?: string;
    displayRadiusMeters: number;
    urgency: AidPostUrgency;
    expiresAt?: string;
    status: AidPostStatus;
    fulfillerId?: string;
    fulfilledAt?: string;
    denId?: string;
    /** Origin system for a mirrored post; absent for one posted here. */
    source?: string;
    /** The origin system's id for the row, unique within `source`. */
    externalId?: string;
    metadata?: Record<string, unknown>;
}

/** Whether a post can be placed on a map at all. */
export function hasCoordinates(
    post: Pick<AidPost, 'location'>
): post is Pick<AidPost, 'location'> & { location: AidPostLocation } {
    const location = post.location;
    return (
        location != null &&
        Number.isFinite(location.latitude) &&
        Number.isFinite(location.longitude)
    );
}

/**
 * What to show for where a post is.
 *
 * A locally-posted row has coordinates and usually no locality; a mirrored one
 * has the reverse. Returns null when neither is known rather than inventing a
 * placeholder.
 */
export function aidPlaceLabel(post: Pick<AidPost, 'location' | 'locality'>): string | null {
    if (post.locality) return post.locality;
    if (post.location?.address) return post.location.address;
    return null;
}

export interface AidResponse {
    id: string;
    aidPostId: string;
    responderId: string;
    message: string;
    createdAt: string;
}

export const URGENCY_RANK: Record<AidPostUrgency, number> = {
    low: 0.25,
    medium: 0.5,
    high: 0.75,
    critical: 1,
};

export function isPostExpired(post: AidPost, nowMs: number = Date.now()): boolean {
    if (!post.expiresAt) return false;
    const expires = Date.parse(post.expiresAt);
    return !Number.isNaN(expires) && expires <= nowMs;
}

export function deriveDisplayStatus(post: AidPost, nowMs: number = Date.now()): AidPostStatus {
    if (post.status === 'fulfilled' || post.status === 'cancelled') return post.status;
    if (isPostExpired(post, nowMs)) return 'expired';
    return post.status;
}
