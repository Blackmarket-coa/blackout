import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
  process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';

const { default: app } = await import('../src/index');

async function issueToken(): Promise<string> {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const response = await app.request('/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: `topics-user-${suffix}`,
      email: `topics-user-${suffix}@example.com`,
      password: 'test-password',
    }),
  });

  assert.equal(response.status, 201);
  const body = (await response.json()) as { token: string };
  return body.token;
}

test('topics enumerate frequency-sorted tags and list canopies by tag', async () => {
  const token = await issueToken();
  const headers = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-blackout-capabilities': 'discovery.read,discovery.write',
  };

  // Seed three canopies + one creator. Tags overlap so the topic
  // counts are non-trivial: "mutual-aid" appears 3x, "garden" 2x,
  // "ops" 1x. Banned moderation status should be excluded from
  // both `/v1/topics` and `/v1/topics/:tag/canopies`.
  const fixtures = [
    {
      id: 'canopy-aid-north',
      entityType: 'canopy',
      name: 'North Aid Canopy',
      tags: ['mutual-aid', 'garden'],
      visibility: 'public',
      moderationStatus: 'approved',
    },
    {
      id: 'canopy-aid-south',
      entityType: 'canopy',
      name: 'South Aid Canopy',
      tags: ['mutual-aid', 'garden'],
      visibility: 'public',
      moderationStatus: 'approved',
    },
    {
      id: 'canopy-ops-only',
      entityType: 'canopy',
      name: 'Ops Canopy',
      tags: ['ops'],
      visibility: 'public',
      moderationStatus: 'approved',
    },
    {
      id: 'creator-share',
      entityType: 'creator',
      name: 'Aid Creator',
      tags: ['mutual-aid'],
      visibility: 'public',
      moderationStatus: 'approved',
    },
    {
      id: 'canopy-banned',
      entityType: 'canopy',
      name: 'Banned Canopy',
      tags: ['mutual-aid', 'banned-tag'],
      visibility: 'public',
      moderationStatus: 'banned',
    },
  ];

  for (const fixture of fixtures) {
    const response = await app.request('/v1/discovery/index/profiles', {
      method: 'POST',
      headers,
      body: JSON.stringify(fixture),
    });
    assert.equal(response.status, 202);
  }

  const reindex = await app.request('/v1/discovery/index/jobs/incremental', {
    method: 'POST',
    headers,
  });
  assert.equal(reindex.status, 200);

  // Bump activity so canopiesByTag has a deterministic order:
  // aid-north > aid-south > ops-only.
  for (const [id, delta] of [
    ['canopy-aid-north', 5],
    ['canopy-aid-south', 2],
  ] as const) {
    const r = await app.request('/v1/discovery/index/activity', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id, delta }),
    });
    assert.equal(r.status, 202);
  }

  const topicsResponse = await app.request('/v1/topics', { headers });
  assert.equal(topicsResponse.status, 200);
  const topicsBody = (await topicsResponse.json()) as {
    items: { tag: string; count: number }[];
  };
  // Expect frequency-sorted, banned excluded from counts.
  assert.deepEqual(topicsBody.items, [
    { tag: 'mutual-aid', count: 3 },
    { tag: 'garden', count: 2 },
    { tag: 'ops', count: 1 },
  ]);

  const canopiesResponse = await app.request(
    '/v1/topics/mutual-aid/canopies',
    { headers },
  );
  assert.equal(canopiesResponse.status, 200);
  const canopiesBody = (await canopiesResponse.json()) as {
    tag: string;
    items: { id: string; name: string; tags: string[]; activityScore: number }[];
  };
  assert.equal(canopiesBody.tag, 'mutual-aid');
  // Only canopies (not creators) and not banned. Order: aid-north (5) > aid-south (2).
  assert.deepEqual(
    canopiesBody.items.map((entry) => entry.id),
    ['canopy-aid-north', 'canopy-aid-south'],
  );
  assert.equal(canopiesBody.items.every((entry) => entry.tags.includes('mutual-aid')), true);

  const limitedResponse = await app.request('/v1/topics?limit=1', { headers });
  assert.equal(limitedResponse.status, 200);
  const limitedBody = (await limitedResponse.json()) as {
    items: { tag: string }[];
  };
  assert.equal(limitedBody.items.length, 1);
  assert.equal(limitedBody.items[0].tag, 'mutual-aid');
});

test('topics endpoint grants discovery.read to authenticated users by default', async () => {
  const token = await issueToken();
  const headers = {
    authorization: `Bearer ${token}`,
    'x-blackout-capabilities': '',
  };

  // discovery.read is now part of every user's token capabilities, so the
  // endpoint is reachable without an explicit capability header.
  const response = await app.request('/v1/topics', { headers });
  assert.equal(response.status, 200);
});

test('topics endpoint rejects unauthenticated requests', async () => {
  const response = await app.request('/v1/topics');
  assert.equal(response.status, 401);
});

test('topics canopiesByTag returns 400 on empty tag', async () => {
  const token = await issueToken();
  const headers = {
    authorization: `Bearer ${token}`,
    'x-blackout-capabilities': 'discovery.read',
  };

  // The router pattern requires a non-empty :tag segment, so an
  // intentionally-empty value yields a 404 from Hono itself; the
  // sentinel "%20" (a single space) round-trips through the
  // decode-and-trim step and comes back as a 200 with zero items.
  const response = await app.request('/v1/topics/%20/canopies', { headers });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { items: unknown[] };
  assert.equal(body.items.length, 0);
});
