import { describe, expect, it } from 'vitest';
import {
    GOVERNANCE_PROPOSAL_EVENT_TYPE,
    ROLE_EVENT_TYPE,
    ROUND_OPENED_EVENT_TYPE,
} from '@blackout/protocol';
import { awaitsMeForMatrixRoom } from '../../../../src/app/features/notifications/awaitsMeForMatrixRoom';

const ROOM = '!den:x';
const ME = '@me:x';
const FRIEND = '@friend:x';

type FakeEvent = {
    type: string;
    sender?: string;
    ts?: number;
    redacted?: boolean;
    content?: Record<string, unknown>;
    id?: string;
    stateKey?: string;
};

function mkEvent(init: FakeEvent) {
    return {
        getType: () => init.type,
        getSender: () => init.sender,
        getTs: () => init.ts ?? 0,
        isRedacted: () => init.redacted === true,
        getContent: <T,>() => (init.content ?? {}) as T,
        getId: () => init.id ?? null,
        getStateKey: () => init.stateKey ?? '',
    };
}

/**
 * Minimal Matrix Room stub with just the methods awaitsMeForMatrixRoom uses.
 */
function mkRoom(stateByType: Record<string, FakeEvent[]>, timeline: FakeEvent[]) {
    const stateEvents = new Map<string, ReturnType<typeof mkEvent>[]>();
    for (const [type, events] of Object.entries(stateByType)) {
        stateEvents.set(type, events.map(mkEvent));
    }
    const liveTimeline = {
        getEvents: () => timeline.map(mkEvent),
    };
    return {
        roomId: ROOM,
        currentState: {
            getStateEvents: (type: string) => stateEvents.get(type) ?? [],
        },
        getLiveTimeline: () => liveTimeline,
    } as unknown as Parameters<typeof awaitsMeForMatrixRoom>[0];
}

describe('awaitsMeForMatrixRoom', () => {
    it('returns no items when there is no user id', () => {
        const room = mkRoom({}, []);
        expect(awaitsMeForMatrixRoom(room, null)).toEqual([]);
    });

    it('flags a consent proposal the user has not reacted to', () => {
        const room = mkRoom(
            {
                [GOVERNANCE_PROPOSAL_EVENT_TYPE]: [
                    {
                        type: GOVERNANCE_PROPOSAL_EVENT_TYPE,
                        id: '$prop-1',
                        ts: 100,
                        sender: FRIEND,
                        stateKey: 'proposal-1',
                        content: {
                            title: 'Try Tuesday potluck',
                            description: 'Try it for a month.',
                            type: 'consent',
                            options: [],
                            quorum: 2,
                            deadline: '2099-01-01T00:00:00Z',
                            eligibility: 'all',
                            status: 'active',
                        },
                    },
                ],
            },
            [],
        );
        const items = awaitsMeForMatrixRoom(room, ME);
        expect(items.length).toBe(1);
        expect(items[0].kind).toBe('consent');
    });

    it('clears a consent proposal the user has reacted to (any consent key)', () => {
        const room = mkRoom(
            {
                [GOVERNANCE_PROPOSAL_EVENT_TYPE]: [
                    {
                        type: GOVERNANCE_PROPOSAL_EVENT_TYPE,
                        id: '$prop-1',
                        ts: 100,
                        sender: FRIEND,
                        stateKey: 'proposal-1',
                        content: {
                            title: 'Tuesday potluck',
                            description: 'Once a week starting in May.',
                            type: 'consent',
                            options: [],
                            quorum: 2,
                            deadline: '2099-01-01T00:00:00Z',
                            eligibility: 'all',
                            status: 'active',
                        },
                    },
                ],
            },
            [
                {
                    type: 'm.reaction',
                    id: '$rx-1',
                    ts: 110,
                    sender: ME,
                    content: {
                        'm.relates_to': {
                            rel_type: 'm.annotation',
                            event_id: '$prop-1',
                            key: '🌱',
                        },
                    },
                },
            ],
        );
        const items = awaitsMeForMatrixRoom(room, ME);
        expect(items).toEqual([]);
    });

    it('flags an open round when the user has not contributed and is not the facilitator', () => {
        const room = mkRoom(
            {},
            [
                {
                    type: ROUND_OPENED_EVENT_TYPE,
                    id: '$round-1',
                    ts: 50,
                    sender: FRIEND,
                    content: {
                        roundId: 'rid-1',
                        prompt: 'How did the week land?',
                        allowVoice: true,
                        facilitator: FRIEND,
                        status: 'open',
                    },
                },
            ],
        );
        const items = awaitsMeForMatrixRoom(room, ME);
        expect(items.length).toBe(1);
        expect(items[0].kind).toBe('round');
    });

    it('clears an open round once the user has replied to it', () => {
        const room = mkRoom(
            {},
            [
                {
                    type: ROUND_OPENED_EVENT_TYPE,
                    id: '$round-1',
                    ts: 50,
                    sender: FRIEND,
                    content: {
                        roundId: 'rid-1',
                        prompt: 'How did the week land?',
                        allowVoice: true,
                        facilitator: FRIEND,
                        status: 'open',
                    },
                },
                {
                    type: 'm.room.message',
                    id: '$reply-1',
                    ts: 60,
                    sender: ME,
                    content: {
                        msgtype: 'm.text',
                        body: 'It was good.',
                        'm.relates_to': {
                            'm.in_reply_to': { event_id: '$round-1' },
                        },
                    },
                },
            ],
        );
        expect(awaitsMeForMatrixRoom(room, ME)).toEqual([]);
    });

    it('flags a role whose term ends within 7 days', () => {
        const sevenDaysOut = new Date(Date.now() + 3 * 86_400_000).toISOString();
        const room = mkRoom(
            {
                [ROLE_EVENT_TYPE]: [
                    {
                        type: ROLE_EVENT_TYPE,
                        id: '$role-1',
                        ts: 0,
                        sender: ME,
                        stateKey: 'facilitator',
                        content: {
                            roleId: 'facilitator',
                            name: 'Facilitator',
                            domain: 'guide the circle',
                            holderId: ME,
                            termStart: '2026-01-01T00:00:00Z',
                            termEnd: sevenDaysOut,
                            updatedAt: '2026-01-01T00:00:00Z',
                        },
                    },
                ],
            },
            [],
        );
        const items = awaitsMeForMatrixRoom(room, ME);
        expect(items.length).toBe(1);
        expect(items[0].kind).toBe('role');
    });

    it('ignores redacted reactions and rounds', () => {
        const room = mkRoom(
            {
                [GOVERNANCE_PROPOSAL_EVENT_TYPE]: [
                    {
                        type: GOVERNANCE_PROPOSAL_EVENT_TYPE,
                        id: '$prop-1',
                        ts: 100,
                        sender: FRIEND,
                        stateKey: 'proposal-1',
                        content: {
                            title: 'Tuesday potluck',
                            description: 'Once a week starting in May.',
                            type: 'consent',
                            options: [],
                            quorum: 1,
                            deadline: '2099-01-01T00:00:00Z',
                            eligibility: 'all',
                            status: 'active',
                        },
                    },
                ],
            },
            [
                {
                    type: 'm.reaction',
                    id: '$rx-1',
                    ts: 110,
                    sender: ME,
                    redacted: true,
                    content: {
                        'm.relates_to': {
                            rel_type: 'm.annotation',
                            event_id: '$prop-1',
                            key: '🌱',
                        },
                    },
                },
            ],
        );
        // The reaction is redacted → user still owes a response.
        expect(awaitsMeForMatrixRoom(room, ME).length).toBe(1);
    });
});
