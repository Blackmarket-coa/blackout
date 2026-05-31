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
process.env.FBM_LOGISTICS_ESCALATION_ROOM = '!escalation:test';
process.env.FBM_FLASH_SALE_PIN_TTL_SECONDS = '3600';
delete process.env.MATRIX_HOMESERVER;
delete process.env.MATRIX_BOT_TOKEN;

const { db } = await import('../src/db/store');
const { resetMarketplaceEntitlementsForTest, recordWebhookReceipt } = await import(
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
const { runFlashSalePinSweep, flashSalePinId } = await import(
    '../src/services/fbmMatrixBridge/flashMob'
);
const { resolveProposalAndNotifyFbm } = await import('../src/services/governanceFbmBridge');

function resetAll() {
    resetMarketplaceEntitlementsForTest();
    resetMarketplaceRegistry();
    db.resetFbmMatrixBridgeForTest();
    for (const item of db.listCoalitionSpatialItems()) db.deleteCoalitionSpatialItem(item.id);
    const provider = getMarketplaceProvider('freeblackmarket');
    if (provider) getFreeblackmarketStubInternals(provider)?.reset();
}

function buildFakeMatrix() {
    const calls = {
        createRoom: [] as Array<Record<string, unknown>>,
        sendEvent: [] as Array<{ roomId: string; content: Record<string, unknown> }>,
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
        async kickFromRoom() {
            return { ok: true as const, status: 200 };
        },
        async purgeRoom() {
            return { ok: true as const, status: 200, deleteId: 'd' };
        },
    };
    return { matrix, calls };
}

function provider() {
    const p = getMarketplaceProvider('freeblackmarket');
    assert.ok(p);
    return p!;
}

function makeEvent(raw: Record<string, unknown>) {
    const event = parseFbmMatrixEvent(raw);
    assert.ok(event, `should parse ${JSON.stringify(raw)}`);
    recordWebhookReceipt(provider().id, event!.eventId, true, raw);
    return event!;
}

// --- parsing ------------------------------------------------------------------

test('parseFbmMatrixEvent: accepts logistics + flash_sale families, rejects bad', () => {
    const ok = [
        { eventId: 'e', type: 'blackstar.driver_assigned', vendorId: 'v', userId: 'u', orderId: 'o' },
        { eventId: 'e', type: 'blackstar.delivered', vendorId: 'v', userId: 'u', orderId: 'o' },
        { eventId: 'e', type: 'flash_sale.start', vendorId: 'v', saleId: 's', name: 'n', discount: '20%', durationSeconds: 900 },
    ];
    for (const raw of ok) assert.ok(parseFbmMatrixEvent(raw), `parse ${raw.type}`);
    assert.equal(parseFbmMatrixEvent({ eventId: 'e', type: 'blackstar.delivered', vendorId: 'v', userId: 'u' }), null);
    assert.equal(parseFbmMatrixEvent({ eventId: 'e', type: 'flash_sale.start', vendorId: 'v', saleId: 's', name: 'n', discount: '20%' }), null);
});

// --- logistics ----------------------------------------------------------------

test('logistics: posts to vendor orders room + buyer order room; failure hits escalation', async () => {
    resetAll();
    const { matrix, calls } = buildFakeMatrix();

    const assigned = makeEvent({
        eventId: 'log-1', type: 'blackstar.driver_assigned',
        vendorId: 'vendor-1', userId: 'buyer-1', orderId: 'ord_1',
        driverName: 'Sam', vehicleType: 'cargo e-bike', trackingUrl: 'https://track/abc',
    });
    await dispatchFbmMatrixEvent(provider(), assigned, { matrixClient: matrix as never });

    const rooms = db.getFbmVendorRooms('vendor-1');
    assert.ok(rooms, 'vendor space provisioned');
    const buyerRoom = db.getFbmBuyerOrderRoom('ord_1');
    assert.ok(buyerRoom, 'buyer order room provisioned');
    // vendor copy carries the pseudonymous alias; buyer copy does not mention vendor alias
    const vendorPost = calls.sendEvent.find((s) => s.roomId === rooms!.ordersRoomId);
    const buyerPost = calls.sendEvent.find((s) => s.roomId === buyerRoom!.roomId);
    assert.ok(vendorPost && buyerPost);
    assert.match(String(vendorPost!.content.body), /Driver assigned Sam \(cargo e-bike\)/);
    assert.match(String(buyerPost!.content.body), /A driver is assigned to your order/);

    // failure → escalation room
    const failedEvt = makeEvent({
        eventId: 'log-2', type: 'blackstar.failed',
        vendorId: 'vendor-1', userId: 'buyer-1', orderId: 'ord_1', failureReason: 'no answer',
    });
    await dispatchFbmMatrixEvent(provider(), failedEvt, { matrixClient: matrix as never });
    const escalation = calls.sendEvent.find((s) => s.roomId === '!escalation:test');
    assert.ok(escalation, 'failure posted to escalation room');
    assert.match(String(escalation!.content.body), /Delivery failed — vendor vendor-1/);
});

// --- flash mob ----------------------------------------------------------------

test('flash_sale.start: broadcasts to announce room + drops ephemeral max-heat pin; sweeper purges', async () => {
    resetAll();
    const { matrix, calls } = buildFakeMatrix();
    const event = makeEvent({
        eventId: 'flash-1', type: 'flash_sale.start',
        vendorId: 'vendor-2', saleId: 'sale_1', name: 'Tomato blowout', discount: '30%',
        durationSeconds: 1800, latitude: 40.1, longitude: -74.2,
        listingDeepLink: 'https://fbm/sale_1',
    });
    await dispatchFbmMatrixEvent(provider(), event, { matrixClient: matrix as never });

    // public announce room broadcast
    const publicRoom = calls.createRoom.find((c) => c.preset === 'public_chat');
    assert.ok(publicRoom, 'public announce room created');
    const broadcast = calls.sendEvent.find((s) =>
        String((s.content as Record<string, unknown>).body).includes('Flash sale: Tomato blowout')
    );
    assert.ok(broadcast, 'flash-sale notice broadcast');

    // ephemeral spatial pin with max heat
    const pinId = flashSalePinId('sale_1');
    const pin = db.listCoalitionSpatialItems().find((p) => p.id === pinId);
    assert.ok(pin, 'spatial pin created');
    assert.equal(pin!.activityLevel, 1);
    assert.equal((pin!.meta as Record<string, unknown>).ephemeral, true);
    assert.equal((pin!.meta as Record<string, unknown>).heatMultiplier, 8);

    // not yet expired → sweep is a no-op
    assert.equal(runFlashSalePinSweep(Date.now()).purged, 0);
    // force expiry → swept
    db.upsertCoalitionSpatialItem({
        ...pin!,
        meta: { ...(pin!.meta as Record<string, unknown>), purgeAt: '2000-01-01T00:00:00.000Z' },
    });
    assert.equal(runFlashSalePinSweep(Date.now()).purged, 1);
    assert.equal(db.listCoalitionSpatialItems().find((p) => p.id === pinId), undefined);
});

// --- governance round-trip ----------------------------------------------------

test('resolveProposalAndNotifyFbm: tallies winner and returns resolution', () => {
    resetAll();
    const proposal = db.createVote({
        id: 'prop-1', communityId: 'coop-1', proposerId: 'user-1', title: 'Raise kale price?',
        voteType: 'yes_no', options: [{ id: 'yes', text: 'Yes' }, { id: 'no', text: 'No' }],
        requiresQuorum: 1, durationHours: 24, status: 'active',
    });
    db.castVote({ id: 'v1', voteId: proposal.id, userId: 'a', choice: 'yes', weight: 1 });
    db.castVote({ id: 'v2', voteId: proposal.id, userId: 'b', choice: 'yes', weight: 1 });
    db.castVote({ id: 'v3', voteId: proposal.id, userId: 'c', choice: 'no', weight: 1 });

    const resolution = resolveProposalAndNotifyFbm(proposal.id);
    assert.ok(resolution);
    assert.equal(resolution!.result, 'yes');
    assert.equal(resolution!.communityId, 'coop-1');
    assert.ok(resolution!.tally.find((t) => t.choice === 'yes' && t.votes === 2));

    assert.equal(resolveProposalAndNotifyFbm('nope'), null);
});

test('resolveProposalAndNotifyFbm: tie returns null result', () => {
    resetAll();
    const proposal = db.createVote({
        id: 'prop-2', communityId: 'coop-1', proposerId: 'user-1', title: 'Tie',
        voteType: 'yes_no', options: [{ id: 'yes', text: 'Yes' }, { id: 'no', text: 'No' }],
        requiresQuorum: 1, durationHours: 24, status: 'active',
    });
    db.castVote({ id: 'v1', voteId: proposal.id, userId: 'a', choice: 'yes', weight: 1 });
    db.castVote({ id: 'v2', voteId: proposal.id, userId: 'b', choice: 'no', weight: 1 });
    assert.equal(resolveProposalAndNotifyFbm(proposal.id)!.result, null);
});

// --- HTTP stub-driven ---------------------------------------------------------

test('HTTP: stub fbm-event drives logistics + flash_sale and acks 200', async () => {
    resetAll();
    const { default: app } = await import('../src/index');
    for (const [kind, body] of [
        ['blackstar.delivered', { eventId: 'h-log', vendorId: 'v', userId: 'u', orderId: 'o' }],
        ['flash_sale.start', { eventId: 'h-flash', vendorId: 'v', saleId: 's', name: 'n', discount: '10%', durationSeconds: 600 }],
    ] as const) {
        const res = await app.request(`/v1/marketplace/stub/fbm-event/${kind}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });
        assert.equal(res.status, 200, `kind ${kind}`);
        assert.equal(((await res.json()) as { ok: boolean }).ok, true);
    }
});
