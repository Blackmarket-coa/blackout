import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.FREEBLACKMARKET_BASE_URL =
    process.env.FREEBLACKMARKET_BASE_URL ?? 'https://api.freeblackmarket.test';
process.env.FREEBLACKMARKET_API_KEY = process.env.FREEBLACKMARKET_API_KEY ?? 'test-api-key';
process.env.FREEBLACKMARKET_WEBHOOK_SECRET =
    process.env.FREEBLACKMARKET_WEBHOOK_SECRET ?? 'test-webhook-secret';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.BLACKOUT_ADMIN_API_KEY = process.env.BLACKOUT_ADMIN_API_KEY ?? 'test-admin-key';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { resetTipsForTest } = await import('../src/services/tips');

const SENDER_ID = 'tips-sender-1';
const SENDER_NAME = 'sender';
const RECIPIENT_ID = 'tips-recipient-1';
const RECIPIENT_NAME = 'recipient';
const ADMIN_KEY = 'test-admin-key';

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

function senderHeaders(): Record<string, string> {
    ensureUser(SENDER_ID, SENDER_NAME);
    return {
        authorization: `Bearer ${signJwt(SENDER_ID, SENDER_NAME, 600)}`,
        'content-type': 'application/json',
    };
}

function recipientHeaders(): Record<string, string> {
    ensureUser(RECIPIENT_ID, RECIPIENT_NAME);
    return {
        authorization: `Bearer ${signJwt(RECIPIENT_ID, RECIPIENT_NAME, 600)}`,
        'content-type': 'application/json',
    };
}

function setup(): void {
    resetTipsForTest();
    ensureUser(SENDER_ID, SENDER_NAME);
    ensureUser(RECIPIENT_ID, RECIPIENT_NAME);
}

interface TipBody {
    id: string;
    senderUserId: string;
    recipientUserId: string;
    grossCents: number;
    feeCents: number;
    netCents: number;
    currency: string;
    status: string;
    contextKind: string;
    fbmOrderId: string | null;
}

test('POST /v1/tips records a 3% commission split and returns the tip', async () => {
    setup();
    const response = await app.request('/v1/tips', {
        method: 'POST',
        headers: senderHeaders(),
        body: JSON.stringify({
            recipientUserId: RECIPIENT_ID,
            contextKind: 'profile',
            grossCents: 1000,
            currency: 'USD',
            note: 'Great work!',
        }),
    });
    assert.equal(response.status, 201);
    const { tip } = (await response.json()) as { tip: TipBody };
    assert.equal(tip.grossCents, 1000);
    assert.equal(tip.feeCents, 30);
    assert.equal(tip.netCents, 970);
    assert.equal(tip.currency, 'USD');
    assert.equal(tip.status, 'pending');
    assert.equal(tip.senderUserId, SENDER_ID);
    assert.equal(tip.recipientUserId, RECIPIENT_ID);
});

test('POST /v1/tips rejects self-tipping with 400 self_tip_forbidden', async () => {
    setup();
    const response = await app.request('/v1/tips', {
        method: 'POST',
        headers: senderHeaders(),
        body: JSON.stringify({
            recipientUserId: SENDER_ID,
            contextKind: 'profile',
            grossCents: 500,
            currency: 'USD',
        }),
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as { code: string };
    assert.equal(body.code, 'self_tip_forbidden');
});

test('POST /v1/tips rejects unknown recipient with 404', async () => {
    setup();
    const response = await app.request('/v1/tips', {
        method: 'POST',
        headers: senderHeaders(),
        body: JSON.stringify({
            recipientUserId: 'no-such-user',
            contextKind: 'profile',
            grossCents: 500,
            currency: 'USD',
        }),
    });
    assert.equal(response.status, 404);
    const body = (await response.json()) as { code: string };
    assert.equal(body.code, 'recipient_unknown');
});

test('POST /v1/tips rejects amounts below the floor', async () => {
    setup();
    const response = await app.request('/v1/tips', {
        method: 'POST',
        headers: senderHeaders(),
        body: JSON.stringify({
            recipientUserId: RECIPIENT_ID,
            contextKind: 'profile',
            grossCents: 50,
            currency: 'USD',
        }),
    });
    assert.equal(response.status, 400);
});

test('POST /v1/tips requires authentication', async () => {
    setup();
    const response = await app.request('/v1/tips', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            recipientUserId: RECIPIENT_ID,
            contextKind: 'profile',
            grossCents: 500,
            currency: 'USD',
        }),
    });
    assert.equal(response.status, 401);
});

