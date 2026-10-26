/**
 * The admin API key (`x-admin-api-key`, `src/middleware/admin-api-key.ts`).
 *
 * Twelve money-path admin writes are guarded by it: ad-revenue periods and
 * shares, tip, creator-subscription and boost-pledge capture and refund, and
 * subscription comps and refund syncs. Until 2026-10-26 each route file fell
 * back to a literal printed in the source when `BLACKOUT_ADMIN_API_KEY` was
 * unset, so a deployment that never set it accepted that literal from anyone
 * (F8 in docs/security/api-findings-triage-2026-10-25.md). Unset, the header
 * now opens nothing (503); set, only the configured value does (403 otherwise).
 * Every refusal below is checked against the state it would have changed.
 *
 * The configured value is random per run, so no secret-shaped literal sits in
 * this file.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api-test';
process.env.JWT_AUDIENCE = 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
process.env.BLACKOUT_DB_MODE = 'memory';
delete process.env.BLACKOUT_ADMIN_API_KEY;

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const adRevenue = await import('../src/services/adRevenue');
const boosts = await import('../src/services/communityBoosts');
const creatorSubs = await import('../src/services/creatorSubscriptions');
const tips = await import('../src/services/tips');
const subscriptions = await import('../src/services/subscriptions');

/** The value the routes fell back to before this change. */
const FORMER_DEFAULT = 'dev-admin-key';
const CONFIGURED = randomBytes(24).toString('base64url');

const seedUser = (): string => {
    const id = randomUUID();
    db.createUser({
        id,
        username: `admin-key-${id.slice(0, 8)}`,
        email: `admin-key-${id.slice(0, 8)}@example.com`,
        passwordHash: 'unused',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: 'pk',
    });
    return id;
};

/** An admin write, freshly seeded, with a read of the state it changes. */
interface AdminWrite {
    label: string;
    path: string;
    body?: Record<string, unknown>;
    okStatus: number;
    state: () => unknown;
}

const PERIOD = {
    periodStart: '2026-09-01T00:00:00.000Z',
    periodEnd: '2026-10-01T00:00:00.000Z',
    totalCents: 100_000,
    currency: 'USD',
};

const pendingShare = () => {
    const creator = seedUser();
    const period = adRevenue.createPeriod(PERIOD);
    const { shares } = adRevenue.allocateShares(period.id, [
        { creatorUserId: creator, grossCents: 1_000 },
    ]);
    return shares[0]!.id;
};

const pendingPledge = () =>
    boosts.pledgeBoost({
        communityId: `community-${randomUUID()}`,
        pledgerUserId: seedUser(),
        monthlyCents: 499,
        currency: 'USD',
    }).id;

const pendingCreatorSub = () => {
    const creator = seedUser();
    const tierId = randomUUID();
    const ts = new Date().toISOString();
    db.insertCreatorSubscriptionTier({
        id: tierId,
        creatorUserId: creator,
        name: 'Supporter',
        description: null,
        priceCents: 499,
        currency: 'USD',
        providerId: 'freeblackmarket',
        fbmListingId: null,
        status: 'active',
        createdAt: ts,
        updatedAt: ts,
    });
    return creatorSubs.startSubscription({ subscriberUserId: seedUser(), tierId }).id;
};

const pendingTip = () =>
    tips.createTip({
        senderUserId: seedUser(),
        recipientUserId: seedUser(),
        contextKind: 'profile',
        grossCents: 500,
        currency: 'USD',
    }).id;

const canopySubscription = (userId: string) => ({
    record: db.getCanopySubscription(userId) ?? null,
    audit: subscriptions.getSubscriptionAuditTimeline(userId).length,
});

const ADMIN_WRITES: Array<() => AdminWrite> = [
    () => ({
        label: 'create an ad-revenue period',
        path: '/v1/ad-revenue/periods',
        body: PERIOD,
        okStatus: 201,
        state: () => adRevenue.listPeriods().length,
    }),
    () => {
        const creator = seedUser();
        const period = adRevenue.createPeriod(PERIOD);
        return {
            label: 'allocate a period',
            path: `/v1/ad-revenue/periods/${period.id}/allocate`,
            body: { entries: [{ creatorUserId: creator, grossCents: 1_000 }] },
            okStatus: 201,
            state: () => adRevenue.listSharesForPeriod(period.id).length,
        };
    },
    () => {
        const shareId = pendingShare();
        return {
            label: 'mark a share paid',
            path: `/v1/ad-revenue/shares/${shareId}/mark-paid`,
            body: { fbmPayoutId: 'payout-1' },
            okStatus: 200,
            state: () => adRevenue.getShare(shareId)?.status,
        };
    },
    () => {
        const shareId = pendingShare();
        return {
            label: 'void a share',
            path: `/v1/ad-revenue/shares/${shareId}/void`,
            okStatus: 200,
            state: () => adRevenue.getShare(shareId)?.status,
        };
    },
    () => {
        const pledgeId = pendingPledge();
        return {
            label: 'capture a boost pledge',
            path: `/v1/community-boosts/pledges/${pledgeId}/capture`,
            body: {},
            okStatus: 200,
            state: () => boosts.getPledge(pledgeId)?.status,
        };
    },
    () => {
        const pledgeId = pendingPledge();
        return {
            label: 'refund a boost pledge',
            path: `/v1/community-boosts/pledges/${pledgeId}/refund`,
            okStatus: 200,
            state: () => boosts.getPledge(pledgeId)?.status,
        };
    },
    () => {
        const subscriptionId = pendingCreatorSub();
        return {
            label: 'capture a creator subscription',
            path: `/v1/creator-subs/subscriptions/${subscriptionId}/capture`,
            body: {},
            okStatus: 200,
            state: () => creatorSubs.getSubscription(subscriptionId)?.status,
        };
    },
    () => {
        const subscriptionId = pendingCreatorSub();
        return {
            label: 'refund a creator subscription',
            path: `/v1/creator-subs/subscriptions/${subscriptionId}/refund`,
            okStatus: 200,
            state: () => creatorSubs.getSubscription(subscriptionId)?.status,
        };
    },
    () => {
        const userId = seedUser();
        return {
            label: 'comp a subscription',
            path: '/v1/subscriptions/admin/comp',
            body: { userId, detail: 'goodwill' },
            okStatus: 200,
            state: () => canopySubscription(userId),
        };
    },
    () => {
        const userId = seedUser();
        return {
            label: 'sync a refund',
            path: '/v1/subscriptions/admin/refund-sync',
            body: { userId, reason: 'requested' },
            okStatus: 200,
            state: () => canopySubscription(userId),
        };
    },
    () => {
        const tipId = pendingTip();
        return {
            label: 'capture a tip',
            path: `/v1/tips/${tipId}/capture`,
            body: {},
            okStatus: 200,
            state: () => tips.getTip(tipId)?.status,
        };
    },
    () => {
        const tipId = pendingTip();
        return {
            label: 'refund a tip',
            path: `/v1/tips/${tipId}/refund`,
            okStatus: 200,
            state: () => tips.getTip(tipId)?.status,
        };
    },
];

