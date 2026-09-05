/**
 * API client for user-made stickers, memes and coins.
 *
 * Assets are inert until approved — the server refuses to relay or resolve a
 * pending one — so the shelf here only ever shows approved work, and a creator's
 * own view is where they see what is still in review.
 */
import { getJson, postJson } from '../../sdk/json';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

const ASSETS_BASE = '/v1/assets';

export type CommunityAssetKind = 'sticker' | 'meme' | 'coin';
export type CommunityAssetStatus = 'pending' | 'approved' | 'rejected' | 'retired';

export interface CommunityAsset {
    id: string;
    creatorId: string;
    kind: CommunityAssetKind;
    name: string;
    description: string | null;
    mediaUrl: string;
    status: CommunityAssetStatus;
    /** Why it was approved or rejected — a decision the creator can answer. */
    reviewNote: string | null;
    foundingOrdinal: number | null;
    createdAt: string;
}

/** The public shelf: approved assets only. */
export function fetchAssets(
    kind?: CommunityAssetKind,
    token: string | null = readBlackoutApiToken()
): Promise<CommunityAsset[]> {
    const qs = kind ? `?kind=${encodeURIComponent(kind)}` : '';
    return getJson<{ assets: CommunityAsset[] }>(`${ASSETS_BASE}${qs}`, token).then(
        (r) => r.assets
    );
}

/** Your own assets at any status, so you can see what is still in review. */
export function fetchMyAssets(
    token: string | null = readBlackoutApiToken()
): Promise<CommunityAsset[]> {
    return getJson<{ assets: CommunityAsset[] }>(`${ASSETS_BASE}/mine`, token).then(
        (r) => r.assets
    );
}

export function submitAsset(
    input: {
        kind: CommunityAssetKind;
        name: string;
        description?: string;
        mediaUrl: string;
    },
    token: string | null = readBlackoutApiToken()
): Promise<{ asset: CommunityAsset; shareable: boolean }> {
    return postJson(`${ASSETS_BASE}`, input, token);
}

export function reportAsset(
    assetId: string,
    reason: string,
    token: string | null = readBlackoutApiToken()
): Promise<unknown> {
    return postJson(`${ASSETS_BASE}/${assetId}/report`, { reason }, token);
}

export interface FoundingStatus {
    credentials: { kind: CommunityAssetKind; ordinal: number; badgeId: string }[];
    /** Reported so being early is a checkable fact rather than a rumour. */
    slotsRemaining: { sticker: number; meme: number; coin: number };
}

export function fetchFoundingStatus(
    userId: string,
    token: string | null = readBlackoutApiToken()
): Promise<FoundingStatus> {
    return getJson<FoundingStatus>(`${ASSETS_BASE}/founding/${encodeURIComponent(userId)}`, token);
}
