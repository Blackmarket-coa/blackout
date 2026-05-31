import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.FREEBLACKMARKET_STUB = '1';
process.env.FREEBLACKMARKET_WEBHOOK_SECRET =
    process.env.FREEBLACKMARKET_WEBHOOK_SECRET ?? 'stub-webhook-secret';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
// Bridge config for this suite.
process.env.FBM_MATRIX_BRIDGE_ENABLED = '1';
process.env.FBM_TIER_ROOM_SIGNAL = '!signal-tier:test';
process.env.FBM_DISPUTE_MEDIATOR_POOL = '@mediator-a:test,@mediator-b:test';
process.env.FBM_PSEUDONYM_SALT = 'test-salt';
// Ensure Matrix is unconfigured for the HTTP graceful-degradation cases.
delete process.env.MATRIX_HOMESERVER;
delete process.env.MATRIX_HOMESERVER_URL;
delete process.env.MATRIX_BOT_TOKEN;

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const {
    resetMarketplaceEntitlementsForTest,
    listEntitlementsForUser,
    recordWebhookReceipt,
} = await import('../src/services/marketplaceEntitlements');
const { resetMarketplaceRegistry, getMarketplaceProvider } = await import(
    '../src/integrations/marketplace'
);
const { getFreeblackmarketStubInternals } = await import(
    '../src/integrations/marketplace/freeblackmarketStub'
);
const messageFormat = await import('../src/services/fbmMatrixBridge/messageFormat');
const { parseFbmMatrixEvent } = await import('../src/services/fbmMatrixBridge/events');
const { pseudonymousAlias } = await import('../src/services/fbmMatrixBridge/identity');
const { dispatchFbmMatrixEvent } = await import('../src/services/fbmMatrixBridge');
const { maybeDeliverDigitalDeadDrop } = await import(
    '../src/services/fbmMatrixBridge/deadDropDelivery'
);
const { runFbmTombstoneSweep } = await import(
    '../src/services/fbmMatrixBridge/tombstoneDispatcher'
);

const USER_ID = 'stub-user';

