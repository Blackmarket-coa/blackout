import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.FREEBLACKMARKET_BASE_URL =
    process.env.FREEBLACKMARKET_BASE_URL ?? 'https://api.freeblackmarket.test';
process.env.FREEBLACKMARKET_API_KEY = process.env.FREEBLACKMARKET_API_KEY ?? 'test-api-key';
process.env.FREEBLACKMARKET_WEBHOOK_SECRET =
    process.env.FREEBLACKMARKET_WEBHOOK_SECRET ?? 'test-webhook-secret';
process.env.FREEBLACKMARKET_STUB = process.env.FREEBLACKMARKET_STUB ?? '1';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.BLACKOUT_ADMIN_API_KEY = process.env.BLACKOUT_ADMIN_API_KEY ?? 'test-admin-key';

const ADMIN_KEY = 'test-admin-key';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { resetTipsForTest, captureTip } = await import('../src/services/tips');
const { resetAidPoolsForTest } = await import('../src/services/aidPools');
const { resetAdRevenueForTest } = await import('../src/services/adRevenue');

const ORGANIZER = 'phase4-organizer';
const DONOR_A = 'phase4-donor-a';
const DONOR_B = 'phase4-donor-b';
const CREATOR_X = 'phase4-creator-x';
const CREATOR_Y = 'phase4-creator-y';

function ensureUser(id: string): void {
    if (db.getUserById(id)) return;
    db.createUser({
        id,
        username: id,
        email: `${id}@blackout.test`,
        passwordHash: 'test-hash',
        reputationScore: 100,
        reputationTier: 'member',
        pubkeyEd25519: `${id}-pubkey`,
    });
}

function headersFor(id: string): Record<string, string> {
    ensureUser(id);
    return {
        authorization: `Bearer ${signJwt(id, id, 600)}`,
        'content-type': 'application/json',
    };
}

function adminHeaders(): Record<string, string> {
    return { 'content-type': 'application/json', 'x-admin-api-key': ADMIN_KEY };
}

function setup(): void {
    resetAidPoolsForTest();
    resetAdRevenueForTest();
    resetTipsForTest();
    [ORGANIZER, DONOR_A, DONOR_B, CREATOR_X, CREATOR_Y].forEach(ensureUser);
}

interface PoolBody {
    id: string;
    organizerUserId: string;
    title: string;
    goalCents: number;
    raisedCents: number;
    feeCents: number;
    netCents: number;
    contributionCount: number;
    uniqueContributorCount: number;
    percent: number;
    status: 'open' | 'fulfilled' | 'closed';
}

interface PeriodBody {
    id: string;
    totalCents: number;
    currency: string;
    status: 'draft' | 'allocated' | 'paid' | 'closed';
    shareCount: number;
    allocatedGrossCents: number;
    allocatedNetCents: number;
}

interface ShareBody {
    id: string;
    creatorUserId: string;
    grossCents: number;
    feeCents: number;
    netCents: number;
    status: 'pending_payout' | 'paid' | 'voided';
    fbmPayoutId: string | null;
}

// =============================================================================
// Aid pools
// =============================================================================

test('POST /v1/aid-pools creates an aid pool with raisedCents=0', async () => {
    setup();
    const r = await app.request('/v1/aid-pools', {
        method: 'POST',
        headers: headersFor(ORGANIZER),
        body: JSON.stringify({
            title: 'Wildfire relief',
            description: 'Help neighbors after the fire',
            goalCents: 100_000,
            currency: 'USD',
        }),
    });
    assert.equal(r.status, 201);
    const { pool } = (await r.json()) as { pool: PoolBody };
    assert.equal(pool.organizerUserId, ORGANIZER);
    assert.equal(pool.goalCents, 100_000);
    assert.equal(pool.raisedCents, 0);
    assert.equal(pool.status, 'open');
});

test('POST /v1/aid-pools rejects below-floor or above-ceiling goals', async () => {
    setup();
    const tooSmall = await app.request('/v1/aid-pools', {
        method: 'POST',
        headers: headersFor(ORGANIZER),
        body: JSON.stringify({ title: 'tiny', goalCents: 50, currency: 'USD' }),
    });
    assert.equal(tooSmall.status, 400);
});

