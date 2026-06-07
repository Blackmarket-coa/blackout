import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');

const USER_ID = 'producer-1';
const USERNAME = 'producer';

function authHeaders(): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(USER_ID, USERNAME, 600)}`,
        'content-type': 'application/json',
    };
}

test('PUT /sellers/me/profile upserts and GET returns the public-safe view', async () => {
    const create = await app.request('/v1/marketplace/sellers/me/profile', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
            displayName: 'Fungi Collective',
            bio: 'Small-batch mushroom kits.',
            vacationMode: false,
        }),
    });
    assert.equal(create.status, 201);
    const created = (await create.json()) as { profile: Record<string, unknown> };
    assert.equal(created.profile.displayName, 'Fungi Collective');
    assert.equal(created.profile.providerId, 'freeblackmarket');
    // payout_id must never be exposed in the read-view.
    assert.ok(!('payoutId' in created.profile));

    // A second PUT is an update (200, not 201) and preserves omitted fields.
    const update = await app.request('/v1/marketplace/sellers/me/profile', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ vacationMode: true }),
    });
    assert.equal(update.status, 200);
    const updated = (await update.json()) as { profile: Record<string, unknown> };
    assert.equal(updated.profile.vacationMode, true);
    assert.equal(updated.profile.bio, 'Small-batch mushroom kits.');

    // Public read by userId.
    const read = await app.request(`/v1/marketplace/sellers/${USER_ID}/profile`);
    assert.equal(read.status, 200);
    const body = (await read.json()) as { profile: Record<string, unknown> };
    assert.equal(body.profile.displayName, 'Fungi Collective');
    assert.ok(!('payoutId' in body.profile));
});

test('GET unknown seller profile is 404', async () => {
    const res = await app.request('/v1/marketplace/sellers/nobody-here/profile');
    assert.equal(res.status, 404);
});

test('PUT requires auth', async () => {
    const res = await app.request('/v1/marketplace/sellers/me/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'x' }),
    });
    assert.equal(res.status, 401);
});
