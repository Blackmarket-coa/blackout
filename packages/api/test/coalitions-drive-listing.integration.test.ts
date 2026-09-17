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
const { ensureDriveListing, archiveDriveListing, driveBeneficiary } = await import(
    '../src/services/coalitionDrives'
);
const { getMarketplaceProvider, resetMarketplaceRegistry } = await import(
    '../src/integrations/marketplace'
);

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

const LEAD = 'dl-lead';
const GIVER = 'dl-giver';
const NEIGHBOUR = 'dl-neighbour';
for (const id of [LEAD, GIVER, NEIGHBOUR]) ensureUser(id);

async function found(name: string): Promise<{ id: string }> {
    const res = await app.request('/v1/coalitions', {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ name, mission: 'Fund the block' }),
    });
    const text = await res.text();
    assert.equal(res.status, 201, text);
    return (JSON.parse(text) as { coalition: { id: string } }).coalition;
}

async function launch(coalitionId: string, body: Record<string, unknown>) {
    const res = await app.request(`/v1/coalitions/${coalitionId}/campaigns`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ type: 'drive', title: 'Coats', goalCents: 50_000, ...body }),
    });
    const text = await res.text();
    assert.equal(res.status, 201, text);
    return (JSON.parse(text) as { campaign: { id: string; status: string } }).campaign;
}

/** The lifecycle hooks are fire-and-forget, so give them a turn to land. */
async function settle(campaignId: string): Promise<string | undefined> {
    for (let i = 0; i < 40; i += 1) {
        const row = db.getCoalitionCampaign(campaignId);
        if (row?.fbmListingId) return row.fbmListingId;
        await new Promise((r) => setTimeout(r, 10));
    }
    return db.getCoalitionCampaign(campaignId)?.fbmListingId;
}

test.beforeEach(() => {
    __resetCoalitionsForTests();
    __setCoalitionMatrixForTests(null);
    resetMarketplaceRegistry();
});

test('activating a drive gives it a published listing stamped with its coalition', async () => {
    const coalition = await found('Has A Listing');
    const campaign = await launch(coalition.id, { title: 'Winter coats' });
    assert.equal(campaign.status, 'active');

    const listingId = await settle(campaign.id);
    assert.ok(listingId, 'the drive was given a listing on activation');

    const provider = getMarketplaceProvider('freeblackmarket');
    const listing = await provider?.getListing(listingId!);
    assert.ok(listing, 'and the listing exists at the provider');
    // Not `subscription`: FBM turns a subscription-category listing into a
    // recurring membership at checkout, which a donation must never become.
    assert.notEqual(listing?.category, 'subscription');
});

test('the listing is purchasable — a contribution no longer answers no_listing', async () => {
    const coalition = await found('Takes Money');
    const campaign = await launch(coalition.id, { title: 'Bus fares' });
    await settle(campaign.id);

    const res = await app.request(
        `/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/contribute`,
        { method: 'POST', headers: auth(GIVER), body: JSON.stringify({ amountCents: 2_500 }) }
    );
    const text = await res.text();
    assert.equal(res.status, 201, text);
    assert.equal((JSON.parse(text) as { status: string }).status, 'pending');
});

test('the listing seller is exactly who the contribution credits', async () => {
    // FBM pays the LISTING's seller; Blackout's tip is a ledger row that moves
    // nothing. If these two ids disagree the ledger says one person was paid
    // while the cash settles to another, with nothing to detect it.
    const coalition = await found('Same Payee');
    const campaign = await launch(coalition.id, { title: 'Repairs' });
    const listingId = await settle(campaign.id);

    const row = db.getCoalitionCampaign(campaign.id);
    assert.ok(row);
    const provider = getMarketplaceProvider('freeblackmarket');
    const listing = await provider?.getListing(listingId!);
    assert.equal(listing?.sellerId, driveBeneficiary(row!));
    assert.equal(listing?.sellerId, LEAD);
});

