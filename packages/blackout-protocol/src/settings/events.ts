import type { LabsGateChangedEvent, SettingChangedEvent } from './contracts';

export {
    SETTINGS_EVENT_NAMES,
    SETTINGS_PROTOCOL_VERSION,
    type LabsGateChangedEvent,
    type LabsGateChangedPayload,
    type LabsGateReason,
    type SettingChangedEvent,
    type SettingChangedPayload,
    type SettingsCategory,
    type SettingsEventName,
    type SettingsScope,
    type SettingsValue,
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

const SETTINGS_CATEGORIES = ['preferences', 'sidebar', 'labs'] as const;
const SETTINGS_SCOPES = ['device', 'account'] as const;
const LABS_GATE_REASONS = ['config_flag', 'developer_mode'] as const;

export const isSettingChanged = (value: unknown): value is SettingChangedEvent => {
    if (!isEnvelope(value)) return false;
    if (value.event !== 'blackout.settings.changed') return false;
    const payload = (value as SettingChangedEvent).payload;
    if (!payload) return false;
    return (
        typeof payload.key === 'string' &&
        typeof payload.changedAt === 'string' &&
        SETTINGS_CATEGORIES.includes(payload.category as (typeof SETTINGS_CATEGORIES)[number]) &&
        SETTINGS_SCOPES.includes(payload.scope as (typeof SETTINGS_SCOPES)[number])
    );
};

export const isLabsGateChanged = (value: unknown): value is LabsGateChangedEvent => {
    if (!isEnvelope(value)) return false;
    if (value.event !== 'blackout.settings.labs.gate.changed') return false;
    const payload = (value as LabsGateChangedEvent).payload;
    if (!payload) return false;
    return (
        typeof payload.visible === 'boolean' &&
        typeof payload.changedAt === 'string' &&
        LABS_GATE_REASONS.includes(payload.reason as (typeof LABS_GATE_REASONS)[number])
    );
};
