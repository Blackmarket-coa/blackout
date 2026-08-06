import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_API_SKIP_LISTEN = process.env.BLACKOUT_API_SKIP_LISTEN ?? '1';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.GEOCODE_RATE_LIMIT_MAX = process.env.GEOCODE_RATE_LIMIT_MAX ?? '500';
process.env.LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'wss://livekit.local';
process.env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? 'lk_test_key';
process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? 'lk_test_secret';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');

const authHeader = (userId = 'geo-user') => ({
    authorization: `Bearer ${signJwt(userId, 'coalition', 600)}`,
});

const search = (q: string, userId?: string) =>
    app.request(`/v1/coalition/geocode?q=${encodeURIComponent(q)}`, {
        headers: authHeader(userId),
    });

const realFetch = globalThis.fetch;

/** Stand in for the operator's geocoder, and record what it was asked. */
function stubUpstream(handler: (url: URL) => Response | Promise<Response>) {
    const calls: URL[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const raw = typeof input === 'string' ? input : input.toString();
        const url = new URL(raw);
        // Let anything that isn't the stubbed geocoder through untouched.
        if (url.hostname !== 'geocoder.test') return realFetch(input as RequestInfo, init);
        calls.push(url);
        return handler(url);
    }) as typeof globalThis.fetch;
    return { calls, restore: () => (globalThis.fetch = realFetch) };
}

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const NOMINATIM_ROW = {
    lat: '47.6062',
    lon: '-122.3321',
    display_name: 'Seattle, King County, Washington',
};

const withGeocoder = (vars: Record<string, string | undefined> = {}) => {
    const applied = { GEOCODER_URL: 'https://geocoder.test/search', ...vars };
    const previous: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(applied)) {
        previous[key] = process.env[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    return () => {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    };
};

/**
 * There is no default provider. An operator who has not chosen one must not
 * have their users' typed addresses sent anywhere.
 */
test('address search is off until an operator configures it', async () => {
    const restoreEnv = withGeocoder({ GEOCODER_URL: undefined });
    const upstream = stubUpstream(() => json([]));
    try {
        const response = await search('Elm Street');
        assert.equal(response.status, 503);
        assert.equal(((await response.json()) as { code: string }).code, 'geocoder_disabled');
        assert.equal(upstream.calls.length, 0, 'nothing should be sent upstream');
    } finally {
        upstream.restore();
        restoreEnv();
    }
});

test('a configured geocoder is queried and its answer normalized', async () => {
    const restoreEnv = withGeocoder();
    const upstream = stubUpstream(() => json([NOMINATIM_ROW]));
    try {
        const response = await search('Seattle');
        assert.equal(response.status, 200);
        const { results } = (await response.json()) as {
            results: { label: string; latitude: number; longitude: number }[];
        };
        assert.equal(results.length, 1);
        assert.equal(results[0].latitude, 47.6062);
        assert.equal(results[0].longitude, -122.3321);

        // The search text reaches the operator's endpoint on their parameter.
        assert.equal(upstream.calls[0].searchParams.get('q'), 'Seattle');
        assert.equal(upstream.calls[0].pathname, '/search');
    } finally {
        upstream.restore();
        restoreEnv();
    }
});

test("the operator's extra query pairs and parameter name are honored", async () => {
    const restoreEnv = withGeocoder({
        GEOCODER_QUERY_PARAM: 'text',
        GEOCODER_EXTRA_QUERY: 'format=jsonv2&limit=5',
    });
    const upstream = stubUpstream(() => json([NOMINATIM_ROW]));
    try {
        await search('Elm Street');
        const asked = upstream.calls[0].searchParams;
        assert.equal(asked.get('text'), 'Elm Street');
        assert.equal(asked.get('format'), 'jsonv2');
        assert.equal(asked.get('limit'), '5');
    } finally {
        upstream.restore();
        restoreEnv();
    }
});

test('an upstream failure is a 502, not a crash or a fake empty result', async () => {
    const restoreEnv = withGeocoder();
    const upstream = stubUpstream(() => json({ error: 'rate limited' }, 429));
    try {
        const response = await search('Seattle');
        // An empty list would read as "no such address", which is a different
        // and misleading statement.
        assert.equal(response.status, 502);
    } finally {
        upstream.restore();
        restoreEnv();
    }
});

test('a non-JSON upstream response is a 502', async () => {
    const restoreEnv = withGeocoder();
    const upstream = stubUpstream(() => new Response('<html>nope</html>', { status: 200 }));
    try {
        assert.equal((await search('Seattle')).status, 502);
    } finally {
        upstream.restore();
        restoreEnv();
    }
});

test('a genuinely empty result set is a 200 with no results', async () => {
    const restoreEnv = withGeocoder();
    const upstream = stubUpstream(() => json([]));
    try {
        const response = await search('Nowhere at all');
        assert.equal(response.status, 200);
        assert.deepEqual(((await response.json()) as { results: unknown[] }).results, []);
    } finally {
        upstream.restore();
        restoreEnv();
    }
});

test('unplottable rows are filtered out of a successful answer', async () => {
    const restoreEnv = withGeocoder();
    const upstream = stubUpstream(() =>
        json([NOMINATIM_ROW, { display_name: 'No coordinates' }, { lat: 91, lon: 0 }])
    );
    try {
        const { results } = (await (await search('Seattle')).json()) as { results: unknown[] };
        assert.equal(results.length, 1);
    } finally {
        upstream.restore();
        restoreEnv();
    }
});

test('a too-short or too-long search is refused before anything is sent', async () => {
    const restoreEnv = withGeocoder();
    const upstream = stubUpstream(() => json([NOMINATIM_ROW]));
    try {
        assert.equal((await search('ab')).status, 400);
        assert.equal((await search('x'.repeat(301))).status, 400);
        assert.equal(upstream.calls.length, 0);
    } finally {
        upstream.restore();
        restoreEnv();
    }
});

test('searching requires sign-in', async () => {
    const restoreEnv = withGeocoder();
    const upstream = stubUpstream(() => json([NOMINATIM_ROW]));
    try {
        const response = await app.request('/v1/coalition/geocode?q=Seattle', {
            headers: { 'content-type': 'application/json' },
        });
        assert.equal(response.status, 401);
        assert.equal(upstream.calls.length, 0);
    } finally {
        upstream.restore();
        restoreEnv();
    }
});

/**
 * The allowlist check only covers the URL the operator configured; an open
 * redirect could otherwise bounce the proxy to an arbitrary host.
 */
test('the proxy does not follow redirects', async () => {
    const restoreEnv = withGeocoder();
    let sawRedirectMode: RequestRedirect | undefined;
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const raw = typeof input === 'string' ? input : input.toString();
        if (!raw.includes('geocoder.test')) return previousFetch(input as RequestInfo, init);
        sawRedirectMode = init?.redirect;
        return new Response('', { status: 302, headers: { location: 'https://evil.test/' } });
    }) as typeof globalThis.fetch;
    try {
        const response = await search('Seattle');
        assert.equal(sawRedirectMode, 'manual');
        // A 3xx is not ok, so it fails closed.
        assert.equal(response.status, 502);
    } finally {
        globalThis.fetch = previousFetch;
        restoreEnv();
    }
});
