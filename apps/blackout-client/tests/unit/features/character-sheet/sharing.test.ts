import { describe, expect, it } from 'vitest';
import {
    canViewCharacterSheet,
    isCharacterSheetSharingPayload,
    PRIVATE_SHEET_SHARING,
    type CharacterSheetSharingPayload,
} from '@blackout/protocol';

const ME = '@me:x';
const HOLDER = '@holder:x';
const ROOM_A = '!den-a:x';
const ROOM_B = '!den-b:x';
const ROOM_C = '!den-c:x';

const sharing = (rooms: string[]): CharacterSheetSharingPayload => ({
    sharedInRooms: rooms,
    updatedAt: '2026-05-11T00:00:00Z',
});

describe('isCharacterSheetSharingPayload', () => {
    it('accepts the private default', () => {
        expect(isCharacterSheetSharingPayload(PRIVATE_SHEET_SHARING)).toBe(true);
    });

    it('accepts a shared-with-N-rooms payload', () => {
        expect(isCharacterSheetSharingPayload(sharing([ROOM_A, ROOM_B]))).toBe(true);
    });

    it('rejects payloads missing sharedInRooms', () => {
        expect(
            isCharacterSheetSharingPayload({ updatedAt: '2026-05-11T00:00:00Z' }),
        ).toBe(false);
    });

    it('rejects payloads whose room list has non-string entries', () => {
        expect(
            isCharacterSheetSharingPayload({
                sharedInRooms: [ROOM_A, 42 as unknown as string],
                updatedAt: '2026-05-11T00:00:00Z',
            }),
        ).toBe(false);
    });
});

describe('canViewCharacterSheet', () => {
    it('always lets the holder see their own sheet', () => {
        expect(
            canViewCharacterSheet({
                viewerUserId: HOLDER,
                holderUserId: HOLDER,
                holderSharing: PRIVATE_SHEET_SHARING,
                viewerRoomIds: [],
            }),
        ).toBe(true);
    });

    it('refuses cross-user viewing when the holder is private', () => {
        expect(
            canViewCharacterSheet({
                viewerUserId: ME,
                holderUserId: HOLDER,
                holderSharing: PRIVATE_SHEET_SHARING,
                viewerRoomIds: [ROOM_A, ROOM_B],
            }),
        ).toBe(false);
    });

    it('allows cross-user viewing when there is at least one shared room overlap', () => {
        expect(
            canViewCharacterSheet({
                viewerUserId: ME,
                holderUserId: HOLDER,
                holderSharing: sharing([ROOM_B, ROOM_C]),
                viewerRoomIds: [ROOM_A, ROOM_B],
            }),
        ).toBe(true);
    });

    it('refuses cross-user viewing when the rooms do not overlap', () => {
        expect(
            canViewCharacterSheet({
                viewerUserId: ME,
                holderUserId: HOLDER,
                holderSharing: sharing([ROOM_C]),
                viewerRoomIds: [ROOM_A, ROOM_B],
            }),
        ).toBe(false);
    });

    it('refuses cross-user viewing when the viewer is not in any rooms', () => {
        expect(
            canViewCharacterSheet({
                viewerUserId: ME,
                holderUserId: HOLDER,
                holderSharing: sharing([ROOM_A]),
                viewerRoomIds: [],
            }),
        ).toBe(false);
    });
});
