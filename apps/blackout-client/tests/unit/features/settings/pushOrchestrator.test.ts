import { describe, expect, it } from 'vitest';
import {
    cleanupInvalidOrExpiredTokens,
    isWithinQuietHours,
    processEventToPush,
    registerDeviceToken,
    resolveWorkflow,
    type DeviceTokenRecord,
    type QuietHoursWindow,
    type UserNotificationPreferences,
} from '../../../../src/app/features/notifications/pushOrchestrator';

const basePrefs: UserNotificationPreferences = {
    globalEnabled: true,
    quietHours: {
        enabled: false,
        startLocal: '22:00',
        endLocal: '07:00',
        timezoneOffsetMinutes: 0,
    },
    perCanopy: {},
    events: {
        mention: true,
        reply: true,
        subscription: true,
        mod_alert: true,
    },
};

describe('push orchestrator', () => {
    it('registers tokens by user/session and updates existing rows', () => {
        const now = Date.now();
        const first = registerDeviceToken([], {
            token: 'token-a',
            userId: '@alice:example.org',
            sessionId: 's1',
            platform: 'ios',
            now,
        });

        const updated = registerDeviceToken(first, {
            token: 'token-b',
            userId: '@alice:example.org',
            sessionId: 's1',
            platform: 'ios',
            now: now + 1,
        });

        expect(updated).toHaveLength(1);
        expect(updated[0].token).toBe('token-b');
        expect(updated[0].provider).toBe('apns');
    });

    it('removes invalid/expired tokens from active pool', () => {
        const now = Date.now();
        const records: DeviceTokenRecord[] = [
            {
                token: 'ok',
                userId: 'u',
                sessionId: 's1',
                platform: 'ios',
                provider: 'apns',
                createdAt: now,
                lastSeenAt: now,
                failureCount: 0,
            },
            {
                token: 'invalid',
                userId: 'u',
                sessionId: 's2',
                platform: 'android',
                provider: 'fcm',
                createdAt: now,
                lastSeenAt: now,
                invalidatedAt: now,
                failureCount: 0,
            },
        ];

        expect(cleanupInvalidOrExpiredTokens(records, now)).toEqual([records[0]]);
    });

    it('maps platform events to novu workflow ids and emits deep-link payload', () => {
        expect(resolveWorkflow('mod_alert').workflowId).toBe('moderation-alert');

        const processed = new Set<string>();
        const delivery = processEventToPush({
            event: {
                eventId: 'evt-1',
                userId: '@alice:example.org',
                canopyId: '!canopy:example.org',
                channelId: '!channel:example.org',
                threadId: '$thread',
                type: 'reply',
                createdAt: Date.now(),
            },
            preferences: basePrefs,
            deviceTokens: [
                {
                    token: 'tok',
                    userId: '@alice:example.org',
                    sessionId: 's1',
                    platform: 'android',
                    provider: 'fcm',
                    createdAt: Date.now(),
                    lastSeenAt: Date.now(),
                    failureCount: 0,
                },
            ],
            processedEventIds: processed,
        });

        expect(delivery.deduped).toBe(false);
        expect(delivery.attempts[0].provider).toBe('fcm');
        expect(delivery.attempts[0].payload.data.deepLink).toContain('/thread/%24thread');
        expect(delivery.metrics.some((metric) => metric.status === 'delivered')).toBe(true);
    });

    it('suppresses events by quiet hours and enforces idempotency', () => {
        // A fixed instant, 12:00 UTC. These assertions must not read the wall clock:
        // the window below is [00:00, 23:59), so a run during the minute 23:59 UTC
        // falls outside it. Three CI runs at 2026-10-24 23:59 UTC failed here that way.
        const now = Date.UTC(2026, 0, 15, 12, 0, 0);
        const event = {
            eventId: 'evt-2',
            userId: '@alice:example.org',
            canopyId: '!canopy:example.org',
            channelId: '!channel:example.org',
            type: 'mention' as const,
            createdAt: now,
        };

        const quietPrefs: UserNotificationPreferences = {
            ...basePrefs,
            quietHours: {
                enabled: true,
                startLocal: '00:00',
                endLocal: '23:59',
                timezoneOffsetMinutes: 0,
            },
        };

        expect(isWithinQuietHours(now, quietPrefs.quietHours)).toBe(true);

        const result = processEventToPush({
            event,
            preferences: quietPrefs,
            deviceTokens: [],
            processedEventIds: new Set<string>(),
            now,
        });
        expect(result.metrics[0].status).toBe('suppressed');

        const processedEventIds = new Set<string>(['evt-2']);
        const duplicate = processEventToPush({
            event,
            preferences: basePrefs,
            deviceTokens: [],
            processedEventIds,
            now,
        });
        expect(duplicate.deduped).toBe(true);
        expect(duplicate.metrics[0].status).toBe('duplicate');
    });

    it('treats the quiet-hours end as exclusive and wraps a window past midnight', () => {
        const at = (hour: number, minute: number, second = 0) =>
            Date.UTC(2026, 0, 15, hour, minute, second);

        const sameDay: QuietHoursWindow = {
            enabled: true,
            startLocal: '00:00',
            endLocal: '23:59',
            timezoneOffsetMinutes: 0,
        };
        expect(isWithinQuietHours(at(0, 0), sameDay)).toBe(true);
        expect(isWithinQuietHours(at(23, 58, 59), sameDay)).toBe(true);
        expect(isWithinQuietHours(at(23, 59), sameDay)).toBe(false);

        const overnight: QuietHoursWindow = {
            enabled: true,
            startLocal: '22:00',
            endLocal: '07:00',
            timezoneOffsetMinutes: 0,
        };
        expect(isWithinQuietHours(at(23, 59), overnight)).toBe(true);
        expect(isWithinQuietHours(at(6, 59, 59), overnight)).toBe(true);
        expect(isWithinQuietHours(at(7, 0), overnight)).toBe(false);
        expect(isWithinQuietHours(at(12, 0), overnight)).toBe(false);

        // The offset is applied before the comparison: 23:30 UTC is 00:30 at UTC+1.
        const shifted: QuietHoursWindow = {
            enabled: true,
            startLocal: '00:00',
            endLocal: '01:00',
            timezoneOffsetMinutes: 60,
        };
        expect(isWithinQuietHours(at(23, 30), shifted)).toBe(true);
        expect(isWithinQuietHours(at(22, 30), shifted)).toBe(false);
    });
});
