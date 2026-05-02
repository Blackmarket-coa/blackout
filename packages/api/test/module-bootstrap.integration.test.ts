import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
  process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';

const [{ default: app }, { featureModules }] = await Promise.all([
  import('../src/index'),
  import('../src/modules/index'),
]);

async function issueToken(): Promise<string> {
  const suffix = Date.now();
  const response = await app.request('/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: `module-user-${suffix}`,
      email: `module-user-${suffix}@example.com`,
      password: 'test-password',
    }),
  });

  assert.equal(response.status, 201);
  const body = (await response.json()) as { token: string };
  return body.token;
}

test('feature module registry contains canonical frontend domains', () => {
  assert.deepEqual(
    featureModules.map((module) => module.id),
    [
      'governance',
      'forum',
      'deaddrop',
      'moderation',
      'streaming',
      'discovery',
      'profile',
      'stego',
    ],
  );
});

test('feature module routes bootstrap under /v1', async () => {
  const token = await issueToken();
  const headers = {
    authorization: `Bearer ${token}`,
    'x-blackout-capabilities': 'governance.read,forum.read,deaddrop.read,moderation.read,streaming.read,discovery.read',
  };

  const checks = await Promise.all([
    app.request('/v1/governance/events', { headers }),
    app.request('/v1/forum/events', { headers }),
    app.request('/v1/deaddrop/events', { headers }),
    app.request('/v1/moderation/events', { headers }),
    app.request('/v1/streaming/events', { headers }),
    app.request('/v1/discovery/events', { headers }),
  ]);

  for (const response of checks) {
    assert.notEqual(response.status, 404);
    assert.equal(response.status, 200);
  }
});
