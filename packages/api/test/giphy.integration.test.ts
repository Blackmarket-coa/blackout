/**
 * Integration tests for the Giphy GIF picker proxy.
 *
 * Covers:
 *   - 503 when GIPHY_API_KEY is unset
 *   - 401 when the user is not signed in
 *   - 200 + reshaped payload on /search (offset cursor in `next`)
 *   - 200 + reshaped payload on /featured (Giphy trending)
 *   - 400 when /search is missing `q`
 *   - 400 + SSRF block when /binary URL is off the Giphy CDN
 *   - 200 + binary body when /binary URL is on the Giphy CDN
 *   - 413 when the upstream declares an oversized body
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Giphy-Tests-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.GIPHY_RATE_LIMIT_MAX = process.env.GIPHY_RATE_LIMIT_MAX ?? '1000';

const { default: app } = await import('../src/index');

let userSeed = Date.now();
async function registerUser(password = 'test-password') {
    const seed = ++userSeed;
    const username = `giphy-${seed}`;
    const email = `giphy-${seed}@example.com`;
    const res = await app.request('/v1/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
    });
    assert.equal(res.status, 201, `register failed: ${res.status}`);
    const body = (await res.json()) as { token: string; userId: string };
    return body;
}

const fakeGiphyJson = {
    data: [
        {
            id: 'giphy-abc',
            title: 'cat hello',
            alt_text: 'A cat saying hi',
            images: {
                original: {
                    url: 'https://media0.giphy.com/abc/cat.gif',
                    width: '320',
                    height: '240',
                    size: '12345',
                },
                fixed_width_small: {
                    url: 'https://media0.giphy.com/abc/cat-small.gif',
                    width: '100',
                    height: '75',
                },
            },
        },
        {
            // Missing original rendition — should be filtered out by toPickerItems.
            id: 'giphy-broken',
            title: 'broken',
            images: {
                fixed_width_small: {
                    url: 'https://media0.giphy.com/x/y-small.gif',
                    width: '100',
                    height: '75',
                },
            },
        },
    ],
    pagination: { total_count: 100, count: 24, offset: 0 },
};

type FetchMock = ((input: unknown, init?: unknown) => Promise<Response>) & {
    calls: Array<{ url: string; init?: unknown }>;
};

const installFetchMock = (
    handler: (url: string, init?: unknown) => Promise<Response>
): FetchMock => {
    const calls: FetchMock['calls'] = [];
    const fn = (async (input: unknown, init?: unknown) => {
        const url = typeof input === 'string' ? input : (input as { url: string }).url;
        calls.push({ url, init });
        return handler(url, init);
    }) as FetchMock;
    fn.calls = calls;
    (globalThis as { fetch: typeof fetch }).fetch = fn as unknown as typeof fetch;
    return fn;
};

const realFetch = globalThis.fetch;
const restoreFetch = () => {
    (globalThis as { fetch: typeof fetch }).fetch = realFetch;
};

test('giphy: /search returns 401 when not signed in', async () => {
    process.env.GIPHY_API_KEY = 'test-key';
    const res = await app.request('/v1/integrations/giphy/search?q=cats');
    assert.equal(res.status, 401);
});

test('giphy: /search returns 503 when GIPHY_API_KEY missing', async () => {
    delete process.env.GIPHY_API_KEY;
    const user = await registerUser();
    const res = await app.request('/v1/integrations/giphy/search?q=cats', {
        headers: { authorization: `Bearer ${user.token}` },
    });
    assert.equal(res.status, 503);
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, 'giphy_disabled');
});

test('giphy: /search 400 when q missing', async () => {
    process.env.GIPHY_API_KEY = 'test-key';
    const user = await registerUser();
    const res = await app.request('/v1/integrations/giphy/search', {
        headers: { authorization: `Bearer ${user.token}` },
    });
    assert.equal(res.status, 400);
});

test('giphy: /search reshapes upstream and forwards key', async () => {
    process.env.GIPHY_API_KEY = 'test-key-123';
    const user = await registerUser();
    const mock = installFetchMock(async (url) => {
        assert.match(url, /\/gifs\/search\?/);
        assert.match(url, /api_key=test-key-123/);
        assert.match(url, /q=cats/);
        return new Response(JSON.stringify(fakeGiphyJson), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    });
    try {
        const res = await app.request('/v1/integrations/giphy/search?q=cats', {
            headers: { authorization: `Bearer ${user.token}` },
        });
        assert.equal(res.status, 200);
        const body = (await res.json()) as { items: Array<{ id: string }>; next: string | null };
        // The broken result should be filtered; the valid one shaped.
        assert.equal(body.items.length, 1);
        assert.equal(body.items[0].id, 'giphy-abc');
        // Offset cursor: 0 + 24 of 100.
        assert.equal(body.next, '24');
        assert.equal(mock.calls.length, 1);
    } finally {
        restoreFetch();
    }
});

test('giphy: /featured reshapes and uses the trending endpoint', async () => {
    process.env.GIPHY_API_KEY = 'test-key-123';
    const user = await registerUser();
    const mock = installFetchMock(async (url) => {
        assert.match(url, /\/gifs\/trending\?/);
        return new Response(JSON.stringify(fakeGiphyJson), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    });
    try {
        const res = await app.request('/v1/integrations/giphy/featured', {
            headers: { authorization: `Bearer ${user.token}` },
        });
        assert.equal(res.status, 200);
        const body = (await res.json()) as { items: Array<{ id: string }> };
        assert.equal(body.items.length, 1);
        assert.equal(mock.calls.length, 1);
    } finally {
        restoreFetch();
    }
});

test('giphy: /search maps upstream failure to 502', async () => {
    process.env.GIPHY_API_KEY = 'test-key-123';
    const user = await registerUser();
    installFetchMock(async () => new Response('nope', { status: 500 }));
    try {
        const res = await app.request('/v1/integrations/giphy/search?q=cats', {
            headers: { authorization: `Bearer ${user.token}` },
        });
        assert.equal(res.status, 502);
        const body = (await res.json()) as { code: string };
        assert.equal(body.code, 'upstream_error');
    } finally {
        restoreFetch();
    }
});

test('giphy: /binary rejects non-giphy host (SSRF guard)', async () => {
    process.env.GIPHY_API_KEY = 'test-key-123';
    const user = await registerUser();
    const res = await app.request(
        `/v1/integrations/giphy/binary?url=${encodeURIComponent('https://evil.example.com/x.gif')}`,
        { headers: { authorization: `Bearer ${user.token}` } }
    );
    assert.equal(res.status, 400);
});

test('giphy: /binary rejects http:// URLs', async () => {
    process.env.GIPHY_API_KEY = 'test-key-123';
    const user = await registerUser();
    const res = await app.request(
        `/v1/integrations/giphy/binary?url=${encodeURIComponent('http://media0.giphy.com/x.gif')}`,
        { headers: { authorization: `Bearer ${user.token}` } }
    );
    assert.equal(res.status, 400);
});

test('giphy: /binary streams a Giphy CDN URL through the proxy', async () => {
    process.env.GIPHY_API_KEY = 'test-key-123';
    const user = await registerUser();
    const gifBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a header
    installFetchMock(async (url) => {
        assert.equal(url, 'https://media0.giphy.com/abc/cat.gif');
        return new Response(gifBytes, {
            status: 200,
            headers: {
                'content-type': 'image/gif',
                'content-length': String(gifBytes.byteLength),
            },
        });
    });
    try {
        const res = await app.request(
            `/v1/integrations/giphy/binary?url=${encodeURIComponent(
                'https://media0.giphy.com/abc/cat.gif'
            )}`,
            { headers: { authorization: `Bearer ${user.token}` } }
        );
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('content-type'), 'image/gif');
        const body = new Uint8Array(await res.arrayBuffer());
        assert.deepEqual(Array.from(body), Array.from(gifBytes));
    } finally {
        restoreFetch();
    }
});

test('giphy: /binary rejects too-large declared content-length', async () => {
    process.env.GIPHY_API_KEY = 'test-key-123';
    const user = await registerUser();
    installFetchMock(
        async () =>
            new Response(new Uint8Array(8), {
                status: 200,
                headers: {
                    'content-type': 'image/gif',
                    'content-length': String(50 * 1024 * 1024),
                },
            })
    );
    try {
        const res = await app.request(
            `/v1/integrations/giphy/binary?url=${encodeURIComponent(
                'https://media0.giphy.com/x.gif'
            )}`,
            { headers: { authorization: `Bearer ${user.token}` } }
        );
        assert.equal(res.status, 413);
    } finally {
        restoreFetch();
    }
});