const send = (write: AdminWrite, headers: Record<string, string>) =>
    app.request(write.path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: write.body ? JSON.stringify(write.body) : undefined,
    });

const refusal = async (res: Response) => ({
    status: res.status,
    code: ((await res.json()) as { code?: string }).code,
});

const withConfiguredKey = async (fn: () => Promise<void>) => {
    process.env.BLACKOUT_ADMIN_API_KEY = CONFIGURED;
    try {
        await fn();
    } finally {
        delete process.env.BLACKOUT_ADMIN_API_KEY;
    }
};

test('there are twelve admin writes behind the key', () => {
    assert.equal(ADMIN_WRITES.length, 12);
});

test('with no key configured, the former default and every other value are refused and nothing is written', async () => {
    for (const make of ADMIN_WRITES) {
        const write = make();
        const before = write.state();
        for (const headers of [
            { 'x-admin-api-key': FORMER_DEFAULT },
            { 'x-admin-api-key': CONFIGURED },
            {},
        ]) {
            assert.deepEqual(
                await refusal(await send(write, headers)),
                { status: 503, code: 'admin_api_key_not_configured' },
                write.label
            );
        }
        assert.deepEqual(write.state(), before, `${write.label}: nothing written`);
    }
});

test('a blank configured key counts as none', async () => {
    process.env.BLACKOUT_ADMIN_API_KEY = '   ';
    try {
        const write = ADMIN_WRITES[0]!();
        const before = write.state();
        assert.equal((await send(write, { 'x-admin-api-key': '   ' })).status, 503);
        assert.deepEqual(write.state(), before);
    } finally {
        delete process.env.BLACKOUT_ADMIN_API_KEY;
    }
});

test('with a key configured, no header, a wrong value, the former default and a session are refused and nothing is written', async () => {
    const someone = seedUser();
    const session = { authorization: `Bearer ${signJwt(someone, 'someone', 600)}` };
    await withConfiguredKey(async () => {
        for (const make of ADMIN_WRITES) {
            const write = make();
            const before = write.state();
            for (const headers of [
                {},
                { 'x-admin-api-key': `${CONFIGURED}x` },
                { 'x-admin-api-key': CONFIGURED.slice(1) },
                { 'x-admin-api-key': FORMER_DEFAULT },
                session,
            ]) {
                assert.deepEqual(
                    await refusal(await send(write, headers)),
                    { status: 403, code: 'forbidden' },
                    write.label
                );
            }
            assert.deepEqual(write.state(), before, `${write.label}: nothing written`);
        }
    });
});

test('the configured key is allowed on every admin write, and the write happens', async () => {
    await withConfiguredKey(async () => {
        for (const make of ADMIN_WRITES) {
            const write = make();
            const before = write.state();
            const res = await send(write, { 'x-admin-api-key': CONFIGURED });
            assert.equal(res.status, write.okStatus, write.label);
            assert.notDeepEqual(write.state(), before, `${write.label}: written`);
        }
    });
});

test("another creator's ad-revenue share opens to the configured key only", async () => {
    const shareId = pendingShare();
    const stranger = seedUser();
    const read = (headers: Record<string, string>) =>
        app.request(`/v1/ad-revenue/shares/${shareId}`, {
            headers: { authorization: `Bearer ${signJwt(stranger, 'stranger', 600)}`, ...headers },
        });

    assert.equal((await read({ 'x-admin-api-key': FORMER_DEFAULT })).status, 404);
    await withConfiguredKey(async () => {
        assert.equal((await read({})).status, 404);
        assert.equal((await read({ 'x-admin-api-key': FORMER_DEFAULT })).status, 404);
        assert.equal((await read({ 'x-admin-api-key': CONFIGURED })).status, 200);
    });
});

test('the subscription audit timeline needs the configured key', async () => {
    const userId = seedUser();
    const read = (headers: Record<string, string>) =>
        app.request(`/v1/subscriptions/admin/audit/${userId}`, { headers });

    assert.equal((await read({ 'x-admin-api-key': FORMER_DEFAULT })).status, 503);
    await withConfiguredKey(async () => {
        assert.equal((await read({ 'x-admin-api-key': FORMER_DEFAULT })).status, 403);
        assert.equal((await read({ 'x-admin-api-key': CONFIGURED })).status, 200);
    });
});
