import { describe, expect, it } from 'vitest';
import {
    buildEmbedCanopyLists,
    buildEmbedHomeLists,
    classifyEmbedRoom,
    type EmbedRoomFacts,
} from './embedScope';

const room = (overrides: Partial<EmbedRoomFacts> & { roomId: string }): EmbedRoomFacts => ({
    name: overrides.roomId,
    membership: 'join',
    createType: undefined,
    denKind: 'text',
    isDirect: false,
    parentIds: [],
    ...overrides,
});

describe('classifyEmbedRoom', () => {
    it('shows canopies, text and announcement dens, and DMs', () => {
        expect(classifyEmbedRoom(room({ roomId: 'c', createType: 'm.space' }))).toBe('canopy');
        expect(classifyEmbedRoom(room({ roomId: 'd' }))).toBe('den');
        expect(classifyEmbedRoom(room({ roomId: 'a', denKind: 'announcement' }))).toBe('den');
        expect(classifyEmbedRoom(room({ roomId: 'm', isDirect: true }))).toBe('dm');
    });

    it('hides voice, stage and forum dens', () => {
        expect(classifyEmbedRoom(room({ roomId: 'v', denKind: 'voice' }))).toBeNull();
        expect(classifyEmbedRoom(room({ roomId: 's', denKind: 'stage' }))).toBeNull();
        expect(classifyEmbedRoom(room({ roomId: 'f', denKind: 'forum' }))).toBeNull();
    });

    it('hides rooms of any other custom type, even when listed as direct', () => {
        expect(classifyEmbedRoom(room({ roomId: 'x', createType: 'co.bmc.forum' }))).toBeNull();
        expect(
            classifyEmbedRoom(room({ roomId: 'y', createType: 'org.example.feed', isDirect: true }))
        ).toBeNull();
    });

    it('hides rooms the user has not joined', () => {
        expect(classifyEmbedRoom(room({ roomId: 'i', membership: 'invite' }))).toBeNull();
        expect(classifyEmbedRoom(room({ roomId: 'l', membership: 'leave' }))).toBeNull();
        expect(
            classifyEmbedRoom(room({ roomId: 'ic', membership: 'invite', createType: 'm.space' }))
        ).toBeNull();
    });
});

describe('buildEmbedHomeLists', () => {
    const rooms: EmbedRoomFacts[] = [
        room({ roomId: 'canopy-b', name: 'Bravo', createType: 'm.space' }),
        room({ roomId: 'canopy-a', name: 'alpha', createType: 'm.space' }),
        room({ roomId: 'sub', name: 'Sub canopy', createType: 'm.space', parentIds: ['canopy-a'] }),
        room({ roomId: 'den-in', name: 'General', parentIds: ['canopy-a'] }),
        room({ roomId: 'den-loose', name: 'Loose den' }),
        room({ roomId: 'den-orphaned', name: 'Orphan', parentIds: ['not-joined-canopy'] }),
        room({ roomId: 'voice-loose', name: 'Voice', denKind: 'voice' }),
        room({ roomId: 'dm-1', name: 'Zed', isDirect: true }),
        room({ roomId: 'dm-2', name: 'amy', isDirect: true, parentIds: ['canopy-a'] }),
        room({ roomId: 'invited', name: 'Invite', membership: 'invite' }),
        room({ roomId: 'feed', name: 'Feed', createType: 'org.example.feed' }),
    ];

    it('lists top-level canopies, loose text dens and DMs, sorted by name', () => {
        const lists = buildEmbedHomeLists(rooms);
        expect(lists.canopies.map((r) => r.roomId)).toEqual(['canopy-a', 'canopy-b']);
        expect(lists.looseDens.map((r) => r.roomId)).toEqual(['den-loose', 'den-orphaned']);
        expect(lists.dms.map((r) => r.roomId)).toEqual(['dm-2', 'dm-1']);
    });

    it('never lists out-of-scope rooms', () => {
        const lists = buildEmbedHomeLists(rooms);
        const listed = [...lists.canopies, ...lists.looseDens, ...lists.dms].map((r) => r.roomId);
        expect(listed).not.toContain('voice-loose');
        expect(listed).not.toContain('invited');
        expect(listed).not.toContain('feed');
        expect(listed).not.toContain('sub');
        expect(listed).not.toContain('den-in');
    });
});

describe('buildEmbedCanopyLists', () => {
    it('splits a canopy into panel dens, sub-canopies and channels shown elsewhere', () => {
        const rooms: EmbedRoomFacts[] = [
            room({ roomId: 'c', createType: 'm.space' }),
            room({ roomId: 'text', name: 'text', parentIds: ['c'] }),
            room({ roomId: 'ann', name: 'ann', denKind: 'announcement', parentIds: ['c'] }),
            room({ roomId: 'voice', name: 'voice', denKind: 'voice', parentIds: ['c'] }),
            room({ roomId: 'forum', name: 'forum', denKind: 'forum', parentIds: ['c'] }),
            room({ roomId: 'sub', name: 'sub', createType: 'm.space', parentIds: ['c'] }),
            room({ roomId: 'dm', name: 'dm', isDirect: true, parentIds: ['c'] }),
            room({ roomId: 'other', name: 'other', parentIds: ['elsewhere'] }),
            room({ roomId: 'inv', name: 'inv', membership: 'invite', parentIds: ['c'] }),
        ];
        const lists = buildEmbedCanopyLists(rooms, 'c');
        expect(lists.dens.map((r) => r.roomId)).toEqual(['ann', 'text']);
        expect(lists.subCanopies.map((r) => r.roomId)).toEqual(['sub']);
        expect(lists.elsewhere.map((r) => r.roomId)).toEqual(['forum', 'voice']);
    });
});
