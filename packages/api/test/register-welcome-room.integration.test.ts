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
process.env.MATRIX_HOMESERVER = 'https://matrix.test.local';
process.env.MATRIX_BOT_TOKEN = 'syt_test_admin_token';
process.env.MATRIX_HOMESERVER_DOMAIN = 'test.local';
process.env.WELCOME_MATRIX_ROOM_ALIAS = '#welcome:test.local';
// Registration must stay open for this test (no invite gate).
delete process.env.REQUIRE_INVITE_TOKEN;

interface FetchCall {
  url: string;
  method?: string;
  bodyText?: string;
}
const fetchCalls: FetchCall[] = [];

const stubFetch = (url: string, init?: RequestInit): Response => {
  // Synapse user provisioning.
  if (url.includes('/_synapse/admin/v2/users/') && init?.method === 'PUT') {
    return new Response(JSON.stringify({ name: '@x:test.local' }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    });
  }
  // Welcome-room alias resolution.
  if (url.includes('/_matrix/client/v3/directory/room/')) {
    return new Response(JSON.stringify({ room_id: '!welcome:test.local' }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    });
  }
  // Admin force-join.
  if (url.includes('/_synapse/admin/v1/join/')) {
    return new Response(JSON.stringify({ room_id: '!welcome:test.local' }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    });
  }
  return new Response(JSON.stringify({}), { headers: { 'content-type': 'application/json' }, status: 200 });
};
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  fetchCalls.push({
    url,
    method: init?.method,
    bodyText: typeof init?.body === 'string' ? init.body : undefined,
  });
  return stubFetch(url, init);
}) as typeof fetch;

const { default: app } = await import('../src/index');

test('registration force-joins the new user into the configured welcome room', async () => {
  const username = `newbie${randomUUID().slice(0, 6)}`;
  const res = await app.request('/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, email: `${username}@example.com`, password: 'Original-Pass-1234!' }),
  });
  assert.equal(res.status, 201);

  const joinCall = fetchCalls.find((call) => call.url.includes('/_synapse/admin/v1/join/'));
  assert.ok(joinCall, 'expected an admin force-join against the welcome room');
  assert.ok(joinCall.bodyText?.includes(`@${username}:test.local`), 'join targets the new user mxid');
});
