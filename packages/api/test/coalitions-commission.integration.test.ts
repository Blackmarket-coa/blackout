import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'wss://livekit.local';
process.env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? 'lk_test_key';
process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? 'lk_test_secret';
process.env.FREEBLACKMARKET_STUB = '1';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { __resetCoalitionsForTests } = await import('../src/services/coalitionNetworkStore');
const { __setCoalitionMatrixForTests } = await import('../src/services/coalitionSpaces');
const { getTip } = await import('../src/services/tips');
const { COALITION_COMMISSION_BPS, assertFlatCommission, previewContribution } = await import(
    '../src/services/coalitionDrives'
);
const { getMarketplaceProvider, resetMarketplaceRegistry } = await import(
    '../src/integrations/marketplace'
);
const { getFreeblackmarketStubInternals } = await import(
    '../src/integrations/marketplace/freeblackmarketStub'
);

const STUB_LISTING = 'stub-theme-noir';

function auth(user: string): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(user, user, 600)}`,
        'content-type': 'application/json',
    };
}

function ensureUser(id: string): void {
    if (db.getUserById(id)) return;
    db.createUser({
        id,
        username: id,
        email: `${id}@example.test`,
        passwordHash: 'hash',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: `pk-${id}`,
    });
}

const LEAD = 'fee-lead';
const GIVER = 'fee-giver';
for (const id of [LEAD, GIVER]) ensureUser(id);

/** Put the listing's seller on a plan that quotes `bps`, or clear the quote. */
function quoteSellerAt(bps: number | null): void {
    const provider = getMarketplaceProvider('freeblackmarket');
    const internals = provider ? getFreeblackmarketStubInternals(provider) : undefined;
    assert.ok(internals, 'the stub provider must be active for these tests');
    internals.setListingFeeBps(STUB_LISTING, bps);
}

async function drive(name: string): Promise<{ coalitionId: string; campaignId: string }> {
    const founded = await app.request('/v1/coalitions', {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ name, mission: 'Fund the block' }),
    });
    const foundedText = await founded.text();
    assert.equal(founded.status, 201, foundedText);
    const coalitionId = (JSON.parse(foundedText) as { coalition: { id: string } }).coalition.id;

    const launched = await app.request(`/v1/coalitions/${coalitionId}/campaigns`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ type: 'drive', title: 'Coats', goalCents: 100_000 }),
    });
    const launchedText = await launched.text();
    assert.equal(launched.status, 201, launchedText);
    const campaignId = (JSON.parse(launchedText) as { campaign: { id: string } }).campaign.id;

    // `fbmListingId` is deliberately not client-writable; set it server-side.
    const campaign = db.getCoalitionCampaign(campaignId);
    assert.ok(campaign);
    db.upsertCoalitionCampaign({ ...campaign, fbmListingId: STUB_LISTING });
    return { coalitionId, campaignId };
}

const contribute = (coalitionId: string, campaignId: string, amountCents: number) =>
    app.request(`/v1/coalitions/${coalitionId}/campaigns/${campaignId}/contribute`, {
        method: 'POST',
        headers: auth(GIVER),
        body: JSON.stringify({ amountCents }),
    });

test.beforeEach(() => {
    __resetCoalitionsForTests();
    __setCoalitionMatrixForTests(null);
    resetMarketplaceRegistry();
});

test('3% is the default — a seller on the free plan pays the standard rate', async () => {
    const { coalitionId, campaignId } = await drive('Standard Rate');
    const res = await contribute(coalitionId, campaignId, 10_000);
    const text = await res.text();
    assert.equal(res.status, 201, text);
    const body = JSON.parse(text) as { split: { feeCents: number; feeBps: number } };
    assert.equal(body.split.feeBps, 300);
    assert.equal(body.split.feeCents, 300);
});

test('a subscription lowers it, and the discount reaches the persisted tip', async () => {
    const { coalitionId, campaignId } = await drive('Paid Plan');
    // The `pro` rung of FBM's ladder: $99/mo, 2%.
    quoteSellerAt(200);

    const res = await contribute(coalitionId, campaignId, 10_000);
    const text = await res.text();
    assert.equal(res.status, 201, text);
    const body = JSON.parse(text) as {
        tipId: string;
        split: { feeCents: number; netCents: number; feeBps: number };
    };
    assert.equal(body.split.feeBps, 200, 'the rate actually charged, not the table rate');
    assert.equal(body.split.feeCents, 200);
    assert.equal(body.split.netCents, 9_800);

    // The tip is the obligation, so the discount has to be baked into its
    // cents — not re-derived later, where the two could disagree.
    const tip = getTip(body.tipId);
    assert.equal(tip?.feeCents, 200);
    assert.equal(tip?.netCents, 9_800);
});

test('the preview quotes the same rate the contribution will charge', async () => {
    const { coalitionId, campaignId } = await drive('Honest Preview');
    quoteSellerAt(150);

    const res = await app.request(
        `/v1/coalitions/${coalitionId}/campaigns/${campaignId}/contribution-preview?amountCents=10000`
    );
    const text = await res.text();
    assert.equal(res.status, 200, text);
    const { split } = JSON.parse(text) as {
        split: { feeCents: number; netCents: number; feeBps: number };
    };
    assert.deepEqual(split, {
        grossCents: 10_000,
        feeCents: 150,
        netCents: 9_850,
        feeBps: 150,
    });

    const charged = await contribute(coalitionId, campaignId, 10_000);
    const chargedBody = JSON.parse(await charged.text()) as { split: { feeCents: number } };
    assert.equal(chargedBody.split.feeCents, split.feeCents, 'preview must not undersell');
});

test('a quote above the ceiling is refused, never clamped and displayed as 3%', async () => {
    const { coalitionId, campaignId } = await drive('Over The Line');
    quoteSellerAt(500);
    // Tips outlive the coalition reset, so count the delta rather than the total.
    const tipsBefore = db.listTipsBySender(GIVER).length;

    const res = await contribute(coalitionId, campaignId, 10_000);
    const text = await res.text();
    // Refusing is the point: showing a 3% split while the marketplace takes 5%
    // would make the number a contributor agreed to a lie.
    assert.equal(res.status, 503, text);
    const body = JSON.parse(text) as { reason?: string };
    assert.equal(body.reason, 'commission_above_ceiling');

    // And nothing was recorded — no obligation for money we refused to take.
    assert.equal(db.listTipsBySender(GIVER).length, tipsBefore);
});

test('an unreachable quote falls back to the standard rate rather than stopping the drive', async () => {
    const { coalitionId, campaignId } = await drive('Provider Hiccup');
    const provider = getMarketplaceProvider('freeblackmarket');
    assert.ok(provider);
    const original = provider.getListingFeeBps;
    provider.getListingFeeBps = async () => {
        throw new Error('fbm is down');
    };
    try {
        const res = await contribute(coalitionId, campaignId, 10_000);
        const text = await res.text();
        assert.equal(res.status, 201, text);
        assert.equal(
            (JSON.parse(text) as { split: { feeBps: number } }).split.feeBps,
            300,
            'an outage must not stop contributions'
        );
    } finally {
        provider.getListingFeeBps = original;
    }
});

test('the ceiling guard allows a table below 3% and refuses one above it', () => {
    assert.equal(COALITION_COMMISSION_BPS, 300);
    // The table sitting at or under the standard rate is the normal case now.
    assert.doesNotThrow(() => assertFlatCommission());
    // A provider whose table rate exceeds the ceiling has no entry here at all;
    // the guard's job is to refuse rather than quietly charge it.
    assert.throws(
        () => assertFlatCommission('blamazon'),
        /must not exceed 300 bps/,
        'a 10% table rate is not a coalition rate'
    );
});

test('the standard rate is never tiered by coalition size or amount', async () => {
    const { coalitionId, campaignId } = await drive('No Tiers');
    for (const amount of [100, 10_000, 1_000_000]) {
        const split = await previewContribution(amount, STUB_LISTING);
        assert.equal(split.feeBps, 300, `${amount} must still be 3%`);
    }
    assert.ok(coalitionId && campaignId);
});
