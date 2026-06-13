import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { applySubscriptionWebhookEvent } = await import('../src/services/subscriptions');

function makeUser(username: string): { id: string; token: string } {
    const id = randomUUID();
    db.createUser({
        id,
        username,
        email: `${username}@test.local`,
        passwordHash: 'x',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: '',
    });
    return { id, token: signJwt(id, username, 600) };
}

/** Activate canopy_pro → `enterprise` entitlement tier → mesh transport. */
function makeEnterpriseUser(username: string): { id: string; token: string } {
    const user = makeUser(username);
    applySubscriptionWebhookEvent({
        eventId: randomUUID(),
        type: 'invoice.paid',
        userId: user.id,
        planCode: 'canopy_pro_monthly',
    });
    return user;
}

const post = (token: string, body: unknown) => ({
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
});
const auth = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

test('POST /v1/mesh/enqueue returns 402 for a non-enterprise caller', async () => {
    const user = makeUser(`free_${randomUUID().slice(0, 8)}`);
    const res = await app.request(
        '/v1/mesh/enqueue',
        post(user.token, { recipient: '@b:server', payload: 'ciphertext' }),
    );
    assert.equal(res.status, 402);
    const body = (await res.json()) as Record<string, any>;
    assert.equal(body.code, 'mesh_not_entitled');
    assert.equal(body.suggestedTier, 'enterprise');
});

test('enterprise caller can enqueue an envelope and pull it from the recipient inbox', async () => {
    const sender = makeEnterpriseUser(`sender_${randomUUID().slice(0, 8)}`);
    const recipientId = `@recip-${randomUUID().slice(0, 8)}:server`;

    const enq = await app.request(
        '/v1/mesh/enqueue',
        post(sender.token, { recipient: recipientId, payload: 'opaque-ct', ttlSeconds: 3600 }),
    );
    assert.equal(enq.status, 201);
    const enqueued = (await enq.json()) as Record<string, any>;
    assert.equal(enqueued.envelope.recipient, recipientId);
    assert.equal(enqueued.envelope.hopCount, 0);
    assert.ok(enqueued.envelope.seenBy.includes('server'));

    // A recipient enterprise user whose mxid matches pulls the live envelope.
    const recipient = makeEnterpriseUser(`recip_${randomUUID().slice(0, 8)}`);
    // The inbox keys off the JWT subject, so enqueue directly to that subject.
    await app.request(
        '/v1/mesh/enqueue',
        post(sender.token, { recipient: recipient.id, payload: 'for-recipient' }),
    );
    const inbox = await app.request('/v1/mesh/inbox', auth(recipient.token));
    assert.equal(inbox.status, 200);
    const body = (await inbox.json()) as Record<string, any>;
    assert.ok(body.envelopes.some((e: any) => e.payload === 'for-recipient'));
});

test('POST /v1/mesh/sync merges peer envelopes and returns what the peer lacks', async () => {
    const user = makeEnterpriseUser(`sync_${randomUUID().slice(0, 8)}`);

    // Seed the relay with an envelope the peer will not have seen.
    await app.request(
        '/v1/mesh/enqueue',
        post(user.token, { recipient: '@x:server', payload: 'seeded-by-server' }),
    );

    const peerEnvelope = {
        id: `peer-${randomUUID()}`,
        sender: '@p:server',
        recipient: '@q:server',
        payload: 'from-peer',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        hopCount: 1,
        maxHops: 8,
        seenBy: ['peerNode'],
    };

    const res = await app.request(
        '/v1/mesh/sync',
        post(user.token, { peerNodeId: 'peerNode', envelopes: [peerEnvelope] }),
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, any>;
    assert.equal(body.accepted, 1); // the peer's envelope was newly accepted
    // The server offers back at least the seeded envelope the peer hasn't seen.
    assert.ok(Array.isArray(body.toForward));
    assert.ok(body.toForward.some((e: any) => e.payload === 'seeded-by-server'));
    // It must not offer back the peer's own envelope (peer has already seen it).
    assert.ok(!body.toForward.some((e: any) => e.id === peerEnvelope.id));
});

test('POST /v1/mesh/sync returns 402 for a non-enterprise caller', async () => {
    const user = makeUser(`nosync_${randomUUID().slice(0, 8)}`);
    const res = await app.request(
        '/v1/mesh/sync',
        post(user.token, { peerNodeId: 'p', envelopes: [] }),
    );
    assert.equal(res.status, 402);
});
