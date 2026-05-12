import type { EventEnvelope } from '../common/types';
import {
    isCharacterSheetSharedGrantPayload,
    isCharacterSheetSharingPayload,
    type CharacterSheetSharedGrantPayload,
    type CharacterSheetSharingPayload,
} from './contracts';

export const CHARACTER_SHEET_SHARING_ACCOUNT_DATA_TYPE = 'co.bmc.user.sheet.sharing';
export const CHARACTER_SHEET_SHARED_GRANT_EVENT_TYPE = 'co.bmc.user.sheet.shared';
export const CHARACTER_SHEET_SHARING_SCHEMA_VERSION = 1;

export type CharacterSheetSharingTimelineEvent = EventEnvelope<
    'blackout.user.sheet.sharing',
    CharacterSheetSharingPayload
>;

export type CharacterSheetSharedGrantTimelineEvent = EventEnvelope<
    'blackout.user.sheet.shared',
    CharacterSheetSharedGrantPayload
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

export const isCharacterSheetSharingTimelineEvent = (
    value: unknown,
): value is CharacterSheetSharingTimelineEvent => {
    if (!isEventEnvelope(value)) return false;
    if (value.event !== 'blackout.user.sheet.sharing') return false;
    return isCharacterSheetSharingPayload(
        (value as CharacterSheetSharingTimelineEvent).payload,
    );
};

export const isCharacterSheetSharedGrantTimelineEvent = (
    value: unknown,
): value is CharacterSheetSharedGrantTimelineEvent => {
    if (!isEventEnvelope(value)) return false;
    if (value.event !== 'blackout.user.sheet.shared') return false;
    return isCharacterSheetSharedGrantPayload(
        (value as CharacterSheetSharedGrantTimelineEvent).payload,
    );
};
