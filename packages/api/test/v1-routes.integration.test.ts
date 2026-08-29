import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'wss://livekit.local';
process.env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? 'lk_test_key';
process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? 'lk_test_secret';
// W1b: Canopy checkout delegates to the FBM marketplace provider; tests run the stub.
process.env.FREEBLACKMARKET_STUB = process.env.FREEBLACKMARKET_STUB ?? '1';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { applySubscriptionWebhookEvent } = await import('../src/services/subscriptions');

// W1b: the Lago/Stripe webhook endpoints are gone — Canopy state changes are
// driven by the FBM marketplace webhook, which loops through
// applySubscriptionWebhookEvent. These integration tests call that seam
// directly, exactly as the FBM dispatcher does.
function entitleViaFbm(userId: string, eventId: string, planCode = 'canopy_sprout_monthly') {
    return applySubscriptionWebhookEvent({
        eventId,
        type: 'invoice.paid',
        userId,
        planCode,
    });
}

async function json(res: Response) {
    return (await res.json()) as Record<string, unknown>;
}

let registerSeed = Date.now();
async function registerUser(password = 'test-password') {
    const seed = ++registerSeed;
    const email = `user-${seed}@example.com`;
    const response = await app.request('/v1/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            username: `user-${seed}`,
            email,
            password,
        }),
    });

    assert.equal(response.status, 201);
    const body = (await response.json()) as { token: string; userId: string };
    return { ...body, email, password };
}

test('v1 auth register works', async () => {
    const body = await registerUser();
    assert.ok(body.token);
    assert.ok(body.userId);
});

test('v1 auth register rejects short passwords', async () => {
    const seed = ++registerSeed;
    const response = await app.request('/v1/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            username: `short-${seed}`,
            email: `short-${seed}@example.com`,
            password: 'short',
        }),
    });
    assert.equal(response.status, 400);
});

test('v1 auth login succeeds with correct credentials', async () => {
    const { email, password } = await registerUser();
    const response = await app.request('/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { token: string; userId: string };
    assert.ok(body.token);
    assert.ok(body.userId);
});

test('v1 auth login rejects wrong password', async () => {
    const { email } = await registerUser();
    const response = await app.request('/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'wrong-password' }),
    });
    assert.equal(response.status, 401);
    const body = await json(response);
    assert.equal(body.code, 'invalid_credentials');
    assert.equal(body.message, 'Invalid credentials');
});

test('v1 auth login rejects unknown email with the same error as wrong password', async () => {
    const response = await app.request('/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            email: 'does-not-exist@example.com',
            password: 'whatever-password',
        }),
    });
    assert.equal(response.status, 401);
    const body = await json(response);
    assert.equal(body.code, 'invalid_credentials');
    assert.equal(body.message, 'Invalid credentials');
});

test('v1 auth login rejects missing fields', async () => {
    const response = await app.request('/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'someone@example.com' }),
    });
    assert.equal(response.status, 400);
});

test('v1 auth middleware rejects expired JWTs', async () => {
    const expired = signJwt('demo-user', 'demo', -10);
    const response = await app.request('/v1/channels', {
        headers: { authorization: `Bearer ${expired}` },
    });
    assert.equal(response.status, 401);
});

test('v1 messages post/list works', async () => {
    const create = await app.request('/v1/messages/general', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'hello', userId: 'demo-user' }),
    });
    assert.equal(create.status, 201);

    const list = await app.request('/v1/messages/general');
    assert.equal(list.status, 200);
    const body = (await list.json()) as Array<{ content: string }>;
    assert.ok(body.some((msg) => msg.content));
});

test('v1 governance proposal create/get works', async () => {
    const { token, userId } = await registerUser();
    const headers = {
        authorization: `Bearer ${token}`,
        'x-blackout-capabilities': 'governance.read,governance.write',
        'content-type': 'application/json',
    };

    const create = await app.request('/v1/governance/proposals', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            communityId: 'community-1',
            proposerId: userId,
            title: 'Ship /v1 only',
        }),
    });
    assert.equal(create.status, 201);
    const created = (await create.json()) as { id: string };

    const get = await app.request(`/v1/governance/proposals/${created.id}`, { headers });
    assert.equal(get.status, 200);
    const body = await json(get);
    assert.equal(body.id, created.id);
});

