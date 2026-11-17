// The arithmetic behind what coalition reads show (services/coalitionVisibility.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    aidPostForViewer,
    canSeeEvent,
    coarsenPoint,
    MIN_AID_CELL_METERS,
    rsvpsForViewer,
} from '../src/services/coalitionVisibility';

const metersBetween = (a: { latitude: number; longitude: number }, b: typeof a) => {
    const rad = Math.PI / 180;
    const x = (b.longitude - a.longitude) * rad * Math.cos(((a.latitude + b.latitude) / 2) * rad);
    const y = (b.latitude - a.latitude) * rad;
    return Math.sqrt(x * x + y * y) * 6_371_000;
};

test('every point in a cell gives the same centre, within half a diagonal of it', () => {
    const centre = coarsenPoint(51.5007, -0.1246, 500);
    for (let i = 0; i < 200; i += 1) {
        // Random points within 240 m of the centre (inside the 500 m cell).
        const angle = Math.random() * 2 * Math.PI;
        const meters = Math.random() * 240;
        const point = {
            latitude: centre.latitude + (Math.sin(angle) * meters) / 111_320,
            longitude:
                centre.longitude +
                (Math.cos(angle) * meters) /
                    (111_320 * Math.cos((centre.latitude * Math.PI) / 180)),
        };
        if (Math.abs(point.latitude - centre.latitude) * 111_320 >= 249) continue;
        const again = coarsenPoint(point.latitude, point.longitude, 500);
        assert.ok(Math.abs(again.latitude - centre.latitude) < 1e-12, 'same row');
        assert.ok(Math.abs(again.longitude - centre.longitude) < 1e-12, 'same column');
        assert.ok(metersBetween(point, again) <= 500 * Math.SQRT1_2 + 1);
    }
});

test('neighbouring cells have different centres, and asking again changes nothing', () => {
    const a = coarsenPoint(40.0, -74.0, 1000);
    const b = coarsenPoint(40.0 + 1000 / 111_320, -74.0, 1000);
    assert.notDeepEqual(a, b);
    assert.deepEqual(coarsenPoint(40.0, -74.0, 1000), a);
});

test('near the poles and the date line the centre stays on the globe', () => {
    for (const [lat, lng] of [
        [89.9999, 10],
        [-89.9999, -170],
        [10, 179.9999],
        [10, -179.9999],
    ]) {
        const centre = coarsenPoint(lat, lng, 500);
        assert.ok(centre.latitude >= -90 && centre.latitude <= 90, `latitude ${centre.latitude}`);
        assert.ok(
            centre.longitude >= -180 && centre.longitude <= 180,
            `longitude ${centre.longitude}`
        );
    }
});

test("a post's own display radius is kept when it is wider than the minimum", () => {
    const post = {
        id: 'aidp_1',
        customerId: 'poster',
        fulfillerId: 'helper',
        type: 'need',
        category: 'food',
        title: 't',
        description: 'd',
        location: { latitude: 40.1, longitude: -74.2, address: '1 Main St' },
        displayRadiusMeters: 2000,
        urgency: 'low',
        status: 'open',
        createdAt: '2026-11-17T00:00:00.000Z',
    } as never;
    const view = aidPostForViewer(post, 'someone-else') as Record<string, unknown>;
    assert.equal(view.displayRadiusMeters, 2000);
    assert.equal('customerId' in view, false);
    assert.equal('fulfillerId' in view, false);
    assert.equal(aidPostForViewer(post, 'poster'), post, 'the poster sees the post itself');
    const small = aidPostForViewer({ ...(post as object), displayRadiusMeters: 50 } as never, null);
    assert.equal(
        (small as { displayRadiusMeters: number }).displayRadiusMeters,
        MIN_AID_CELL_METERS
    );
});

test('who sees a non-public event, and whose RSVPs', () => {
    const event = { visibility: 'community' as const, organizerId: 'org' };
    const rsvps = [{ userId: 'guest' }, { userId: 'other' }];
    assert.equal(canSeeEvent(event, null, rsvps), false);
    assert.equal(canSeeEvent(event, 'stranger', rsvps), false);
    assert.equal(canSeeEvent(event, 'guest', rsvps), true);
    assert.equal(canSeeEvent(event, 'org', []), true);
    assert.equal(canSeeEvent({ ...event, visibility: 'public' }, null, []), true);
    assert.deepEqual(rsvpsForViewer(event, 'org', rsvps), rsvps);
    assert.deepEqual(rsvpsForViewer(event, 'guest', rsvps), [{ userId: 'guest' }]);
    assert.deepEqual(rsvpsForViewer(event, null, rsvps), []);
});
