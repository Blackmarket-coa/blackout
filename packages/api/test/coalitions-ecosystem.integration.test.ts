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
// The ecosystem push targets are configured so the emitters actually fire;
// both transports are stubbed below, so nothing leaves the process.
process.env.FBM_ENTITLEMENTS_BASE_URL = 'https://fbm.test';
process.env.FBM_ENTITLEMENTS_SERVICE_TOKEN = 'svc-token-test';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { __resetCoalitionsForTests } = await import('../src/services/coalitionNetworkStore');
const { __setCoalitionMatrixForTests } = await import('../src/services/coalitionSpaces');
const { __setReputationFetchForTests } = await import('../src/services/coalitionReputation');
const { __setBridgeFetchForTests, computeCoalitionMilestones } = await import(
    '../src/services/coalitionFbmBridge'
);

interface Captured {
    url: string;
    method: string;
    auth: string | null;
    body: Record<string, unknown>;
}

let reputationCalls: Captured[] = [];
let bridgeCalls: Captured[] = [];

function recorder(into: Captured[], response: unknown = {}): typeof fetch {
    return (async (input: unknown, init?: RequestInit) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        into.push({
            url: String(input),
            method: init?.method ?? 'GET',
            auth: headers['Authorization'] ?? null,
            body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
        });
        return new Response(JSON.stringify(response), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as unknown as typeof fetch;
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

const LEAD = 'eco-lead';
const MEMBER = 'eco-member';
for (const id of [LEAD, MEMBER]) ensureUser(id);

async function foundCoalition(name: string) {
    const res = await app.request('/v1/coalitions', {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ name, mission: 'Move what the block needs' }),
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
    return (JSON.parse(text) as { campaign: { id: string } }).campaign;
}

async function setStatus(coalitionId: string, campaignId: string, status: string) {
    const res = await app.request(`/v1/coalitions/${coalitionId}/campaigns/${campaignId}/status`, {
        method: 'POST',
        headers: auth(LEAD),
        body: JSON.stringify({ status }),
    });
    assert.equal(res.status, 200, await res.text());
}

/** The pushes are fire-and-forget, so let the microtask queue drain. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

test.beforeEach(() => {
    __resetCoalitionsForTests();
    __setCoalitionMatrixForTests(null);
    reputationCalls = [];
    bridgeCalls = [];
    __setReputationFetchForTests(recorder(reputationCalls));
    __setBridgeFetchForTests(recorder(bridgeCalls, { order_cycle_id: 'oc_1' }));
});

test.after(() => {
    __setReputationFetchForTests(undefined);
    __setBridgeFetchForTests(undefined);
});

test('founding a coalition reports the event, never an amount', async () => {
    const coalition = await foundCoalition('Ecosystem Founders');
    await settle();

    const founded = reputationCalls.find((c) => c.body.eventType === 'coalition_founded');
    assert.ok(founded, 'expected a coalition_founded push');
    assert.equal(founded.method, 'POST');
    assert.equal(founded.auth, 'Bearer svc-token-test');
    assert.equal(founded.body.blackoutUserId, LEAD);
    assert.equal(founded.body.referenceId, coalition.id);
    // FBM decides what it is worth. Blackout never sends a delta, so a
    // compromised Blackout process cannot mint reputation.
    assert.equal(founded.body.amount, undefined);
    assert.equal(founded.body.karma, undefined);
});

test('a member joining is keyed on the membership, so rejoining cannot farm it', async () => {
    const coalition = await foundCoalition('Open Doors');
    const join = async () =>
        app.request(`/v1/coalitions/${coalition.id}/join`, {
            method: 'POST',
            headers: auth(MEMBER),
        });

    assert.equal((await join()).status, 200);
    await settle();
    await app.request(`/v1/coalitions/${coalition.id}/leave`, {
        method: 'POST',
        headers: auth(MEMBER),
    });
    assert.equal((await join()).status, 200);
    await settle();

    const joins = reputationCalls.filter((c) => c.body.eventType === 'member_joined');
    assert.equal(joins.length, 2, 'both joins push');
    // Same reference both times: FBM's (source_module, source_id) dedupe means
    // the second award is a no-op rather than a second 2 KARMA.
    assert.equal(joins[0]!.body.referenceId, joins[1]!.body.referenceId);
});

test('completing a drive credits the organiser and pushes absolute totals', async () => {
    const coalition = await foundCoalition('Winter Drive');
    const campaign = await launchCampaign(coalition.id, {
        type: 'drive',
        title: 'Coats',
        goalCents: 20_000,
    });
    await setStatus(coalition.id, campaign.id, 'completed');
    await settle();

    const completed = reputationCalls.find((c) => c.body.eventType === 'drive_completed');
    assert.ok(completed, 'expected a drive_completed push');
    assert.equal(completed.body.blackoutUserId, LEAD);

    const milestones = bridgeCalls.find((c) => c.url.endsWith('/milestones'));
    assert.ok(milestones, 'expected a milestones push');
    assert.equal(milestones.method, 'PUT');
    assert.equal(milestones.body.drives_completed, 1);
    // Counts and cents only — who gave what stays on Blackout.
    assert.deepEqual(Object.keys(milestones.body).sort(), [
        'contributing_members',
        'drives_completed',
        'raised_cents',
    ]);
});

test('milestones count only completed drives, and only their contributors', async () => {
    const coalition = await foundCoalition('Totals');
    const closed = await launchCampaign(coalition.id, { type: 'drive', title: 'Closed' });
    const open = await launchCampaign(coalition.id, { type: 'drive', title: 'Still open' });

    for (const [campaignId, supporter, cents] of [
        [closed.id, 'giver-a', 1_000],
        [closed.id, 'giver-b', 2_000],
        [closed.id, 'giver-a', 500],
        [open.id, 'giver-c', 9_000],
    ] as const) {
        db.upsertCoalitionCampaignContribution({
            id: `contrib-${campaignId}-${supporter}-${cents}`,
            campaignId,
            coalitionId: coalition.id,
            supporterUserId: supporter,
            tipId: `tip-${campaignId}-${supporter}-${cents}`,
            amountCents: cents,
            currency: 'USD',
        });
    }
    await setStatus(coalition.id, closed.id, 'completed');

    const totals = computeCoalitionMilestones(coalition.id);
    assert.equal(totals.drivesCompleted, 1);
    // giver-a twice is one contributor; giver-c's open drive does not count.
    assert.equal(totals.contributingMembers, 2);
    assert.equal(totals.raisedCents, 3_500);
});

test('a goods drive going live opens the shared ordering window', async () => {
    const coalition = await foundCoalition('Bulk Staples');
    const endsAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const campaign = await launchCampaign(coalition.id, {
        type: 'goods_drive',
        title: 'Rice and beans',
        goalUnits: 200,
        endsAt,
    });
    await settle();

    const window = bridgeCalls.find((c) => c.url.endsWith('/order-cycles'));
    assert.ok(window, 'expected a window push when the drive went active');
    assert.equal(window.body.campaign_id, campaign.id);
    assert.equal(window.body.closes_at, endsAt);
    // Dispatch is never earlier than close, which FBM also enforces.
    assert.ok(String(window.body.dispatch_at) >= String(window.body.closes_at));

    // And the returned window id is stored back on the campaign.
    assert.equal(db.getCoalitionCampaign(campaign.id)?.fbmOrderCycleId, 'oc_1');
});

test('a goods drive with no end date opens no window rather than inventing one', async () => {
    const coalition = await foundCoalition('Undated');
    const campaign = await launchCampaign(coalition.id, {
        type: 'goods_drive',
        title: 'Open ended',
        goalUnits: 10,
    });
    await settle();

    assert.equal(db.getCoalitionCampaign(campaign.id)?.status, 'active');
    assert.equal(
        bridgeCalls.filter((c) => c.url.endsWith('/order-cycles')).length,
        0,
        'a window with no close would never dispatch'
    );
});

test('an FBM outage costs a push, never the coalition action', async () => {
    __setReputationFetchForTests((async () => {
        throw new Error('connection refused');
    }) as unknown as typeof fetch);
    __setBridgeFetchForTests((async () => {
        throw new Error('connection refused');
    }) as unknown as typeof fetch);

    const coalition = await foundCoalition('Offline');
    const campaign = await launchCampaign(coalition.id, { type: 'drive', title: 'Still works' });
    await setStatus(coalition.id, campaign.id, 'completed');
    await settle();

    assert.equal(db.getCoalitionCampaign(campaign.id)?.status, 'completed');
});
