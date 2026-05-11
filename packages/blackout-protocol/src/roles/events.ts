import type { EventEnvelope } from '../common/types';
import { isRolePayload, type RolePayload } from './contracts';

export const ROLE_EVENT_TYPE = 'co.bmc.governance.role';
export const ROLES_SCHEMA_VERSION = 1;

export type RoleSetTimelineEvent = EventEnvelope<
    'blackout.governance.role.set',
    RolePayload
>;

const isEventEnvelope = (
    value: unknown,
): value is {
    roomId: string;
    senderId: string;
    occurredAt: string;
    event: string;
    payload: unknown;
} => {
    if (!value || typeof value !== 'object') return false;
    const c = value as Partial<{
        roomId: string;
        senderId: string;
        occurredAt: string;
        event: string;
    }>;
    return (
        typeof c.roomId === 'string' &&
        typeof c.senderId === 'string' &&
        typeof c.occurredAt === 'string' &&
        typeof c.event === 'string'
    );
};

export const isRoleSetTimelineEvent = (value: unknown): value is RoleSetTimelineEvent => {
    if (!isEventEnvelope(value)) return false;
    if (value.event !== 'blackout.governance.role.set') return false;
    return isRolePayload((value as RoleSetTimelineEvent).payload);
};
