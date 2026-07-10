import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';

const { default: app } = await import('../src/index');
const { db } = await import('../src/db/store');

// Mid-Pacific viewer position, far from every seeded coalition fixture, so
// the assertions below count only what this file creates.
const VIEWER = { lat: 2.5, lng: -140.5 };
const NEAR = { latitude: 2.502, longitude: -140.503 }; // ~400m away
const FAR = { latitude: 3.4, longitude: -140.5 }; // ~100km away

function seedSignals(): void {
    db.createCoalitionAidPost({
        id: `aidp_near_${Math.random().toString(36).slice(2, 8)}`,
        customerId: '@helper:test',
        type: 'offer',
        category: 'food',
        title: 'Community fridge restock',
        description: 'Fresh produce available',
        location: { ...NEAR },
        displayRadiusMeters: 400,
        urgency: 'medium',
        status: 'open',
    });
    db.createCoalitionAidPost({
        id: `aidp_far_${Math.random().toString(36).slice(2, 8)}`,
        customerId: '@helper:test',
        type: 'offer',
        category: 'food',
        title: 'Too far to count',
        description: 'Out of radius',
        location: { ...FAR },
        displayRadiusMeters: 400,
        urgency: 'medium',
        status: 'open',
    });
    db.upsertCoalitionSpatialItem({
        id: `spatial_near_${Math.random().toString(36).slice(2, 8)}`,
        layer: 'aid',
        title: 'Water distribution point',
        latitude: NEAR.latitude,
        longitude: NEAR.longitude,
        visibility: 'public',
        eventType: 'other',
        startsAt: new Date().toISOString(),
        status: 'live',
        source: 'blackout',
    });
}

void test('counts located signals within the radius and omits coordinates', async () => {
    seedSignals();
    const response = await app.request(
        `/v1/coalition/nearby?lat=${VIEWER.lat}&lng=${VIEWER.lng}&radiusKm=5`
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
        count: number;
        signals: Array<Record<string, unknown>>;
    };
    assert.equal(body.count, 2);
    const titles = body.signals.map((signal) => signal.title).sort();
    assert.deepEqual(titles, ['Community fridge restock', 'Water distribution point']);
    for (const signal of body.signals) {
        assert.deepEqual(Object.keys(signal).sort(), ['id', 'kind', 'title']);
    }
});

void test('a wider radius picks up the distant signal too', async () => {
    const response = await app.request(
        `/v1/coalition/nearby?lat=${VIEWER.lat}&lng=${VIEWER.lng}&radiusKm=200`
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as { count: number };
    assert.equal(body.count, 3);
});

void test('rejects requests without a complete nearby filter', async () => {
    for (const query of ['', '?lat=2.5', '?lat=2.5&lng=-140.5', '?lat=999&lng=0&radiusKm=5']) {
        const response = await app.request(`/v1/coalition/nearby${query}`);
        assert.equal(response.status, 400, `expected 400 for "${query}"`);
    }
});