test('v1 entitlements read + family filter works', async () => {
    const payload = {
        deploymentPreset: 'starter',
        deploymentPresetEntitlements: {
            'features.stego.enabled': true,
            'features.governance.entitlements': false,
        },
        orgTier: 'pro',
        orgTierEntitlements: {
            'features.stego.ephemeral': true,
            'features.governance.entitlements': true,
        },
        planState: {
            tier: 'pro',
            status: 'active',
            isPaid: true,
        },
    };

    const me = await app.request('/v1/entitlements/me', {
        headers: {
            'x-blackout-entitlement-payload': JSON.stringify(payload),
        },
    });
    assert.equal(me.status, 200);
    const meBody = await json(me);
    assert.equal(meBody.family, 'all');

    const stego = await app.request('/v1/entitlements/stego', {
        headers: {
            'x-blackout-entitlement-payload': JSON.stringify(payload),
        },
    });
    assert.equal(stego.status, 200);
    const stegoBody = await json(stego);
    const entitlements = ((stegoBody.payload as Record<string, unknown>)
        .deploymentPresetEntitlements ?? {}) as Record<string, unknown>;
    assert.ok(Object.keys(entitlements).every((key) => key.startsWith('features.stego.')));
});

test('v1 entitlements returns 400 for invalid payload', async () => {
    const response = await app.request('/v1/entitlements/me', {
        headers: {
            'x-blackout-entitlement-payload': JSON.stringify({ deploymentPreset: 'starter' }),
        },
    });

    assert.equal(response.status, 400);
});

