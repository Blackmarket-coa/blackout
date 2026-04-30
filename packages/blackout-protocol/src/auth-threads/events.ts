import type {
    AuthSessionContinuedEvent,
    ThreadActivityUpdatedEvent,
} from './contracts';

export {
    AUTH_THREADS_EVENT_NAMES,
    AUTH_THREADS_PROTOCOL_VERSION,
    type AuthSessionContinuationReason,
    type AuthSessionContinuedEvent,
    type AuthSessionContinuedPayload,
    type AuthThreadsEventName,
    type ThreadActivityKind,
    type ThreadActivityUpdatedEvent,
    type ThreadActivityUpdatedPayload,
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

const THREAD_KINDS = ['thread_started', 'thread_replied', 'thread_resolved'] as const;
const SESSION_REASONS = ['login', 'refresh', 'idp_handoff'] as const;

export const isThreadActivityUpdated = (
    value: unknown
): value is ThreadActivityUpdatedEvent => {
    if (!isEnvelope(value)) return false;
    if (value.event !== 'blackout.thread.activity.updated') return false;
    const payload = (value as ThreadActivityUpdatedEvent).payload;
    if (!payload) return false;
    return (
        typeof payload.activityId === 'string' &&
        typeof payload.threadRootEventId === 'string' &&
        typeof payload.roomId === 'string' &&
        typeof payload.unreadCount === 'number' &&
        typeof payload.occurredAt === 'string' &&
        THREAD_KINDS.includes(payload.kind as (typeof THREAD_KINDS)[number])
    );
};

export const isAuthSessionContinued = (
    value: unknown
): value is AuthSessionContinuedEvent => {
    if (!isEnvelope(value)) return false;
    if (value.event !== 'blackout.auth.session.continued') return false;
    const payload = (value as AuthSessionContinuedEvent).payload;
    if (!payload) return false;
    return (
        typeof payload.subject === 'string' &&
        typeof payload.issuer === 'string' &&
        typeof payload.issuedAt === 'string' &&
        typeof payload.expiresAt === 'string' &&
        SESSION_REASONS.includes(payload.reason as (typeof SESSION_REASONS)[number])
    );
};
