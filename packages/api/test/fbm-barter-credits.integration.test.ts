import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.FREEBLACKMARKET_STUB = '1';
process.env.FREEBLACKMARKET_WEBHOOK_SECRET =
    process.env.FREEBLACKMARKET_WEBHOOK_SECRET ?? 'stub-webhook-secret';
process.env.FBM_MATRIX_BRIDGE_ENABLED = '1';
process.env.FBM_PSEUDONYM_SALT = 'test-salt';
delete process.env.MATRIX_HOMESERVER;
delete process.env.MATRIX_BOT_TOKEN;

const { db } = await import('../src/db/store');
const { resetMarketplaceEntitlementsForTest } = await import(
    '../src/services/marketplaceEntitlements'
);
const { resetMarketplaceRegistry, getMarketplaceProvider } = await import(
    '../src/integrations/marketplace'
);
const { getFreeblackmarketStubInternals } = await import(
    '../src/integrations/marketplace/freeblackmarketStub'
);
const { parseFbmMatrixEvent } = await import('../src/services/fbmMatrixBridge/events');
const { dispatchFbmMatrixEvent } = await import('../src/services/fbmMatrixBridge');

function resetAll() {
    resetMarketplaceEntitlementsForTest();
    resetMarketplaceRegistry();
    db.resetFbmMatrixBridgeForTest();
    const provider = getMarketplaceProvider('freeblackmarket');
    if (provider) getFreeblackmarketStubInternals(provider)?.reset();
}

function buildFakeMatrix() {
    const calls = {
        sendEvent: [] as Array<{ roomId: string; content: Record<string, unknown> }>,
    };
    let n = 0;
    const matrix = {
        async botUserId() {
            return '@bot:test';
        },
        async createRoom() {
            return { ok: true as const, status: 200, roomId: `!room${++n}:test` };
        },
        async sendEvent(roomId: string, content: Record<string, unknown>) {
            calls.sendEvent.push({ roomId, content });
            return { ok: true as const, status: 200, eventId: `$e${++n}` };
        },
        async sendStateEvent() {
            return { ok: true as const, status: 200, eventId: `$s${++n}` };
        },
        async inviteToRoom() {
            return { ok: true as const, status: 200 };
        },
        async adminJoinUserToRoom() {
            return { ok: true as const, status: 200 };
        },
    };
    return { matrix, calls };
}

test('barter.offer_created posts a co.bmc.marketplace.barter block; counterparty is pseudonymous', async () => {
    resetAll();
    const { matrix, calls } = buildFakeMatrix();
    const provider = getMarketplaceProvider('freeblackmarket');
    assert.ok(provider);
    const event = parseFbmMatrixEvent({
        eventId: 'barter-1',
        type: 'barter.offer_created',
        barterId: 'bt_77',
        vendorId: 'vendor-a',
        counterpartyUserId: 'rival-vendor-secret',
        offered: [{ sku: 'tomato', title: 'Tomatoes', qty: 5 }],
        requested: [{ title: 'Basil', qty: 2 }],
    });
    assert.ok(event);

    await dispatchFbmMatrixEvent(provider, event, { matrixClient: matrix });

    const post = calls.sendEvent.find((s) => 'co.bmc.marketplace.barter' in s.content);
    assert.ok(post, 'expected a barter post');
    const block = post.content['co.bmc.marketplace.barter'] as Record<string, unknown>;
    assert.equal(block.barterId, 'bt_77');
    assert.equal(block.kind, 'offer_created');
    assert.ok(String(block.counterpartyAlias).startsWith('buyer~'));
    // The raw counterparty id must never leak into room content.
    assert.ok(!JSON.stringify(post.content).includes('rival-vendor-secret'));
});

test('credits.earned posts an order-linked co.bmc.marketplace.credits block to the buyer room', async () => {
    resetAll();
    const { matrix, calls } = buildFakeMatrix();
    const provider = getMarketplaceProvider('freeblackmarket');
    assert.ok(provider);
    const event = parseFbmMatrixEvent({
        eventId: 'credits-1',
        type: 'credits.earned',
        userId: 'buyer-7',
        vendorId: 'vendor-a',
        orderId: 'ord_5',
        unit: 'xp',
        amount: 50,
        reason: 'Order completed',
        balance: 1250,
    });
    assert.ok(event);

    await dispatchFbmMatrixEvent(provider, event, { matrixClient: matrix });

    const post = calls.sendEvent.find((s) => 'co.bmc.marketplace.credits' in s.content);
    assert.ok(post, 'expected a credits post');
    const block = post.content['co.bmc.marketplace.credits'] as Record<string, unknown>;
    assert.equal(block.kind, 'earned');
    assert.equal(block.unit, 'xp');
    assert.equal(block.amount, 50);
    assert.equal(block.orderId, 'ord_5');
    assert.equal(block.balance, 1250);
});

test('rejects malformed barter/credits payloads', () => {
    // barter without barterId
    assert.equal(
        parseFbmMatrixEvent({ eventId: 'e', type: 'barter.offer_created', vendorId: 'v' }),
        null
    );
    // credits missing orderId
    assert.equal(
        parseFbmMatrixEvent({
            eventId: 'e',
            type: 'credits.earned',
            userId: 'u',
            vendorId: 'v',
            unit: 'xp',
            amount: 5,
            reason: 'x',
        }),
        null
    );
    // credits with a bad unit
    assert.equal(
        parseFbmMatrixEvent({
            eventId: 'e',
            type: 'credits.spent',
            userId: 'u',
            vendorId: 'v',
            orderId: 'o',
            unit: 'gold',
            amount: 5,
            reason: 'x',
        }),
        null
    );
});
