import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'wss://livekit.local';
process.env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? 'lk_test_key';
process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? 'lk_test_secret';
// freeblackmarket is the always-on real provider; the stub keeps it offline-safe.
process.env.FREEBLACKMARKET_STUB = process.env.FREEBLACKMARKET_STUB ?? '1';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');

const PROVIDER = 'freeblackmarket';
const LISTING = 'listing-xyz';

function authHeader(sub = 'review-test-user'): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(sub, 'reviews', 600)}`,
        'content-type': 'application/json',
    };
}

test('product reviews: post, aggregate, and re-review updates in place', async () => {
    const first = await app.request(`/v1/marketplace/listings/${PROVIDER}/${LISTING}/reviews`, {
        method: 'POST',
        headers: authHeader('alice'),
        body: JSON.stringify({ rating: 4, body: 'Solid' }),
    });
    assert.equal(first.status, 201);

    await app.request(`/v1/marketplace/listings/${PROVIDER}/${LISTING}/reviews`, {
        method: 'POST',
        headers: authHeader('bob'),
        body: JSON.stringify({ rating: 2 }),
    });

    let res = await app.request(`/v1/marketplace/listings/${PROVIDER}/${LISTING}/reviews`);
    assert.equal(res.status, 200);
    let body = (await res.json()) as {
        reviews: Array<{ authorId: string; rating: number }>;
        summary: { count: number; average: number };
    };
    assert.equal(body.reviews.length, 2);
    assert.equal(body.summary.count, 2);
    assert.equal(body.summary.average, 3); // (4 + 2) / 2

    // Alice re-reviews: should update her row, not add a new one.
    await app.request(`/v1/marketplace/listings/${PROVIDER}/${LISTING}/reviews`, {
        method: 'POST',
        headers: authHeader('alice'),
        body: JSON.stringify({ rating: 5, body: 'Even better now' }),
    });
    res = await app.request(`/v1/marketplace/listings/${PROVIDER}/${LISTING}/reviews`);
    body = (await res.json()) as typeof body;
    assert.equal(body.reviews.length, 2, 'still two reviewers');
    assert.equal(body.summary.average, 3.5); // (5 + 2) / 2
});

test('product reviews: rating must be 1–5', async () => {
    const res = await app.request(`/v1/marketplace/listings/${PROVIDER}/${LISTING}/reviews`, {
        method: 'POST',
        headers: authHeader('alice'),
        body: JSON.stringify({ rating: 9 }),
    });
    assert.equal(res.status, 400);
});

test('product reviews: write requires auth', async () => {
    const res = await app.request(`/v1/marketplace/listings/${PROVIDER}/${LISTING}/reviews`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rating: 5 }),
    });
    assert.equal(res.status, 401);
});

test('product version history: append-only, newest first', async () => {
    await app.request(`/v1/marketplace/listings/${PROVIDER}/${LISTING}/versions`, {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ version: '1.0.0', notes: 'Initial' }),
    });
    await app.request(`/v1/marketplace/listings/${PROVIDER}/${LISTING}/versions`, {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ version: '1.1.0', notes: 'Fixes' }),
    });
    const res = await app.request(`/v1/marketplace/listings/${PROVIDER}/${LISTING}/versions`);
    assert.equal(res.status, 200);
    const { versions } = (await res.json()) as { versions: Array<{ version: string }> };
    assert.ok(versions.length >= 2);
    // newest-first ordering
    assert.equal(versions[0]?.version, '1.1.0');
});

test('product version history: same-millisecond releases still return newest-first', async () => {
    // Regression: `listVersions` sorted on `releasedAt` alone, so two versions
    // published inside the same millisecond compared equal and the stable sort
    // left them in insertion order — i.e. oldest-first. Pinning an identical
    // timestamp reproduces that deterministically instead of relying on how
    // fast the host happens to run (it passed locally and failed in CI).
    const { db } = await import('../src/db/store');
    const { listVersions } = await import('../src/services/productReviews');
    const listingId = 'listing-same-ms';
    const releasedAt = '2026-01-01T00:00:00.000Z';

    db.addProductVersion({
        id: 'pver_same_ms_older',
        providerId: PROVIDER,
        listingId,
        version: '1.0.0',
        releasedAt,
    });
    db.addProductVersion({
        id: 'pver_same_ms_newer',
        providerId: PROVIDER,
        listingId,
        version: '1.1.0',
        releasedAt,
    });

    const versions = listVersions(PROVIDER, listingId);
    assert.equal(versions.length, 2);
    assert.equal(versions[0]?.version, '1.1.0');
    assert.equal(versions[1]?.version, '1.0.0');
});
