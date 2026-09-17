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
const { allocatePayeeCents, campaignPayeeSharesAreValid } = await import('@blackout/core');
const { __resetCoalitionsForTests } = await import('../src/services/coalitionNetworkStore');
const { __setCoalitionMatrixForTests } = await import('../src/services/coalitionSpaces');
const { resetMarketplaceRegistry } = await import('../src/integrations/marketplace');
const { captureTip } = await import('../src/services/tips');
const { listDomainEvents } = await import('../src/modules/domain-events');

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

const LEAD = 'pay-lead';
const HELPER = 'pay-helper';
const NEIGHBOUR = 'pay-neighbour';
const GIVER = 'pay-giver';
for (const id of [LEAD, HELPER, NEIGHBOUR, GIVER]) ensureUser(id);

async function found(name: string) {
    const res = await app.request('/v1/coalitions', {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ name, mission: 'Share it out' }),
    });
    const coalition = ((await res.json()) as { coalition: { id: string } }).coalition;
    for (const m of [HELPER, NEIGHBOUR]) {
        await app.request(`/v1/coalitions/${coalition.id}/join`, {
            method: 'POST',
            headers: auth(m),
        });
    }
    return coalition;
}

async function launch(coalitionId: string, body: Record<string, unknown>) {
    const res = await app.request(`/v1/coalitions/${coalitionId}/campaigns`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify(body),
    });
    const text = await res.text();
    assert.equal(res.status, 201, text);
    return (JSON.parse(text) as { campaign: { id: string } }).campaign;
}

function attachListing(campaignId: string): void {
    const campaign = db.getCoalitionCampaign(campaignId)!;
    db.upsertCoalitionCampaign({ ...campaign, fbmListingId: STUB_LISTING });
}

test.beforeEach(() => {
    __resetCoalitionsForTests();
    __setCoalitionMatrixForTests(null);
    resetMarketplaceRegistry();
});

// --- allocation math ---------------------------------------------------------

test('a split divides to the cent and loses nothing', () => {
    const three = [
        { userId: 'a', shareBps: 3_334, active: true },
        { userId: 'b', shareBps: 3_333, active: true },
        { userId: 'c', shareBps: 3_333, active: true },
    ];
    for (const net of [1, 2, 100, 999, 1_000, 2_425, 1_000_000]) {
        const parts = allocatePayeeCents(net, three);
        assert.equal(
            parts.reduce((sum, p) => sum + p.amountCents, 0),
            net,
            `${net} must divide exactly`
        );
        assert.ok(parts.every((p) => p.amountCents >= 0));
    }
});

test('shares that do not total 100% are not a split', () => {
    assert.equal(
        campaignPayeeSharesAreValid([
            { shareBps: 5_000, active: true },
            { shareBps: 4_000, active: true },
        ]),
        false
    );
    assert.equal(campaignPayeeSharesAreValid([{ shareBps: 10_000, active: true }]), true);
    assert.equal(campaignPayeeSharesAreValid([]), false);
    // A deactivated row does not count toward the whole.
    assert.equal(
        campaignPayeeSharesAreValid([
            { shareBps: 10_000, active: true },
            { shareBps: 5_000, active: false },
        ]),
        true
    );
});

// --- beneficiary -------------------------------------------------------------

test('a raised request pays the person who asked, not the member who raised it', async () => {
    const coalition = await found('Neighbours');
    const aidPostId = 'aid-ride';
    db.upsertCoalitionAidPostByOrigin({
        id: aidPostId,
        customerId: NEIGHBOUR,
        type: 'request',
        category: 'transport',
        title: 'Ride to dialysis',
        description: 'Tuesdays',
        displayRadiusMeters: 1000,
        urgency: 'soon',
        status: 'open',
        source: 'test',
        externalId: aidPostId,
    } as never);

    const raised = await app.request(`/v1/coalitions/${coalition.id}/raise-aid`, {
        method: 'POST',
        headers: auth(HELPER),
        body: JSON.stringify({ aidPostId }),
    });
    const raisedText = await raised.text();
    assert.equal(raised.status, 201, raisedText);
    const campaign = (JSON.parse(raisedText) as { campaign: { id: string } }).campaign;

    const stored = db.getCoalitionCampaign(campaign.id)!;
    assert.equal(stored.createdBy, HELPER, 'the raiser organised it');
    assert.equal(stored.beneficiaryUserId, NEIGHBOUR, 'the money is for the person who asked');

    // And the money actually goes there.
    attachListing(campaign.id);
    const res = await app.request(
        `/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/contribute`,
        { method: 'POST', headers: auth(GIVER), body: JSON.stringify({ amountCents: 2_500 }) }
    );
    const contribText = await res.text();
    assert.equal(res.status, 201, contribText);
    const tipId = (JSON.parse(contribText) as { tipId: string }).tipId;
    assert.equal(db.getTip(tipId)?.recipientUserId, NEIGHBOUR);
});

