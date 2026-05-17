import { describe, expect, it } from 'vitest';
import type { RolePayload, RoundOpenedPayload } from '@blackout/protocol';
import {
    deriveAwaitsMe,
    type AwaitsMeInputs,
    type AwaitsMeProposal,
} from '../../../../src/lib/bmc-core/awaitsMe';

const ROOM = '!room:x';
const ME = '@me:x';
const FRIEND = '@friend:x';

const proposal = (overrides: Partial<AwaitsMeProposal> = {}): AwaitsMeProposal => ({
    proposalEventId: 'p1',
    title: 'Tuesday potluck',
    status: 'active',
    type: 'consent',
    timestamp: 1_000,
    ...overrides,
});

const round = (
    overrides: Partial<{
        eventId: string;
        payload: Partial<RoundOpenedPayload>;
        senderId: string;
        timestamp: number;
        contributors: string[];
    }> = {},
): AwaitsMeInputs['openRounds'][number] => ({
    eventId: 'r1',
    payload: {
        roundId: 'rid-1',
        prompt: 'How did this week land?',
        allowVoice: true,
        facilitator: FRIEND,
        status: 'open',
        ...(overrides.payload ?? {}),
    },
    senderId: FRIEND,
    timestamp: 2_000,
    contributors: [],
    ...overrides,
});

const role = (overrides: Partial<RolePayload> = {}): RolePayload => ({
    roleId: 'facilitator',
    name: 'Facilitator',
    domain: 'guide the circle',
    holderId: ME,
    termStart: '2026-01-01T00:00:00Z',
    termEnd: '2026-04-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
});

const NOW = Date.parse('2026-03-28T00:00:00Z'); // 4 days before role term ends

describe('deriveAwaitsMe', () => {
    it('returns nothing when there is no user id', () => {
        const items = deriveAwaitsMe(
            { userId: null, consentProposals: [], openRounds: [], roles: [] },
            ROOM,
        );
        expect(items).toEqual([]);
    });

    it('flags an active consent proposal that I have not reacted to', () => {
        const items = deriveAwaitsMe(
            {
                userId: ME,
                consentProposals: [{ proposal: proposal(), reactions: [] }],
                openRounds: [],
                roles: [],
            },
            ROOM,
        );
        expect(items.length).toBe(1);
        expect(items[0].kind).toBe('consent');
    });

    it('clears a consent proposal once I have reacted (any of 🌱 / 🌾 / 🪨)', () => {
        const items = deriveAwaitsMe(
            {
                userId: ME,
                consentProposals: [
                    {
                        proposal: proposal(),
                        reactions: [
                            {
                                reactorId: ME,
                                key: '🌱',
                                eventId: 'rx1',
                                timestamp: 2,
                            },
                        ],
                    },
                ],
                openRounds: [],
                roles: [],
            },
            ROOM,
        );
        expect(items).toEqual([]);
    });

    it('skips proposals that are not active', () => {
        const items = deriveAwaitsMe(
            {
                userId: ME,
                consentProposals: [
                    { proposal: proposal({ status: 'passed' }), reactions: [] },
                ],
                openRounds: [],
                roles: [],
            },
            ROOM,
        );
        expect(items).toEqual([]);
    });

    it('flags an open round when I have not replied', () => {
        const items = deriveAwaitsMe(
            {
                userId: ME,
                consentProposals: [],
                openRounds: [round()],
                roles: [],
            },
            ROOM,
        );
        expect(items[0]?.kind).toBe('round');
    });

    it('excludes the round facilitator from their own round', () => {
        const items = deriveAwaitsMe(
            {
                userId: ME,
                consentProposals: [],
                openRounds: [round({ payload: { facilitator: ME } })],
                roles: [],
            },
            ROOM,
        );
        expect(items).toEqual([]);
    });

    it('clears a round once I have contributed', () => {
        const items = deriveAwaitsMe(
            {
                userId: ME,
                consentProposals: [],
                openRounds: [round({ contributors: [ME] })],
                roles: [],
            },
            ROOM,
        );
        expect(items).toEqual([]);
    });

    it('respects explicit invitee lists', () => {
        const items = deriveAwaitsMe(
            {
                userId: ME,
                consentProposals: [],
                openRounds: [round({ payload: { invitees: [FRIEND] } })],
                roles: [],
            },
            ROOM,
        );
        // ME is not on the invitee list — no obligation.
        expect(items).toEqual([]);
    });

    it('flags my held role when its term ends within the window', () => {
        const items = deriveAwaitsMe(
            {
                userId: ME,
                consentProposals: [],
                openRounds: [],
                roles: [role()],
                nowMs: NOW, // 4 days before termEnd → inside default 7-day window
            },
            ROOM,
        );
        expect(items[0]?.kind).toBe('role');
        const item = items[0];
        if (item.kind === 'role') {
            expect(item.reason).toBe('term-ending');
        }
    });

    it('does not flag a role whose term ends well in the future', () => {
        const items = deriveAwaitsMe(
            {
                userId: ME,
                consentProposals: [],
                openRounds: [],
                roles: [role({ termEnd: '2027-01-01T00:00:00Z' })],
                nowMs: NOW,
            },
            ROOM,
        );
        expect(items).toEqual([]);
    });

    it('sorts merged items newest-first by their sort timestamp', () => {
        const items = deriveAwaitsMe(
            {
                userId: ME,
                consentProposals: [
                    { proposal: proposal({ timestamp: 1_000 }), reactions: [] },
                ],
                openRounds: [round({ timestamp: 5_000 })],
                roles: [role({ termEnd: '2026-03-30T00:00:00Z' })], // sorts on termEnd ms
                nowMs: NOW,
            },
            ROOM,
        );
        // Role term-end is in 2026-03-30 → ms ~ 1.7e12, which dominates.
        // Round timestamp 5_000 should fall between proposal 1_000 and role.
        expect(items.map((i) => i.kind)).toEqual(['role', 'round', 'consent']);
    });
});
