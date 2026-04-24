import { describe, expect, it } from 'vitest';
import {
  cleanupInvalidOrExpiredTokens,
  isWithinQuietHours,
  processEventToPush,
  registerDeviceToken,
  resolveWorkflow,
  type DeviceTokenRecord,
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
    const event = {
      eventId: 'evt-2',
      userId: '@alice:example.org',
      canopyId: '!canopy:example.org',
      channelId: '!channel:example.org',
      type: 'mention' as const,
      createdAt: Date.now(),
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

    expect(isWithinQuietHours(Date.now(), quietPrefs.quietHours)).toBe(true);

    const result = processEventToPush({
      event,
      preferences: quietPrefs,
      deviceTokens: [],
      processedEventIds: new Set<string>(),
    });
    expect(result.metrics[0].status).toBe('suppressed');

    const processedEventIds = new Set<string>(['evt-2']);
    const duplicate = processEventToPush({
      event,
      preferences: basePrefs,
      deviceTokens: [],
      processedEventIds,
    });
    expect(duplicate.deduped).toBe(true);
    expect(duplicate.metrics[0].status).toBe('duplicate');
  });
});
