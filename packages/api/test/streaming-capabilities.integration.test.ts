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

interface Account {
  token: string;
  userId: string;
  username: string;
}

async function register(): Promise<Account> {
  const username = `stream-cap-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const response = await app.request('/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, email: `${username}@example.com`, password: 'test-password' }),
  });
  assert.equal(response.status, 201);
  const body = (await response.json()) as { token: string; userId: string };
  return { token: body.token, userId: body.userId, username };
}

const auth = (account: Account) => ({ authorization: `Bearer ${account.token}` });
const jsonAuth = (account: Account) => ({ ...auth(account), 'content-type': 'application/json' });

test('every authenticated user is minted read access + safe writes and can browse Live', async () => {
  const account = await register();

  const claims = verifyJwt(account.token);
  assert.ok(claims, 'token should verify');
  const caps = new Set(claims?.capabilities ?? []);

  // Read access to every guarded domain, plus write only where the module
  // enforces per-resource ownership (streaming, profile).
  for (const cap of [
    'streaming.read',
    'streaming.write',
    'profile.read',
    'profile.write',
    'governance.read',
    'moderation.read',
    'forum.read',
    'discovery.read',
  ]) {
    assert.ok(caps.has(cap), `expected capability ${cap}`);
  }

  // Writes for domains that gate solely on the capability (no ownership check)
  // must NOT be minted into every token, or any user could moderate/govern.
  for (const cap of ['governance.write', 'moderation.write', 'forum.write', 'deaddrop.write']) {
    assert.ok(!caps.has(cap), `should not mint ${cap} for all users`);
  }

  const listResp = await app.request('/v1/streaming/streams', { headers: auth(account) });
  assert.equal(listResp.status, 200);
});

// Regression: opening a profile failed because tokens never carried
// profile.read, so GET /v1/profile/:id returned 403 (surfaced as the reported
// "405"). A real login token must now grant profile.read with no extra header.
test('a registered user can read profiles without an explicit capability header', async () => {
  const account = await register();
  const res = await app.request(`/v1/profile/${account.userId}`, { headers: auth(account) });
  // 404 (no profile saved yet) — crucially NOT 403 missing_capability.
  assert.equal(res.status, 404);
});

test('a user can provision and read their own stream key, but not another creator’s', async () => {
  const account = await register();

  // Own creator id == own user id: allowed.
  const own = await app.request(`/v1/streaming/creators/${account.userId}/stream-key`, {
    method: 'POST',
    headers: jsonAuth(account),
    body: JSON.stringify({}),
  });
  assert.equal(own.status, 201);

  const readOwn = await app.request(`/v1/streaming/creators/${account.userId}/stream-key`, {
    headers: auth(account),
  });
  assert.equal(readOwn.status, 200);

  // Someone else's creator id: forbidden, even though the caller has write.
  const other = await app.request(`/v1/streaming/creators/someone-else/stream-key`, {
    method: 'POST',
    headers: jsonAuth(account),
    body: JSON.stringify({}),
  });
  assert.equal(other.status, 403);

  const readOther = await app.request(`/v1/streaming/creators/someone-else/stream-key`, {
    headers: auth(account),
  });
  assert.equal(readOther.status, 403);
});

test('a creator’s private reads are not exposed to other users', async () => {
  const owner = await register();
  const intruder = await register();
  const streamId = `cap-stream-${Date.now()}`;

  // Owner provisions a stream (creates the stream record owned by them).
  const provision = await app.request(`/v1/streaming/creators/${owner.userId}/stream-key`, {
    method: 'POST',
    headers: jsonAuth(owner),
    body: JSON.stringify({ streamId }),
  });
  assert.equal(provision.status, 201);

  // Owner can read their own revenue / sessions / moderation.
  for (const path of ['revenue', 'sessions', 'moderation']) {
    const ok = await app.request(`/v1/streaming/streams/${streamId}/${path}`, { headers: auth(owner) });
    assert.equal(ok.status, 200, `owner ${path}`);
  }

  // A different user cannot, despite holding streaming.write.
  for (const path of ['revenue', 'sessions', 'moderation']) {
    const denied = await app.request(`/v1/streaming/streams/${streamId}/${path}`, {
      headers: auth(intruder),
    });
    assert.equal(denied.status, 403, `intruder ${path}`);
  }
});

test('the streaming-wide event log is admin-only', async () => {
  const previousAdmins = process.env.BLACKOUT_ADMIN_USERS;
  delete process.env.BLACKOUT_ADMIN_USERS;
  try {
    const regular = await register();
    const denied = await app.request('/v1/streaming/events', { headers: auth(regular) });
    assert.equal(denied.status, 403);

    const adminAccount = await register();
    process.env.BLACKOUT_ADMIN_USERS = adminAccount.username;
    const ok = await app.request('/v1/streaming/events', { headers: auth(adminAccount) });
    assert.equal(ok.status, 200);
  } finally {
    if (previousAdmins === undefined) delete process.env.BLACKOUT_ADMIN_USERS;
    else process.env.BLACKOUT_ADMIN_USERS = previousAdmins;
  }
});
