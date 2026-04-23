import test from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET_PRIMARY =
  process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

let registerSeed = Date.now();
async function registerUser(password = 'test-password') {
  const seed = ++registerSeed;
  const email = `user-${seed}@example.com`;
  const response = await app.request('/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: `user-${seed}`,
      email,
      password,
    }),
  });

  assert.equal(response.status, 201);
  const body = (await response.json()) as { token: string; userId: string };
  return { ...body, email, password };
}

test('v1 auth register works', async () => {
  const body = await registerUser();
  assert.ok(body.token);
  assert.ok(body.userId);
});

test('v1 auth register rejects short passwords', async () => {
  const seed = ++registerSeed;
  const response = await app.request('/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: `short-${seed}`,
      email: `short-${seed}@example.com`,
      password: 'short',
    }),
  });
  assert.equal(response.status, 400);
});

test('v1 auth login succeeds with correct credentials', async () => {
  const { email, password } = await registerUser();
  const response = await app.request('/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { token: string; userId: string };
  assert.ok(body.token);
  assert.ok(body.userId);
});

test('v1 auth login rejects wrong password', async () => {
  const { email } = await registerUser();
  const response = await app.request('/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'wrong-password' }),
  });
  assert.equal(response.status, 401);
  const body = await json(response);
  assert.equal(body.error, 'Invalid credentials');
});

test('v1 auth login rejects unknown email with the same error as wrong password', async () => {
  const response = await app.request('/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'does-not-exist@example.com', password: 'whatever-password' }),
  });
  assert.equal(response.status, 401);
  const body = await json(response);
  assert.equal(body.error, 'Invalid credentials');
});

test('v1 auth login rejects missing fields', async () => {
  const response = await app.request('/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'someone@example.com' }),
  });
  assert.equal(response.status, 400);
});

test('v1 auth middleware rejects expired JWTs', async () => {
  const expired = signJwt('demo-user', 'demo', -10);
  const response = await app.request('/v1/channels', {
    headers: { authorization: `Bearer ${expired}` },
  });
  assert.equal(response.status, 401);
});

test('v1 messages post/list works', async () => {
  const create = await app.request('/v1/messages/general', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: 'hello', userId: 'demo-user' }),
  });
  assert.equal(create.status, 201);

  const list = await app.request('/v1/messages/general');
  assert.equal(list.status, 200);
  const body = (await list.json()) as Array<{ content: string }>;
  assert.ok(body.some((msg) => msg.content));
});

test('v1 channels create/list works', async () => {
  const create = await app.request('/v1/channels', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ communityId: 'c-1', name: 'general' }),
  });
  assert.equal(create.status, 201);

  const list = await app.request('/v1/channels');
  assert.equal(list.status, 200);
  const body = (await list.json()) as Array<{ name: string }>;
  assert.ok(body.some((channel) => channel.name === 'general'));
});

test('v1 governance proposal create/get works', async () => {
  const { token, userId } = await registerUser();
  const headers = {
    authorization: `Bearer ${token}`,
    'x-blackout-capabilities': 'governance.read,governance.write',
    'content-type': 'application/json',
  };

  const create = await app.request('/v1/governance/proposals', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      communityId: 'community-1',
      proposerId: userId,
      title: 'Ship /v1 only',
    }),
  });
  assert.equal(create.status, 201);
  const created = (await create.json()) as { id: string };

  const get = await app.request(`/v1/governance/proposals/${created.id}`, { headers });
  assert.equal(get.status, 200);
  const body = await json(get);
  assert.equal(body.id, created.id);
});

test('v1 entitlements read + family filter works', async () => {
  const payload = {
    deploymentPreset: 'starter',
    deploymentPresetEntitlements: {
      'features.stego.enabled': true,
      'features.governance.entitlements': false,
    },
    orgTier: 'pro',
    orgTierEntitlements: {
      'features.stego.ephemeral': true,
      'features.governance.entitlements': true,
    },
    planState: {
      tier: 'pro',
      status: 'active',
      isPaid: true,
    },
  };

  const me = await app.request('/v1/entitlements/me', {
    headers: {
      'x-blackout-entitlement-payload': JSON.stringify(payload),
    },
  });
  assert.equal(me.status, 200);
  const meBody = await json(me);
  assert.equal(meBody.family, 'all');

  const stego = await app.request('/v1/entitlements/stego', {
    headers: {
      'x-blackout-entitlement-payload': JSON.stringify(payload),
    },
  });
  assert.equal(stego.status, 200);
  const stegoBody = await json(stego);
  const entitlements = ((stegoBody.payload as Record<string, unknown>).deploymentPresetEntitlements ?? {}) as Record<string, unknown>;
  assert.ok(Object.keys(entitlements).every((key) => key.startsWith('features.stego.')));
});

test('v1 entitlements returns 400 for invalid payload', async () => {
  const response = await app.request('/v1/entitlements/me', {
    headers: {
      'x-blackout-entitlement-payload': JSON.stringify({ deploymentPreset: 'starter' }),
    },
  });

  assert.equal(response.status, 400);
});
