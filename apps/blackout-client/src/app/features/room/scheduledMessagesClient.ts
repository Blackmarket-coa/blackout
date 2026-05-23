import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

const SCHEDULED_MESSAGES_BASE = '/v1/scheduled-messages';

export type ScheduledMessageStatus = 'pending' | 'delivered' | 'failed' | 'cancelled';

export interface ScheduledMessageRecord {
    id: string;
    userId: string;
    matrixRoomId: string;
    body: string;
    formattedBody?: string;
    deliverAt: string;
    status: ScheduledMessageStatus;
    attempts: number;
    lastError?: string;
    createdAt: string;
    deliveredAt?: string;
}

export interface CreateScheduledMessageInput {
    matrixRoomId: string;
    body: string;
    formattedBody?: string;
    /** ISO-8601 timestamp; must be in the future. */
    deliverAt: string;
}

const callJson = <T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body: unknown,
    token: string | null
): Promise<T> => createAuthorizedApiClient(token)({ method, path, body }) as Promise<T>;

export const createScheduledMessage = (
    input: CreateScheduledMessageInput,
    token: string | null = readBlackoutApiToken()
): Promise<{ scheduledMessage: ScheduledMessageRecord }> =>
    callJson('POST', SCHEDULED_MESSAGES_BASE, input, token);

export const listScheduledMessages = (
    token: string | null = readBlackoutApiToken()
): Promise<{ scheduledMessages: ScheduledMessageRecord[] }> =>
    callJson('GET', SCHEDULED_MESSAGES_BASE, undefined, token);

export const cancelScheduledMessage = (
    id: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ scheduledMessage: ScheduledMessageRecord }> =>
    callJson('DELETE', `${SCHEDULED_MESSAGES_BASE}/${encodeURIComponent(id)}`, undefined, token);
