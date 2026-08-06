import test from 'node:test';
import assert from 'node:assert/strict';

import {
    MAX_GEOCODE_RESULTS,
    normalizeGeocodeResponse,
    normalizeGeocodeRow,
    readGeocoderConfig,
} from '../src/services/geocoder';

/**
 * The normalizer is the whole contract between an operator's geocoder and what
 * this app will store. Anything it lets through becomes a pin on a map, so it
 * has to reject what cannot be plotted rather than pass it along.
 */

const withEnv = <T>(vars: Record<string, string | undefined>, body: () => T): T => {
    const previous: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(vars)) {
        previous[key] = process.env[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    try {
        return body();
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
};

test('the feature is off until an operator names a geocoder', () => {
    const config = withEnv({ GEOCODER_URL: undefined }, readGeocoderConfig);
    assert.ok('error' in config);
    // No default provider: an operator who has not chosen one sends nothing
    // anywhere.
    assert.match(config.error, /GEOCODER_URL/);
});

test('a malformed or non-http URL is refused rather than guessed at', () => {
    for (const bad of ['nominatim.example.org/search', 'ftp://example.org/search', 'not a url']) {
        const config = withEnv({ GEOCODER_URL: bad }, readGeocoderConfig);
        assert.ok('error' in config, `expected ${bad} to be refused`);
    }
});

test('operator settings are read, with sane defaults', () => {
    const config = withEnv(
        {
            GEOCODER_URL: 'https://nominatim.example.org/search',
            GEOCODER_QUERY_PARAM: undefined,
            GEOCODER_EXTRA_QUERY: 'format=jsonv2&limit=5',
            GEOCODER_USER_AGENT: undefined,
            GEOCODER_TIMEOUT_MS: undefined,
        },
        readGeocoderConfig
    );
    assert.ok(!('error' in config));
    assert.equal(config.url.hostname, 'nominatim.example.org');
    // Nominatim's parameter, since that is the common self-hostable service.
    assert.equal(config.queryParam, 'q');
    assert.deepEqual(config.extra, [
        ['format', 'jsonv2'],
        ['limit', '5'],
    ]);
    // Nominatim refuses requests without an identifying User-Agent.
    assert.ok(config.userAgent.length > 0);
    assert.ok(config.timeoutMs > 0);
});

test('a nonsense timeout falls back rather than disabling the request', () => {
    const config = withEnv(
        { GEOCODER_URL: 'https://g.example.org/search', GEOCODER_TIMEOUT_MS: '-1' },
        readGeocoderConfig
    );
    assert.ok(!('error' in config));
    assert.ok(config.timeoutMs > 0);
});

test("reads Nominatim's shape, where coordinates are strings", () => {
    const row = normalizeGeocodeRow({
        lat: '47.6062',
        lon: '-122.3321',
        display_name: 'Seattle, King County, Washington',
    });
    assert.deepEqual(row, {
        label: 'Seattle, King County, Washington',
        latitude: 47.6062,
        longitude: -122.3321,
    });
});

test('also reads the numeric latitude/longitude spelling other services use', () => {
    const row = normalizeGeocodeRow({ latitude: 47.6, longitude: -122.3, name: 'Elm St' });
    assert.deepEqual(row, { label: 'Elm St', latitude: 47.6, longitude: -122.3 });
});

test('a row with no usable coordinate is dropped', () => {
    // An unplottable suggestion is worse than one fewer suggestion.
    assert.equal(normalizeGeocodeRow({ display_name: 'Nowhere' }), null);
    assert.equal(normalizeGeocodeRow({ lat: 'abc', lon: 'def' }), null);
    assert.equal(normalizeGeocodeRow(null), null);
    assert.equal(normalizeGeocodeRow('a string'), null);
});

test('a coordinate outside the world is dropped', () => {
    assert.equal(normalizeGeocodeRow({ lat: 91, lon: 0 }), null);
    assert.equal(normalizeGeocodeRow({ lat: 0, lon: 181 }), null);
});

test('a row with coordinates but no label still gets one', () => {
    const row = normalizeGeocodeRow({ lat: 47.6062, lon: -122.3321 });
    assert.match(row?.label ?? '', /47\.6062/);
});

test('an absurdly long label is truncated rather than stored whole', () => {
    const row = normalizeGeocodeRow({ lat: 1, lon: 2, display_name: 'x'.repeat(5000) });
    assert.ok((row?.label.length ?? 0) <= 300);
});

test('a bare array and a wrapped array both parse', () => {
    const rows = [{ lat: 1, lon: 2, display_name: 'A' }];
    assert.equal(normalizeGeocodeResponse(rows).length, 1);
    assert.equal(normalizeGeocodeResponse({ results: rows }).length, 1);
});

test('an unexpected payload yields nothing rather than throwing', () => {
    assert.deepEqual(normalizeGeocodeResponse(null), []);
    assert.deepEqual(normalizeGeocodeResponse('nope'), []);
    assert.deepEqual(normalizeGeocodeResponse({ error: 'rate limited' }), []);
});

test('the result list is capped', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ lat: 1, lon: i, display_name: `#${i}` }));
    assert.equal(normalizeGeocodeResponse(many).length, MAX_GEOCODE_RESULTS);
});
