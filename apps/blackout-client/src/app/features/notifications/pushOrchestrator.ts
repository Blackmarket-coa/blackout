export type MobilePlatform = 'ios' | 'android';
export type PlatformEventType = 'mention' | 'reply' | 'subscription' | 'mod_alert';
export type DeliveryProvider = 'apns' | 'fcm';
export type DeliveryStatus = 'delivered' | 'opened' | 'failed' | 'suppressed' | 'duplicate';

export interface DeviceTokenRecord {
  token: string;
  userId: string;
  sessionId: string;
  platform: MobilePlatform;
  provider: DeliveryProvider;
  createdAt: number;
  lastSeenAt: number;
  invalidatedAt?: number;
  failureCount: number;
}

export interface QuietHoursWindow {
  enabled: boolean;
  startLocal: string;
  endLocal: string;
  timezoneOffsetMinutes: number;
}

export interface UserNotificationPreferences {
  globalEnabled: boolean;
  mutedUntil?: number;
  quietHours: QuietHoursWindow;
  perCanopy: Record<string, { enabled: boolean; mutedUntil?: number }>;
  events: Record<PlatformEventType, boolean>;
}

export interface PlatformEvent {
  eventId: string;
  userId: string;
  canopyId: string;
  channelId: string;
  threadId?: string;
  type: PlatformEventType;
  createdAt: number;
}

export interface NotificationWorkflow {
  workflowId: string;
  event: PlatformEventType;
}

export interface PushDeliveryPayload {
  title: string;
  body: string;
  data: {
    deepLink: string;
    canopyId: string;
    channelId: string;
    threadId?: string;
    eventId: string;
    workflowId: string;
  };
}

export interface PushAttempt {
  token: string;
  provider: DeliveryProvider;
  payload: PushDeliveryPayload;
  attempt: number;
}

export interface NotificationMetric {
  eventId: string;
  userId: string;
  token: string;
  status: DeliveryStatus;
  at: number;
  attempt: number;
  reason?: string;
}

export interface DeliveryResult {
  attempts: PushAttempt[];
  metrics: NotificationMetric[];
  deduped: boolean;
}

const MAX_FAILURES = 3;
const MAX_RETRIES = 3;

const WORKFLOW_MAP: Record<PlatformEventType, NotificationWorkflow> = {
  mention: { event: 'mention', workflowId: 'canopy-mention' },
  reply: { event: 'reply', workflowId: 'thread-reply' },
  subscription: { event: 'subscription', workflowId: 'canopy-subscription' },
  mod_alert: { event: 'mod_alert', workflowId: 'moderation-alert' },
};

const withProvider = (platform: MobilePlatform): DeliveryProvider =>
  platform === 'ios' ? 'apns' : 'fcm';

const toMinutes = (value: string): number => {
  const [h, m] = value.split(':').map((part) => Number(part));
  return h * 60 + m;
};

export const isWithinQuietHours = (now: number, quietHours: QuietHoursWindow): boolean => {
  if (!quietHours.enabled) return false;

  const localDate = new Date(now + quietHours.timezoneOffsetMinutes * 60_000);
  const currentMinutes = localDate.getUTCHours() * 60 + localDate.getUTCMinutes();
  const start = toMinutes(quietHours.startLocal);
  const end = toMinutes(quietHours.endLocal);

  if (start === end) return false;
  if (start < end) return currentMinutes >= start && currentMinutes < end;
  return currentMinutes >= start || currentMinutes < end;
};

export const registerDeviceToken = (
  records: DeviceTokenRecord[],
  payload: { token: string; userId: string; sessionId: string; platform: MobilePlatform; now?: number }
): DeviceTokenRecord[] => {
  const now = payload.now ?? Date.now();
  const provider = withProvider(payload.platform);

  const existingIndex = records.findIndex(
    (record) =>
      record.userId === payload.userId &&
      record.sessionId === payload.sessionId &&
      record.platform === payload.platform
  );

  if (existingIndex >= 0) {
    const next = [...records];
    next[existingIndex] = {
      ...next[existingIndex],
      token: payload.token,
      provider,
      lastSeenAt: now,
      invalidatedAt: undefined,
      failureCount: 0,
    };
    return next;
  }

  return [
    ...records,
    {
      token: payload.token,
      userId: payload.userId,
      sessionId: payload.sessionId,
      platform: payload.platform,
      provider,
      createdAt: now,
      lastSeenAt: now,
      failureCount: 0,
    },
  ];
};

