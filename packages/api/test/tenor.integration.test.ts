/**
 * Integration tests for the Tenor GIF picker proxy.
 *
 * Covers:
 *   - 503 when TENOR_API_KEY is unset
 *   - 401 when the user is not signed in
 *   - 200 + reshaped payload on /search
 *   - 200 + reshaped payload on /featured
 *   - 400 when /search is missing `q`
 *   - 400 + SSRF block when /binary URL is off the Tenor CDN
 *   - 200 + binary body when /binary URL is on the Tenor CDN
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
  process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Tenor-Tests-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.TENOR_RATE_LIMIT_MAX = process.env.TENOR_RATE_LIMIT_MAX ?? '1000';

const { default: app } = await import('../src/index');

let userSeed = Date.now();
async function registerUser(password = 'test-password') {
  const seed = ++userSeed;
  const username = `tenor-${seed}`;
  const email = `tenor-${seed}@example.com`;
  const res = await app.request('/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });
  assert.equal(res.status, 201, `register failed: ${res.status}`);
  const body = (await res.json()) as { token: string; userId: string };
  return body;
}

const fakeTenorJson = {
  results: [
    {
      id: 'tenor-abc',
      title: 'cat hello',
      content_description: 'A cat saying hi',
      media_formats: {
        gif: {
          url: 'https://media.tenor.com/abc/cat.gif',
          dims: [320, 240] as [number, number],
          size: 12345,
        },
        tinygif: {
          url: 'https://media.tenor.com/abc/cat-tiny.gif',
          dims: [120, 90] as [number, number],
        },
      },
    },
    {
      // Missing gif format — should be filtered out by toPickerItems.
      id: 'tenor-broken',
      title: 'broken',
      content_description: 'no full size',
      media_formats: {
        tinygif: {
          url: 'https://media.tenor.com/x/y-tiny.gif',
          dims: [120, 90] as [number, number],
        },
      },
    },
  ],
  next: '24',
};

type FetchMock = ((input: unknown, init?: unknown) => Promise<Response>) & {
  calls: Array<{ url: string; init?: unknown }>;
};

const installFetchMock = (handler: (url: string, init?: unknown) => Promise<Response>): FetchMock => {
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

test('tenor: /search returns 401 when not signed in', async () => {
  process.env.TENOR_API_KEY = 'test-key';
  const res = await app.request('/v1/integrations/tenor/search?q=cats');
  assert.equal(res.status, 401);
});

test('tenor: /search returns 503 when TENOR_API_KEY missing', async () => {
  delete process.env.TENOR_API_KEY;
  const user = await registerUser();
  const res = await app.request('/v1/integrations/tenor/search?q=cats', {
    headers: { authorization: `Bearer ${user.token}` },
  });
  assert.equal(res.status, 503);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, 'tenor_disabled');
});

test('tenor: /search 400 when q missing', async () => {
  process.env.TENOR_API_KEY = 'test-key';
  const user = await registerUser();
  const res = await app.request('/v1/integrations/tenor/search', {
    headers: { authorization: `Bearer ${user.token}` },
  });
  assert.equal(res.status, 400);
});

test('tenor: /search reshapes upstream and forwards key', async () => {
  process.env.TENOR_API_KEY = 'test-key-123';
  const user = await registerUser();
  const mock = installFetchMock(async (url) => {
    assert.match(url, /\/search\?/);
    assert.match(url, /key=test-key-123/);
    assert.match(url, /media_filter=gif%2Ctinygif/);
    assert.match(url, /q=cats/);
    return new Response(JSON.stringify(fakeTenorJson), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  try {
    const res = await app.request('/v1/integrations/tenor/search?q=cats', {
      headers: { authorization: `Bearer ${user.token}` },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { items: Array<{ id: string }>; next: string | null };
    // The broken result should be filtered; the valid one shaped.
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].id, 'tenor-abc');
    assert.equal(body.next, '24');
    assert.equal(mock.calls.length, 1);
  } finally {
    restoreFetch();
  }
});

test('tenor: /featured reshapes and uses /featured endpoint', async () => {
  process.env.TENOR_API_KEY = 'test-key-123';
  const user = await registerUser();
  const mock = installFetchMock(async (url) => {
    assert.match(url, /\/featured\?/);
    return new Response(JSON.stringify(fakeTenorJson), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  try {
    const res = await app.request('/v1/integrations/tenor/featured', {
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

test('tenor: /binary rejects non-tenor host (SSRF guard)', async () => {
  process.env.TENOR_API_KEY = 'test-key-123';
  const user = await registerUser();
  const res = await app.request(
    `/v1/integrations/tenor/binary?url=${encodeURIComponent('https://evil.example.com/x.gif')}`,
    { headers: { authorization: `Bearer ${user.token}` } },
  );
  assert.equal(res.status, 400);
});

test('tenor: /binary rejects http:// URLs', async () => {
  process.env.TENOR_API_KEY = 'test-key-123';
  const user = await registerUser();
  const res = await app.request(
    `/v1/integrations/tenor/binary?url=${encodeURIComponent('http://media.tenor.com/x.gif')}`,
    { headers: { authorization: `Bearer ${user.token}` } },
  );
  assert.equal(res.status, 400);
});

test('tenor: /binary streams a Tenor CDN URL through the proxy', async () => {
  process.env.TENOR_API_KEY = 'test-key-123';
  const user = await registerUser();
  const gifBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a header
  installFetchMock(async (url) => {
    assert.equal(url, 'https://media.tenor.com/abc/cat.gif');
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
      `/v1/integrations/tenor/binary?url=${encodeURIComponent(
        'https://media.tenor.com/abc/cat.gif',
      )}`,
      { headers: { authorization: `Bearer ${user.token}` } },
    );
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/gif');
    const body = new Uint8Array(await res.arrayBuffer());
    assert.deepEqual(Array.from(body), Array.from(gifBytes));
  } finally {
    restoreFetch();
  }
});

test('tenor: /binary rejects too-large declared content-length', async () => {
  process.env.TENOR_API_KEY = 'test-key-123';
  const user = await registerUser();
  installFetchMock(async () =>
    new Response(new Uint8Array(8), {
      status: 200,
      headers: {
        'content-type': 'image/gif',
        'content-length': String(50 * 1024 * 1024),
      },
    }),
  );
  try {
    const res = await app.request(
      `/v1/integrations/tenor/binary?url=${encodeURIComponent(
        'https://media.tenor.com/x.gif',
      )}`,
      { headers: { authorization: `Bearer ${user.token}` } },
    );
    assert.equal(res.status, 413);
  } finally {
    restoreFetch();
  }
});

test('tenor: /share is best-effort and 200s even when no upstream fires', async () => {
  process.env.TENOR_API_KEY = 'test-key-123';
  const user = await registerUser();
  installFetchMock(async (url) => {
    // /registershare must be called with the id and optional q
    assert.match(url, /\/registershare\?/);
    assert.match(url, /id=tenor-abc/);
    return new Response('', { status: 200 });
  });
  try {
    const res = await app.request('/v1/integrations/tenor/share', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${user.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ id: 'tenor-abc', q: 'cats' }),
    });
    assert.equal(res.status, 200);
  } finally {
    restoreFetch();
  }
});

test('tenor: /share 400 when id missing', async () => {
  process.env.TENOR_API_KEY = 'test-key-123';
  const user = await registerUser();
  const res = await app.request('/v1/integrations/tenor/share', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${user.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
});