function authHeaders(): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(USER_ID, 'stub-tester', 600)}`,
        'content-type': 'application/json',
    };
}

function resetAll() {
    resetMarketplaceEntitlementsForTest();
    resetMarketplaceRegistry();
    db.resetFbmMatrixBridgeForTest();
    const provider = getMarketplaceProvider('freeblackmarket');
    if (provider) getFreeblackmarketStubInternals(provider)?.reset();
}

// A fake Matrix client that records calls and hands back synthetic room ids, so
// the room orchestration can be asserted without a live Synapse.
function buildFakeMatrix() {
    const calls = {
        createRoom: [] as Array<Record<string, unknown>>,
        sendEvent: [] as Array<{ roomId: string; content: Record<string, unknown> }>,
        sendStateEvent: [] as Array<{ roomId: string; type: string; stateKey: string }>,
        invite: [] as Array<{ roomId: string; userId: string }>,
        kick: [] as Array<{ roomId: string; userId: string }>,
        purge: [] as string[],
    };
    let n = 0;
    const matrix = {
        async botUserId() {
            return '@bot:test';
        },
        async createRoom(input: Record<string, unknown>) {
            calls.createRoom.push(input);
            return { ok: true as const, status: 200, roomId: `!room${++n}:test` };
        },
        async sendEvent(roomId: string, content: Record<string, unknown>) {
            calls.sendEvent.push({ roomId, content });
            return { ok: true as const, status: 200, eventId: `$evt${++n}` };
        },
        async sendStateEvent(
            roomId: string,
            type: string,
            _content: Record<string, unknown>,
            stateKey = ''
        ) {
            calls.sendStateEvent.push({ roomId, type, stateKey });
            return { ok: true as const, status: 200, eventId: `$state${++n}` };
        },
        async inviteToRoom(roomId: string, userId: string) {
            calls.invite.push({ roomId, userId });
            return { ok: true as const, status: 200 };
        },
        async adminJoinUserToRoom(roomId: string, userId: string) {
            calls.invite.push({ roomId, userId });
            return { ok: true as const, status: 200 };
        },
        async kickFromRoom(roomId: string, userId: string) {
            calls.kick.push({ roomId, userId });
            return { ok: true as const, status: 200 };
        },
        async purgeRoom(roomId: string) {
            calls.purge.push(roomId);
            return { ok: true as const, status: 200, deleteId: `del${++n}` };
        },
    };
    return { matrix, calls };
}

function provider() {
    const p = getMarketplaceProvider('freeblackmarket');
    assert.ok(p, 'stub provider must be registered');
    return p!;
}

// Build a typed bridge event from a raw payload via the real parser, recording a
// webhook receipt first so webhook-level idempotency behaves like production.
function makeEvent(raw: Record<string, unknown>) {
    const event = parseFbmMatrixEvent(raw);
    assert.ok(event, `payload should parse: ${JSON.stringify(raw)}`);
    recordWebhookReceipt(provider().id, event!.eventId, true, raw);
    return event!;
}

// --- Unit: pure formatters ----------------------------------------------------

test('messageFormat: money + short ref', () => {
    assert.equal(messageFormat.formatMoney(4200, 'USD'), '$42.00');
    assert.equal(messageFormat.formatMoney(150, 'EUR'), '€1.50');
    assert.equal(messageFormat.formatMoney(999, 'CAD'), '9.99 CAD');
    assert.equal(messageFormat.shortRef('ord_8f3a91c2'), '91C2');
});

test('messageFormat: order created body + structured block', () => {
    const event = makeEvent({
        eventId: 'fmt-1',
        type: 'order.created',
        vendorId: 'v1',
        userId: 'buyer-1',
        orderId: 'ord_ABCD',
        items: [{ sku: 's1', title: 'Cat Sticker Pack', qty: 2, priceCents: 199 }],
        totalCents: 398,
        currency: 'USD',
    });
    assert.equal(event.type, 'order.created');
    const formatted = messageFormat.formatOrderCreated(event as never, 'buyer~abc123');
    assert.equal(
        formatted.body,
        'New order #ABCD from buyer~abc123 — 2× Cat Sticker Pack. Total $3.98.'
    );
    assert.ok(formatted.content['co.bmc.marketplace.order']);
});

test('messageFormat: ledger escrow body', () => {
    const event = makeEvent({
        eventId: 'fmt-2',
        type: 'ledger.escrow_released',
        vendorId: 'v1',
        orderId: 'ord_WXYZ',
        amountMinorUnits: 4200,
        currency: 'USD',
        ledgerTxId: 'tx1',
    });
    const formatted = messageFormat.formatLedger(event as never);
    assert.equal(formatted.body, 'Escrow released: $42.00 for order #WXYZ.');
});

// --- Unit: event parsing ------------------------------------------------------

test('parseFbmMatrixEvent: accepts every bridge family', () => {
    const families = [
        { eventId: 'e', type: 'order.created', vendorId: 'v', userId: 'u', orderId: 'o' },
        { eventId: 'e', type: 'order.updated', vendorId: 'v', userId: 'u', orderId: 'o', status: 'dispatched' },
        { eventId: 'e', type: 'order.cancelled', vendorId: 'v', userId: 'u', orderId: 'o' },
        { eventId: 'e', type: 'inventory.low', vendorId: 'v', sku: 's', title: 't', remaining: 1 },
        { eventId: 'e', type: 'ledger.refund', vendorId: 'v', amountMinorUnits: 100, ledgerTxId: 'tx' },
        { eventId: 'e', type: 'subscription.activated', userId: 'u', tier: 'signal', subscriptionId: 'sub' },
        { eventId: 'e', type: 'subscription.lapsed', userId: 'u', tier: 'community', subscriptionId: 'sub' },
        { eventId: 'e', type: 'dispute.opened', disputeId: 'd', vendorId: 'v', userId: 'u', orderId: 'o' },
        { eventId: 'e', type: 'dispute.resolved', disputeId: 'd' },
    ];
    for (const raw of families) {
        assert.ok(parseFbmMatrixEvent(raw), `should parse ${raw.type}`);
    }
});

test('parseFbmMatrixEvent: returns null for purchase.* and garbage (fall-through)', () => {
    assert.equal(parseFbmMatrixEvent({ eventId: 'e', type: 'purchase.succeeded' }), null);
    assert.equal(parseFbmMatrixEvent({ type: 'order.created' }), null); // missing eventId/fields
    assert.equal(parseFbmMatrixEvent({ eventId: 'e', type: 'order.updated', vendorId: 'v', userId: 'u', orderId: 'o', status: 'bogus' }), null);
    assert.equal(parseFbmMatrixEvent(null), null);
    assert.equal(parseFbmMatrixEvent('nope'), null);
});

// --- Unit: pseudonymous alias -------------------------------------------------

test('pseudonymousAlias: stable, non-reversible, vendor-scoped', () => {
    const a = pseudonymousAlias('@buyer:test', 'vendor-1');
    const b = pseudonymousAlias('@buyer:test', 'vendor-1');
    const c = pseudonymousAlias('@buyer:test', 'vendor-2');
    assert.equal(a, b, 'stable for same buyer+vendor');
    assert.notEqual(a, c, 'differs across vendors');
    assert.match(a, /^buyer~[0-9a-f]{6}$/);
    assert.ok(!a.includes('@buyer:test'), 'never leaks the MXID');
});

// --- Bridge dispatch with a fake Matrix client --------------------------------

test('order.created: provisions vendor space + rooms, posts order, persists mapping', async () => {
    resetAll();
    const { matrix, calls } = buildFakeMatrix();
    const event = makeEvent({
        eventId: 'ord-evt-1',
        type: 'order.created',
        vendorId: 'vendor-1',
        userId: 'buyer-1',
        orderId: 'ord_1',
        items: [{ sku: 's', title: 'Thing', qty: 1, priceCents: 500 }],
        totalCents: 500,
        currency: 'USD',
    });
    const res = await dispatchFbmMatrixEvent(provider(), event, { matrixClient: matrix as never });
    assert.equal(res.ok, true);
    assert.equal(res.status, 200);

    const mapping = db.getFbmVendorRooms('vendor-1');
    assert.ok(mapping, 'vendor room mapping persisted');
    // space + 3 child rooms
    assert.equal(calls.createRoom.length, 4);
    // posted into the orders room
    const posted = calls.sendEvent.find((s) => s.roomId === mapping!.ordersRoomId);
    assert.ok(posted, 'order message posted to orders room');
    assert.ok((posted!.content as Record<string, unknown>)['co.bmc.marketplace.order']);
});

test('order.created: replay is idempotent (no duplicate provisioning/post)', async () => {
    resetAll();
    const { matrix, calls } = buildFakeMatrix();
    const raw = {
        eventId: 'ord-evt-replay',
        type: 'order.created',
        vendorId: 'vendor-r',
        userId: 'buyer-1',
        orderId: 'ord_r',
        items: [],
        totalCents: 0,
        currency: 'USD',
    };
    const event = makeEvent(raw);
    const first = await dispatchFbmMatrixEvent(provider(), event, { matrixClient: matrix as never });
    assert.equal(first.applied.alreadyProcessed, false);
    const postsAfterFirst = calls.sendEvent.length;

    const second = await dispatchFbmMatrixEvent(provider(), event, { matrixClient: matrix as never });
    assert.equal(second.applied.alreadyProcessed, true, 'replay acks as already processed');
    assert.equal(calls.sendEvent.length, postsAfterFirst, 'no second post on replay');
});

test('order.updated: pushes status to the buyer order room', async () => {
    resetAll();
    const { matrix, calls } = buildFakeMatrix();
    const event = makeEvent({
        eventId: 'ord-upd-1',
        type: 'order.updated',
        vendorId: 'vendor-u',
        userId: 'buyer-1',
        orderId: 'ord_u',
        status: 'dispatched',
    });
    await dispatchFbmMatrixEvent(provider(), event, { matrixClient: matrix as never });
    const buyerRoom = db.getFbmBuyerOrderRoom('ord_u');
    assert.ok(buyerRoom, 'buyer order room persisted');
    const buyerPost = calls.sendEvent.find((s) => s.roomId === buyerRoom!.roomId);
    assert.ok(buyerPost, 'status posted to buyer order room');
    assert.match(String((buyerPost!.content as Record<string, unknown>).body), /is now dispatched/);
});

test('subscription.activated/lapsed: invites then kicks from the tier room', async () => {
    resetAll();
    const { matrix, calls } = buildFakeMatrix();
    const activate = makeEvent({
        eventId: 'sub-act-1',
        type: 'subscription.activated',
        userId: '@buyer:test',
        tier: 'signal',
        subscriptionId: 'sub-1',
    });
    await dispatchFbmMatrixEvent(provider(), activate, { matrixClient: matrix as never });
    assert.deepEqual(calls.invite.at(-1), { roomId: '!signal-tier:test', userId: '@buyer:test' });

    const lapse = makeEvent({
        eventId: 'sub-lapse-1',
        type: 'subscription.lapsed',
        userId: '@buyer:test',
        tier: 'signal',
        subscriptionId: 'sub-1',
    });
    await dispatchFbmMatrixEvent(provider(), lapse, { matrixClient: matrix as never });
    assert.deepEqual(calls.kick.at(-1), { roomId: '!signal-tier:test', userId: '@buyer:test' });
});

test('dispute.opened then resolved: creates encrypted room, invites three parties, then marks read-only + purge window', async () => {
    resetAll();
    const { matrix, calls } = buildFakeMatrix();
    const opened = makeEvent({
        eventId: 'disp-open-1',
        type: 'dispute.opened',
        disputeId: 'disp-1',
        vendorId: '@vendor:test',
        userId: '@buyer:test',
        orderId: 'ord_d',
    });
    await dispatchFbmMatrixEvent(provider(), opened, { matrixClient: matrix as never });
    const record = db.getFbmDisputeRoom('disp-1');
    assert.ok(record, 'dispute room persisted');
    assert.equal(record!.status, 'open');
    assert.ok(record!.mediatorUserId, 'a mediator was auto-assigned');
    // encryption forced on
    assert.ok(calls.sendStateEvent.some((s) => s.type === 'm.room.encryption'));
    // buyer, vendor, mediator invited
    assert.equal(calls.invite.length, 3);

    const resolved = makeEvent({
        eventId: 'disp-res-1',
        type: 'dispute.resolved',
        disputeId: 'disp-1',
        outcome: 'refunded',
    });
    await dispatchFbmMatrixEvent(provider(), resolved, { matrixClient: matrix as never });
    const after = db.getFbmDisputeRoom('disp-1');
    assert.equal(after!.status, 'resolved');
    assert.ok(after!.resolvedAt);
    assert.ok(after!.purgeAfter, 'retention window set');
    assert.ok(calls.sendStateEvent.some((s) => s.type === 'm.room.power_levels'));
});

test('digital dead-drop: provisions encrypted room + persists delivery; sweeper purges after TTL', async () => {
    resetAll();
    const { matrix, calls } = buildFakeMatrix();
    const event = {
        providerId: 'freeblackmarket' as const,
        eventId: 'dd-evt-1',
        type: 'purchase.succeeded' as const,
        userId: 'buyer-1',
        providerListingId: 'stub-digital-ebook',
        sku: null,
        kind: 'vault_item' as const,
        occurredAt: new Date().toISOString(),
        metadata: { digitalDelivery: true },
    };
    const applied = { entitlement: { id: 'ent-1' } as never, licenseKey: null, alreadyProcessed: false };
    await maybeDeliverDigitalDeadDrop(event, applied, { matrixClient: matrix as never });

    const delivery = db.getFbmDeaddropDeliveryBySourceEvent('dd-evt-1');
    assert.ok(delivery, 'delivery persisted');
    assert.ok(calls.sendStateEvent.some((s) => s.type === 'm.room.encryption'), 'room encrypted');
    assert.equal(delivery!.tombstonedAt, null);

    // Force the TTL into the past and sweep.
    db.upsertFbmDeaddropDelivery({ ...delivery!, expiresAt: '2000-01-01T00:00:00.000Z' });
    const swept = await runFbmTombstoneSweep(matrix as never);
    assert.equal(swept.deaddropsTombstoned, 1);
    assert.ok(calls.purge.includes(delivery!.roomId));
    assert.ok(db.getFbmDeaddropDeliveryBySourceEvent('dd-evt-1')!.tombstonedAt);
});

// --- HTTP stub-driven flow + graceful degradation (Matrix unconfigured) -------

test('HTTP: stub fbm-event drives the bridge and acks (graceful when Matrix unconfigured)', async () => {
    resetAll();
    const body = JSON.stringify({
        eventId: 'http-order-1',
        vendorId: 'vendor-http',
        userId: USER_ID,
        orderId: 'ord_http',
        items: [],
        totalCents: 0,
        currency: 'USD',
    });
    const first = await app.request('/v1/marketplace/stub/fbm-event/order.created', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
    });
    assert.equal(first.status, 200);
    const firstJson = (await first.json()) as { ok: boolean; alreadyProcessed: boolean };
    assert.equal(firstJson.ok, true);
    assert.equal(firstJson.alreadyProcessed, false);

    // Replay with the same eventId → acknowledged as already processed.
    const second = await app.request('/v1/marketplace/stub/fbm-event/order.created', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
    });
    const secondJson = (await second.json()) as { alreadyProcessed: boolean };
    assert.equal(secondJson.alreadyProcessed, true);
});

test('HTTP: digital purchase still grants entitlement even when dead-drop delivery cannot reach Matrix', async () => {
    resetAll();
    const checkout = await app.request('/v1/marketplace/checkout', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
            providerId: 'freeblackmarket',
            listingId: 'stub-digital-ebook',
            embed: true,
        }),
    });
    assert.equal(checkout.status, 200);
    const { sessionId } = (await checkout.json()) as { sessionId: string };

    const complete = await app.request(`/v1/marketplace/stub/checkout/${sessionId}/complete`, {
        method: 'POST',
    });
    assert.equal(complete.status, 200);

    const entitlements = listEntitlementsForUser(USER_ID);
    assert.equal(entitlements.length, 1);
    assert.equal(entitlements[0]!.providerListingId, 'stub-digital-ebook');
    assert.equal(entitlements[0]!.status, 'granted');
});
