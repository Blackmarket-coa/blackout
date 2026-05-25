import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
  process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';

const { default: app } = await import('../src/index');
const { verifyJwt } = await import('../src/services/auth');

async function register(username: string): Promise<{ token: string }> {
  const response = await app.request('/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password: 'test-password',
    }),
  });
  assert.equal(response.status, 201);
  return (await response.json()) as { token: string };
}

test('regular users get streaming.read by default and can browse the Live directory without a capability header', async () => {
  const previousAdmins = process.env.BLACKOUT_ADMIN_USERS;
  delete process.env.BLACKOUT_ADMIN_USERS;
  try {
    const username = `viewer-${Date.now()}`;
    const { token } = await register(username);

    const claims = verifyJwt(token);
    assert.ok(claims, 'token should verify');
    assert.deepEqual(claims?.capabilities, ['streaming.read']);

    // The Live directory fetch that previously 403'd with
    // "Streaming isn't available on your account yet."
    const listResp = await app.request('/v1/streaming/streams', {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(listResp.status, 200);

    // Going live stays reserved — no streaming.write for a regular user.
    const writeResp = await app.request(`/v1/streaming/creators/creator-${Date.now()}/stream-key`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(writeResp.status, 403);

    // Creator-private reads must NOT be exposed by the universal read grant:
    // the publishing secret, earnings, and operational logs stay on write.
    const auth = { authorization: `Bearer ${token}` };
    const keyResp = await app.request(`/v1/streaming/creators/creator-x/stream-key`, { headers: auth });
    assert.equal(keyResp.status, 403);
    const revenueResp = await app.request(`/v1/streaming/streams/stream-x/revenue`, { headers: auth });
    assert.equal(revenueResp.status, 403);
    const eventsResp = await app.request(`/v1/streaming/events`, { headers: auth });
    assert.equal(eventsResp.status, 403);
  } finally {
    if (previousAdmins === undefined) delete process.env.BLACKOUT_ADMIN_USERS;
    else process.env.BLACKOUT_ADMIN_USERS = previousAdmins;
  }
});

test('admin allowlist members are minted streaming.write and can provision a stream key', async () => {
  const previousAdmins = process.env.BLACKOUT_ADMIN_USERS;
  const username = `admin-${Date.now()}`;
  process.env.BLACKOUT_ADMIN_USERS = username;
  try {
    const { token } = await register(username);

    const claims = verifyJwt(token);
    assert.ok(claims?.capabilities?.includes('streaming.read'));
    assert.ok(claims?.capabilities?.includes('streaming.write'));

    const writeResp = await app.request(`/v1/streaming/creators/creator-${Date.now()}/stream-key`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(writeResp.status, 201);
  } finally {
    if (previousAdmins === undefined) delete process.env.BLACKOUT_ADMIN_USERS;
    else process.env.BLACKOUT_ADMIN_USERS = previousAdmins;
  }
});