test('GET /v1/tips/received lists tips for the recipient with most-recent first', async () => {
    setup();
    for (const grossCents of [200, 500, 1000]) {
        const r = await app.request('/v1/tips', {
            method: 'POST',
            headers: senderHeaders(),
            body: JSON.stringify({
                recipientUserId: RECIPIENT_ID,
                contextKind: 'stream',
                contextRef: 'stream-abc',
                grossCents,
                currency: 'USD',
            }),
        });
        assert.equal(r.status, 201);
    }
    const response = await app.request('/v1/tips/received', {
        method: 'GET',
        headers: recipientHeaders(),
    });
    assert.equal(response.status, 200);
    const { tips } = (await response.json()) as { tips: TipBody[] };
    assert.equal(tips.length, 3);
    assert.deepEqual(
        tips.map((t) => t.grossCents),
        [1000, 500, 200]
    );
});

test('GET /v1/tips/sent lists tips for the sender', async () => {
    setup();
    await app.request('/v1/tips', {
        method: 'POST',
        headers: senderHeaders(),
        body: JSON.stringify({
            recipientUserId: RECIPIENT_ID,
            contextKind: 'post',
            contextRef: 'post-1',
            grossCents: 750,
            currency: 'USD',
        }),
    });
    const response = await app.request('/v1/tips/sent', {
        method: 'GET',
        headers: senderHeaders(),
    });
    assert.equal(response.status, 200);
    const { tips } = (await response.json()) as { tips: TipBody[] };
    assert.equal(tips.length, 1);
    assert.equal(tips[0].senderUserId, SENDER_ID);
});

test('POST /v1/tips/:id/capture transitions a pending tip to captured (admin-gated)', async () => {
    setup();
    const created = await app.request('/v1/tips', {
        method: 'POST',
        headers: senderHeaders(),
        body: JSON.stringify({
            recipientUserId: RECIPIENT_ID,
            contextKind: 'profile',
            grossCents: 500,
            currency: 'USD',
        }),
    });
    const { tip } = (await created.json()) as { tip: TipBody };

    const unauthorized = await app.request(`/v1/tips/${tip.id}/capture`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
    });
    assert.equal(unauthorized.status, 403);

    const captured = await app.request(`/v1/tips/${tip.id}/capture`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-admin-api-key': ADMIN_KEY,
        },
        body: JSON.stringify({ fbmOrderId: 'fbm-order-xyz' }),
    });
    assert.equal(captured.status, 200);
    const { tip: capturedTip } = (await captured.json()) as { tip: TipBody };
    assert.equal(capturedTip.status, 'captured');
    assert.equal(capturedTip.fbmOrderId, 'fbm-order-xyz');
});

test('POST /v1/tips/:id/refund transitions a captured tip to refunded', async () => {
    setup();
    const created = await app.request('/v1/tips', {
        method: 'POST',
        headers: senderHeaders(),
        body: JSON.stringify({
            recipientUserId: RECIPIENT_ID,
            contextKind: 'profile',
            grossCents: 500,
            currency: 'USD',
        }),
    });
    const { tip } = (await created.json()) as { tip: TipBody };

    await app.request(`/v1/tips/${tip.id}/capture`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-api-key': ADMIN_KEY },
        body: JSON.stringify({}),
    });

    const refunded = await app.request(`/v1/tips/${tip.id}/refund`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-api-key': ADMIN_KEY },
    });
    assert.equal(refunded.status, 200);
    const { tip: refundedTip } = (await refunded.json()) as { tip: TipBody };
    assert.equal(refundedTip.status, 'refunded');
});

test('GET /v1/tips/:id rejects access by users other than sender or recipient', async () => {
    setup();
    const created = await app.request('/v1/tips', {
        method: 'POST',
        headers: senderHeaders(),
        body: JSON.stringify({
            recipientUserId: RECIPIENT_ID,
            contextKind: 'profile',
            grossCents: 500,
            currency: 'USD',
        }),
    });
    const { tip } = (await created.json()) as { tip: TipBody };

    ensureUser('outsider-user', 'outsider');
    const outsiderHeaders = {
        authorization: `Bearer ${signJwt('outsider-user', 'outsider', 600)}`,
        'content-type': 'application/json',
    };

    const response = await app.request(`/v1/tips/${tip.id}`, {
        method: 'GET',
        headers: outsiderHeaders,
    });
    assert.equal(response.status, 404);
});
