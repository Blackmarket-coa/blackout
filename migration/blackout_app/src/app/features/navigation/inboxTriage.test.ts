import { describe, expect, it } from 'vitest';
import {
    buildPrioritySections,
    createInboxTriagePayload,
    getResolvedItems,
    getSnoozedItems,
    normalizeInboxTriagePayload,
    type InboxUserTriageState,
} from './inboxTriage';
import type { MentionInboxItem } from '../right-panel/rightPanelUtils';

const baseItems: MentionInboxItem[] = [
    {
        roomId: '!room:example.org',
        roomName: 'Ops',
        eventId: '$direct',
        sourceEventId: '$direct',
        body: 'ping @alice',
        timestamp: 300,
        unread: true,
        priority: 'direct_mention',
    },
    {
        roomId: '!room:example.org',
        roomName: 'Ops',
        eventId: '$thread',
        sourceEventId: '$root',
        body: 'thread follow-up',
        timestamp: 200,
        unread: true,
        priority: 'thread_reply',
    },
    {
        roomId: '!room:example.org',
        roomName: 'Ops',
        eventId: '$keyword',
        sourceEventId: '$keyword',
        body: 'urgent escalation',
        timestamp: 100,
        unread: false,
        priority: 'keyword_hit',
    },
];

describe('inbox triage model', () => {
    it('sorts unresolved items into priority sections', () => {
        const triage: InboxUserTriageState = {
            readEventIds: {},
            events: {
                $keyword: { resolved: true },
            },
        };

        const sections = buildPrioritySections({ items: baseItems, triage, now: 1_000 });
        expect(sections.map((section) => section.priority)).toEqual([
            'direct_mention',
            'thread_reply',
        ]);
        expect(sections[0]?.items[0]?.eventId).toBe('$direct');
        expect(sections[1]?.items[0]?.sourceEventId).toBe('$root');
    });

    it('round-trips persisted payload and tracks snoozed/resolved subsets', () => {
        const payload = createInboxTriagePayload({
            userId: '@alice:example.org',
            triage: {
                readEventIds: { $direct: true },
                events: {
                    $thread: { snoozedUntil: 5_000 },
                    $keyword: { resolved: true },
                },
            },
        });

        const parsed = normalizeInboxTriagePayload(payload);
        const triage = parsed.users['@alice:example.org'];
        expect(triage.readEventIds.$direct).toBe(true);

        const snoozed = getSnoozedItems({ items: baseItems, triage, now: 1_000 });
        expect(snoozed.map((item) => item.eventId)).toEqual(['$thread']);

        const resolved = getResolvedItems({ items: baseItems, triage });
        expect(resolved.map((item) => item.eventId)).toEqual(['$keyword']);
    });
});