test('POST /v1/aid-pools/:id/contribute creates a tip; capture moves the pool toward its goal', async () => {
    setup();
    const created = await app.request('/v1/aid-pools', {
        method: 'POST',
        headers: headersFor(ORGANIZER),
        body: JSON.stringify({ title: 'food bank', goalCents: 5_000, currency: 'USD' }),
    });
    const { pool } = (await created.json()) as { pool: PoolBody };

    const cR = await app.request(`/v1/aid-pools/${pool.id}/contribute`, {
        method: 'POST',
        headers: headersFor(DONOR_A),
        body: JSON.stringify({ amountCents: 1_000, note: 'good luck' }),
    });
    assert.equal(cR.status, 201);
    const { tip } = (await cR.json()) as { tip: { id: string; status: string } };
    assert.equal(tip.status, 'pending');
    captureTip(tip.id, { fbmOrderId: 'fbm-aid-1' });

    const fetched = await app.request(`/v1/aid-pools/${pool.id}`, { method: 'GET' });
    const { pool: refreshed } = (await fetched.json()) as { pool: PoolBody };
    assert.equal(refreshed.raisedCents, 1_000);
    assert.equal(refreshed.feeCents, 30);
    assert.equal(refreshed.netCents, 970);
    assert.equal(refreshed.contributionCount, 1);
    assert.equal(refreshed.uniqueContributorCount, 1);
    assert.equal(refreshed.percent, 20);
});

test('Aid pool aggregates multiple captured tips and counts unique donors', async () => {
    setup();
    const created = await app.request('/v1/aid-pools', {
        method: 'POST',
        headers: headersFor(ORGANIZER),
        body: JSON.stringify({ title: 'medical', goalCents: 10_000, currency: 'USD' }),
    });
    const { pool } = (await created.json()) as { pool: PoolBody };

    for (const [donor, amount] of [
        [DONOR_A, 1_000],
        [DONOR_A, 500],
        [DONOR_B, 2_000],
    ] as const) {
        const cR = await app.request(`/v1/aid-pools/${pool.id}/contribute`, {
            method: 'POST',
            headers: headersFor(donor),
            body: JSON.stringify({ amountCents: amount }),
        });
        const { tip } = (await cR.json()) as { tip: { id: string } };
        captureTip(tip.id, { fbmOrderId: `fbm-${donor}-${amount}` });
    }

    const r = await app.request(`/v1/aid-pools/${pool.id}`, { method: 'GET' });
    const { pool: agg } = (await r.json()) as { pool: PoolBody };
    assert.equal(agg.raisedCents, 3_500);
    assert.equal(agg.contributionCount, 3);
    assert.equal(agg.uniqueContributorCount, 2);
    assert.equal(agg.percent, 35);
});

test('POST /v1/aid-pools/:id/fulfill is restricted to the organizer', async () => {
    setup();
    const created = await app.request('/v1/aid-pools', {
        method: 'POST',
        headers: headersFor(ORGANIZER),
        body: JSON.stringify({ title: 'rent', goalCents: 5_000, currency: 'USD' }),
    });
    const { pool } = (await created.json()) as { pool: PoolBody };

    const denied = await app.request(`/v1/aid-pools/${pool.id}/fulfill`, {
        method: 'POST',
        headers: headersFor(DONOR_A),
    });
    assert.equal(denied.status, 403);

    const allowed = await app.request(`/v1/aid-pools/${pool.id}/fulfill`, {
        method: 'POST',
        headers: headersFor(ORGANIZER),
    });
    assert.equal(allowed.status, 200);
    const { pool: after } = (await allowed.json()) as { pool: PoolBody };
    assert.equal(after.status, 'fulfilled');
});

test('POST /v1/aid-pools/:id/contribute rejects contributions to a closed pool', async () => {
    setup();
    const created = await app.request('/v1/aid-pools', {
        method: 'POST',
        headers: headersFor(ORGANIZER),
        body: JSON.stringify({ title: 'over', goalCents: 5_000, currency: 'USD' }),
    });
    const { pool } = (await created.json()) as { pool: PoolBody };
    await app.request(`/v1/aid-pools/${pool.id}/close`, {
        method: 'POST',
        headers: headersFor(ORGANIZER),
    });

    const r = await app.request(`/v1/aid-pools/${pool.id}/contribute`, {
        method: 'POST',
        headers: headersFor(DONOR_A),
        body: JSON.stringify({ amountCents: 500 }),
    });
    assert.equal(r.status, 410);
    const body = (await r.json()) as { code: string };
    assert.equal(body.code, 'pool_closed');
});

