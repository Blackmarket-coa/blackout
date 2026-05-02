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

export type AidPostType = (typeof AID_POST_TYPES)[number];
export type AidPostCategory = (typeof AID_POST_CATEGORIES)[number];
export type AidPostUrgency = (typeof AID_POST_URGENCY)[number];
export type AidPostStatus = (typeof AID_POST_STATUS)[number];

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
    location: AidPostLocation;
    displayRadiusMeters: number;
    urgency: AidPostUrgency;
    expiresAt?: string;
    status: AidPostStatus;
    fulfillerId?: string;
    fulfilledAt?: string;
    denId?: string;
    metadata?: Record<string, unknown>;
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

export function deriveDisplayStatus(
    post: AidPost,
    nowMs: number = Date.now(),
): AidPostStatus {
    if (post.status === 'fulfilled' || post.status === 'cancelled') return post.status;
    if (isPostExpired(post, nowMs)) return 'expired';
    return post.status;
}
