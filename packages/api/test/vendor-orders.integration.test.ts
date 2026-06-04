import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';

const { default: app } = await import('../src/index');
const { db } = await import('../src/db/store');
const { signJwt } = await import('../src/services/auth');
const { createTip, captureTip, resetTipsForTest } = await import('../src/services/tips');

function ensureUser(id: string, username: string): void {
    if (db.getUserById(id)) return;
    db.createUser({
        id,
        username,
        email: `${username}@blackout.test`,
        passwordHash: 'test-hash',
        reputationScore: 100,
        reputationTier: 'member',
        pubkeyEd25519: `${id}-pubkey`,
    });
}

function authHeaders(userId: string, username: string): Record<string, string> {
    return { authorization: `Bearer ${signJwt(userId, username, 600)}` };
}

test('vendor orders surfaces bridged order rooms, room layout, and earnings', async () => {
    resetTipsForTest();
    ensureUser('vendor-1', 'vendortest');
    ensureUser('buyer-1', 'buyertest');
    ensureUser('tipper-1', 'tippertest');

    // Bridged vendor room layout + two order rooms (as the FBM bridge would create).
    db.upsertFbmVendorRooms({
        vendorId: 'vendor-1',
        spaceRoomId: '!space:server',
        ordersRoomId: '!orders:server',
        inventoryRoomId: '!inv:server',
        ledgerRoomId: '!ledger:server',
        createdAt: '2026-05-01T00:00:00.000Z',
    });
    db.upsertFbmBuyerOrderRoom({
        id: '00000000-0000-0000-0000-000000000001',
        vendorId: 'vendor-1',
        buyerUserId: 'buyer-1',
        orderId: 'order-A',
        roomId: '!orderA:server',
        createdAt: '2026-05-02T00:00:00.000Z',
    });
    db.upsertFbmBuyerOrderRoom({
        id: '00000000-0000-0000-0000-000000000002',
        vendorId: 'vendor-1',
        buyerUserId: 'buyer-1',
        orderId: 'order-B',
        roomId: '!orderB:server',
        createdAt: '2026-05-03T00:00:00.000Z',
    });
    // An order room for a different vendor must not leak in.
    db.upsertFbmBuyerOrderRoom({
        id: '00000000-0000-0000-0000-000000000003',
        vendorId: 'vendor-2',
        buyerUserId: 'buyer-1',
        orderId: 'order-C',
        roomId: '!orderC:server',
        createdAt: '2026-05-04T00:00:00.000Z',
    });

    // A captured tip to the vendor → earnings rollup (3% of 1000 = 30 fee).
    const tip = createTip({
        senderUserId: 'tipper-1',
        recipientUserId: 'vendor-1',
        contextKind: 'profile',
        grossCents: 1_000,
        currency: 'USD',
    });
    captureTip(tip.id);

    const res = await app.request('/v1/creator/orders', {
        headers: authHeaders('vendor-1', 'vendortest'),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
        vendorId: string;
        rooms: { ordersRoomId: string; ledgerRoomId: string } | null;
        orders: { orderId: string }[];
        orderCount: number;
        earnings: { capturedCount: number; grossCents: number; feeCents: number; netCents: number };
    };

    assert.equal(body.vendorId, 'vendor-1');
    assert.equal(body.rooms?.ordersRoomId, '!orders:server');
    assert.equal(body.orderCount, 2);
    // Newest first; the other vendor's order-C is excluded.
    assert.deepEqual(
        body.orders.map((o) => o.orderId),
        ['order-B', 'order-A'],
    );
    assert.equal(body.earnings.capturedCount, 1);
    assert.equal(body.earnings.grossCents, 1_000);
    assert.equal(body.earnings.feeCents, 30);
    assert.equal(body.earnings.netCents, 970);
});

test('a vendor with no bridged rooms gets an empty, well-formed payload', async () => {
    resetTipsForTest();
    ensureUser('vendor-empty', 'vendorempty');
    const res = await app.request('/v1/creator/orders', {
        headers: authHeaders('vendor-empty', 'vendorempty'),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
        rooms: unknown;
        orderCount: number;
        earnings: { capturedCount: number };
    };
    assert.equal(body.rooms, null);
    assert.equal(body.orderCount, 0);
    assert.equal(body.earnings.capturedCount, 0);
});

test('unauthenticated vendor orders request is rejected', async () => {
    const res = await app.request('/v1/creator/orders', { method: 'GET' });
    assert.equal(res.status, 401);
});