test('Self-organizer contribution to own pool is rejected (self-tip block)', async () => {
    setup();
    const created = await app.request('/v1/aid-pools', {
        method: 'POST',
        headers: headersFor(ORGANIZER),
        body: JSON.stringify({ title: 'self', goalCents: 1_000, currency: 'USD' }),
    });
    const { pool } = (await created.json()) as { pool: PoolBody };

    const r = await app.request(`/v1/aid-pools/${pool.id}/contribute`, {
        method: 'POST',
        headers: headersFor(ORGANIZER),
        body: JSON.stringify({ amountCents: 100 }),
    });
    assert.equal(r.status, 400);
    const body = (await r.json()) as { code: string };
    assert.equal(body.code, 'tip_failed');
});

// =============================================================================
// Ad-revenue share batch
// =============================================================================

test('POST /v1/ad-revenue/periods is admin-gated', async () => {
    setup();
    const denied = await app.request('/v1/ad-revenue/periods', {
        method: 'POST',
        headers: headersFor(CREATOR_X),
        body: JSON.stringify({
            periodStart: '2026-04-01T00:00:00.000Z',
            periodEnd: '2026-05-01T00:00:00.000Z',
            totalCents: 100_000,
            currency: 'USD',
        }),
    });
    assert.equal(denied.status, 403);
});

test('Admin can create a period in draft and allocate shares with the 3% split', async () => {
    setup();
    const periodR = await app.request('/v1/ad-revenue/periods', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
            periodStart: '2026-04-01T00:00:00.000Z',
            periodEnd: '2026-05-01T00:00:00.000Z',
            totalCents: 100_000,
            currency: 'USD',
            notes: 'April 2026 ads',
        }),
    });
    assert.equal(periodR.status, 201);
    const { period } = (await periodR.json()) as { period: PeriodBody };
    assert.equal(period.status, 'draft');

    const allocR = await app.request(`/v1/ad-revenue/periods/${period.id}/allocate`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
            entries: [
                { creatorUserId: CREATOR_X, grossCents: 60_000 },
                { creatorUserId: CREATOR_Y, grossCents: 40_000 },
            ],
        }),
    });
    assert.equal(allocR.status, 201);
    const { period: after, shares } = (await allocR.json()) as {
        period: PeriodBody;
        shares: ShareBody[];
    };
    assert.equal(after.status, 'allocated');
    assert.equal(after.shareCount, 2);
    assert.equal(shares.length, 2);
    const xShare = shares.find((s) => s.creatorUserId === CREATOR_X)!;
    assert.equal(xShare.grossCents, 60_000);
    assert.equal(xShare.feeCents, 1_800);
    assert.equal(xShare.netCents, 58_200);
    assert.equal(xShare.status, 'pending_payout');
});

test('Allocate rejects entries summing above the period total', async () => {
    setup();
    const { period } = (await (
        await app.request('/v1/ad-revenue/periods', {
            method: 'POST',
            headers: adminHeaders(),
            body: JSON.stringify({
                periodStart: '2026-04-01T00:00:00.000Z',
                periodEnd: '2026-05-01T00:00:00.000Z',
                totalCents: 1_000,
                currency: 'USD',
            }),
        })
    ).json()) as { period: PeriodBody };

    const r = await app.request(`/v1/ad-revenue/periods/${period.id}/allocate`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
            entries: [
                { creatorUserId: CREATOR_X, grossCents: 600 },
                { creatorUserId: CREATOR_Y, grossCents: 600 },
            ],
        }),
    });
    assert.equal(r.status, 400);
    const body = (await r.json()) as { code: string };
    assert.equal(body.code, 'totals_exceed_period');
});

test('Allocate rejects duplicate creators and unknown creators', async () => {
    setup();
    const { period } = (await (
        await app.request('/v1/ad-revenue/periods', {
            method: 'POST',
            headers: adminHeaders(),
            body: JSON.stringify({
                periodStart: '2026-04-01T00:00:00.000Z',
                periodEnd: '2026-05-01T00:00:00.000Z',
                totalCents: 100_000,
                currency: 'USD',
            }),
        })
    ).json()) as { period: PeriodBody };

    const dup = await app.request(`/v1/ad-revenue/periods/${period.id}/allocate`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
            entries: [
                { creatorUserId: CREATOR_X, grossCents: 100 },
                { creatorUserId: CREATOR_X, grossCents: 200 },
            ],
        }),
    });
    assert.equal(dup.status, 409);

    const unknown = await app.request(`/v1/ad-revenue/periods/${period.id}/allocate`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
            entries: [{ creatorUserId: 'nope', grossCents: 100 }],
        }),
    });
    assert.equal(unknown.status, 404);
});

