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
// A contribution now records nothing unless a checkout can actually be opened,
// so these tests run against the stub marketplace rather than asserting the
// old behaviour, where a drive with no listing behind it still wrote a pending
// obligation nobody could ever collect.
process.env.FREEBLACKMARKET_STUB = '1';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { __resetCoalitionsForTests } = await import('../src/services/coalitionNetworkStore');
const { __setCoalitionMatrixForTests } = await import('../src/services/coalitionSpaces');
const { captureTip, refundTip } = await import('../src/services/tips');
const { previewContribution, assertFlatCommission, COALITION_COMMISSION_BPS } = await import(
    '../src/services/coalitionDrives'
);
const { listBounties } = await import('../src/services/bountyStore');
const { resetMarketplaceRegistry } = await import('../src/integrations/marketplace');

/** A published listing the stub provider already carries. */
const STUB_LISTING = 'stub-theme-noir';

/**
 * Point a campaign at a real listing. `fbmListingId` is deliberately not
 * client-writable — it decides which listing takes a contributor's money — so
 * a test sets it the way the server would.
 */
function attachListing(campaignId: string, listingId = STUB_LISTING): void {
    const campaign = db.getCoalitionCampaign(campaignId);
    if (!campaign) throw new Error(`no campaign ${campaignId}`);
    db.upsertCoalitionCampaign({ ...campaign, fbmListingId: listingId });
}

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

const LEAD = 'drv-lead';
const GIVER = 'drv-giver';
const OTHER = 'drv-other';
for (const id of [LEAD, GIVER, OTHER]) ensureUser(id);

async function foundCoalition(name: string) {
    const res = await app.request('/v1/coalitions', {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ name, mission: 'Raise what the block needs' }),
    });
    const text = await res.text();
    assert.equal(res.status, 201, text);
    return (JSON.parse(text) as { coalition: { id: string } }).coalition;
}

async function launchCampaign(coalitionId: string, body: Record<string, unknown>) {
    const res = await app.request(`/v1/coalitions/${coalitionId}/campaigns`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify(body),
    });
    const text = await res.text();
    assert.equal(res.status, 201, text);
    return (JSON.parse(text) as { campaign: { id: string; status: string; bountyId?: string } })
        .campaign;
}

test.beforeEach(() => {
    __resetCoalitionsForTests();
    __setCoalitionMatrixForTests(null);
    resetMarketplaceRegistry();
});

test('commission defaults to 3% and the split is computed, never assumed', async () => {
    assert.equal(COALITION_COMMISSION_BPS, 300);
    assert.doesNotThrow(() => assertFlatCommission());
    assert.deepEqual(await previewContribution(10_000), {
        grossCents: 10_000,
        feeCents: 300,
        netCents: 9_700,
        feeBps: 300,
    });
    // The rate does not move with size — a large drive pays the same 3%.
    assert.deepEqual(await previewContribution(1_000_000), {
        grossCents: 1_000_000,
        feeCents: 30_000,
        netCents: 970_000,
        feeBps: 300,
    });
});

test('contributing records a pending tip with the 3% split and no money moves yet', async () => {
    const coalition = await foundCoalition('Block Fund');
    const campaign = await launchCampaign(coalition.id, {
        type: 'drive',
        title: 'Winter coats',
        goalCents: 50_000,
    });
    attachListing(campaign.id);

    const res = await app.request(
        `/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/contribute`,
        { method: 'POST', headers: auth(GIVER), body: JSON.stringify({ amountCents: 2_500 }) }
    );
    assert.equal(res.status, 201);
    const body = (await res.json()) as {
        tipId: string;
        status: string;
        split: { grossCents: number; feeCents: number; netCents: number };
        redirectUrl: string | null;
        checkoutError?: string;
    };
    assert.equal(body.status, 'pending', 'money moves only when FBM confirms');
    assert.deepEqual(body.split, { grossCents: 2_500, feeCents: 75, netCents: 2_425, feeBps: 300 });

    // The campaign meter has not moved: nothing was captured.
    const before = (await (
        await app.request(`/v1/coalitions/${coalition.id}/campaigns/${campaign.id}`)
    ).json()) as { campaign: { raisedCents: number; contributorCount: number } };
    assert.equal(before.campaign.raisedCents, 0);
    assert.equal(before.campaign.contributorCount, 0);

    // Capture is what advances it — and it advances by NET, not gross.
    captureTip(body.tipId, { fbmOrderId: 'fbm-order-1' });
    const after = (await (
        await app.request(`/v1/coalitions/${coalition.id}/campaigns/${campaign.id}`)
    ).json()) as { campaign: { raisedCents: number; contributorCount: number } };
    assert.equal(after.campaign.raisedCents, 2_425);
    assert.equal(after.campaign.contributorCount, 1);
});

