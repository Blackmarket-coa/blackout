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
// Small per-token ceiling so the bucket-separation case can hit it quickly.
process.env.SPATIAL_RATE_LIMIT_MAX = '3';
// Surface starts DARK: no service tokens configured.
delete process.env.SPATIAL_SERVICE_TOKENS;
delete process.env.GEOCODER_URL;

const { default: app } = await import('../src/index');

const TOKEN_A = 'spatial-token-aaaaaaaaaaaaaaaa';
const TOKEN_B = 'spatial-token-bbbbbbbbbbbbbbbb';

const bearer = (token: string): Record<string, string> => ({
    'x-spatial-token': token,
});

test('W5: the surface is dark by default — 503 while no service token is configured', async () => {
    const res = await app.request('/v1/spatial/geocode?q=48201');
    assert.equal(res.status, 503);
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, 'spatial_disabled');
});

test('W5: a wrong token is 403, a right one reaches the surface', async () => {
    process.env.SPATIAL_SERVICE_TOKENS = `${TOKEN_A}, ${TOKEN_B}`;

    const bad = await app.request('/v1/spatial/health', { headers: bearer('nope') });
    assert.equal(bad.status, 403);

    const missing = await app.request('/v1/spatial/health');
    assert.equal(missing.status, 403);

    const ok = await app.request('/v1/spatial/health', { headers: bearer(TOKEN_A) });
    assert.equal(ok.status, 200);
    const body = (await ok.json()) as { configured: boolean };
    // No GEOCODER_URL in this suite: reachable but unconfigured.
    assert.equal(body.configured, false);
});

test('W5: geocode fails closed (503 geocoder_disabled) without an upstream, and serves results with one', async () => {
    process.env.SPATIAL_SERVICE_TOKENS = TOKEN_A;

    const disabled = await app.request('/v1/spatial/geocode?q=48201', {
        headers: bearer(TOKEN_A),
    });
    assert.equal(disabled.status, 503);
    assert.equal(((await disabled.json()) as { code: string }).code, 'geocoder_disabled');

    process.env.GEOCODER_URL = 'https://geocoder.test/search';
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        assert.ok(url.startsWith('https://geocoder.test/search'), url);
        return new Response(
            JSON.stringify([{ lat: '42.33', lon: '-83.05', display_name: 'Detroit, MI 48201' }]),
            { status: 200, headers: { 'content-type': 'application/json' } }
        );
    }) as typeof fetch;
    try {
        const ok = await app.request('/v1/spatial/geocode?q=48201', {
            headers: bearer(TOKEN_A),
        });
        assert.equal(ok.status, 200);
        const body = (await ok.json()) as {
            results: Array<{ label: string; latitude: number; longitude: number }>;
        };
        assert.equal(body.results.length, 1);
        assert.equal(body.results[0]!.latitude, 42.33);
    } finally {
        globalThis.fetch = realFetch;
        delete process.env.GEOCODER_URL;
    }
});

test('W5: rate buckets are per service token, not shared', async () => {
    process.env.SPATIAL_SERVICE_TOKENS = `${TOKEN_A},${TOKEN_B}`;
    process.env.GEOCODER_URL = 'https://geocoder.test/search';
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
        new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        })) as typeof fetch;
    try {
        // Exhaust token A's bucket (SPATIAL_RATE_LIMIT_MAX=3 for the suite).
        let lastStatus = 0;
        for (let i = 0; i < 4; i += 1) {
            const res = await app.request('/v1/spatial/geocode?q=detroit', {
                headers: bearer(TOKEN_A),
            });
            lastStatus = res.status;
        }
        assert.equal(lastStatus, 429);

        // Token B still has its own headroom.
        const other = await app.request('/v1/spatial/geocode?q=detroit', {
            headers: bearer(TOKEN_B),
        });
        assert.equal(other.status, 200);
    } finally {
        globalThis.fetch = realFetch;
        delete process.env.GEOCODER_URL;
    }
});

test('W5: input validation matches the user geocode contract', async () => {
    // Fresh token: earlier cases spent TOKEN_A's per-token bucket, and the
    // limiter (correctly) runs before validation.
    const tokenC = 'spatial-token-cccccccccccccccc';
    process.env.SPATIAL_SERVICE_TOKENS = tokenC;
    const short = await app.request('/v1/spatial/geocode?q=ab', {
        headers: bearer(tokenC),
    });
    assert.equal(short.status, 400);
    const long = await app.request(`/v1/spatial/geocode?q=${'x'.repeat(301)}`, {
        headers: bearer(tokenC),
    });
    assert.equal(long.status, 400);
});
