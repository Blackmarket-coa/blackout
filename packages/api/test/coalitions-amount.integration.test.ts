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
const { captureTip, getTip } = await import('../src/services/tips');
const { getMarketplaceProvider, resetMarketplaceRegistry } = await import(
    '../src/integrations/marketplace'
);
const { getFreeblackmarketStubInternals } = await import(
    '../src/integrations/marketplace/freeblackmarketStub'
);

/** A seeded stub listing. Its own price is deliberately NOT the contribution. */
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

const LEAD = 'amt-lead';
const GIVER = 'amt-giver';
for (const id of [LEAD, GIVER]) ensureUser(id);

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

test("the contributor's chosen amount is what the checkout is opened for", async () => {
    const { coalitionId, campaignId } = await drive('Real Amount');
    const provider = getMarketplaceProvider('freeblackmarket');
    assert.ok(provider);
    const internals = getFreeblackmarketStubInternals(provider);
    assert.ok(internals);

    const res = await contribute(coalitionId, campaignId, 2_500);
    const text = await res.text();
    assert.equal(res.status, 201, text);
    const body = JSON.parse(text) as { tipId: string; sessionId: string };

    // The listing prices itself at something else entirely. Before the amount
    // travelled, THAT is what the card was charged while Blackout recorded,
    // displayed and metered the $25 the contributor actually chose.
    const session = internals.getSession(body.sessionId);
    assert.ok(session, 'a checkout session was opened');
    assert.equal(session.amountCents, 2_500, 'the chosen amount reaches the rail');
});

test('capture settles on what was charged, not on what was predicted', async () => {
    const { coalitionId, campaignId } = await drive('Settle On Truth');
    const res = await contribute(coalitionId, campaignId, 10_000);
    const { tipId } = JSON.parse(await res.text()) as { tipId: string };

    // Simulate the provider reporting a different figure than the tip predicted.
    // The money that really moved is the truth: crediting a beneficiary for an
    // amount nobody paid is the failure this guards.
    captureTip(tipId, { fbmOrderId: 'fbm-1', chargedCents: 4_000 });

    const tip = getTip(tipId);
    assert.equal(tip?.status, 'captured');
    assert.equal(tip?.grossCents, 4_000, 'settled at the charged amount');
    assert.equal(tip?.feeCents, 120, 'the fee is recomputed at the tip’s own rate');
    assert.equal(tip?.netCents, 3_880);

    const view = (await (
        await app.request(`/v1/coalitions/${coalitionId}/campaigns/${campaignId}`)
    ).json()) as { campaign: { raisedCents: number } };
    assert.equal(view.campaign.raisedCents, 3_880, 'the meter follows the real money');
});

test('a matching charge captures exactly as before', async () => {
    const { coalitionId, campaignId } = await drive('No Surprise');
    const res = await contribute(coalitionId, campaignId, 10_000);
    const { tipId } = JSON.parse(await res.text()) as { tipId: string };

    captureTip(tipId, { fbmOrderId: 'fbm-2', chargedCents: 10_000 });
    const tip = getTip(tipId);
    assert.equal(tip?.grossCents, 10_000);
    assert.equal(tip?.feeCents, 300);
    assert.equal(tip?.netCents, 9_700);
});

test('a provider that reports no amount is trusted as before', async () => {
    const { coalitionId, campaignId } = await drive('Silent Provider');
    const res = await contribute(coalitionId, campaignId, 5_000);
    const { tipId } = JSON.parse(await res.text()) as { tipId: string };

    // Absent, null and malformed all mean "the provider said nothing", so the
    // predicted split stands rather than being zeroed by a bad value.
    captureTip(tipId, { fbmOrderId: 'fbm-3', chargedCents: null });
    const tip = getTip(tipId);
    assert.equal(tip?.grossCents, 5_000);
    assert.equal(tip?.netCents, 4_850);
});

test('the rate a tip was quoted at is stored, so a resettle uses it', async () => {
    const { coalitionId, campaignId } = await drive('Quoted Rate');
    const provider = getMarketplaceProvider('freeblackmarket');
    assert.ok(provider);
    getFreeblackmarketStubInternals(provider)?.setListingFeeBps(STUB_LISTING, 200);

    const res = await contribute(coalitionId, campaignId, 10_000);
    const { tipId } = JSON.parse(await res.text()) as { tipId: string };
    assert.equal(getTip(tipId)?.feeBps, 200, 'the quoted rate is on the tip');

    // Resettling must use the rate this tip was quoted, not today's table rate.
    captureTip(tipId, { fbmOrderId: 'fbm-4', chargedCents: 5_000 });
    const tip = getTip(tipId);
    assert.equal(tip?.feeCents, 100, '2% of the amount actually charged');
    assert.equal(tip?.netCents, 4_900);
});