test('BLACKOUT_BETA_UNLOCK_ALL unlocks all services and reverts when unset', async () => {
    const { token } = await registerUser();

    // Default (flag unset): a fresh user is free tier and not paid.
    const free = await app.request('/v1/entitlements/me', {
        headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(free.status, 200);
    const freePlan = ((await json(free)).payload as Record<string, unknown>).planState as Record<
        string,
        unknown
    >;
    assert.equal(freePlan.tier, 'free');
    assert.equal(freePlan.isPaid, false);

    process.env.BLACKOUT_BETA_UNLOCK_ALL = 'true';
    try {
        const unlocked = await app.request('/v1/entitlements/me', {
            headers: { authorization: `Bearer ${token}` },
        });
        assert.equal(unlocked.status, 200);
        const payload = (await json(unlocked)).payload as Record<string, unknown>;
        const plan = payload.planState as Record<string, unknown>;
        assert.equal(plan.tier, 'enterprise');
        assert.equal(plan.isPaid, true);
        const ents = payload.deploymentPresetEntitlements as Record<string, boolean>;
        assert.equal(ents['features.stego.ephemeral'], true);
        assert.equal(ents['features.governance.entitlements'], true);
        assert.equal(ents['features.deaddrop.team.quorumOpen'], true);

        // Per-listing marketplace paywall is also bypassed under the flag.
        const listing = await app.request('/v1/entitlements/listings/freeblackmarket/listing-123', {
            headers: { authorization: `Bearer ${token}` },
        });
        assert.equal(listing.status, 200);
        assert.equal((await json(listing)).canAccess, true);
    } finally {
        delete process.env.BLACKOUT_BETA_UNLOCK_ALL;
    }

    // Reversibility: with the flag cleared, the user is free tier again.
    const reverted = await app.request('/v1/entitlements/me', {
        headers: { authorization: `Bearer ${token}` },
    });
    const revertedPlan = ((await json(reverted)).payload as Record<string, unknown>)
        .planState as Record<string, unknown>;
    assert.equal(revertedPlan.tier, 'free');
});

test('v1 subscriptions checkout delegates to FBM + entitlement state works end-to-end', async () => {
    const { token, userId } = await registerUser();

    // Unmapped plans fail safe: no FBM listing configured -> 503, never a charge.
    const unavailable = await app.request('/v1/subscriptions/checkout', {
        method: 'POST',
        headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            planCode: 'canopy_sprout_monthly',
            successUrl: 'https://example.com/success',
        }),
    });
    assert.equal(unavailable.status, 503);
    assert.equal((await json(unavailable)).code, 'billing_unavailable');

    // Map the plan onto a (stub) FBM listing and the checkout returns the
    // provider session the client redirects/embeds.
    const catalog = await app.request('/v1/marketplace/listings?providerId=freeblackmarket', {
        headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(catalog.status, 200);
    const catalogListings = (await json(catalog)).listings as Array<{
        providerListingId: string;
    }>;
    assert.ok(catalogListings.length > 0, 'stub catalog is seeded');
    process.env.CANOPY_FBM_LISTING_IDS = JSON.stringify({
        canopy_sprout_monthly: catalogListings[0].providerListingId,
    });
    try {
        const checkout = await app.request('/v1/subscriptions/checkout', {
            method: 'POST',
            headers: {
                authorization: `Bearer ${token}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                planCode: 'canopy_sprout_monthly',
                successUrl: 'https://example.com/success',
            }),
        });
        assert.equal(checkout.status, 201);
        const session = await json(checkout);
        assert.equal(session.provider, 'freeblackmarket');
        assert.ok(typeof session.redirectUrl === 'string' && session.redirectUrl.length > 0);
        assert.ok(typeof session.sessionId === 'string' && session.sessionId.length > 0);
    } finally {
        delete process.env.CANOPY_FBM_LISTING_IDS;
    }

    // Settlement loops back through the FBM dispatcher seam.
    const paid = entitleViaFbm(userId, `evt_${Date.now()}`);
    assert.equal(paid.processed, true);

    const entitlements = await app.request('/v1/entitlements/me', {
        headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(entitlements.status, 200);
    const body = await json(entitlements);
    const payload = body.payload as Record<string, unknown>;
    const planState = payload.planState as Record<string, unknown>;
    assert.equal(planState.status, 'active');

    // Event-id de-dupe survives (durable ledger, not the deleted route). The id
    // is unique per run because the ledger itself is durable across runs.
    const dupEventId = `evt_dup_${Date.now()}`;
    const duplicate = applySubscriptionWebhookEvent({
        eventId: dupEventId,
        type: 'subscription.canceled',
        userId,
    });
    assert.equal(duplicate.processed, true);
    const duplicateAgain = applySubscriptionWebhookEvent({
        eventId: dupEventId,
        type: 'subscription.canceled',
        userId,
    });
    assert.equal(duplicateAgain.processed, false);
});

async function registerTestCanopy(canopyId: string, token: string): Promise<void> {
    await app.request('/v1/discovery/index/canopies', {
        method: 'POST',
        headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            'x-blackout-capabilities': 'discovery.write',
        },
        body: JSON.stringify({ canopyId, name: canopyId }),
    });
}

test('v1 voice join is gated by backend subscription entitlement', async () => {
    const { token, userId } = await registerUser();
    await registerTestCanopy('canopy-1', token);

    const denied = await app.request('/v1/voice/rooms/join', {
        method: 'POST',
        headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({ canopyId: 'canopy-1', channelId: 'chan-1', role: 'member' }),
    });
    assert.equal(denied.status, 402);

    entitleViaFbm(userId, `evt_voice_${Date.now()}`);

    const allowed = await app.request('/v1/voice/rooms/join', {
        method: 'POST',
        headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({ canopyId: 'canopy-1', channelId: 'chan-1', role: 'member' }),
    });
    assert.equal(allowed.status, 200);
});

test('v1 subscriptions pay-it-forward gift chain works end-to-end', async () => {
    process.env.BLACKOUT_ADMIN_API_KEY = process.env.BLACKOUT_ADMIN_API_KEY ?? 'integration-admin';
    const donor = await registerUser();
    const recipient = await registerUser();

    entitleViaFbm(donor.userId, `evt_donor_${Date.now()}`);

    const donate = await app.request('/v1/subscriptions/forward', {
        method: 'POST',
        headers: { authorization: `Bearer ${donor.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({}),
    });
    assert.equal(donate.status, 201);
    const donateBody = await json(donate);
    const gift = donateBody.gift as {
        id: string;
        rootGiftId: string;
        chainDepth: number;
        status: string;
    };
    assert.equal(gift.status, 'pending');
    assert.equal(gift.chainDepth, 0);
    assert.equal(gift.rootGiftId, gift.id);

    const available = await app.request('/v1/subscriptions/forward/available', {
        headers: { authorization: `Bearer ${recipient.token}` },
    });
    assert.equal(available.status, 200);
    const availableBody = await json(available);
    const gifts = availableBody.gifts as Array<{ id: string; donorUserId: string }>;
    assert.ok(gifts.some((g) => g.id === gift.id));
    assert.ok(gifts.every((g) => g.donorUserId !== recipient.userId));

    const claim = await app.request(`/v1/subscriptions/forward/${gift.id}/claim`, {
        method: 'POST',
        headers: { authorization: `Bearer ${recipient.token}` },
    });
    assert.equal(claim.status, 200);
    const claimBody = await json(claim);
    const claimedSub = claimBody.subscription as {
        tier: string;
        comped: boolean;
        entitlementActive: boolean;
    };
    assert.equal(claimedSub.tier, 'sprout');
    assert.equal(claimedSub.comped, true);
    assert.equal(claimedSub.entitlementActive, true);

    const reclaim = await app.request(`/v1/subscriptions/forward/${gift.id}/claim`, {
        method: 'POST',
        headers: { authorization: `Bearer ${recipient.token}` },
    });
    assert.equal(reclaim.status, 409);

    const ownClaim = await app.request(`/v1/subscriptions/forward/${gift.id}/claim`, {
        method: 'POST',
        headers: { authorization: `Bearer ${donor.token}` },
    });
    assert.equal(ownClaim.status, 409);

    const seedDonor = await registerUser();
    const passer = await registerUser();
    const finalRecipient = await registerUser();

    entitleViaFbm(seedDonor.userId, `evt_seed_${Date.now()}`);

    const seedDonate = await app.request('/v1/subscriptions/forward', {
        method: 'POST',
        headers: { authorization: `Bearer ${seedDonor.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({}),
    });
    assert.equal(seedDonate.status, 201);
    const seedGift = (await json(seedDonate)).gift as { id: string; rootGiftId: string };

    const pass = await app.request(`/v1/subscriptions/forward/${seedGift.id}/pass`, {
        method: 'POST',
        headers: { authorization: `Bearer ${passer.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({}),
    });
    assert.equal(pass.status, 201);
    const passBody = await json(pass);
    const previous = passBody.previous as { status: string; forwardedToGiftId: string };
    const next = passBody.next as {
        id: string;
        status: string;
        rootGiftId: string;
        chainDepth: number;
        donorUserId: string;
    };
    assert.equal(previous.status, 'forwarded');
    assert.equal(next.status, 'pending');
    assert.equal(next.chainDepth, 1);
    assert.equal(next.rootGiftId, seedGift.rootGiftId);
    assert.equal(previous.forwardedToGiftId, next.id);
    assert.equal(next.donorUserId, passer.userId);

    const finalClaim = await app.request(`/v1/subscriptions/forward/${next.id}/claim`, {
        method: 'POST',
        headers: { authorization: `Bearer ${finalRecipient.token}` },
    });
    assert.equal(finalClaim.status, 200);

    const myGifts = await app.request('/v1/subscriptions/forward/me', {
        headers: { authorization: `Bearer ${seedDonor.token}` },
    });
    assert.equal(myGifts.status, 200);
    const myGiftsBody = await json(myGifts);
    const donated = myGiftsBody.donated as Array<{ id: string }>;
    assert.ok(donated.some((g) => g.id === seedGift.id));

    const audit = await app.request(`/v1/subscriptions/admin/audit/${donor.userId}`, {
        headers: { 'x-admin-api-key': process.env.BLACKOUT_ADMIN_API_KEY ?? '' },
    });
    assert.equal(audit.status, 200);
    const auditBody = await json(audit);
    const timeline = auditBody.timeline as Array<{ type: string; detail: Record<string, unknown> }>;
    assert.ok(timeline.some((e) => e.type === 'gift.donated' && e.detail.giftId === gift.id));
});

test('v1 subscriptions forward rejects free-tier donors and unknown gifts', async () => {
    const free = await registerUser();

    const reject = await app.request('/v1/subscriptions/forward', {
        method: 'POST',
        headers: { authorization: `Bearer ${free.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({}),
    });
    assert.equal(reject.status, 409);
    const rejectBody = await json(reject);
    assert.equal(rejectBody.code, 'no_active_subscription');

    const missing = await app.request('/v1/subscriptions/forward/gift_does_not_exist/claim', {
        method: 'POST',
        headers: { authorization: `Bearer ${free.token}` },
    });
    assert.equal(missing.status, 404);
});

test('v1 subscriptions admin tools support comp + refund + audit timeline', async () => {
    process.env.BLACKOUT_ADMIN_API_KEY = 'integration-admin';
    const { userId } = await registerUser();

    const comp = await app.request('/v1/subscriptions/admin/comp', {
        method: 'POST',
        headers: {
            'x-admin-api-key': 'integration-admin',
            'content-type': 'application/json',
        },
        body: JSON.stringify({ userId, detail: 'goodwill' }),
    });
    assert.equal(comp.status, 200);

    const refund = await app.request('/v1/subscriptions/admin/refund-sync', {
        method: 'POST',
        headers: {
            'x-admin-api-key': 'integration-admin',
            'content-type': 'application/json',
        },
        body: JSON.stringify({ userId, reason: 'requested' }),
    });
    assert.equal(refund.status, 200);

    const audit = await app.request(`/v1/subscriptions/admin/audit/${userId}`, {
        headers: { 'x-admin-api-key': 'integration-admin' },
    });
    assert.equal(audit.status, 200);
    const auditBody = await json(audit);
    const timeline = auditBody.timeline as Array<Record<string, unknown>>;
    assert.ok(timeline.length >= 2);
});

test('v1 apps contract, events, and actions are exposed', async () => {
    const contract = await app.request('/v1/apps/contract');
    assert.equal(contract.status, 200);
    const contractBody = await json(contract);
    assert.ok(contractBody.oauth);
    assert.ok(contractBody.webhook);
    assert.ok(contractBody.rateLimits);

    const events = await app.request('/v1/apps/events');
    assert.equal(events.status, 200);
    const eventsBody = await json(events);
    assert.deepEqual(eventsBody.events, ['message_created', 'member_joined', 'report_created']);

    const actions = await app.request('/v1/apps/actions');
    assert.equal(actions.status, 200);
    const actionsBody = await json(actions);
    assert.deepEqual(actionsBody.actions, ['post_message', 'moderate_user', 'assign_role']);
});

test('v1 app directory install review and revoke flow works', async () => {
    const { token } = await registerUser();
    await registerTestCanopy('main', token);

    const directory = await app.request('/v1/apps/directory?canopyId=main');
    assert.equal(directory.status, 200);
    const directoryBody = await json(directory);
    const apps = directoryBody.apps as Array<{ id: string; defaultScopes: string[] }>;
    assert.ok(apps.length >= 1);

    const target = apps[0];
    const install = await app.request(`/v1/apps/directory/${target.id}/install`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ canopyId: 'main', permissions: target.defaultScopes }),
    });
    assert.equal(install.status, 201);

    const observability = await app.request(
        `/v1/apps/directory/${target.id}/observability?canopyId=main`
    );
    assert.equal(observability.status, 200);
    const obsBody = await json(observability);
    const metrics = obsBody.metrics as Record<string, unknown>;
    assert.equal(metrics.quotaUsed, 0);

    const action = await app.request('/v1/apps/actions/post_message', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ appId: target.id, canopyId: 'main', latencyMs: 42 }),
    });
    assert.equal(action.status, 200);

    const revoke = await app.request(`/v1/apps/directory/${target.id}/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ canopyId: 'main' }),
    });
    assert.equal(revoke.status, 200);

    const deniedAction = await app.request('/v1/apps/actions/post_message', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ appId: target.id, canopyId: 'main', latencyMs: 10 }),
    });
    assert.equal(deniedAction.status, 404);
});

test('v1 managed n8n templates are exposed for common automation packs', async () => {
    const templates = await app.request('/v1/apps/workflows/n8n/templates');
    assert.equal(templates.status, 200);
    const templatesBody = await json(templates);
    const list = templatesBody.templates as Array<{ id: string }>;
    assert.ok(list.some((entry) => entry.id === 'welcome-flow-v1'));

    const detail = await app.request('/v1/apps/workflows/n8n/templates/welcome-flow-v1');
    assert.equal(detail.status, 200);
    const detailBody = await json(detail);
    const template = detailBody.template as Record<string, unknown>;
    assert.ok(template.n8nTemplate);
});
