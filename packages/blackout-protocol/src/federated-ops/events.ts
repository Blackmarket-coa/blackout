import type {
    FederationAlertStatusEvent,
    RevenueOpsSnapshotEvent,
    TownhallLifecycleEvent,
} from './contracts';

export {
    FEDERATED_OPS_EVENT_NAMES,
    FEDERATED_OPS_PROTOCOL_VERSION,
    type FederatedOpsEventName,
    type FederationAlertSeverity,
    type FederationAlertStatusEvent,
    type FederationAlertStatusPayload,
    type RevenueOpsSnapshotEvent,
    type RevenueOpsSnapshotPayload,
    type TownhallLifecycleEvent,
    type TownhallLifecyclePayload,
    type TownhallLifecyclePhase,
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

const SEVERITIES = ['info', 'warning', 'critical'] as const;
const PHASES = ['scheduled', 'live', 'archived', 'cancelled'] as const;

export const isFederationAlertStatus = (value: unknown): value is FederationAlertStatusEvent => {
    if (!isEnvelope(value)) return false;
    if (value.event !== 'blackout.federation.alert.status') return false;
    const payload = (value as FederationAlertStatusEvent).payload;
    if (!payload) return false;
    return (
        typeof payload.alertId === 'string' &&
        typeof payload.headline === 'string' &&
        typeof payload.publishedAt === 'string' &&
        typeof payload.active === 'boolean' &&
        SEVERITIES.includes(payload.severity as (typeof SEVERITIES)[number])
    );
};

export const isTownhallLifecycle = (value: unknown): value is TownhallLifecycleEvent => {
    if (!isEnvelope(value)) return false;
    if (value.event !== 'blackout.townhall.lifecycle') return false;
    const payload = (value as TownhallLifecycleEvent).payload;
    if (!payload) return false;
    return (
        typeof payload.townhallId === 'string' &&
        typeof payload.topic === 'string' &&
        typeof payload.occurredAt === 'string' &&
        PHASES.includes(payload.phase as (typeof PHASES)[number])
    );
};

export const isRevenueOpsSnapshot = (value: unknown): value is RevenueOpsSnapshotEvent => {
    if (!isEnvelope(value)) return false;
    if (value.event !== 'blackout.revenue.ops.snapshot') return false;
    const payload = (value as RevenueOpsSnapshotEvent).payload;
    if (!payload) return false;
    return (
        typeof payload.snapshotId === 'string' &&
        typeof payload.capturedAt === 'string' &&
        typeof payload.currency === 'string' &&
        Boolean(payload.figures) &&
        typeof payload.figures.gross === 'string'
    );
};
