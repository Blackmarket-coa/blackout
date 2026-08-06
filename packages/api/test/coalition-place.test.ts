import test from 'node:test';
import assert from 'node:assert/strict';

import {
    AREA_RADIUS_OPTIONS_KM,
    MAX_AREA_RADIUS_METERS,
    SPATIAL_LAYER_KEYS,
    circleRingCoordinates,
    describePlace,
    formatRadius,
    haversineDistanceMeters,
    isCoalitionPlace,
    normalizeSpatialLayerKey,
    placeRadiusMeters,
    placeWithinRadius,
    type AreaPlace,
    type CoalitionPlace,
    type PinPlace,
} from '@blackout/core';

const SEATTLE = { latitude: 47.6062, longitude: -122.3321 };

const pin = (over: Partial<PinPlace> = {}): PinPlace => ({
    kind: 'pin',
    ...SEATTLE,
    ...over,
});

const area = (radiusMeters: number, over: Partial<AreaPlace> = {}): AreaPlace => ({
    kind: 'area',
    ...SEATTLE,
    radiusMeters,
    ...over,
});

/** A point `meters` due north of Seattle. */
function northOf(meters: number): { latitude: number; longitude: number } {
    return { latitude: SEATTLE.latitude + meters / 111_320, longitude: SEATTLE.longitude };
}

test('the needs and resources layers exist in the taxonomy', () => {
    // Needs, projects and resources had no coordinates and so no layer; the map
    // could not show them at all.
    assert.ok(SPATIAL_LAYER_KEYS.includes('needs'));
    assert.ok(SPATIAL_LAYER_KEYS.includes('resources'));
    assert.ok(SPATIAL_LAYER_KEYS.includes('projects'));
    assert.equal(normalizeSpatialLayerKey('need'), 'needs');
    assert.equal(normalizeSpatialLayerKey('Resource'), 'resources');
});

test('a pin has no radius; an area has its own', () => {
    assert.equal(placeRadiusMeters(pin()), 0);
    assert.equal(placeRadiusMeters(area(5_000)), 5_000);
});

test('an exact pin is matched by point-in-circle', () => {
    const viewer = northOf(3_000);
    assert.equal(placeWithinRadius(pin(), viewer, 5_000), true);
    assert.equal(placeWithinRadius(pin(), viewer, 1_000), false);
});

/**
 * The distinction that makes areas worth having. A crew with a 20km area of
 * operations centred 15km away genuinely does serve someone searching 5km
 * around themselves; filtering on centre distance would hide exactly the
 * coverage the radius was drawn to express.
 */
test('an area matches when the circles overlap, not when its centre is in range', () => {
    const viewer = northOf(15_000);
    const wideCrew = area(20_000);

    // Centre is 15km away, well outside a 5km search…
    assert.ok(haversineDistanceMeters(SEATTLE, viewer) > 5_000);
    // …but the crew reaches the viewer, so it belongs in the results.
    assert.equal(placeWithinRadius(wideCrew, viewer, 5_000), true);
});

test('an area that does not reach the viewer stays out', () => {
    const viewer = northOf(40_000);
    assert.equal(placeWithinRadius(area(20_000), viewer, 5_000), false);
    // Exactly touching counts — the boundary is inclusive, as for pins.
    assert.equal(placeWithinRadius(area(35_000), viewer, 5_000), true);
});

test('validation rejects out-of-range coordinates, not merely non-numbers', () => {
    assert.equal(isCoalitionPlace(pin()), true);
    assert.equal(isCoalitionPlace(area(1_000)), true);

    // A latitude of 91 is a bug or an attack; it would pin something nowhere a
    // map can draw.
    assert.equal(isCoalitionPlace({ ...pin(), latitude: 91 }), false);
    assert.equal(isCoalitionPlace({ ...pin(), longitude: -181 }), false);
    assert.equal(isCoalitionPlace({ ...pin(), latitude: Number.NaN }), false);
});

test('validation rejects a malformed or absent kind', () => {
    assert.equal(isCoalitionPlace(null), false);
    assert.equal(isCoalitionPlace({ latitude: 1, longitude: 2 }), false);
    assert.equal(isCoalitionPlace({ ...pin(), kind: 'blob' }), false);
});

test('an area must carry a positive, bounded radius', () => {
    assert.equal(isCoalitionPlace({ kind: 'area', ...SEATTLE }), false);
    assert.equal(isCoalitionPlace({ kind: 'area', ...SEATTLE, radiusMeters: 0 }), false);
    assert.equal(isCoalitionPlace({ kind: 'area', ...SEATTLE, radiusMeters: -5 }), false);
    assert.equal(
        isCoalitionPlace({
            kind: 'area',
            ...SEATTLE,
            radiusMeters: MAX_AREA_RADIUS_METERS + 1,
        }),
        false
    );
});

/**
 * The union's whole point: "radius 0" and "no radius" are different statements,
 * and a pin carrying a radius is neither.
 */
test('a pin may not smuggle in a radius', () => {
    assert.equal(isCoalitionPlace({ ...pin(), radiusMeters: 5_000 }), false);
});

test('every offered radius option is a valid area', () => {
    for (const km of AREA_RADIUS_OPTIONS_KM) {
        assert.equal(isCoalitionPlace(area(km * 1000)), true, `${km}km should be valid`);
    }
});

test('the circle ring closes and sits at the requested distance', () => {
    const steps = 32;
    const ring = circleRingCoordinates(SEATTLE, 5_000, steps);

    // GeoJSON polygons must close: the last point repeats the first.
    assert.equal(ring.length, steps + 1);
    assert.deepEqual(ring[0], ring[ring.length - 1]);

    for (const [longitude, latitude] of ring) {
        const distance = haversineDistanceMeters(SEATTLE, { latitude, longitude });
        // Equirectangular approximation; a few metres out over 5km is fine.
        assert.ok(
            Math.abs(distance - 5_000) < 50,
            `expected ~5000m from centre, got ${Math.round(distance)}m`
        );
    }
});

test('the ring stays finite near the poles', () => {
    // cos(latitude) approaches zero at the pole; unclamped, the longitude
    // spacing would blow up and the ring would wrap the globe.
    const ring = circleRingCoordinates({ latitude: 89.999, longitude: 0 }, 10_000, 16);
    assert.ok(ring.every(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat)));
});

test('radii read the way people say them', () => {
    assert.equal(formatRadius(800), '800 m');
    assert.equal(formatRadius(5_000), '5 km');
    assert.equal(formatRadius(12_500), '12.5 km');
});

test('a place describes itself for a pin subtitle', () => {
    assert.equal(describePlace(pin({ label: 'Elm St yard' })), 'Elm St yard');
    assert.equal(describePlace(area(5_000)), 'within 5 km');
    assert.equal(describePlace(area(5_000, { label: 'North side' })), 'North side · within 5 km');
    // No label: fall back to coordinates rather than rendering nothing.
    assert.match(describePlace(pin()), /47\.6062, -122\.3321/);
});

test('the union narrows on kind', () => {
    const places: CoalitionPlace[] = [pin(), area(1_000)];
    const radii = places.map((place) =>
        place.kind === 'area' ? place.radiusMeters : placeRadiusMeters(place)
    );
    assert.deepEqual(radii, [0, 1_000]);
});
