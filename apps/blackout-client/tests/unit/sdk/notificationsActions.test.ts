import { describe, expect, it } from 'vitest';
import {
    isPresenceDigestAcknowledged,
    isPresenceDigestGenerated,
    NOTIFICATIONS_EVENT_NAMES,
    type PresenceDigestActivity,
    type PresenceDigestGeneratedEvent,
    type NotificationRulePayload,
} from '@blackout/protocol';
import {
    buildPresenceDigest,
    createNotificationActions,
} from '@blackout/sdk';
import type { ApiClient, ApiRequest } from '@blackout/sdk';

const buildClient = <T>(response: T) => {
    const calls: ApiRequest[] = [];
    const apiClient: ApiClient = async (request) => {
        calls.push(request);
        return response as never;
    };
    return { apiClient, calls };
};

describe('@blackout/protocol notification event guards', () => {
    it('publishes the canonical Matrix event types', () => {
        expect(NOTIFICATIONS_EVENT_NAMES.digestGenerated).toBe(
            'co.bmc.notifications.digest.generated'
        );
        expect(NOTIFICATIONS_EVENT_NAMES.digestAcknowledged).toBe(
            'co.bmc.notifications.digest.acknowledged'
        );
    });

    it('isPresenceDigestGenerated narrows valid envelopes', () => {
        const valid: PresenceDigestGeneratedEvent = {
            event: 'blackout.notifications.digest.generated',
            roomId: '!nf:srv',
            senderId: '@bot:srv',
            occurredAt: '2026-04-27T00:00:00.000Z',
            payload: {
                digestId: 'd-1',
                generatedAt: '2026-04-27T00:00:00.000Z',
                windowMinutes: 30,
                activities: [{ userId: '@a:srv', lastActiveAt: '2026-04-27T00:00:00.000Z' }],
            },
        };
        expect(isPresenceDigestGenerated(valid)).toBe(true);
        expect(isPresenceDigestGenerated({ ...valid, payload: { digestId: 'x' } })).toBe(false);
        expect(
            isPresenceDigestGenerated({
                ...valid,
                event: 'blackout.notifications.digest.acknowledged',
            })
        ).toBe(false);
    });

    it('isPresenceDigestAcknowledged narrows valid envelopes', () => {
        const valid = {
            event: 'blackout.notifications.digest.acknowledged',
            roomId: '!nf:srv',
            senderId: '@a:srv',
            occurredAt: '2026-04-27T00:00:00.000Z',
            payload: { digestId: 'd-1', acknowledgedAt: '2026-04-27T00:01:00.000Z' },
        };
        expect(isPresenceDigestAcknowledged(valid)).toBe(true);
        expect(isPresenceDigestAcknowledged({ ...valid, payload: { digestId: 'x' } })).toBe(false);
    });
});

describe('@blackout/sdk createNotificationActions', () => {
    it('fetchNotificationRules calls GET /v1/notifications/rules', async () => {
        const { apiClient, calls } = buildClient({ subject: '@a:srv', rules: [] });
        const actions = createNotificationActions(apiClient);
        await actions.fetchNotificationRules();
        expect(calls.at(-1)).toEqual({ method: 'GET', path: '/v1/notifications/rules' });
    });

    it('upsertNotificationRule encodes feature and category', async () => {
        const rule: NotificationRulePayload = {
            feature: 'mentions',
            category: 'dm/private',
            hardCapPerDay: 50,
            cooldownMinutes: 5,
        };
        const { apiClient, calls } = buildClient(rule);
        const actions = createNotificationActions(apiClient);
        await actions.upsertNotificationRule(rule);
        expect(calls.at(-1)).toEqual({
            method: 'PUT',
            path: `/v1/notifications/rules/mentions/${encodeURIComponent('dm/private')}`,
            body: rule,
        });
    });

    it('deleteNotificationRule encodes both segments', async () => {
        const { apiClient, calls } = buildClient<void>(undefined as void);
        const actions = createNotificationActions(apiClient);
        await actions.deleteNotificationRule('reactions', 'space/lobby');
        expect(calls.at(-1)).toEqual({
            method: 'DELETE',
            path: `/v1/notifications/rules/reactions/${encodeURIComponent('space/lobby')}`,
        });
    });

    it('fetchPresenceDigest passes windowMinutes when positive and drops it otherwise', async () => {
        const { apiClient, calls } = buildClient<PresenceDigestGeneratedEvent>(
            {} as PresenceDigestGeneratedEvent
        );
        const actions = createNotificationActions(apiClient);

        await actions.fetchPresenceDigest();
        expect(calls.at(-1)?.path).toBe('/v1/notifications/presence-digest');

        await actions.fetchPresenceDigest({ windowMinutes: 45 });
        expect(calls.at(-1)?.path).toBe('/v1/notifications/presence-digest?windowMinutes=45');

        await actions.fetchPresenceDigest({ windowMinutes: 0 });
        expect(calls.at(-1)?.path).toBe('/v1/notifications/presence-digest');
    });

    it('acknowledgePresenceDigest issues a POST keyed by digest id', async () => {
        const { apiClient, calls } = buildClient<unknown>({});
        const actions = createNotificationActions(apiClient);

        await actions.acknowledgePresenceDigest('digest 9');
        expect(calls.at(-1)).toEqual({
            method: 'POST',
            path: `/v1/notifications/presence-digests/${encodeURIComponent('digest 9')}/ack`,
            body: {},
        });
    });
});

describe('buildPresenceDigest', () => {
    const now = '2026-04-27T12:00:00.000Z';
    const activities: PresenceDigestActivity[] = [
        { userId: '@a:srv', lastActiveAt: '2026-04-27T11:55:00.000Z' },
        { userId: '@b:srv', lastActiveAt: '2026-04-27T11:30:00.000Z' },
        { userId: '@c:srv', lastActiveAt: '2026-04-27T10:00:00.000Z' },
        { userId: '@d:srv', lastActiveAt: '2026-04-27T13:00:00.000Z' }, // future
        { userId: '@e:srv', lastActiveAt: 'not-a-timestamp' },
    ];

    it('keeps only activities within [now - windowMinutes, now] and sorts newest-first', () => {
        // 30-minute window from 12:00 covers [11:30, 12:00]: a (11:55) and b (11:30).
        const tight = buildPresenceDigest(activities, now, { windowMinutes: 30 });
        expect(tight.map((entry) => entry.userId)).toEqual(['@a:srv', '@b:srv']);

        // 10-minute window covers only a (11:55).
        const tighter = buildPresenceDigest(activities, now, { windowMinutes: 10 });
        expect(tighter.map((entry) => entry.userId)).toEqual(['@a:srv']);

        // 24h window keeps a, b, c (in newest-first order); future + malformed dropped.
        const wide = buildPresenceDigest(activities, now, { windowMinutes: 24 * 60 });
        expect(wide.map((entry) => entry.userId)).toEqual(['@a:srv', '@b:srv', '@c:srv']);
    });

    it('drops malformed timestamps and out-of-window activities', () => {
        const result = buildPresenceDigest(activities, now, { windowMinutes: 240 });
        expect(result.map((entry) => entry.userId)).toEqual(['@a:srv', '@b:srv', '@c:srv']);
    });

    it('returns [] for an unparseable now', () => {
        expect(buildPresenceDigest(activities, 'not-a-time', { windowMinutes: 30 })).toEqual([]);
    });

    it('clamps a negative windowMinutes to zero (no entries qualify)', () => {
        expect(buildPresenceDigest(activities, now, { windowMinutes: -10 })).toEqual([]);
    });
});
