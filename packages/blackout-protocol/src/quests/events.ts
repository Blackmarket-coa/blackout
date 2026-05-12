import type { EventEnvelope } from '../common/types';
import { isUserQuestsPayload, type UserQuestsPayload } from './contracts';

export const USER_QUESTS_ACCOUNT_DATA_TYPE = 'co.bmc.user.quests';
export const USER_QUESTS_SCHEMA_VERSION = 1;

export type UserQuestsAccountDataTimelineEvent = EventEnvelope<
    'blackout.user.quests',
    UserQuestsPayload
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

export const isUserQuestsTimelineEvent = (
    value: unknown,
): value is UserQuestsAccountDataTimelineEvent => {
    if (!isEventEnvelope(value)) return false;
    if (value.event !== 'blackout.user.quests') return false;
    return isUserQuestsPayload((value as UserQuestsAccountDataTimelineEvent).payload);
};
