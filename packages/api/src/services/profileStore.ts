import {
    collectDownstreamRelays,
    isPaletteUnlocked,
    normalizeProfileLayout,
    PROFILE_PALETTE_IDS,
    type ProfileLayout,
    type ProfileMilestoneStats,
    type RelayLink,
} from '@blackout/core';
import { resolveBlackoutUserId } from './userIdentity';

import { db } from '../db/store';

/**
 * Profile store for the MySpace-style member profile feature. Mirrors the
 * `MemberProfile` shape consumed by
 * `apps/blackout-client/src/app/features/profile/profileTypes.ts`.
 *
 * Backed by `member_profiles` / `profile_wall_posts` (migration 087). These were
 * two module-level Maps that reset on every restart; once profiles carried a
 * hand-arranged block layout, a chosen palette and per-relationship Circle-map
 * consent, losing them on deploy stopped being a convenience issue — a dropped
 * opt-in silently re-hides or re-exposes a relationship someone decided about.
 */

export type ConnectionType = 'github' | 'website' | 'x' | 'linkedin' | 'matrix' | 'fbm' | 'other';

export interface ProfileConnection {
    type: ConnectionType;
    username?: string;
    label?: string;
    url: string;
}

export type ProfileWallVisibility = 'public' | 'friends' | 'private';
export type ProfileWallWhoCanPost = 'owner' | 'friends' | 'anyone';
export type ProfileWallModeration = 'open' | 'approval';

export interface ProfileWallSettings {
    visibility: ProfileWallVisibility;
    whoCanPost: ProfileWallWhoCanPost;
    moderation: ProfileWallModeration;
}

export interface ProfileTopFriends {
    userIds: string[];
    max?: number;
}

export type ProfileThemeTokenKey =
    | 'accent'
    | 'panelBg'
    | 'panelFg'
    | 'headerBg'
    | 'linkColor'
    | 'fontFamily';

export interface ProfileCustomTheme {
    tokens?: Partial<Record<ProfileThemeTokenKey, string>>;
}

export interface ProfileStatus {
    text: string;
    emoji?: string;
    expiresAt?: string;
}

export type ProfilePinnedMedia =
    | { kind: 'audio'; mxc: string; title?: string; artist?: string }
    | { kind: 'article'; url: string; title?: string }
    | { kind: 'image'; mxc: string; alt?: string }
    | { kind: 'video'; mxc: string };

export interface BmcProfileEvent {
    banner?: string;
    bio?: string;
    pronouns?: string;
    connections?: ProfileConnection[];
    decoration?: string;
    wall?: ProfileWallSettings;
    topFriends?: ProfileTopFriends;
    customTheme?: ProfileCustomTheme;
    status?: ProfileStatus;
    pinnedMedia?: ProfilePinnedMedia[];
    /** Opt-in publish flag for the zero-auth public profile page. */
    public?: boolean;
    /** Curated FreeBlackMarket vendor handles shown as sponsors/backers. */
    sponsors?: string[];
    /** Curated canopy ids surfaced as affiliations on the public profile. */
    featuredCanopies?: string[];
    /** Equipped collectible badge cosmetic ids (capped). */
    badgeIds?: string[];
    /** Which blocks this profile shows, and in what order. */
    layout?: ProfileLayout;
    /** Chosen palette id from the bounded set in `@blackout/core`. */
    paletteId?: string;
    /**
     * Relationships the owner has agreed to show on their Circle map. Opt-in
     * per relationship: an edge appears only if it is listed here, so building
     * a Circle never publishes it as a side effect.
     */
    circleMapVisible?: string[];
    /** Relay ids the owner has pinned — chains they started or carried onward. */
    pinnedRelayIds?: string[];
}

export interface MemberProfile {
    userId: string;
    displayName: string;
    avatarUrl?: string;
    primaryRole?: string;
    roleBadges: string[];
    mutualSpaces: string[];
    isFriend?: boolean;
    profile: BmcProfileEvent;
    /**
     * ISO timestamp stamped by the server the first time this profile is
     * written; immutable afterwards (never client-supplied). Absent for
     * synthesized defaults the store has never seen a write for.
     */
    memberSince?: string;
}

export interface WallPost {
    id: string;
    profileUserId: string;
    authorId: string;
    body: string;
    createdAt: string;
}