test('a replayed capture never double-counts, and a second gift from the same person counts once as a contributor', async () => {
    const coalition = await foundCoalition('Replay Safe');
    const campaign = await launchCampaign(coalition.id, {
        type: 'drive',
        title: 'Seeds',
        goalCents: 10_000,
    });
    attachListing(campaign.id);
    const contribute = async (user: string, amountCents: number) => {
        const res = await app.request(
            `/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/contribute`,
            { method: 'POST', headers: auth(user), body: JSON.stringify({ amountCents }) }
        );
        return ((await res.json()) as { tipId: string }).tipId;
    };

    const first = await contribute(GIVER, 1_000);
    captureTip(first, { fbmOrderId: 'o-1' });
    captureTip(first, { fbmOrderId: 'o-1' }); // webhook redelivery

    const second = await contribute(GIVER, 1_000);
    captureTip(second, { fbmOrderId: 'o-2' });
    const third = await contribute(OTHER, 500);
    captureTip(third, { fbmOrderId: 'o-3' });

    const view = (await (
        await app.request(`/v1/coalitions/${coalition.id}/campaigns/${campaign.id}`)
    ).json()) as { campaign: { raisedCents: number; contributorCount: number } };
    // 970 + 970 + 485, counted once each.
    assert.equal(view.campaign.raisedCents, 2_425);
    assert.equal(view.campaign.contributorCount, 2, 'two distinct supporters');

    const wall = (await (
        await app.request(`/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/contributions`)
    ).json()) as {
        contributions: Array<{ supporterUserId: string; supporter: { username: string } }>;
    };
    assert.equal(wall.contributions.length, 3);
    assert.equal(wall.contributions[0].supporter.username, OTHER);
});

test('a refunded contribution does not advance the meter', async () => {
    const coalition = await foundCoalition('Refunds');
    const campaign = await launchCampaign(coalition.id, {
        type: 'drive',
        title: 'Tools',
        goalCents: 5_000,
    });
    const res = await app.request(
        `/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/contribute`,
        { method: 'POST', headers: auth(GIVER), body: JSON.stringify({ amountCents: 1_000 }) }
    );
    const { tipId } = (await res.json()) as { tipId: string };
    refundTip(tipId);
    const view = (await (
        await app.request(`/v1/coalitions/${coalition.id}/campaigns/${campaign.id}`)
    ).json()) as { campaign: { raisedCents: number } };
    assert.equal(view.campaign.raisedCents, 0);
});

test('contributions are refused for campaigns that are not active', async () => {
    const coalition = await foundCoalition('Closed Doors');
    const campaign = await launchCampaign(coalition.id, {
        type: 'drive',
        title: 'Old',
        goalCents: 100,
    });
    await app.request(`/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/status`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ status: 'completed' }),
    });
    const res = await app.request(
        `/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/contribute`,
        { method: 'POST', headers: auth(GIVER), body: JSON.stringify({ amountCents: 1_000 }) }
    );
    assert.equal(res.status, 409);
    assert.equal(((await res.json()) as { code: string }).code, 'campaign_inactive');
});

test('a project campaign posts to the existing bounty board, scoped to the coalition', async () => {
    const coalition = await foundCoalition('Builders');
    const campaign = await launchCampaign(coalition.id, {
        type: 'project',
        title: 'Joint drop artwork',
        description: 'Cover art for the joint release',
        bounty: {
            rewardType: 'revenue_share',
            rewardSummary: '15% of the drop, split three ways',
            requirements: ['Portfolio link'],
            deliverables: ['Cover art', 'Three variants'],
        },
    });
    assert.ok(campaign.bountyId, 'campaign links the bounty it posted');

    const scoped = listBounties({ coalitionId: coalition.id });
    assert.equal(scoped.length, 1);
    assert.equal(scoped[0].id, campaign.bountyId);
    assert.equal(scoped[0].category, 'coalition');
    assert.equal(scoped[0].rewardSummary, '15% of the drop, split three ways');
    assert.deepEqual(scoped[0].deliverables, ['Cover art', 'Three variants']);

    // It is the same board the Creator Hub reads.
    const viaApi = (await (
        await app.request(`/v1/bounties?coalitionId=${encodeURIComponent(coalition.id)}`)
    ).json()) as { bounties: Array<{ id: string }> };
    assert.equal(viaApi.bounties.length, 1);
    assert.equal(viaApi.bounties[0].id, campaign.bountyId);
});

