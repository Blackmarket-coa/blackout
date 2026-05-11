import { describe, expect, it } from 'vitest';
import {
    isUserQuestsPayload,
    QUEST_IDS,
    type QuestId,
} from '@blackout/protocol';
import {
    QUEST_NARRATIVE,
    detectQuestCompletions,
} from '../../../../src/lib/bmc-core/questDetection';

const ME = '@me:x';
const SOMEONE_ELSE = '@friend:x';

const emptyEvidence = () => ({
    userId: ME,
    facilitatedRounds: [],
    consentReactions: [],
    rolesHeld: [],
    domainsAuthored: [],
});

describe('detectQuestCompletions', () => {
    it('returns nothing when the user has done nothing', () => {
        expect(detectQuestCompletions(emptyEvidence()).size).toBe(0);
    });

    it('flags first-round when I facilitated any round', () => {
        const set = detectQuestCompletions({
            ...emptyEvidence(),
            facilitatedRounds: [{ facilitator: ME }],
        });
        expect(set.has('first-round')).toBe(true);
    });

    it('does not flag first-round when someone else facilitated', () => {
        const set = detectQuestCompletions({
            ...emptyEvidence(),
            facilitatedRounds: [{ facilitator: SOMEONE_ELSE }],
        });
        expect(set.has('first-round')).toBe(false);
    });

    it('flags first-consent on any reaction I cast', () => {
        const set = detectQuestCompletions({
            ...emptyEvidence(),
            consentReactions: [{ reactorId: ME, key: '🌱' }],
        });
        expect(set.has('first-consent')).toBe(true);
    });

    it('flags first-role-nomination only when I hold the role', () => {
        expect(
            detectQuestCompletions({
                ...emptyEvidence(),
                rolesHeld: [{ holderId: ME }],
            }).has('first-role-nomination'),
        ).toBe(true);
        expect(
            detectQuestCompletions({
                ...emptyEvidence(),
                rolesHeld: [{ holderId: SOMEONE_ELSE }],
            }).has('first-role-nomination'),
        ).toBe(false);
    });

    it('flags first-domain only when the domain string is non-empty', () => {
        expect(
            detectQuestCompletions({
                ...emptyEvidence(),
                domainsAuthored: [{ domain: 'we steward the garden' }],
            }).has('first-domain'),
        ).toBe(true);
        expect(
            detectQuestCompletions({
                ...emptyEvidence(),
                domainsAuthored: [{ domain: '   ' }],
            }).has('first-domain'),
        ).toBe(false);
    });
});

describe('QUEST_NARRATIVE', () => {
    it('covers every quest id', () => {
        for (const id of QUEST_IDS) {
            expect(QUEST_NARRATIVE[id as QuestId]).toBeTypeOf('string');
            expect(QUEST_NARRATIVE[id as QuestId].length).toBeGreaterThan(0);
        }
    });
});

describe('isUserQuestsPayload', () => {
    it('accepts the initial sheet shape', () => {
        const payload = {
            activeQuests: [...QUEST_IDS],
            completedQuests: [],
        };
        expect(isUserQuestsPayload(payload)).toBe(true);
    });

    it('accepts a completed-with-roomId shape', () => {
        const payload = {
            activeQuests: [],
            completedQuests: [
                { id: 'first-round', completedAt: '2026-05-11T00:00:00Z', roomId: '!den:x' },
            ],
        };
        expect(isUserQuestsPayload(payload)).toBe(true);
    });

    it('rejects unknown quest ids', () => {
        const payload = {
            activeQuests: ['first-round', 'not-a-quest'],
            completedQuests: [],
        };
        expect(isUserQuestsPayload(payload)).toBe(false);
    });
});
