import { describe, expect, it } from 'vitest';
import type { CompletedQuest, RolePayload } from '@blackout/protocol';
import {
    aggregateCharacterSheet,
    type CharacterSheetRoomInput,
} from '../../../../src/lib/bmc-core/characterSheet';

const ME = '@me:x';
const FRIEND = '@friend:x';

const role = (overrides: Partial<RolePayload>): RolePayload => ({
    roleId: 'facilitator',
    name: 'Facilitator',
    domain: 'guide the circle',
    holderId: ME,
    termStart: '2026-01-01T00:00:00Z',
    termEnd: '2026-04-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
});

const room = (overrides: Partial<CharacterSheetRoomInput>): CharacterSheetRoomInput => ({
    roomId: '!room:x',
    roomName: 'Tuesday potluck',
    roles: [],
    ...overrides,
});

describe('aggregateCharacterSheet', () => {
    it('returns the empty sheet for users with no joined rooms', () => {
        const sheet = aggregateCharacterSheet({
            userId: ME,
            completedQuests: [],
            rooms: [],
        });
        expect(sheet.firstPlaybook).toBeNull();
        expect(sheet.rolesHeld).toEqual([]);
        expect(sheet.densJoined).toBe(0);
        expect(sheet.questLog).toEqual([]);
    });

    it('picks the earliest joined room with a playbook for firstPlaybook', () => {
        const sheet = aggregateCharacterSheet({
            userId: ME,
            completedQuests: [],
            rooms: [
                room({ joinedAtMs: 200, playbookId: 'workshop' }),
                room({ roomId: '!later:x', joinedAtMs: 100, playbookId: 'hearth' }),
            ],
        });
        expect(sheet.firstPlaybook).toBe('hearth');
    });

    it('only counts roles the user currently holds', () => {
        const sheet = aggregateCharacterSheet({
            userId: ME,
            completedQuests: [],
            rooms: [
                room({
                    roles: [
                        role({ roleId: 'facilitator', holderId: ME }),
                        role({ roleId: 'treasurer', holderId: FRIEND }),
                    ],
                }),
            ],
        });
        expect(sheet.rolesHeld.length).toBe(1);
        expect(sheet.rolesHeld[0].roleId).toBe('facilitator');
    });

    it('sorts the quest log newest-first and attaches narrative beats', () => {
        const completed: CompletedQuest[] = [
            { id: 'first-round', completedAt: '2026-05-01T00:00:00Z' },
            { id: 'first-consent', completedAt: '2026-05-10T00:00:00Z' },
        ];
        const sheet = aggregateCharacterSheet({
            userId: ME,
            completedQuests: completed,
            rooms: [],
        });
        expect(sheet.questLog.map((entry) => entry.id)).toEqual([
            'first-consent',
            'first-round',
        ]);
        expect(sheet.questLog[0].narrative).toMatch(/consent/i);
    });

    it('reports densJoined as the raw room count, ignoring playbook status', () => {
        const sheet = aggregateCharacterSheet({
            userId: ME,
            completedQuests: [],
            rooms: [room({}), room({ roomId: '!b:x' })],
        });
        expect(sheet.densJoined).toBe(2);
    });
});