test('a request mirrored from another platform has nobody to pay, and says so', async () => {
    const coalition = await found('Mirrored');
    const aidPostId = 'aid-mirrored';
    db.upsertCoalitionAidPostByOrigin({
        id: aidPostId,
        // FBM's projection withholds the requester's id on purpose.
        customerId: 'system:freeblackmarket',
        type: 'request',
        category: 'food',
        title: 'Groceries',
        description: 'mirrored',
        displayRadiusMeters: 1000,
        urgency: 'soon',
        status: 'open',
        source: 'freeblackmarket',
        externalId: aidPostId,
    } as never);

    const raised = await app.request(`/v1/coalitions/${coalition.id}/raise-aid`, {
        method: 'POST',
        headers: auth(HELPER),
        body: JSON.stringify({ aidPostId }),
    });
    assert.equal(raised.status, 201, 'raising for amplification is still fine');
    const campaign = ((await raised.json()) as { campaign: { id: string } }).campaign;
    attachListing(campaign.id);

    const before = db.listTipsBySender(GIVER).length;
    const res = await app.request(
        `/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/contribute`,
        { method: 'POST', headers: auth(GIVER), body: JSON.stringify({ amountCents: 2_500 }) }
    );
    assert.equal(res.status, 503);
    assert.equal(((await res.json()) as { reason: string }).reason, 'no_beneficiary');
    assert.equal(db.listTipsBySender(GIVER).length, before, 'nothing is recorded');
});

// --- payees ------------------------------------------------------------------

test('a steward sets the split; contributors never can', async () => {
    const coalition = await found('Divided');
    const campaign = await launch(coalition.id, { type: 'drive', title: 'Van repair' });

    const ok = await app.request(`/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/payees`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({
            payees: [
                { userId: LEAD, shareBps: 6_000, role: 'organiser' },
                { userId: HELPER, shareBps: 4_000, role: 'driver' },
            ],
        }),
    });
    assert.equal(ok.status, 200, await ok.text());

    // A plain member cannot.
    const refused = await app.request(
        `/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/payees`,
        {
            method: 'POST',
            headers: auth(HELPER),
            body: JSON.stringify({ payees: [{ userId: HELPER, shareBps: 10_000, role: 'all' }] }),
        }
    );
    assert.equal(refused.status, 403);
});

test('shares must total 100% and payees must be accountable to the coalition', async () => {
    const coalition = await found('Strict');
    const campaign = await launch(coalition.id, { type: 'drive', title: 'Tools' });
    const post = (payees: unknown) =>
        app.request(`/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/payees`, {
            method: 'POST',
            headers: auth(LEAD),
            body: JSON.stringify({ payees }),
        });

    const short = await post([
        { userId: LEAD, shareBps: 5_000, role: 'a' },
        { userId: HELPER, shareBps: 4_000, role: 'b' },
    ]);
    assert.equal(short.status, 400);
    assert.equal(((await short.json()) as { reason: string }).reason, 'shares_must_total_100');

    const twice = await post([
        { userId: LEAD, shareBps: 5_000, role: 'a' },
        { userId: LEAD, shareBps: 5_000, role: 'b' },
    ]);
    assert.equal(((await twice.json()) as { reason: string }).reason, 'duplicate');

    const outsider = await post([{ userId: GIVER, shareBps: 10_000, role: 'a' }]);
    assert.equal(((await outsider.json()) as { reason: string }).reason, 'not_a_member');
});

test('re-setting the split replaces it wholesale', async () => {
    const coalition = await found('Replaced');
    const campaign = await launch(coalition.id, { type: 'drive', title: 'Round two' });
    const post = (payees: unknown) =>
        app.request(`/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/payees`, {
            method: 'POST',
            headers: auth(LEAD),
            body: JSON.stringify({ payees }),
        });

    await post([
        { userId: LEAD, shareBps: 5_000, role: 'a' },
        { userId: HELPER, shareBps: 5_000, role: 'b' },
    ]);
    await post([{ userId: HELPER, shareBps: 10_000, role: 'sole' }]);

    const listed = (await (
        await app.request(`/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/payees`, {
            headers: auth(LEAD),
        })
    ).json()) as { payees: Array<{ userId: string; shareBps: number }> };
    assert.deepEqual(
        listed.payees.map((p) => [p.userId, p.shareBps]),
        [[HELPER, 10_000]],
        'the stored active rows are exactly what was last agreed'
    );
});

test('a capture freezes the division in cents against that payment', async () => {
    const coalition = await found('Frozen');
    const campaign = await launch(coalition.id, { type: 'drive', title: 'Split me' });
    attachListing(campaign.id);
    await app.request(`/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/payees`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({
            payees: [
                { userId: LEAD, shareBps: 3_334, role: 'a' },
                { userId: HELPER, shareBps: 3_333, role: 'b' },
                { userId: NEIGHBOUR, shareBps: 3_333, role: 'c' },
            ],
        }),
    });

    const res = await app.request(
        `/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/contribute`,
        { method: 'POST', headers: auth(GIVER), body: JSON.stringify({ amountCents: 2_500 }) }
    );
    // One payment, not three: a contributor is never asked to complete N checkouts.
    const body = (await res.json()) as { tipId: string; redirectUrl: string | null };
    assert.equal(
        db.listTipsBySender(GIVER).filter((t) => t.contextRef === campaign.id).length,
        1,
        'one payment, not one per payee — nobody completes three redirects'
    );
    captureTip(body.tipId, { fbmOrderId: 'o-split-1' });

    const recorded = listDomainEvents('coalitions').find(
        (e) => e.type === 'coalition.campaign.contribution.recorded'
    );
    const payload = recorded?.payload as {
        amountCents: number;
        allocation: Array<{ userId: string; amountCents: number }>;
    };
    assert.equal(payload.allocation.length, 3);
    assert.equal(
        payload.allocation.reduce((sum, a) => sum + a.amountCents, 0),
        payload.amountCents,
        'the parts sum back to what was captured'
    );
});
