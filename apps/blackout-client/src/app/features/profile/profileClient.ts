import type {
    ArenaRecord,
    PaletteAvailability,
    ProfileMilestoneStats,
    ReputationProfile,
} from '@blackout/core';
import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';
import type { BmcProfileEvent, MemberProfile } from './profileTypes';

const PROFILE_BASE = '/v1/profile';
const REPUTATION_BASE = '/v1/reputation';

export interface SaveProfileInput {
    displayName?: string;
    avatarUrl?: string;
    primaryRole?: string;
    roleBadges?: string[];
    mutualSpaces?: string[];
    isFriend?: boolean;
    profile?: BmcProfileEvent;
}

export interface WallPost {
    id: string;
    profileUserId: string;
    authorId: string;
    body: string;
    createdAt: string;
}

export interface FetchWallResponse {
    userId: string;
    posts: WallPost[];
}

function getJson<T>(path: string, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'GET', path }) as Promise<T>;
}

function delJson<T>(path: string, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'DELETE', path }) as Promise<T>;
}

const FOLLOWS_BASE = '/v1/follows';

export interface FollowUserSummary {
    /** Blackout user id (the follow-graph key). */
    userId: string;
    username: string;
    /** Matrix id, used to fetch the user's profile/status/wall. */
    matrixUserId: string | null;
}

export function followUser(
    followeeId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ ok: boolean; following: boolean; created: boolean }> {
    return postJson(FOLLOWS_BASE, { followeeId }, token);
}

export function unfollowUser(
    followeeId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ ok: boolean; following: boolean; removed: boolean }> {
    return delJson(`${FOLLOWS_BASE}/${encodeURIComponent(followeeId)}`, token);
}

export function fetchFollowing(
    token: string | null = readBlackoutApiToken()
): Promise<{ following: FollowUserSummary[] }> {
    return getJson(`${FOLLOWS_BASE}/following`, token);
}

export function fetchFollowers(
    token: string | null = readBlackoutApiToken()
): Promise<{ followers: FollowUserSummary[] }> {
    return getJson(`${FOLLOWS_BASE}/followers`, token);
}

function putJson<T>(path: string, body: unknown, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'PUT', path, body }) as Promise<T>;
}

function postJson<T>(path: string, body: unknown, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'POST', path, body }) as Promise<T>;
}

export function fetchProfile(
    userId: string,
    token: string | null = readBlackoutApiToken()
): Promise<MemberProfile> {
    return getJson<MemberProfile>(`${PROFILE_BASE}/${encodeURIComponent(userId)}`, token);
}

export function saveProfile(
    userId: string,
    input: SaveProfileInput,
    token: string | null = readBlackoutApiToken()
): Promise<MemberProfile> {
    return putJson<MemberProfile>(`${PROFILE_BASE}/${encodeURIComponent(userId)}`, input, token);
}

/**
 * Palettes with their unlock state, plus the milestone counts behind them.
 * Locked palettes come back too, with progress — the UI shows them as locked
 * rather than hiding them.
 */
export function fetchProfilePalettes(
    userId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ stats: ProfileMilestoneStats; palettes: PaletteAvailability[] }> {
    return getJson<{ stats: ProfileMilestoneStats; palettes: PaletteAvailability[] }>(
        `${PROFILE_BASE}/${encodeURIComponent(userId)}/palettes`,
        token
    );
}

/**
 * The owner's Circle map. Only overlapping circles are eligible — an overlap
 * means both people chose the edge — and `visible` is the owner's per-relationship
 * opt-in on top of that.
 */
export function fetchCircleMap(
    userId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{
    connections: { userId: string; visible: boolean }[];
    eligibleCount: number;
    visibleCount: number;
}> {
    return getJson(`${PROFILE_BASE}/${encodeURIComponent(userId)}/circle-map`, token);
}

export function fetchWall(
    userId: string,
    token: string | null = readBlackoutApiToken()
): Promise<FetchWallResponse> {
    return getJson<FetchWallResponse>(`${PROFILE_BASE}/${encodeURIComponent(userId)}/wall`, token);
}

export function postWall(
    userId: string,
    body: string,
    token: string | null = readBlackoutApiToken()
): Promise<WallPost> {
    return postJson<WallPost>(
        `${PROFILE_BASE}/${encodeURIComponent(userId)}/wall`,
        { body },
        token
    );
}

/** Literal Coliseum record — event counts plus Briefs fought in. */
export interface ArenaTrackRecord extends ArenaRecord {
    briefsAuthored: number;
}

export interface FetchReputationResponse {
    userId: string;
    generatedAt: string;
    reputation: ReputationProfile;
    /** Absent on servers that predate the arena-record rollout. */
    record?: ArenaTrackRecord;
}

export function fetchReputation(
    userId: string,
    token: string | null = readBlackoutApiToken()
): Promise<FetchReputationResponse> {
    return getJson<FetchReputationResponse>(
        `${REPUTATION_BASE}/${encodeURIComponent(userId)}`,
        token
    );
}
