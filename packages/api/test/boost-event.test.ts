import test from 'node:test';
import assert from 'node:assert/strict';

import { upsertBoost, listBoosts } from '../src/services/fbmMatrixBridge/boost';
import type { FbmBridgeMatrixClient } from '../src/services/fbmMatrixBridge/client';

const boost = {
    schemaVersion: 1,
    boostId: 'b_1',
    type: 'hype_train' as const,
    goalCents: 500000,
    currentCents: 0,
    currency: 'USD',
    milestones: [
        { atCents: 50000, reward: 'Level 1' },
        { atCents: 100000, reward: 'Level 2' },
    ],
    startedAt: '2026-01-01T00:00:00Z',
    expiresAt: '2026-01-02T00:00:00Z',
    status: 'active' as const,
};

function buildFakeMatrix() {
    const state = new Map<string, { eventId: string; content: Record<string, unknown> }>();
    let counter = 0;
    const fake: Partial<FbmBridgeMatrixClient> = {
        async sendStateEvent(roomId, type, content, stateKey = '') {
            counter += 1;
            const eventId = `$b${counter}:bmc`;
            state.set(`${roomId}|${type}|${stateKey}`, { eventId, content });
            return { ok: true as const, status: 200, eventId };
        },
        async getRoomStateEvents(roomId, type) {
            const prefix = `${roomId}|${type}|`;
            const events = [...state.entries()]
                .filter(([key]) => key.startsWith(prefix))
                .map(([key, value]) => ({
                    stateKey: key.slice(prefix.length),
                    eventId: value.eventId,
                    content: value.content,
                }));
            return { ok: true as const, status: 200, events };
        },
    };
    return fake as FbmBridgeMatrixClient;
}

test('upsertBoost writes the boost state event', async () => {
    const matrix = buildFakeMatrix();
    const result = await upsertBoost({ roomId: '!r:bmc', boost }, matrix);
    assert.equal(result.ok, true);
});

test('upsertBoost rejects an invalid payload', async () => {
    const matrix = buildFakeMatrix();
    const result = await upsertBoost(
        { roomId: '!r:bmc', boost: { ...boost, goalCents: 0 } },
        matrix,
    );
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, 'invalid_payload');
});

test('re-upserting advances currentCents in place', async () => {
    const matrix = buildFakeMatrix();
    await upsertBoost({ roomId: '!r:bmc', boost }, matrix);
    await upsertBoost({ roomId: '!r:bmc', boost: { ...boost, currentCents: 60000 } }, matrix);
    const boosts = await listBoosts('!r:bmc', matrix);
    assert.equal(boosts.length, 1);
    assert.equal(boosts[0]?.boost.currentCents, 60000);
});