export const cleanupInvalidOrExpiredTokens = (
  records: DeviceTokenRecord[],
  now = Date.now(),
  maxTokenAgeMs = 90 * 24 * 60 * 60 * 1000
): DeviceTokenRecord[] =>
  records.filter(
    (record) =>
      !record.invalidatedAt &&
      now - record.lastSeenAt <= maxTokenAgeMs &&
      record.failureCount < MAX_FAILURES
  );

export const resolveWorkflow = (eventType: PlatformEventType): NotificationWorkflow => WORKFLOW_MAP[eventType];

const isSuppressed = (
  event: PlatformEvent,
  preferences: UserNotificationPreferences,
  now: number
): { suppressed: boolean; reason?: string } => {
  if (!preferences.globalEnabled) return { suppressed: true, reason: 'global_disabled' };
  if (preferences.mutedUntil && preferences.mutedUntil > now) {
    return { suppressed: true, reason: 'global_muted' };
  }
  if (!preferences.events[event.type]) return { suppressed: true, reason: 'event_disabled' };

  const canopyPreference = preferences.perCanopy[event.canopyId];
  if (canopyPreference) {
    if (!canopyPreference.enabled) return { suppressed: true, reason: 'canopy_disabled' };
    if (canopyPreference.mutedUntil && canopyPreference.mutedUntil > now) {
      return { suppressed: true, reason: 'canopy_muted' };
    }
  }

  if (isWithinQuietHours(now, preferences.quietHours)) {
    return { suppressed: true, reason: 'quiet_hours' };
  }

  return { suppressed: false };
};

const buildDeepLink = (event: PlatformEvent): string => {
  const path = `/canopy/${encodeURIComponent(event.canopyId)}/channel/${encodeURIComponent(event.channelId)}`;
  if (!event.threadId) return `blackout://${path}`;
  return `blackout://${path}/thread/${encodeURIComponent(event.threadId)}`;
};

const buildPayload = (event: PlatformEvent): PushDeliveryPayload => {
  const workflow = resolveWorkflow(event.type);
  return {
    title: 'Blackout update',
    body: `New ${event.type.replace('_', ' ')} activity`,
    data: {
      deepLink: buildDeepLink(event),
      canopyId: event.canopyId,
      channelId: event.channelId,
      threadId: event.threadId,
      eventId: event.eventId,
      workflowId: workflow.workflowId,
    },
  };
};

export const processEventToPush = (params: {
  event: PlatformEvent;
  preferences: UserNotificationPreferences;
  deviceTokens: DeviceTokenRecord[];
  processedEventIds: Set<string>;
  now?: number;
}): DeliveryResult => {
  const now = params.now ?? Date.now();

  if (params.processedEventIds.has(params.event.eventId)) {
    return {
      attempts: [],
      deduped: true,
      metrics: [
        {
          at: now,
          eventId: params.event.eventId,
          userId: params.event.userId,
          token: 'n/a',
          status: 'duplicate',
          attempt: 0,
        },
      ],
    };
  }

  const suppression = isSuppressed(params.event, params.preferences, now);
  if (suppression.suppressed) {
    return {
      attempts: [],
      deduped: false,
      metrics: [
        {
          at: now,
          eventId: params.event.eventId,
          userId: params.event.userId,
          token: 'n/a',
          status: 'suppressed',
          attempt: 0,
          reason: suppression.reason,
        },
      ],
    };
  }

  const payload = buildPayload(params.event);
  const recipientTokens = cleanupInvalidOrExpiredTokens(
    params.deviceTokens.filter((record) => record.userId === params.event.userId),
    now
  );

  const attempts: PushAttempt[] = [];
  const metrics: NotificationMetric[] = [];

  recipientTokens.forEach((record) => {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      attempts.push({ token: record.token, provider: record.provider, payload, attempt });
      metrics.push({
        eventId: params.event.eventId,
        userId: params.event.userId,
        token: record.token,
        status: attempt === 1 ? 'delivered' : 'opened',
        at: now,
        attempt,
      });
    }
  });

  params.processedEventIds.add(params.event.eventId);

  return { attempts, metrics, deduped: false };
};
