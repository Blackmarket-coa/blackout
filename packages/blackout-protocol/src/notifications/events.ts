import type {
    PresenceDigestAcknowledgedEvent,
    PresenceDigestGeneratedEvent,
} from './contracts';

export {
    NOTIFICATIONS_EVENT_NAMES,
    NOTIFICATIONS_PROTOCOL_VERSION,
    type NotificationRulePayload,
    type NotificationsEventName,
    type PresenceDigestAcknowledgedEvent,
    type PresenceDigestAcknowledgedPayload,
    type PresenceDigestActivity,
    type PresenceDigestGeneratedEvent,
    type PresenceDigestPayload,
} from './contracts';

const isEnvelope = (
    value: unknown
): value is { roomId: string; senderId: string; occurredAt: string; event: string; payload: unknown } => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<{
        roomId: string;
        senderId: string;
        occurredAt: string;
        event: string;
    }>;
    return (
        typeof candidate.roomId === 'string' &&
        typeof candidate.senderId === 'string' &&
        typeof candidate.occurredAt === 'string' &&
        typeof candidate.event === 'string'
    );
};

export const isPresenceDigestGenerated = (
    value: unknown
): value is PresenceDigestGeneratedEvent => {
    if (!isEnvelope(value)) return false;
    if (value.event !== 'blackout.notifications.digest.generated') return false;
    const payload = (value as PresenceDigestGeneratedEvent).payload;
    if (!payload) return false;
    return (
        typeof payload.digestId === 'string' &&
        typeof payload.generatedAt === 'string' &&
        typeof payload.windowMinutes === 'number' &&
        Array.isArray(payload.activities)
    );
};

export const isPresenceDigestAcknowledged = (
    value: unknown
): value is PresenceDigestAcknowledgedEvent => {
    if (!isEnvelope(value)) return false;
    if (value.event !== 'blackout.notifications.digest.acknowledged') return false;
    const payload = (value as PresenceDigestAcknowledgedEvent).payload;
    if (!payload) return false;
    return (
        typeof payload.digestId === 'string' &&
        typeof payload.acknowledgedAt === 'string'
    );
};
