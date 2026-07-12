export const BMC_PROFILE_EVENT_TYPE = 'co.bmc.profile';

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
    /** Ordered list of Matrix user ids; the first slot is "top" friend. Capped at 12. */
    userIds: string[];
    /** Optional grid size override (defaults to 8 in the UI). */
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
    /**
     * Constrained CSS-variable bundle. Values are validated against an
     * allow-list of CSS color/length/font-family forms. Raw CSS is intentionally
     * NOT supported in v1 — see ProfileThemeScope and the sanitizer below.
     */
    tokens?: Partial<Record<ProfileThemeTokenKey, string>>;
}

export interface ProfileStatus {
    /** Short status text, max 140 chars. */
    text: string;
    /** Optional emoji glyph; one grapheme. */
    emoji?: string;
    /** ISO-8601 timestamp; status is hidden after this. */
    expiresAt?: string;
}

export type ProfilePinnedMedia =
    | { kind: 'audio'; mxc: string; title?: string; artist?: string }
    | { kind: 'article'; url: string; title?: string }
    | { kind: 'image'; mxc: string; alt?: string }
    | { kind: 'video'; mxc: string };

export type ProfilePinnedMediaKind = ProfilePinnedMedia['kind'];

export interface BmcProfileEvent {
    banner?: string;
    bio?: string;
    pronouns?: string;
    connections?: ProfileConnection[];
    decoration?: string;
    /** Equipped nameplate cosmetic id (see cosmeticsAtoms). */
    nameplateId?: string;
    /** Equipped profile-effect cosmetic id. */
    profileEffectId?: string;
    /** Equipped collectible badge cosmetic ids (capped). */
    badgeIds?: string[];
    wall?: ProfileWallSettings;
    topFriends?: ProfileTopFriends;
    customTheme?: ProfileCustomTheme;
    status?: ProfileStatus;
    pinnedMedia?: ProfilePinnedMedia[];
    /**
     * Opt-in flag that exposes this profile on the public creator page
     * (`theblackout.app/@handle`). The zero-auth read
     * (`GET /v1/profile/{userId}/public`) returns 404 unless this is `true`.
     */
    public?: boolean;
    /** Curated FreeBlackMarket vendor handles shown as sponsors/backers. */
    sponsors?: string[];
    /** Curated canopy ids surfaced as affiliations on the public profile. */
    featuredCanopies?: string[];
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
     * ISO timestamp stamped server-side on first profile write (see
     * `packages/api/src/services/profileStore.ts`); never client-supplied.
     * Absent for accounts the store has never seen a write for.
     */
    memberSince?: string;
}

/**
 * Canonical primary roles a member can switch between. `primaryRole` is
 * self-presentation (how you show up across the ecosystem), distinct from
 * earned `roleBadges`. Kept open (the field stays `string`) so legacy/custom
 * values still round-trip, but the editor offers this curated set.
 */
export const MEMBER_PRIMARY_ROLES = [
    'Creator',
    'Builder',
    'Producer',
    'Community Member',
    'Moderator',
    'Developer',
] as const;
export type MemberPrimaryRole = typeof MEMBER_PRIMARY_ROLES[number];

export interface DecorationOption {
    id: string;
    label: string;
    cssGradient: string;
    cssGlow: string;
    gated?: boolean;
}

const MATRIX_USER_ID_RE = /^@[^:\s]+:[^:\s]+$/;
const MXC_RE = /^mxc:\/\/[^/\s]+\/[A-Za-z0-9_-]+$/;
const HTTP_URL_RE = /^https?:\/\/[^\s]+$/i;
const TOP_FRIENDS_CAP = 12;
const PINNED_MEDIA_CAP = 8;
const STATUS_TEXT_CAP = 140;

const WALL_VISIBILITY: ReadonlyArray<ProfileWallVisibility> = ['public', 'friends', 'private'];
const WALL_WHO_CAN_POST: ReadonlyArray<ProfileWallWhoCanPost> = ['owner', 'friends', 'anyone'];
const WALL_MODERATION: ReadonlyArray<ProfileWallModeration> = ['open', 'approval'];

