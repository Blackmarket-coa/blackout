import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api-test';
process.env.JWT_AUDIENCE = 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.MATRIX_HOMESERVER = process.env.MATRIX_HOMESERVER ?? 'https://matrix.test.local';
process.env.MATRIX_BOT_TOKEN = process.env.MATRIX_BOT_TOKEN ?? 'syt_test_admin_token';
// The admin allowlist is read per-request from this env var.
process.env.BLACKOUT_ADMIN_USERS = 'rootadmin';

const stubFetch = (url: string, init?: RequestInit): Response => {
  if (url.includes('/_synapse/admin/v2/users?') && url.includes('limit=1')) {
    return new Response(JSON.stringify({ total: 7, users: [] }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    });
  }
  if (url.includes('/_synapse/admin/v1/rooms?')) {
    return new Response(JSON.stringify({ total_rooms: 3, rooms: [] }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    });
  }
  if (url.includes('/_synapse/admin/v2/users?')) {
    return new Response(
      JSON.stringify({
        total: 1,
        users: [{ name: '@target:test.local', displayname: 'Target', deactivated: false, admin: false }],
      }),
      { headers: { 'content-type': 'application/json' }, status: 200 },
    );
  }
  if (url.includes('/_synapse/admin/v1/deactivate/')) {
    return new Response(JSON.stringify({ id_server_unbind_result: 'success' }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    });
  }
  if (init?.method === 'DELETE' && url.includes('/_synapse/admin/v2/rooms/')) {
    return new Response(JSON.stringify({ delete_id: 'del-123' }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    });
  }
  return new Response(JSON.stringify({}), { headers: { 'content-type': 'application/json' }, status: 200 });
};
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  return stubFetch(url, init);
}) as typeof fetch;

const { default: app } = await import('../src/index');
const { signJwt, hashPassword } = await import('../src/services/auth');
const { db } = await import('../src/db/store');

const seedUser = (username: string) => {
  const id = randomUUID();
  db.createUser({
    id,
    username,
    email: `${username}@example.com`,
    passwordHash: hashPassword('Original-Pass-1234!'),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  return db.getUserById(id)!;
};

const bearer = (userId: string, username: string) => ({
  authorization: `Bearer ${signJwt(userId, username, 600)}`,
  'content-type': 'application/json',
});

test('GET /v1/admin/stats requires authentication', async () => {
  const res = await app.request('/v1/admin/stats', { method: 'GET' });
  assert.equal(res.status, 401);
});

test('GET /v1/admin/stats rejects a non-admin user with 403', async () => {
  const user = seedUser(`member-${randomUUID().slice(0, 6)}`);
  const res = await app.request('/v1/admin/stats', {
    method: 'GET',
    headers: bearer(user.id, user.username),
  });
  assert.equal(res.status, 403);
});

test('GET /v1/admin/stats returns server counts for an allowlisted admin', async () => {
  const admin = seedUser('rootadmin');
  const res = await app.request('/v1/admin/stats', {
    method: 'GET',
    headers: bearer(admin.id, admin.username),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { totalUsers: number; totalRooms: number };
  assert.equal(body.totalUsers, 7);
  assert.equal(body.totalRooms, 3);
});

test('POST /v1/admin/users/:id/deactivate is admin-gated and proxies Synapse', async () => {
  const member = seedUser(`member-${randomUUID().slice(0, 6)}`);
  const denied = await app.request('/v1/admin/users/%40target%3Atest.local/deactivate', {
    method: 'POST',
    headers: bearer(member.id, member.username),
    body: JSON.stringify({}),
  });
  assert.equal(denied.status, 403);

  const admin = seedUser('rootadmin');
  const ok = await app.request('/v1/admin/users/%40target%3Atest.local/deactivate', {
    method: 'POST',
    headers: bearer(admin.id, admin.username),
    body: JSON.stringify({}),
  });
  assert.equal(ok.status, 200);
});

test('POST /v1/admin/rooms/:id/purge returns the Synapse delete job id for an admin', async () => {
  const admin = seedUser('rootadmin');
  const res = await app.request('/v1/admin/rooms/%21room%3Atest.local/purge', {
    method: 'POST',
    headers: bearer(admin.id, admin.username),
    body: JSON.stringify({ purge: true }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; deleteId?: string };
  assert.equal(body.ok, true);
  assert.equal(body.deleteId, 'del-123');
});
