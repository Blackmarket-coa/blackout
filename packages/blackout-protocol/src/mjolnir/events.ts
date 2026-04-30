import type { BanListChangedEvent, ProtectionChangedEvent } from './contracts';

export {
    MJOLNIR_EVENT_NAMES,
    MJOLNIR_PROTOCOL_VERSION,
    type BanListChangeOp,
    type BanListChangedEvent,
    type BanListChangedPayload,
    type BanListRuleKind,
    type BanListRulePayload,
    type BanListRuleRecommendation,
    type MjolnirEventName,
    type ProtectionChangedEvent,
    type ProtectionChangedPayload,
    type ProtectionDescriptor,
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

const BANLIST_CHANGE_OPS = ['created', 'updated', 'removed'] as const;

export const isProtectionChanged = (value: unknown): value is ProtectionChangedEvent => {
    if (!isEnvelope(value)) return false;
    if (value.event !== 'blackout.moderation.mjolnir.protection.changed') return false;
    const payload = (value as ProtectionChangedEvent).payload;
    if (!payload) return false;
    return (
        typeof payload.protectionId === 'string' &&
        typeof payload.enabled === 'boolean' &&
        typeof payload.changedAt === 'string'
    );
};

export const isBanListChanged = (value: unknown): value is BanListChangedEvent => {
    if (!isEnvelope(value)) return false;
    if (value.event !== 'blackout.moderation.mjolnir.banlist.changed') return false;
    const payload = (value as BanListChangedEvent).payload;
    if (!payload) return false;
    if (
        typeof payload.listId !== 'string' ||
        typeof payload.changedAt !== 'string' ||
        !BANLIST_CHANGE_OPS.includes(payload.op as (typeof BANLIST_CHANGE_OPS)[number])
    ) {
        return false;
    }
    if (payload.op === 'removed') {
        return typeof payload.removedRuleId === 'string';
    }
    return Boolean(payload.rule && typeof payload.rule.ruleId === 'string');
};
