import type {
    StegoChannelCreatedEvent,
    StegoChannelExpiredEvent,
    StegoChannelRotatedEvent,
} from './contracts';

export {
    STEGO_EVENT_NAMES,
    STEGO_PROTOCOL_VERSION,
    type StegoCarrier,
    type StegoChannelCreatedEvent,
    type StegoChannelCreatedPayload,
    type StegoChannelExpiredEvent,
    type StegoChannelExpiredPayload,
    type StegoChannelExpiryReason,
    type StegoChannelRotatedEvent,
    type StegoChannelRotatedPayload,
    type StegoEphemeralMode,
    type StegoEventName,
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

const STEGO_CARRIERS = ['text', 'image', 'audio'] as const;
const STEGO_EPHEMERAL_MODES = ['persistent', 'expire_after_hours', 'delete_on_read'] as const;
const STEGO_EXPIRY_REASONS = [
    'ttl_elapsed',
    'read_consumed',
    'operator_revoked',
    'policy_archived',
] as const;

export const isStegoChannelCreated = (value: unknown): value is StegoChannelCreatedEvent => {
    if (!isEnvelope(value)) return false;
    if (value.event !== 'blackout.stego.channel.created') return false;
    const payload = (value as StegoChannelCreatedEvent).payload;
    if (!payload) return false;
    return (
        typeof payload.channelId === 'string' &&
        typeof payload.name === 'string' &&
        typeof payload.audience === 'string' &&
        typeof payload.createdAt === 'string' &&
        typeof payload.rotationDays === 'number' &&
        STEGO_CARRIERS.includes(payload.carrier as (typeof STEGO_CARRIERS)[number]) &&
        STEGO_EPHEMERAL_MODES.includes(
            payload.ephemeralMode as (typeof STEGO_EPHEMERAL_MODES)[number]
        )
    );
};

export const isStegoChannelRotated = (value: unknown): value is StegoChannelRotatedEvent => {
    if (!isEnvelope(value)) return false;
    if (value.event !== 'blackout.stego.channel.rotated') return false;
    const payload = (value as StegoChannelRotatedEvent).payload;
    if (!payload) return false;
    return (
        typeof payload.channelId === 'string' &&
        typeof payload.rotatedAt === 'string' &&
        typeof payload.rotationIndex === 'number' &&
        typeof payload.materialFingerprint === 'string'
    );
};

export const isStegoChannelExpired = (value: unknown): value is StegoChannelExpiredEvent => {
    if (!isEnvelope(value)) return false;
    if (value.event !== 'blackout.stego.channel.expired') return false;
    const payload = (value as StegoChannelExpiredEvent).payload;
    if (!payload) return false;
    return (
        typeof payload.channelId === 'string' &&
        typeof payload.expiredAt === 'string' &&
        STEGO_EXPIRY_REASONS.includes(payload.reason as (typeof STEGO_EXPIRY_REASONS)[number])
    );
};