test('mark-paid records the FBM payout id; period flips to paid once all shares are paid', async () => {
    setup();
    const periodR = await app.request('/v1/ad-revenue/periods', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
            periodStart: '2026-04-01T00:00:00.000Z',
            periodEnd: '2026-05-01T00:00:00.000Z',
            totalCents: 10_000,
            currency: 'USD',
        }),
    });
    const { period } = (await periodR.json()) as { period: PeriodBody };
    const allocR = await app.request(`/v1/ad-revenue/periods/${period.id}/allocate`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
            entries: [
                { creatorUserId: CREATOR_X, grossCents: 6_000 },
                { creatorUserId: CREATOR_Y, grossCents: 4_000 },
            ],
        }),
    });
    const { shares } = (await allocR.json()) as { shares: ShareBody[] };

    const firstPaid = await app.request(`/v1/ad-revenue/shares/${shares[0]!.id}/mark-paid`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ fbmPayoutId: 'fbm-payout-1' }),
    });
    assert.equal(firstPaid.status, 200);

    let pR = await app.request(`/v1/ad-revenue/periods/${period.id}`, { method: 'GET' });
    let pBody = (await pR.json()) as { period: PeriodBody };
    assert.equal(pBody.period.status, 'allocated', 'period should still be allocated until both shares are paid');

    const secondPaid = await app.request(`/v1/ad-revenue/shares/${shares[1]!.id}/mark-paid`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ fbmPayoutId: 'fbm-payout-2' }),
    });
    assert.equal(secondPaid.status, 200);

    pR = await app.request(`/v1/ad-revenue/periods/${period.id}`, { method: 'GET' });
    pBody = (await pR.json()) as { period: PeriodBody };
    assert.equal(pBody.period.status, 'paid');
});

test('mark-paid rejects already-paid shares (409)', async () => {
    setup();
    const periodR = await app.request('/v1/ad-revenue/periods', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
            periodStart: '2026-04-01T00:00:00.000Z',
            periodEnd: '2026-05-01T00:00:00.000Z',
            totalCents: 1_000,
            currency: 'USD',
        }),
    });
    const { period } = (await periodR.json()) as { period: PeriodBody };
    const allocR = await app.request(`/v1/ad-revenue/periods/${period.id}/allocate`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ entries: [{ creatorUserId: CREATOR_X, grossCents: 500 }] }),
    });
    const { shares } = (await allocR.json()) as { shares: ShareBody[] };

    await app.request(`/v1/ad-revenue/shares/${shares[0]!.id}/mark-paid`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ fbmPayoutId: 'fbm-1' }),
    });
    const second = await app.request(`/v1/ad-revenue/shares/${shares[0]!.id}/mark-paid`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ fbmPayoutId: 'fbm-2' }),
    });
    assert.equal(second.status, 409);
});

test('GET /v1/ad-revenue/me returns the authenticated creators own shares', async () => {
    setup();
    const periodR = await app.request('/v1/ad-revenue/periods', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
            periodStart: '2026-04-01T00:00:00.000Z',
            periodEnd: '2026-05-01T00:00:00.000Z',
            totalCents: 10_000,
            currency: 'USD',
        }),
    });
    const { period } = (await periodR.json()) as { period: PeriodBody };
    await app.request(`/v1/ad-revenue/periods/${period.id}/allocate`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
            entries: [
                { creatorUserId: CREATOR_X, grossCents: 5_000 },
                { creatorUserId: CREATOR_Y, grossCents: 5_000 },
            ],
        }),
    });

    const xR = await app.request('/v1/ad-revenue/me', {
        method: 'GET',
        headers: headersFor(CREATOR_X),
    });
    const { shares } = (await xR.json()) as { shares: ShareBody[] };
    assert.equal(shares.length, 1);
    assert.equal(shares[0]!.creatorUserId, CREATOR_X);
    assert.equal(shares[0]!.netCents, 4_850);
});
