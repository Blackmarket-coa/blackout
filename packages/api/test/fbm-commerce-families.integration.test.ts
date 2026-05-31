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
const messageFormat = await import('../src/services/fbmMatrixBridge/messageFormat');

function resetAll() {
    resetMarketplaceEntitlementsForTest();
    resetMarketplaceRegistry();
    db.resetFbmMatrixBridgeForTest();
    const provider = getMarketplaceProvider('freeblackmarket');
    if (provider) getFreeblackmarketStubInternals(provider)?.reset();
}

function buildFakeMatrix() {
    const calls = {
        createRoom: [] as Array<Record<string, unknown>>,
        sendEvent: [] as Array<{ roomId: string; content: Record<string, unknown> }>,
        sendStateEvent: [] as Array<{ roomId: string; type: string; stateKey: string; content: Record<string, unknown> }>,
        invite: [] as Array<{ roomId: string; userId: string }>,
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
        async sendStateEvent(roomId: string, type: string, content: Record<string, unknown>, stateKey = '') {
            calls.sendStateEvent.push({ roomId, type, stateKey, content });
            return { ok: true as const, status: 200, eventId: `$s${++n}` };
        },
        async inviteToRoom(roomId: string, userId: string) {
            calls.invite.push({ roomId, userId });
            return { ok: true as const, status: 200 };
        },
        async adminJoinUserToRoom(roomId: string, userId: string) {
            calls.invite.push({ roomId, userId });
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

test('parseFbmMatrixEvent: accepts the three new Phase-2 families', () => {
    const ok = [
        { eventId: 'e', type: 'cycle.open', vendorId: 'v', cycleId: 'c', name: 'Spring' },
        { eventId: 'e', type: 'cycle.close', vendorId: 'v', cycleId: 'c', name: 'Spring' },
        { eventId: 'e', type: 'sold_out', vendorId: 'v', cycleId: 'c', name: 'Spring', soldOutSku: 's' },
        { eventId: 'e', type: 'message.sent', vendorId: 'v', userId: 'u', body: 'hi' },
        { eventId: 'e', type: 'vendor.trust_changed', vendorId: 'v', verified: true, tier: 'verified' },
    ];
    for (const raw of ok) assert.ok(parseFbmMatrixEvent(raw), `parse ${raw.type}`);
    // bad tier / missing verified rejected
    assert.equal(parseFbmMatrixEvent({ eventId: 'e', type: 'vendor.trust_changed', vendorId: 'v', tier: 'bogus' }), null);
    assert.equal(parseFbmMatrixEvent({ eventId: 'e', type: 'vendor.trust_changed', vendorId: 'v', tier: 'verified' }), null);
});

// --- formatters ---------------------------------------------------------------

test('formatCycle: open / close / sold_out bodies', () => {
    const open = makeEvent({
        eventId: 'fc1', type: 'cycle.open', vendorId: 'v', cycleId: 'c', name: 'Spring',
        items: [{ sku: 's1', title: 'Kale' }], closingAt: '2026-06-01T00:00:00Z',
    });
    assert.match(messageFormat.formatCycle(open as never).body, /Order cycle "Spring" is open\. 1 item available\./);

    const close = makeEvent({ eventId: 'fc2', type: 'cycle.close', vendorId: 'v', cycleId: 'c', name: 'Spring', ordersPlaced: 9 });
    assert.match(messageFormat.formatCycle(close as never).body, /has closed\. 9 order\(s\) placed\./);

    const sold = makeEvent({ eventId: 'fc3', type: 'sold_out', vendorId: 'v', cycleId: 'c', name: 'Spring', soldOutSku: 'Kale' });
    assert.match(messageFormat.formatCycle(sold as never).body, /Sold out: Kale in "Spring"\./);
});

test('formatCustomerMessage: prefixes pseudonymous alias, never the raw id', () => {
    const evt = makeEvent({ eventId: 'fm1', type: 'message.sent', vendorId: 'v', userId: 'buyer-1', body: 'is this gluten free?' });
    const out = messageFormat.formatCustomerMessage(evt as never, 'buyer~abc123');
    assert.equal(out.body, 'buyer~abc123: is this gluten free?');
    assert.ok(!out.body.includes('buyer-1'));
});

// --- dispatch with fake matrix ------------------------------------------------

test('cycle.open: lazily provisions a PUBLIC announce room and posts', async () => {
    resetAll();
    const { matrix, calls } = buildFakeMatrix();
    const event = makeEvent({
        eventId: 'cyc-1', type: 'cycle.open', vendorId: 'vendor-1', cycleId: 'cyc', name: 'Spring Harvest',
    });
    await dispatchFbmMatrixEvent(provider(), event, { matrixClient: matrix as never });

    const rooms = db.getFbmVendorRooms('vendor-1');
    assert.ok(rooms?.announceRoomId, 'announce room persisted on the mapping');
    const announceCreate = calls.createRoom.find((c) => c.preset === 'public_chat');
    assert.ok(announceCreate, 'announce room created as public_chat');
    const posted = calls.sendEvent.find((s) => s.roomId === rooms!.announceRoomId);
    assert.ok(posted);
    assert.ok((posted!.content as Record<string, unknown>)['co.bmc.marketplace.cycle']);

    // Second cycle event reuses the same room (no second public room).
    const event2 = makeEvent({ eventId: 'cyc-2', type: 'cycle.close', vendorId: 'vendor-1', cycleId: 'cyc', name: 'Spring Harvest' });
    const publicBefore = calls.createRoom.filter((c) => c.preset === 'public_chat').length;
    await dispatchFbmMatrixEvent(provider(), event2, { matrixClient: matrix as never });
    const publicAfter = calls.createRoom.filter((c) => c.preset === 'public_chat').length;
    assert.equal(publicAfter, publicBefore, 'announce room reused');
});

test('message.sent: provisions a private customer-messages room and posts aliased body', async () => {
    resetAll();
    const { matrix, calls } = buildFakeMatrix();
    const event = makeEvent({
        eventId: 'msg-1', type: 'message.sent', vendorId: 'vendor-2', userId: 'buyer-9', body: 'hello vendor',
    });
    await dispatchFbmMatrixEvent(provider(), event, { matrixClient: matrix as never });
    const rooms = db.getFbmVendorRooms('vendor-2');
    assert.ok(rooms?.customerMessagesRoomId, 'customer-messages room persisted');
    const posted = calls.sendEvent.find((s) => s.roomId === rooms!.customerMessagesRoomId);
    assert.ok(posted);
    const body = String((posted!.content as Record<string, unknown>).body);
    assert.match(body, /^buyer~[0-9a-f]{6}: hello vendor$/);
    assert.ok(!body.includes('buyer-9'));
});

test('vendor.trust_changed: writes co.bmc.vendor.trust state on space + orders room, keyed by vendorId', async () => {
    resetAll();
    const { matrix, calls } = buildFakeMatrix();
    const event = makeEvent({
        eventId: 'trust-1', type: 'vendor.trust_changed', vendorId: 'vendor-3',
        verified: true, tier: 'trusted', completionRate: 0.98, disputeRate: 0.01,
    });
    await dispatchFbmMatrixEvent(provider(), event, { matrixClient: matrix as never });
    const rooms = db.getFbmVendorRooms('vendor-3');
    assert.ok(rooms);
    const trustWrites = calls.sendStateEvent.filter((s) => s.type === 'co.bmc.vendor.trust');
    assert.equal(trustWrites.length, 2, 'written to space + orders room');
    for (const w of trustWrites) {
        assert.equal(w.stateKey, 'vendor-3', 'state key is the vendor id');
        assert.equal((w.content as Record<string, unknown>).tier, 'trusted');
    }
    const target = new Set(trustWrites.map((w) => w.roomId));
    assert.ok(target.has(rooms!.spaceRoomId));
    assert.ok(target.has(rooms!.ordersRoomId));
});

// --- HTTP stub-driven path (graceful when Matrix unconfigured) ----------------

test('HTTP: /stub/fbm-event drives each new family and acks 200; replay idempotent', async () => {
    resetAll();
    const { default: app } = await import('../src/index');
    const body = JSON.stringify({
        eventId: 'http-cyc-1', vendorId: 'vendor-http', cycleId: 'c1', name: 'Cycle',
    });
    const first = await app.request('/v1/marketplace/stub/fbm-event/cycle.open', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
    });
    assert.equal(first.status, 200);
    assert.equal(((await first.json()) as { alreadyProcessed: boolean }).alreadyProcessed, false);

    const replay = await app.request('/v1/marketplace/stub/fbm-event/cycle.open', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
    });
    assert.equal(((await replay.json()) as { alreadyProcessed: boolean }).alreadyProcessed, true);
});