test('raising a mutual-aid post amplifies it without copying it, and boosts rank it', async () => {
    const coalition = await foundCoalition('Amplifiers');
    await app.request(`/v1/coalitions/${coalition.id}/join`, {
        method: 'POST',
        headers: auth(GIVER),
    });
    await app.request(`/v1/coalitions/${coalition.id}/join`, {
        method: 'POST',
        headers: auth(OTHER),
    });

    const post = db.createCoalitionAidPost({
        id: 'aid-post-1',
        customerId: 'someone-else',
        type: 'need',
        category: 'food',
        title: 'Groceries for the week',
        description: 'Family of four, one income lost',
        urgency: 'high',
        status: 'open',
        denId: '!den:blackout',
        displayRadiusMeters: 0,
    } as never);

    const raised = await app.request(`/v1/coalitions/${coalition.id}/raise-aid`, {
        method: 'POST',
        headers: auth(GIVER),
        body: JSON.stringify({ aidPostId: post.id }),
    });
    assert.equal(raised.status, 201);
    const campaign = (
        (await raised.json()) as {
            campaign: { id: string; aidPostId: string; type: string; status: string };
        }
    ).campaign;
    assert.equal(campaign.type, 'mutual_aid');
    assert.equal(campaign.aidPostId, post.id, 'points at the post rather than copying it');
    assert.equal(campaign.status, 'active', 'raising needs no steward gate');

    // Raising twice is idempotent — no duplicate campaign.
    const again = await app.request(`/v1/coalitions/${coalition.id}/raise-aid`, {
        method: 'POST',
        headers: auth(OTHER),
        body: JSON.stringify({ aidPostId: post.id }),
    });
    assert.equal(((await again.json()) as { campaign: { id: string } }).campaign.id, campaign.id);

    const base = (await (await app.request(`/v1/coalitions/${coalition.id}/amplified`)).json()) as {
        amplified: Array<{ aidPostId: string; boost: { visibilityMultiplier: number } }>;
    };
    assert.equal(base.amplified.length, 1);
    const unboosted = base.amplified[0].boost.visibilityMultiplier;

    await app.request(`/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/boost`, {
        method: 'POST',
        headers: auth(GIVER),
    });
    await app.request(`/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/boost`, {
        method: 'POST',
        headers: auth(OTHER),
    });

    const lifted = (await (
        await app.request(`/v1/coalitions/${coalition.id}/amplified`)
    ).json()) as {
        amplified: Array<{ boost: { visibilityMultiplier: number; members: number } }>;
    };
    assert.equal(lifted.amplified[0].boost.members, 2);
    assert.ok(
        lifted.amplified[0].boost.visibilityMultiplier > unboosted,
        'member boosts lift the request the same way a Surge lifts a project'
    );
});

test('only members can raise aid, and an unknown post is refused', async () => {
    const coalition = await foundCoalition('Gatekept');
    const post = db.createCoalitionAidPost({
        id: 'aid-post-2',
        customerId: 'someone',
        type: 'need',
        category: 'care',
        title: 'Rides to dialysis',
        description: 'Tuesdays and Thursdays',
        urgency: 'critical',
        status: 'open',
        denId: '!den:blackout',
        displayRadiusMeters: 0,
    } as never);

    const outsider = await app.request(`/v1/coalitions/${coalition.id}/raise-aid`, {
        method: 'POST',
        headers: auth(OTHER),
        body: JSON.stringify({ aidPostId: post.id }),
    });
    assert.equal(outsider.status, 403);

    const missing = await app.request(`/v1/coalitions/${coalition.id}/raise-aid`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ aidPostId: 'nope' }),
    });
    assert.equal(missing.status, 404);
});
