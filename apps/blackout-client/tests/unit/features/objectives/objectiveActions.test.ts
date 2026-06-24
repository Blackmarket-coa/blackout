import { describe, expect, it, vi } from 'vitest';
import {
    DEN_OBJECTIVE_CONTRIBUTION_EVENT_TYPE,
    DEN_OBJECTIVE_EVENT_TYPE,
    type DenObjectivePayload,
} from '@blackout/protocol';
import { createObjectiveMatrixActions } from '@blackout/sdk';

const objective: DenObjectivePayload = {
    objectiveId: 'obj-42',
    title: 'Plant the food forest',
    unit: 'beds',
    target: 12,
    status: 'active',
    createdAt: '2026-06-24T00:00:00.000Z',
};

describe('createObjectiveMatrixActions', () => {
    it('writes the objective as a state event keyed by objectiveId', async () => {
        const sendStateEvent = vi.fn().mockResolvedValue(undefined);
        const sendEvent = vi.fn().mockResolvedValue(undefined);
        const actions = createObjectiveMatrixActions({ sendEvent, sendStateEvent });

        await actions.setObjective('!room:x', objective);

        expect(sendStateEvent).toHaveBeenCalledTimes(1);
        const [roomId, eventType, content, stateKey] = sendStateEvent.mock.calls[0];
        expect(roomId).toBe('!room:x');
        expect(eventType).toBe(DEN_OBJECTIVE_EVENT_TYPE);
        expect(stateKey).toBe('obj-42');
        expect(content).toMatchObject({ ...objective, schemaVersion: 1 });
        expect(sendEvent).not.toHaveBeenCalled();
    });

    it('writes a contribution as a timeline event', async () => {
        const sendStateEvent = vi.fn().mockResolvedValue(undefined);
        const sendEvent = vi.fn().mockResolvedValue(undefined);
        const actions = createObjectiveMatrixActions({ sendEvent, sendStateEvent });

        await actions.contribute('!room:x', { objectiveId: 'obj-42', amount: 3, note: 'bed 3' });

        expect(sendEvent).toHaveBeenCalledTimes(1);
        const [roomId, eventType, content] = sendEvent.mock.calls[0];
        expect(roomId).toBe('!room:x');
        expect(eventType).toBe(DEN_OBJECTIVE_CONTRIBUTION_EVENT_TYPE);
        expect(content).toMatchObject({ objectiveId: 'obj-42', amount: 3, note: 'bed 3' });
        expect(sendStateEvent).not.toHaveBeenCalled();
    });

    it('GUARDRAIL: a contribution payload carries no per-member score field', async () => {
        const sendEvent = vi.fn().mockResolvedValue(undefined);
        const actions = createObjectiveMatrixActions({
            sendEvent,
            sendStateEvent: vi.fn(),
        });

        await actions.contribute('!room:x', { objectiveId: 'obj-42', amount: 3 });
        const [, , content] = sendEvent.mock.calls[0];
        // No reputation/xp/points/rank/score smuggled into the event content.
        for (const banned of ['xp', 'points', 'reputation', 'score', 'rank', 'level']) {
            expect(Object.keys(content)).not.toContain(banned);
        }
    });
});
