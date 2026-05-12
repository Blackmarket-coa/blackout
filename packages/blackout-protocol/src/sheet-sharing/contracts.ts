/**
 * Character-sheet sharing preferences (J4 sharing surface).
 *
 * The brief frames the character sheet as "visible to the user themselves
 * by default; opt-in shareable to dens the user is a member of." This
 * contract is the storage shape — a per-user account-data event listing
 * the room ids the user has opted into sharing with.
 *
 * Default state (no event, or empty list) is private. There's no global
 * "everyone in the federation" toggle — the brief explicitly rejects
 * leaderboards and member-vs-member comparison; sharing is per-circle and
 * the user always names the rooms.
 */

import type { EventEnvelope } from '../common/types';

export const CHARACTER_SHEET_SHARING_PROTOCOL_VERSION = 1 as const;

/**
 * Stable identifiers for the sheet's per-section opt-ins. The "whole-sheet
 * remainder" (Roles + Quest log) is *not* a section — it follows the
 * per-room grant directly. Only Header (userId + copy-link block) and
 * Stats (the four numeric cards) are independently gateable.
 *
 * Per the brief, defaults are explicit per-section opt-in: turning on the
 * per-room grant alone reveals nothing from this list — each section
 * requires its own toggle.
 *
 * Adding entries here is an additive minor change. Older readers ignore
 * unknown ids, so unknown sections render as "not shared" — the safe
 * direction for a privacy surface.
 */
export const CHARACTER_SHEET_SECTION_IDS = ['header', 'stats'] as const;
export type CharacterSheetSectionId = (typeof CHARACTER_SHEET_SECTION_IDS)[number];

const isStringArray = (value: unknown): value is ReadonlyArray<string> => {
    if (!Array.isArray(value)) return false;
    return value.every((entry) => typeof entry === 'string');
};

const isStringRecordOfStringArray = (
    value: unknown,
): value is Readonly<Record<string, ReadonlyArray<string>>> => {
    if (!value || typeof value !== 'object') return false;
    return Object.values(value as Record<string, unknown>).every(isStringArray);
};

export interface CharacterSheetSharingPayload {
    /**
     * Matrix room ids the user has opted into sharing their sheet with.
     * Empty list = private. Order is not significant; clients should
     * de-duplicate before write.
     */
    sharedInRooms: ReadonlyArray<string>;
    /** ISO-8601 timestamp of the last edit. */
    updatedAt: string;
    /**
     * Per-room per-section opt-ins. Missing entry (or empty array) means
     * the room's grant carries the whole-sheet remainder only — no
     * sections from `CHARACTER_SHEET_SECTION_IDS` are revealed. Stays
     * synchronized with the per-room state-event grant; the account-data
     * copy is the holder's cross-device source of truth.
     */
    sectionsByRoom?: Readonly<Record<string, ReadonlyArray<string>>>;
}

export const isCharacterSheetSharingPayload = (
    value: unknown,
): value is CharacterSheetSharingPayload => {
    if (!value || typeof value !== 'object') return false;
    const p = value as Record<string, unknown>;
    if (!Array.isArray(p.sharedInRooms)) return false;
    if (!p.sharedInRooms.every((entry) => typeof entry === 'string')) return false;
    if (typeof p.updatedAt !== 'string') return false;
    if (p.sectionsByRoom !== undefined && !isStringRecordOfStringArray(p.sectionsByRoom)) {
        return false;
    }
    return true;
};

/** Default sharing state — the sheet is private until the user opts in. */
export const PRIVATE_SHEET_SHARING: CharacterSheetSharingPayload = {
    sharedInRooms: [],
    updatedAt: '1970-01-01T00:00:00Z',
};

/**
 * Per-room grant. Matrix account data is per-user-private, so a viewer
 * can't read the holder's preferences directly. To let den members
 * discover which fellow members have shared their sheet *with this
 * circle*, the holder mirrors each opt-in into a room state event keyed
 * by their user id. Empty / missing state event means no grant.
 *
 * The payload is intentionally minimal — just a timestamp — so the room
 * timeline isn't doing double duty as the holder's preferences store.
 * The holder's account-data event remains authoritative for cross-device
 * sync; the room state event is the discoverable side.
 */
export interface CharacterSheetSharedGrantPayload {
    /** ISO-8601 timestamp the grant was last written. */
    sharedAt: string;
    /**
     * Sections the holder has independently opted into for THIS room.
     * Strings rather than the narrowed union so a future minor that
     * introduces a new section id doesn't reject older payloads.
     * Missing or empty: only the whole-sheet remainder is shared.
     */
    sections?: ReadonlyArray<string>;
}

export const isCharacterSheetSharedGrantPayload = (
    value: unknown,
): value is CharacterSheetSharedGrantPayload => {
    if (!value || typeof value !== 'object') return false;
    const p = value as Record<string, unknown>;
    if (typeof p.sharedAt !== 'string') return false;
    if (p.sections !== undefined && !isStringArray(p.sections)) return false;
    return true;
};

/**
 * Returns true iff `payload` opts the named section in. Filters down to the
 * known `CharacterSheetSectionId` set, so an unknown future id stored in a
 * newer payload doesn't accidentally pass an older reader's section check.
 */
export const grantHasSection = (
    payload: CharacterSheetSharedGrantPayload,
    section: CharacterSheetSectionId,
): boolean => {
    if (!payload.sections) return false;
    return payload.sections.includes(section);
};

export type CharacterSheetSharingEvent = EventEnvelope<
    'blackout.user.sheet.sharing',
    CharacterSheetSharingPayload
>;

export type CharacterSheetSharedGrantEvent = EventEnvelope<
    'blackout.user.sheet.shared',
    CharacterSheetSharedGrantPayload
>;

export interface CharacterSheetSharingProtocolSurface {
    owner: '@blackout/protocol';
    version: typeof CHARACTER_SHEET_SHARING_PROTOCOL_VERSION;
    policy: 'additive-only-minor';
}

export const CHARACTER_SHEET_SHARING_PROTOCOL_SURFACE: CharacterSheetSharingProtocolSurface = {
    owner: '@blackout/protocol',
    version: CHARACTER_SHEET_SHARING_PROTOCOL_VERSION,
    policy: 'additive-only-minor',
};

/**
 * Pure visibility predicate: can `viewerUserId` see `holderUserId`'s
 * character sheet?
 *
 *   • the user can always see their own sheet
 *   • viewers see another user's sheet only when the holder has shared
 *     into a room the viewer is also a member of (the "circle of trust"
 *     framing)
 *
 * Caller supplies the room-id set the viewer belongs to and the holder's
 * sharing payload. v1 keeps the rule simple — no per-section visibility,
 * no per-viewer allow lists; just the room-overlap test.
 */
export function canViewCharacterSheet(input: {
    viewerUserId: string;
    holderUserId: string;
    holderSharing: CharacterSheetSharingPayload;
    viewerRoomIds: ReadonlyArray<string>;
}): boolean {
    if (input.viewerUserId === input.holderUserId) return true;
    if (input.holderSharing.sharedInRooms.length === 0) return false;
    const viewerSet = new Set(input.viewerRoomIds);
    return input.holderSharing.sharedInRooms.some((roomId) => viewerSet.has(roomId));
}
