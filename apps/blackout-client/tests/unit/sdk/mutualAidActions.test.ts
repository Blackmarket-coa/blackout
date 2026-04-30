import { describe, expect, it } from 'vitest';
import {
    isMutualAidThreadOpened,
    isMutualAidThreadUpdated,
    MUTUAL_AID_EVENT_NAMES,
    type MutualAidThreadOpenedEvent,
    type MutualAidThreadPayload,
    type MutualAidThreadUpdatedEvent,
} from '@blackout/protocol';
import {
    applyMutualAidThreadUpdate,
    createMutualAidActions,
    filterActiveMutualAidThreads,
} from '@blackout/sdk';
import type { ApiClient, ApiRequest } from '@blackout/sdk';

const buildClient = <T>(response: T) => {
    const calls: ApiRequest[] = [];
    const apiClient: ApiClient = async (request) => {
        calls.push(request);
        return response as never;
    };
    return { apiClient, calls };
};

const thread = (
    overrides: Partial<MutualAidThreadPayload> = {}
): MutualAidThreadPayload => ({
    threadId: 't-1',
    requester: '@a:srv',
    headline: 'Need a ride',
    status: 'open',
    openedAt: '2026-04-30T00:00:00.000Z',
    updatedAt: '2026-04-30T00:00:00.000Z',
    ...overrides,
});

describe('@blackout/protocol mutual-aid guards (BKL-013)', () => {
    it('publishes the canonical Matrix event types', () => {
        expect(MUTUAL_AID_EVENT_NAMES.threadOpened).toBe(
            'co.bmc.deaddrop.mutual-aid.thread.opened'
        );
        expect(MUTUAL_AID_EVENT_NAMES.threadUpdated).toBe(
            'co.bmc.deaddrop.mutual-aid.thread.updated'
        );
    });

    it('isMutualAidThreadOpened enforces the status union', () => {
        const valid: MutualAidThreadOpenedEvent = {
            event: 'blackout.deaddrop.mutual-aid.thread.opened',
            roomId: '!ma:srv',
            senderId: '@a:srv',
            occurredAt: '2026-04-30T00:00:00.000Z',
            payload: thread(),
        };
        expect(isMutualAidThreadOpened(valid)).toBe(true);
        expect(
            isMutualAidThreadOpened({
                ...valid,
                payload: { ...valid.payload, status: 'rogue' },
            })
        ).toBe(false);
        expect(isMutualAidThreadUpdated(valid)).toBe(false);
    });

    it('isMutualAidThreadUpdated narrows the updated envelope', () => {
        const valid: MutualAidThreadUpdatedEvent = {
            event: 'blackout.deaddrop.mutual-aid.thread.updated',
            roomId: '!ma:srv',
            senderId: '@a:srv',
            occurredAt: '2026-04-30T00:00:00.000Z',
            payload: thread({ status: 'in_progress' }),
        };
        expect(isMutualAidThreadUpdated(valid)).toBe(true);
        expect(isMutualAidThreadOpened(valid)).toBe(false);
    });
});

describe('createMutualAidActions', () => {
    it('listThreads + openThread + updateThreadStatus hit the canonical paths', async () => {
        const { apiClient, calls } = buildClient<unknown>({});
        const actions = createMutualAidActions(apiClient);

        await actions.listThreads();
        expect(calls.at(-1)).toEqual({
            method: 'GET',
            path: '/v1/deaddrop/mutual-aid/threads',
        });

        await actions.openThread({ headline: 'Need a ride', body: 'East side' });
        expect(calls.at(-1)).toEqual({
            method: 'POST',
            path: '/v1/deaddrop/mutual-aid/threads',
            body: { headline: 'Need a ride', body: 'East side' },
        });

        await actions.updateThreadStatus('t 9', 'resolved');
        expect(calls.at(-1)).toEqual({
            method: 'PUT',
            path: `/v1/deaddrop/mutual-aid/threads/${encodeURIComponent('t 9')}/status`,
            body: { status: 'resolved' },
        });
    });
});

describe('filterActiveMutualAidThreads', () => {
    it('keeps only open + in_progress threads', () => {
        const threads: MutualAidThreadPayload[] = [
            thread({ threadId: 'a', status: 'open' }),
            thread({ threadId: 'b', status: 'in_progress' }),
            thread({ threadId: 'c', status: 'resolved' }),
            thread({ threadId: 'd', status: 'cancelled' }),
        ];
        expect(filterActiveMutualAidThreads(threads).map((t) => t.threadId)).toEqual([
            'a',
            'b',
        ]);
    });
});

describe('applyMutualAidThreadUpdate', () => {
    it('inserts when threadId is unknown', () => {
        const next = applyMutualAidThreadUpdate([], thread({ threadId: 'new' }));
        expect(next.map((t) => t.threadId)).toEqual(['new']);
    });

    it('replaces fields when threadId matches', () => {
        const before = [thread({ threadId: 't-1', status: 'open' })];
        const next = applyMutualAidThreadUpdate(before, thread({ threadId: 't-1', status: 'resolved' }));
        expect(next[0].status).toBe('resolved');
    });
});
