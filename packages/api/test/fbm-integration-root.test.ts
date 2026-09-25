// FBM_ENTITLEMENTS_BASE_URL is accepted as the bare origin or as the full
// integration root; every consumer must land on FBM's real routes under
// /v1/integrations/blackout either way.
import test from 'node:test';
import assert from 'node:assert/strict';

import type { CoalitionCampaignRecord } from '../src/db/types';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';

const { resolveFbmIntegrationRoot, fbmIntegrationTarget } = await import(
    '../src/integrations/fbm/integrationRoot'
);
const { getEntitlementsClient, resetEntitlementsClientForTest } = await import(
    '../src/integrations/fbm/entitlementsClientFactory'
);
const {
    __setBridgeFetchForTests,
    openSharedOrderWindow,
    pushCoalitionMilestones,
    pushCoalitionStatus,
} = await import('../src/services/coalitionFbmBridge');
const { __setReputationFetchForTests, awardCoalitionKarma } = await import(
    '../src/services/coalitionReputation'
);

const ROOT = 'https://fbm.test/v1/integrations/blackout';
const BASE_FORMS = [
    'https://fbm.test',
    'https://fbm.test/',
    'https://fbm.test/v1/integrations/blackout',
    'https://fbm.test/v1/integrations/blackout//',
];

function recorder(urls: string[], response: unknown = {}): typeof fetch {
    return (async (input: unknown) => {
        urls.push(String(input));
        return new Response(JSON.stringify(response), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as unknown as typeof fetch;
}

async function withEnv(base: string, fn: () => Promise<void>): Promise<void> {
    const prevBase = process.env.FBM_ENTITLEMENTS_BASE_URL;
    const prevToken = process.env.FBM_ENTITLEMENTS_SERVICE_TOKEN;
    process.env.FBM_ENTITLEMENTS_BASE_URL = base;
    process.env.FBM_ENTITLEMENTS_SERVICE_TOKEN = 'svc-token-test';
    try {
        await fn();
    } finally {
        if (prevBase === undefined) delete process.env.FBM_ENTITLEMENTS_BASE_URL;
        else process.env.FBM_ENTITLEMENTS_BASE_URL = prevBase;
        if (prevToken === undefined) delete process.env.FBM_ENTITLEMENTS_SERVICE_TOKEN;
        else process.env.FBM_ENTITLEMENTS_SERVICE_TOKEN = prevToken;
    }
}

test('resolveFbmIntegrationRoot accepts both base forms', () => {
    for (const base of BASE_FORMS) {
        assert.equal(resolveFbmIntegrationRoot(base), ROOT, base);
    }
    // A reverse-proxy prefix is kept; the integration path goes after it.
    assert.equal(
        resolveFbmIntegrationRoot('https://gw.test/fbm/'),
        'https://gw.test/fbm/v1/integrations/blackout'
    );
});

test('fbmIntegrationTarget is null unless both base and token are set', () => {
    assert.equal(fbmIntegrationTarget({}), null);
    assert.equal(fbmIntegrationTarget({ FBM_ENTITLEMENTS_BASE_URL: 'https://fbm.test' }), null);
    assert.equal(fbmIntegrationTarget({ FBM_ENTITLEMENTS_SERVICE_TOKEN: 't' }), null);
    assert.deepEqual(
        fbmIntegrationTarget({
            FBM_ENTITLEMENTS_BASE_URL: 'https://fbm.test',
            FBM_ENTITLEMENTS_SERVICE_TOKEN: 't',
        }),
        { root: ROOT, serviceToken: 't' }
    );
});

test('entitlements client hits /v1/integrations/blackout/entitlements/* for both base forms', async () => {
    const realFetch = globalThis.fetch;
    try {
        for (const base of BASE_FORMS) {
            const urls: string[] = [];
            globalThis.fetch = recorder(urls, { roles: [], memberships: [] });
            resetEntitlementsClientForTest();
            const client = getEntitlementsClient({
                FBM_ENTITLEMENTS_BASE_URL: base,
                FBM_ENTITLEMENTS_SERVICE_TOKEN: 'svc-token-test',
            });
            assert.ok(client, base);
            await client.getGovernanceRoles('@a:blackout.local');
            await client.getCoalitionMemberships('@a:blackout.local');
            assert.deepEqual(
                urls,
                [
                    `${ROOT}/entitlements/governance-roles/%40a%3Ablackout.local`,
                    `${ROOT}/entitlements/coalitions/%40a%3Ablackout.local`,
                ],
                base
            );
        }
    } finally {
        globalThis.fetch = realFetch;
        resetEntitlementsClientForTest();
    }
});

test('coalition bridge pushes hit /v1/integrations/blackout/coalitions/* for both base forms', async () => {
    try {
        for (const base of BASE_FORMS) {
            const urls: string[] = [];
            __setBridgeFetchForTests(recorder(urls));
            await withEnv(base, async () => {
                await pushCoalitionStatus('coal_1', 'taken_down');
                await pushCoalitionMilestones('coal_1');
                await openSharedOrderWindow({
                    campaign: {
                        id: 'camp_1',
                        coalitionId: 'coal_1',
                        title: 'Drive',
                    } as CoalitionCampaignRecord,
                    opensAt: '2026-01-01T00:00:00.000Z',
                    closesAt: '2026-01-02T00:00:00.000Z',
                    dispatchAt: '2026-01-03T00:00:00.000Z',
                });
            });
            assert.deepEqual(
                urls,
                [
                    `${ROOT}/coalitions/coal_1/status`,
                    `${ROOT}/coalitions/coal_1/milestones`,
                    `${ROOT}/coalitions/coal_1/order-cycles`,
                ],
                base
            );
        }
    } finally {
        __setBridgeFetchForTests(undefined);
    }
});

test('coalition reputation hits /v1/integrations/blackout/reputation/events for both base forms', async () => {
    try {
        for (const base of BASE_FORMS) {
            const urls: string[] = [];
            __setReputationFetchForTests(recorder(urls));
            await withEnv(base, async () => {
                await awardCoalitionKarma({
                    eventType: 'drive_completed',
                    blackoutUserId: 'user_1',
                    coalitionId: 'coal_1',
                    referenceId: 'camp_1',
                });
            });
            assert.deepEqual(urls, [`${ROOT}/reputation/events`], base);
        }
    } finally {
        __setReputationFetchForTests(undefined);
    }
});
