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
      username: `discovery-user-${suffix}`,
      email: `discovery-user-${suffix}@example.com`,
      password: 'test-password',
    }),
  });

  assert.equal(response.status, 201);
  const body = (await response.json()) as { token: string };
  return body.token;
}

test('discovery index jobs, trust filters, browse surfaces, and analytics funnel', async () => {
  const token = await issueToken();
  const headers = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-blackout-capabilities': 'discovery.read,discovery.write',
  };

  const entities = [
    {
      id: 'creator-alpha',
      entityType: 'creator',
      name: 'Alpha Forge',
      bio: 'Crafting resilient mesh tools',
      tags: ['craft', 'mesh'],
      language: 'en',
      isPaid: false,
      moderationStatus: 'approved',
      visibility: 'public',
    },
    {
      id: 'canopy-ops',
      entityType: 'canopy',
      name: 'Ops Canopy',
      tags: ['ops', 'security'],
      language: 'en',
      isPaid: true,
      moderationStatus: 'approved',
      visibility: 'public',
      legalRestrictedRegions: ['fr'],
    },
    {
      id: 'creator-banned',
      entityType: 'creator',
      name: 'Banned Creator',
      moderationStatus: 'banned',
      visibility: 'public',
    },
  ];

  for (const entity of entities) {
    const response = await app.request('/v1/discovery/index/profiles', {
      method: 'POST',
      headers,
      body: JSON.stringify(entity),
    });
    assert.equal(response.status, 202);
  }

  const activity = await app.request('/v1/discovery/index/activity', {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: 'creator-alpha', delta: 3 }),
  });
  assert.equal(activity.status, 202);

  const incremental = await app.request('/v1/discovery/index/jobs/incremental', { method: 'POST', headers });
  assert.equal(incremental.status, 200);
  const incrementalBody = (await incremental.json()) as { indexed: number };
  assert.ok(incrementalBody.indexed >= 2);

  const trending = await app.request('/v1/discovery/browse/trending', { headers });
  assert.equal(trending.status, 200);
  const trendingBody = (await trending.json()) as Array<{ id: string }>;
  assert.equal(trendingBody[0]?.id, 'creator-alpha');
  assert.equal(trendingBody.some((entry) => entry.id === 'creator-banned'), false);

  const legalFilter = await app.request('/v1/discovery/browse/search?region=fr', { headers });
  assert.equal(legalFilter.status, 200);
  const legalFilterBody = (await legalFilter.json()) as Array<{ id: string }>;
  assert.equal(legalFilterBody.some((entry) => entry.id === 'canopy-ops'), false);

  const categories = await app.request('/v1/discovery/browse/categories?tag=ops', { headers });
  assert.equal(categories.status, 200);
  const categoriesBody = (await categories.json()) as Array<{ id: string }>;
  assert.equal(categoriesBody.some((entry) => entry.id === 'canopy-ops'), true);

  const recommended = await app.request('/v1/discovery/browse/recommended?language=en', { headers });
  assert.equal(recommended.status, 200);

  const search = await app.request('/v1/discovery/browse/search?q=alpha&sort=relevance', { headers });
  assert.equal(search.status, 200);
  const searchBody = (await search.json()) as Array<{ id: string }>;
  assert.equal(searchBody[0]?.id, 'creator-alpha');

  const funnelEvents = ['impression', 'click', 'join', 'subscribe'] as const;
  for (const stage of funnelEvents) {
    const response = await app.request('/v1/discovery/analytics/events', {
      method: 'POST',
      headers,
      body: JSON.stringify({ entityId: 'creator-alpha', stage }),
    });
    assert.equal(response.status, 202);
  }

  const funnel = await app.request('/v1/discovery/analytics/funnel', { headers });
  assert.equal(funnel.status, 200);
  const funnelBody = (await funnel.json()) as {
    totals: { impressions: number; clicks: number; joins: number; subscribes: number };
  };
  assert.deepEqual(funnelBody.totals, { impressions: 1, clicks: 1, joins: 1, subscribes: 1 });
});
