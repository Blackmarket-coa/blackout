import type {
    DeadDropCreated,
    DeadDropOpened,
    MutualAidThreadOpenedEvent,
    MutualAidThreadPayload,
    MutualAidThreadStatus,
    MutualAidThreadUpdatedEvent,
} from '@blackout/protocol';
import type { ApiClient } from '../client/types';

export const createDeadDropActions = (client: ApiClient) => ({
    createDeadDrop: (payload: DeadDropCreated['payload']) =>
        client<DeadDropCreated>({
            method: 'POST',
            path: '/v1/deaddrop',
            body: payload,
        }),
    openDeadDrop: (payload: DeadDropOpened['payload']) =>
        client<DeadDropOpened>({
            method: 'POST',
            path: '/v1/deaddrop/open',
            body: payload,
        }),
});

/**
 * Mutual-aid thread actions (BKL-013). Lives alongside the existing
 * deaddrop actions because mutual-aid threads ride on deaddrop infra.
 */

export type MutualAidThreadListResponse = {
    subject: string;
    threads: MutualAidThreadPayload[];
};

export type OpenMutualAidThreadInput = {
    headline: string;
    body?: string;
};

export const createMutualAidActions = (client: ApiClient) => ({
    /**
     * Fetch the open + in-progress mutual-aid threads visible to the
     * subject. Backed by `GET /v1/deaddrop/mutual-aid/threads`.
     */
    listThreads: () =>
        client<MutualAidThreadListResponse>({
            method: 'GET',
            path: '/v1/deaddrop/mutual-aid/threads',
        }),
    /**
     * Open a new mutual-aid thread. Server emits a
     * `blackout.deaddrop.mutual-aid.thread.opened` envelope.
     */
    openThread: (input: OpenMutualAidThreadInput) =>
        client<MutualAidThreadOpenedEvent>({
            method: 'POST',
            path: '/v1/deaddrop/mutual-aid/threads',
            body: input,
        }),
    /**
     * Transition a thread to a new status. Server emits a
     * `blackout.deaddrop.mutual-aid.thread.updated` envelope.
     */
    updateThreadStatus: (threadId: string, status: MutualAidThreadStatus) =>
        client<MutualAidThreadUpdatedEvent>({
            method: 'PUT',
            path: `/v1/deaddrop/mutual-aid/threads/${encodeURIComponent(threadId)}/status`,
            body: { status },
        }),
});

/**
 * Pure helper: filters a thread list to the active threads (`open` and
 * `in_progress`), preserving order.
 */
export const filterActiveMutualAidThreads = (
    threads: readonly MutualAidThreadPayload[]
): MutualAidThreadPayload[] =>
    threads.filter(
        (thread) => thread.status === 'open' || thread.status === 'in_progress'
    );

/**
 * Pure helper: applies a thread envelope to a local snapshot. Inserts
 * the thread if its id is unknown, replaces fields otherwise. Returns a
 * new array; callers can compare references to detect change.
 */
export const applyMutualAidThreadUpdate = (
    threads: readonly MutualAidThreadPayload[],
    payload: MutualAidThreadPayload
): MutualAidThreadPayload[] => {
    const existing = threads.find((thread) => thread.threadId === payload.threadId);
    if (!existing) return [...threads, payload];
    return threads.map((thread) =>
        thread.threadId === payload.threadId ? { ...thread, ...payload } : thread
    );
};

export type {
    MutualAidThreadOpenedEvent,
    MutualAidThreadPayload,
    MutualAidThreadStatus,
    MutualAidThreadUpdatedEvent,
};
