import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api-test';
process.env.JWT_AUDIENCE = 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
process.env.BLACKOUT_DB_MODE = 'memory';
// Selects the in-memory entitlements stub for the "available" case; the
// no-config case flips this off explicitly below.
process.env.FBM_ENTITLEMENTS_STUB = '1';

const { default: app } = await import('../src/index');
const { signJwt, hashPassword } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { getEntitlementsClient, getEntitlementsStubForTest, resetEntitlementsClientForTest } =
    await import('../src/integrations/fbm/entitlementsClientFactory');

const seedUser = (overrides: Partial<{ id: string; username: string }> = {}) => {
    const id = overrides.id ?? randomUUID();
    const username = overrides.username ?? `user-${id.slice(0, 8)}`;
    db.createUser({
        id,
        username,
        email: `${username}@example.com`,
        passwordHash: hashPassword('Original-Pass-1234!'),
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: 'pk',
    });
    return db.getUserById(id)!;
};

const bearer = (userId: string, username: string) => ({
    authorization: `Bearer ${signJwt(userId, username, 600)}`,
    'content-type': 'application/json',
});

// Mirror the route's MXID construction so the seed key matches the lookup key.
const mxidFor = (username: string): string => {
    const domain = (process.env.MATRIX_HOMESERVER_DOMAIN ?? 'blackout.local').replace(/^@+/, '');
    return `@${username}:${domain}`;
};

interface CreditsResponse {
    available: boolean;
    balanceMinorUnits?: number;
    currency?: string;
    pendingPayouts?: {
        currency: string;
        amountMinorUnits: number;
        expectedSettlementAt: string | null;
    }[];
    rewardEligibility?: { programKey: string; eligible: boolean }[];
}

test('coalition-credits: projects economic standing from the entitlements stub', async () => {
    process.env.FBM_ENTITLEMENTS_STUB = '1';
    resetEntitlementsClientForTest();
    const client = getEntitlementsClient();
    assert.ok(client, 'entitlements stub client should be configured');
    const stub = getEntitlementsStubForTest();
    assert.ok(stub, 'stub instance should be present when FBM_ENTITLEMENTS_STUB=1');

    const user = seedUser();
    stub.seed(mxidFor(user.username), {
        economicStanding: {
            coalitionCreditsBalanceMinorUnits: 125_000,
            pendingPayouts: [
                {
                    currency: 'CC',
                    amountMinorUnits: 5_000,
                    expectedSettlementAt: '2026-09-01T00:00:00.000Z',
                },
            ],
            creatorRewardEligibility: [
                { program: 'creator-fund', eligible: true, blockedReason: null },
                { program: 'coalition-boost', eligible: false, blockedReason: 'not-a-member' },
            ],
        },
    });

    const res = await app.request('/v1/coalition-credits', {
        headers: bearer(user.id, user.username),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as CreditsResponse;

    assert.equal(body.available, true);
    assert.equal(typeof body.balanceMinorUnits, 'number');
    assert.equal(body.balanceMinorUnits, 125_000);
    assert.equal(body.currency, 'CC');
    assert.equal(body.pendingPayouts?.length, 1);
    assert.equal(body.pendingPayouts?.[0]?.amountMinorUnits, 5_000);
    assert.equal(body.pendingPayouts?.[0]?.expectedSettlementAt, '2026-09-01T00:00:00.000Z');
    assert.equal(body.rewardEligibility?.length, 2);
    // `program` on the contract is projected to `programKey` on the wire.
    assert.deepEqual(body.rewardEligibility, [
        { programKey: 'creator-fund', eligible: true },
        { programKey: 'coalition-boost', eligible: false },
    ]);
});

test('coalition-credits: empty standing still reports available with a zero balance', async () => {
    process.env.FBM_ENTITLEMENTS_STUB = '1';
    resetEntitlementsClientForTest();
    getEntitlementsClient();
    const user = seedUser(); // not seeded → stub returns the empty standing

    const res = await app.request('/v1/coalition-credits', {
        headers: bearer(user.id, user.username),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as CreditsResponse;
    assert.equal(body.available, true);
    assert.equal(body.balanceMinorUnits, 0);
    assert.deepEqual(body.pendingPayouts, []);
    assert.deepEqual(body.rewardEligibility, []);
});

test('coalition-credits: degrades to available:false when the service is not configured', async () => {
    delete process.env.FBM_ENTITLEMENTS_STUB;
    delete process.env.FBM_ENTITLEMENTS_BASE_URL;
    delete process.env.FBM_ENTITLEMENTS_SERVICE_TOKEN;
    resetEntitlementsClientForTest();
    assert.equal(getEntitlementsClient(), undefined);

    const user = seedUser();
    const res = await app.request('/v1/coalition-credits', {
        headers: bearer(user.id, user.username),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as CreditsResponse;
    assert.equal(body.available, false);
    assert.equal(body.balanceMinorUnits, undefined);
});

test('coalition-credits: requires authentication', async () => {
    // Re-enable the stub so this asserts the auth gate, not the config gate.
    process.env.FBM_ENTITLEMENTS_STUB = '1';
    resetEntitlementsClientForTest();
    const res = await app.request('/v1/coalition-credits');
    assert.equal(res.status, 401);
});