test('provisioning is idempotent and never mints a second listing', async () => {
    const coalition = await found('Once Only');
    const campaign = await launch(coalition.id, { title: 'Seeds' });
    const first = await settle(campaign.id);

    const row = db.getCoalitionCampaign(campaign.id);
    await ensureDriveListing(row!);
    await ensureDriveListing(db.getCoalitionCampaign(campaign.id)!);

    assert.equal(db.getCoalitionCampaign(campaign.id)?.fbmListingId, first);
});

test('a mutual-aid drive with no payable beneficiary gets no listing', async () => {
    const coalition = await found('Nobody To Pay');
    const created = await app.request(`/v1/coalitions/${coalition.id}/campaigns`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ type: 'mutual_aid', title: 'Rent', goalCents: 90_000 }),
    });
    const campaign = (JSON.parse(await created.text()) as { campaign: { id: string } }).campaign;

    // Mutual aid pays the person who asked. With none resolvable, falling back
    // to the organiser would pay the raiser money meant for a neighbour, so
    // there is nobody to be the listing's seller.
    await ensureDriveListing(db.getCoalitionCampaign(campaign.id)!);
    assert.equal(db.getCoalitionCampaign(campaign.id)?.fbmListingId, undefined);
});

test('completing a drive withdraws its listing and forgets the id', async () => {
    const coalition = await found('Done Selling');
    const campaign = await launch(coalition.id, { title: 'Firewood' });
    await settle(campaign.id);

    const res = await app.request(
        `/v1/coalitions/${coalition.id}/campaigns/${campaign.id}/status`,
        { method: 'POST', headers: auth(LEAD), body: JSON.stringify({ status: 'completed' }) }
    );
    assert.equal(res.status, 200, await res.text());

    for (let i = 0; i < 40; i += 1) {
        if (!db.getCoalitionCampaign(campaign.id)?.fbmListingId) break;
        await new Promise((r) => setTimeout(r, 10));
    }
    // Both halves: a stale id makes startContribution skip its honest
    // no_listing answer and fail later with an opaque checkout error, and a
    // listing left published keeps taking money for a drive that is over.
    assert.equal(db.getCoalitionCampaign(campaign.id)?.fbmListingId, undefined);
});

test('taking down a coalition stops its drives taking money', async () => {
    const coalition = await found('Stopped Selling');
    const campaign = await launch(coalition.id, { title: 'Generators' });
    const listingId = await settle(campaign.id);
    assert.ok(listingId);

    const admin = 'dl-admin';
    ensureUser(admin);
    process.env.BLACKOUT_ADMIN_USERS = admin;
    const down = await app.request(`/v1/coalitions/${coalition.id}/takedown`, {
        method: 'POST',
        headers: auth(admin),
        body: JSON.stringify({ reason: 'policy' }),
    });
    assert.equal(down.status, 200, await down.text());
    delete process.env.BLACKOUT_ADMIN_USERS;

    for (let i = 0; i < 40; i += 1) {
        if (!db.getCoalitionCampaign(campaign.id)?.fbmListingId) break;
        await new Promise((r) => setTimeout(r, 10));
    }
    // FBM's checkout never consults coalition status, so nothing else would
    // have stopped this listing selling.
    assert.equal(db.getCoalitionCampaign(campaign.id)?.fbmListingId, undefined);
});

test('archiving a listing that the provider refuses still forgets the id', async () => {
    const coalition = await found('Provider Down');
    const campaign = await launch(coalition.id, { title: 'Blankets' });
    await settle(campaign.id);

    const provider = getMarketplaceProvider('freeblackmarket');
    assert.ok(provider);
    const original = provider.archiveCreatorListing;
    provider.archiveCreatorListing = async () => {
        throw new Error('fbm is down');
    };
    try {
        await archiveDriveListing(db.getCoalitionCampaign(campaign.id)!);
    } finally {
        provider.archiveCreatorListing = original;
    }

    // A stale id routes real money at a finished drive; an orphaned listing is
    // the lesser failure, so the id goes either way.
    assert.equal(db.getCoalitionCampaign(campaign.id)?.fbmListingId, undefined);
});