function isString(value: unknown): value is string {
    return typeof value === 'string';
}

/**
 * Allow-list parser for profile theme tokens. Accepts:
 *   - hex colors (#rgb / #rrggbb / #rrggbbaa)
 *   - rgb()/rgba()/hsl()/hsla() with simple numeric/percent args
 *   - named CSS colors (alphabetic only)
 *   - length values (px, em, rem, %, ch)
 *   - font-family names (alphanumeric, spaces, dash, single/double quotes, fallback comma)
 *
 * Rejects (returns null) values containing url(...), expression(...), behavior(...),
 * @-rules, semicolons, braces, or any character outside the safe set. Always
 * trim()s and slice()s to a reasonable length to avoid ReDoS-style payloads.
 */
export function sanitizeProfileThemeTokenValue(
    key: ProfileThemeTokenKey,
    raw: unknown
): string | null {
    if (!isString(raw)) return null;
    const value = raw.trim().slice(0, 200);
    if (value.length === 0) return null;
    // Reject any character that could escape a CSS value context.
    if (/[;{}<>"`\\]/.test(value)) return null;
    // Reject CSS function calls and at-rules that could exfiltrate or redirect.
    if (/url\s*\(|expression\s*\(|behavior\s*:|@import|@charset/i.test(value)) return null;

    const isHexColor = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value);
    const isRgbHsl = /^(?:rgba?|hsla?)\(\s*[0-9.,%\s/-]+\)$/i.test(value);
    const isNamedColor = /^[a-zA-Z]+$/.test(value);
    const isLength = /^-?[0-9]+(?:\.[0-9]+)?(?:px|em|rem|%|ch|vh|vw)$/i.test(value);
    const isFontFamily = /^[a-zA-Z0-9 ,\-_'"]+$/.test(value);

    switch (key) {
        case 'accent':
        case 'panelBg':
        case 'panelFg':
        case 'headerBg':
        case 'linkColor':
            return isHexColor || isRgbHsl || isNamedColor ? value : null;
        case 'fontFamily':
            return isFontFamily ? value : null;
    }
    // Unknown key (shouldn't happen via TS but defensive against runtime payloads).
    if (isLength || isHexColor) return value;
    return null;
}

const THEME_TOKEN_KEYS: ReadonlyArray<ProfileThemeTokenKey> = [
    'accent',
    'panelBg',
    'panelFg',
    'headerBg',
    'linkColor',
    'fontFamily',
];

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
        const value = sanitizeProfileThemeTokenValue(key, rawTokens[key]);
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
            const title = isString(data.title) ? data.title.slice(0, 200) : undefined;
            const artist = isString(data.artist) ? data.artist.slice(0, 200) : undefined;
            return { kind: 'audio', mxc: data.mxc, title, artist };
        }
        case 'article': {
            if (!isString(data.url) || !HTTP_URL_RE.test(data.url)) return null;
            const title = isString(data.title) ? data.title.slice(0, 300) : undefined;
            return { kind: 'article', url: data.url, title };
        }
        case 'image': {
            if (!isString(data.mxc) || !MXC_RE.test(data.mxc)) return null;
            const alt = isString(data.alt) ? data.alt.slice(0, 200) : undefined;
            return { kind: 'image', mxc: data.mxc, alt };
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

export const sanitizeProfileEvent = (input: unknown): BmcProfileEvent => {
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
        : [];

    return {
        banner: isString(data.banner) ? data.banner : undefined,
        bio: isString(data.bio) ? data.bio.slice(0, 2000) : '',
        pronouns: isString(data.pronouns) ? data.pronouns.slice(0, 60) : '',
        connections,
        decoration: isString(data.decoration) ? data.decoration : undefined,
        nameplateId: isString(data.nameplateId) ? data.nameplateId.slice(0, 64) : undefined,
        profileEffectId: isString(data.profileEffectId)
            ? data.profileEffectId.slice(0, 64)
            : undefined,
        badgeIds: Array.isArray(data.badgeIds)
            ? data.badgeIds
                  .filter(isString)
                  .map((id) => id.slice(0, 64))
                  .slice(0, 6)
            : undefined,
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
    };
};