const STATUS_TEXT_CAP = 140;
const TOP_FRIENDS_CAP = 12;
const PINNED_MEDIA_CAP = 8;
const MATRIX_USER_ID_RE = /^@[^:\s]+:[^:\s]+$/;
const MXC_RE = /^mxc:\/\/[^/\s]+\/[A-Za-z0-9_-]+$/;
const HTTP_URL_RE = /^https?:\/\/[^\s]+$/i;
const WALL_VISIBILITY: ReadonlyArray<ProfileWallVisibility> = ['public', 'friends', 'private'];
const WALL_WHO_CAN_POST: ReadonlyArray<ProfileWallWhoCanPost> = ['owner', 'friends', 'anyone'];
const WALL_MODERATION: ReadonlyArray<ProfileWallModeration> = ['open', 'approval'];
const THEME_TOKEN_KEYS: ReadonlyArray<ProfileThemeTokenKey> = [
    'accent',
    'panelBg',
    'panelFg',
    'headerBg',
    'linkColor',
    'fontFamily',
];

const isString = (value: unknown): value is string => typeof value === 'string';

/**
 * Allow-list parser shared with the client sanitizer. Rejects raw CSS that
 * could escape the value context (urls, expressions, semicolons, braces).
 */
function sanitizeThemeTokenValue(key: ProfileThemeTokenKey, raw: unknown): string | null {
    if (!isString(raw)) return null;
    const value = raw.trim().slice(0, 200);
    if (value.length === 0) return null;
    if (/[;{}<>"`\\]/.test(value)) return null;
    if (/url\s*\(|expression\s*\(|behavior\s*:|@import|@charset/i.test(value)) return null;

    const isHexColor = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value);
    const isRgbHsl = /^(?:rgba?|hsla?)\(\s*[0-9.,%\s/-]+\)$/i.test(value);
    const isNamedColor = /^[a-zA-Z]+$/.test(value);
    const isFontFamily = /^[a-zA-Z0-9 ,\-_'"]+$/.test(value);

    if (key === 'fontFamily') return isFontFamily ? value : null;
    return isHexColor || isRgbHsl || isNamedColor ? value : null;
}

function sanitizeCustomTheme(input: unknown): ProfileCustomTheme | undefined {
    if (!input || typeof input !== 'object') return undefined;
    const data = input as Record<string, unknown>;
    const rawTokens =
        data.tokens && typeof data.tokens === 'object'
            ? (data.tokens as Record<string, unknown>)
            : null;
    if (!rawTokens) return undefined;
    const tokens: Partial<Record<ProfileThemeTokenKey, string>> = {};
    for (const key of THEME_TOKEN_KEYS) {
        const value = sanitizeThemeTokenValue(key, rawTokens[key]);
        if (value !== null) tokens[key] = value;
    }
    if (Object.keys(tokens).length === 0) return undefined;
    return { tokens };
}

function sanitizeWall(input: unknown): ProfileWallSettings | undefined {
    if (!input || typeof input !== 'object') return undefined;
    const data = input as Record<string, unknown>;
    const visibility = WALL_VISIBILITY.includes(data.visibility as ProfileWallVisibility)
        ? (data.visibility as ProfileWallVisibility)
        : 'public';
    const whoCanPost = WALL_WHO_CAN_POST.includes(data.whoCanPost as ProfileWallWhoCanPost)
        ? (data.whoCanPost as ProfileWallWhoCanPost)
        : 'friends';
    const moderation = WALL_MODERATION.includes(data.moderation as ProfileWallModeration)
        ? (data.moderation as ProfileWallModeration)
        : 'open';
    return { visibility, whoCanPost, moderation };
}

function sanitizeTopFriends(input: unknown): ProfileTopFriends | undefined {
    if (!input || typeof input !== 'object') return undefined;
    const data = input as Record<string, unknown>;
    const ids = Array.isArray(data.userIds)
        ? data.userIds
              .filter(isString)
              .map((id) => id.trim())
              .filter((id) => MATRIX_USER_ID_RE.test(id))
        : [];
    const deduped: string[] = [];
    for (const id of ids) {
        if (!deduped.includes(id)) deduped.push(id);
        if (deduped.length >= TOP_FRIENDS_CAP) break;
    }
    if (deduped.length === 0) return undefined;
    const rawMax = data.max;
    const max =
        typeof rawMax === 'number' && rawMax >= 1 && rawMax <= TOP_FRIENDS_CAP
            ? Math.floor(rawMax)
            : undefined;
    return { userIds: deduped, max };
}

function sanitizeStatus(input: unknown): ProfileStatus | undefined {
    if (!input || typeof input !== 'object') return undefined;
    const data = input as Record<string, unknown>;
    const text = isString(data.text) ? data.text.trim().slice(0, STATUS_TEXT_CAP) : '';
    if (text.length === 0) return undefined;
    const emoji = isString(data.emoji) ? data.emoji.trim().slice(0, 8) : undefined;
    const expiresAt =
        isString(data.expiresAt) && !Number.isNaN(Date.parse(data.expiresAt))
            ? data.expiresAt
            : undefined;
    return emoji ? { text, emoji, expiresAt } : { text, expiresAt };
}

function sanitizePinnedMediaItem(input: unknown): ProfilePinnedMedia | null {
    if (!input || typeof input !== 'object') return null;
    const data = input as Record<string, unknown>;
    if (!isString(data.kind)) return null;
    switch (data.kind) {
        case 'audio': {
            if (!isString(data.mxc) || !MXC_RE.test(data.mxc)) return null;
            return {
                kind: 'audio',
                mxc: data.mxc,
                title: isString(data.title) ? data.title.slice(0, 200) : undefined,
                artist: isString(data.artist) ? data.artist.slice(0, 200) : undefined,
            };
        }
        case 'article': {
            if (!isString(data.url) || !HTTP_URL_RE.test(data.url)) return null;
            return {
                kind: 'article',
                url: data.url,
                title: isString(data.title) ? data.title.slice(0, 300) : undefined,
            };
        }
        case 'image': {
            if (!isString(data.mxc) || !MXC_RE.test(data.mxc)) return null;
            return {
                kind: 'image',
                mxc: data.mxc,
                alt: isString(data.alt) ? data.alt.slice(0, 200) : undefined,
            };
        }
        case 'video': {
            if (!isString(data.mxc) || !MXC_RE.test(data.mxc)) return null;
            return { kind: 'video', mxc: data.mxc };
        }
        default:
            return null;
    }
}

function sanitizePinnedMedia(input: unknown): ProfilePinnedMedia[] | undefined {
    if (!Array.isArray(input)) return undefined;
    const out: ProfilePinnedMedia[] = [];
    for (const candidate of input) {
        const item = sanitizePinnedMediaItem(candidate);
        if (item) out.push(item);
        if (out.length >= PINNED_MEDIA_CAP) break;
    }
    return out.length > 0 ? out : undefined;
}

export function sanitizeProfileEvent(input: unknown): BmcProfileEvent {
    if (!input || typeof input !== 'object') return {};
    const data = input as Record<string, unknown>;
    const connections = Array.isArray(data.connections)
        ? data.connections
              .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
              .map((item) => ({
                  type: isString(item.type) ? (item.type as ConnectionType) : 'other',
                  username: isString(item.username) ? item.username : undefined,
                  label: isString(item.label) ? item.label : undefined,
                  url: isString(item.url) ? item.url : '',
              }))
              .filter((item) => item.url)
        : undefined;

    return {
        banner: isString(data.banner) ? data.banner : undefined,
        bio: isString(data.bio) ? data.bio.slice(0, 2000) : undefined,
        pronouns: isString(data.pronouns) ? data.pronouns.slice(0, 60) : undefined,
        connections,
        decoration: isString(data.decoration) ? data.decoration : undefined,
        wall: sanitizeWall(data.wall),
        topFriends: sanitizeTopFriends(data.topFriends),
        customTheme: sanitizeCustomTheme(data.customTheme),
        status: sanitizeStatus(data.status),
        pinnedMedia: sanitizePinnedMedia(data.pinnedMedia),
        public: data.public === true ? true : undefined,
        sponsors: Array.isArray(data.sponsors)
            ? data.sponsors
                  .filter(isString)
                  .map((handle) => handle.trim().slice(0, 64))
                  .filter((handle) => handle.length > 0)
                  .slice(0, 12)
            : undefined,
        featuredCanopies: Array.isArray(data.featuredCanopies)
            ? data.featuredCanopies
                  .filter(isString)
                  .map((id) => id.trim().slice(0, 128))
                  .filter((id) => id.length > 0)
                  .slice(0, 12)
            : undefined,
        badgeIds: Array.isArray(data.badgeIds)
            ? data.badgeIds
                  .filter(isString)
                  .map((id) => id.slice(0, 64))
                  .slice(0, 6)
            : undefined,
        // Normalizing here means a release that adds or removes a block kind
        // never silently rearranges someone's profile.
        layout: data.layout === undefined ? undefined : normalizeProfileLayout(data.layout),
        // Membership only — the *unlock* check needs the owner's milestone
        // counts, which this pure sanitizer has no access to, so it happens in
        // `upsertProfile` where the user id is known.
        paletteId:
            isString(data.paletteId) && PROFILE_PALETTE_IDS.includes(data.paletteId)
                ? data.paletteId
                : undefined,
        circleMapVisible: Array.isArray(data.circleMapVisible)
            ? data.circleMapVisible
                  .filter(isString)
                  .map((id) => id.trim().slice(0, 255))
                  .filter((id) => id.length > 0)
                  .slice(0, 200)
            : undefined,
        pinnedRelayIds: Array.isArray(data.pinnedRelayIds)
            ? data.pinnedRelayIds
                  .filter(isString)
                  .map((id) => id.slice(0, 64))
                  .slice(0, 12)
            : undefined,
    };
}

export function getProfile(userId: string): MemberProfile | null {
    return db.getMemberProfile(userId) ?? null;
}

/**
 * Returns the stored profile, or a synthesized minimal profile for users who
 * have never customized one (e.g. any Matrix user the store hasn't seen).
 * Lets `GET /profile/:userId` always resolve a usable record instead of 404ing
 * for un-seeded accounts.
 */
export function getProfileOrDefault(userId: string): MemberProfile {
    return (
        db.getMemberProfile(userId) ?? {
            userId,
            displayName: userId,
            roleBadges: [],
            mutualSpaces: [],
            profile: {},
        }
    );
}

export interface UpsertProfileInput {
    displayName?: string;
    avatarUrl?: string;
    primaryRole?: string;
    roleBadges?: string[];
    mutualSpaces?: string[];
    isFriend?: boolean;
    profile?: unknown;
}

/**
 * Milestone counts for the profile's owner, in the Blackout-id space the graph
 * is keyed by. Returns zeroes for an unresolvable id, which simply means no
 * unlockable palette is available — the safe direction.
 */
function milestoneStatsFor(userId: string): ProfileMilestoneStats {
    const graphId = resolveBlackoutUserId(userId);
    if (!graphId) {
        return {
            relaysMade: 0,
            circleSize: 0,
            circleOverlaps: 0,
            chainDepthReached: 0,
            peopleReached: 0,
        };
    }
    const allRelays = [...db.relayEdges.values()] as RelayLink[];
    const ownRelays = allRelays.filter((e) => e.relayerUserId === graphId);
    const downstream = collectDownstreamRelays(
        ownRelays.map((e) => e.id),
        allRelays
    );
    const following = [...db.circleEdges.values()].filter((e) => e.followerId === graphId);
    const followers = new Set(
        [...db.circleEdges.values()]
            .filter((e) => e.followeeId === graphId)
            .map((e) => e.followerId)
    );
    return {
        relaysMade: ownRelays.length,
        circleSize: following.length,
        circleOverlaps: following.filter((e) => followers.has(e.followeeId)).length,
        chainDepthReached: downstream.reduce(
            (max, e) => Math.max(max, e.chainDepth),
            ownRelays.reduce((max, e) => Math.max(max, e.chainDepth), 0)
        ),
        peopleReached: new Set(downstream.map((e) => e.relayerUserId)).size,
    };
}

export function upsertProfile(userId: string, input: UpsertProfileInput): MemberProfile {
    const existing = db.getMemberProfile(userId);
    const next: MemberProfile = {
        userId,
        displayName: input.displayName ?? existing?.displayName ?? userId,
        avatarUrl: input.avatarUrl ?? existing?.avatarUrl,
        primaryRole: input.primaryRole ?? existing?.primaryRole,
        roleBadges: input.roleBadges ?? existing?.roleBadges ?? [],
        mutualSpaces: input.mutualSpaces ?? existing?.mutualSpaces ?? [],
        isFriend: input.isFriend ?? existing?.isFriend,
        profile:
            input.profile !== undefined
                ? sanitizeProfileEvent(input.profile)
                : existing?.profile ?? {},
        memberSince: existing?.memberSince ?? new Date().toISOString(),
    };

    // A palette is a claim about something the owner did, so the server has to
    // check it: the sanitizer only verifies the id is one we know, and
    // `isPaletteUnlocked` was exported but never actually called. A locked pick
    // falls back to whatever they had rather than failing the whole save.
    const requested = next.profile.paletteId;
    if (requested && !isPaletteUnlocked(requested, milestoneStatsFor(userId))) {
        next.profile = { ...next.profile, paletteId: existing?.profile.paletteId };
    }

    return db.upsertMemberProfile(next);
}

export function listWallPosts(userId: string): WallPost[] {
    return db.listProfileWallPosts(userId);
}

/** Find one wall post by id — a relay addresses its subject by id alone. */
export function findWallPost(postId: string): WallPost | null {
    return db.getProfileWallPost(postId) ?? null;
}

/** Every wall post authored by `authorId`, newest first — the Circle-ring query. */
export function listWallPostsByAuthor(authorId: string): WallPost[] {
    return db.listProfileWallPostsByAuthor(authorId);
}

export function appendWallPost(input: {
    profileUserId: string;
    authorId: string;
    body: string;
}): WallPost {
    const body = input.body.trim().slice(0, 2000);
    if (body.length === 0) {
        throw new Error('wall_post_body_required');
    }
    const post: WallPost = {
        id: crypto.randomUUID(),
        profileUserId: input.profileUserId,
        authorId: input.authorId,
        body,
        createdAt: new Date().toISOString(),
    };
    return db.createProfileWallPost(post);
}

/** Test-only helper used to reset state between integration tests. */
export function __resetProfileStoreForTests(): void {
    db.memberProfiles.clear();
    db.profileWallPosts.clear();
}
