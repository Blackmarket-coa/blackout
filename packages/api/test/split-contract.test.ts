import test from 'node:test';
import assert from 'node:assert/strict';

import {
    activateSplitContract,
    listSplitContracts,
} from '../src/services/fbmMatrixBridge/splitContract';
import type { FbmBridgeMatrixClient } from '../src/services/fbmMatrixBridge/client';

const validContract = {
    contractId: 'sc_1',
    name: 'Editor revenue share',
    appliesTo: ['fbm_prod_1'],
    parties: [
        { matrixId: '@creator:bmc', fbmVendorId: 'v_creator', percentage: 70, role: 'creator' },
        { matrixId: '@editor:bmc', fbmVendorId: 'v_editor', percentage: 30, role: 'editor' },
    ],
    effectiveFrom: '2026-01-01T00:00:00Z',
    minimumThresholdCents: 0,
    status: 'active' as const,
};

// A minimal fake Matrix client recording state writes and replaying them on read.
function buildFakeMatrix() {
    const state = new Map<string, { eventId: string; content: Record<string, unknown> }>();
    let counter = 0;
    const fake: Partial<FbmBridgeMatrixClient> = {
        async sendStateEvent(roomId, type, content, stateKey = '') {
            counter += 1;
            const eventId = `$evt${counter}:bmc`;
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

test('activateSplitContract writes a state event and returns its event id', async () => {
    const matrix = buildFakeMatrix();
    const result = await activateSplitContract({ spaceId: '!space:bmc', contract: validContract }, matrix);
    assert.equal(result.ok, true);
    assert.ok(result.ok && result.matrixEventId.startsWith('$evt'));
});

test('activateSplitContract rejects shares that do not sum to 100', async () => {
    const matrix = buildFakeMatrix();
    const bad = {
        ...validContract,
        parties: [
            { matrixId: '@a:bmc', fbmVendorId: 'v_a', percentage: 40, role: 'creator' },
            { matrixId: '@b:bmc', fbmVendorId: 'v_b', percentage: 40, role: 'editor' },
        ],
    };
    const result = await activateSplitContract({ spaceId: '!space:bmc', contract: bad }, matrix);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, 'invalid_split');
});

test('listSplitContracts returns activated contracts keyed by contractId', async () => {
    const matrix = buildFakeMatrix();
    await activateSplitContract({ spaceId: '!space:bmc', contract: validContract }, matrix);
    await activateSplitContract(
        { spaceId: '!space:bmc', contract: { ...validContract, contractId: 'sc_2' } },
        matrix,
    );
    const contracts = await listSplitContracts('!space:bmc', matrix);
    assert.equal(contracts.length, 2);
    assert.deepEqual(
        contracts.map((entry) => entry.contract.contractId).sort(),
        ['sc_1', 'sc_2'],
    );
});

test('archiving supersedes a contract in place (same state key)', async () => {
    const matrix = buildFakeMatrix();
    await activateSplitContract({ spaceId: '!space:bmc', contract: validContract }, matrix);
    await activateSplitContract(
        { spaceId: '!space:bmc', contract: { ...validContract, status: 'archived' } },
        matrix,
    );
    const contracts = await listSplitContracts('!space:bmc', matrix);
    assert.equal(contracts.length, 1);
    assert.equal(contracts[0]?.contract.status, 'archived');
});
