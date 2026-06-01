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
        sendStateEvent: [] as Array<{
            roomId: string;
            type: string;
            stateKey: string;
            content: Record<string, unknown>;
        }>,
    };
    let n = 0;
    const matrix = {
        async botUserId() {
            return '@bot:test';
        },
        async createRoom() {
            return { ok: true as const, status: 200, roomId: `!room${++n}:test` };
        },
        async sendEvent() {
            return { ok: true as const, status: 200, eventId: `$e${++n}` };
        },
        async sendStateEvent(
            roomId: string,
            type: string,
            content: Record<string, unknown>,
            stateKey = ''
        ) {
            calls.sendStateEvent.push({ roomId, type, stateKey, content });
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

test('vendor.trust_changed also writes co.bmc.vendor.metadata (empty state key) binding room->vendorId', async () => {
    resetAll();
    const { matrix, calls } = buildFakeMatrix();
    const provider = getMarketplaceProvider('freeblackmarket');
    assert.ok(provider);
    const event = parseFbmMatrixEvent({
        eventId: 'trust-meta-1',
        type: 'vendor.trust_changed',
        vendorId: 'vendor-9',
        verified: true,
        tier: 'trusted',
    });
    assert.ok(event);

    await dispatchFbmMatrixEvent(provider, event, { matrixClient: matrix });

    const metaWrites = calls.sendStateEvent.filter((s) => s.type === 'co.bmc.vendor.metadata');
    // One per vendor room the badge is written to (space + orders).
    assert.equal(metaWrites.length, 2);
    for (const write of metaWrites) {
        assert.equal(write.stateKey, '');
        assert.equal(write.content.vendorId, 'vendor-9');
    }

    // The metadata rooms must match the rooms the trust badge was written to,
    // so the client can resolve room -> vendorId -> trust.
    const trustWrites = calls.sendStateEvent.filter((s) => s.type === 'co.bmc.vendor.trust');
    assert.deepEqual(
        new Set(metaWrites.map((w) => w.roomId)),
        new Set(trustWrites.map((w) => w.roomId))
    );
});
