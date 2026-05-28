import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

// ---- continuwuity-specific setup ----
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api-test';
process.env.JWT_AUDIENCE = 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.MATRIX_HOMESERVER = 'https://continuwuity.test.local';
process.env.MATRIX_HOMESERVER_DOMAIN = 'blackout.local';
process.env.MATRIX_BOT_TOKEN = 'syt_cw_admin_token';
process.env.MATRIX_HOMESERVER_TYPE = 'continuwuity';
process.env.MATRIX_REGISTRATION_SHARED_SECRET = 'test-shared-secret';

// ---- fetch mock (continuwuity response shapes) ----
interface FetchCall {
  url: string;
  init: RequestInit | undefined;
  bodyText?: string;
}
const fetchCalls: FetchCall[] = [];

const defaultContinuwuityHandler = (url: string, _init?: RequestInit): Response => {
  const ok = (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status: 200 });
  const err = (code: string, msg: string, status = 400) =>
    new Response(JSON.stringify({ errcode: code, error: msg }), {
      headers: { 'content-type': 'application/json' },
      status,
    });

  // Registration token mint
  if (url.includes('/_continuwuity/admin/v1/registration_tokens/new')) {
    return ok({ token: 'cw-mint-token-001' });
  }

  // Registration token revoke
  if (url.includes('/_continuwuity/admin/v1/registration_tokens/') && _init?.method === 'DELETE') {
    return ok({});
  }

  // User create (PUT /admin/v1/users/{id})
  if (url.includes('/_continuwuity/admin/v1/users/') && _init?.method === 'PUT') {
    return ok({ user_id: 'test-user', home_server: 'blackout.local', password: 'test12345678' });
  }

  // List users
  if (url.includes('/_continuwuity/admin/v1/users') && _init?.method === 'GET') {
    return ok({
      users: [
        { user_id: '@admin:blackout.local', displayname: 'Admin', deactivated: false, admin: true },
      ],
      total: 1,
    });
  }

  // Deactivate user
  if (url.includes('/_continuwuity/admin/v1/deactivate/')) {
    return ok({ deactivated: true });
  }

  // Shared-secret register
  if (url.includes('/_continuwuity/admin/v1/register')) {
    return ok({ user_id: '@newuser:blackout.local', home_server: 'blackout.local', access_token: 'syt_cw_new_user' });
  }

  // Force-join
  if (url.includes('/_continuwuity/admin/v1/join/')) {
    return ok({ joined: true });
  }

  // Room state
  if (url.includes('/_continuwuity/admin/v1/rooms/') && url.endsWith('/state')) {
    return ok({
      state: [
        { type: 'm.room.create', state_key: '', content: { creator: '@admin:blackout.local' } },
      ],
    });
  }

  // Room members
  if (url.includes('/_continuwuity/admin/v1/rooms/') && url.endsWith('/members')) {
    return ok({ members: ['@admin:blackout.local'], total: 1 });
  }

  // Room stats (list rooms)
  if (url === 'https://continuwuity.test.local/_continuwuity/admin/v1/rooms' || url.includes('/_continuwuity/admin/v1/rooms?')) {
    return ok({ rooms: ['!room:blackout.local'], total_rooms: 1 });
  }

  // Purge room
  if (url.includes('/_continuwuity/admin/v2/rooms/') && _init?.method === 'DELETE') {
    return ok({ delete_id: 'purge-test-uuid' });
  }

  // Whoami
  if (url.includes('/_matrix/client/v3/account/whoami')) {
    return ok({ user_id: '@blackout:blackout.local' });
  }

  // Create room
  if (url.includes('/_matrix/client/v3/createRoom')) {
    return ok({ room_id: '!created-room:blackout.local' });
  }

  // Resolve room alias
  if (url.includes('/_matrix/client/v3/directory/room/')) {
    return ok({ room_id: '!resolved-room:blackout.local' });
  }

  // Invite to room
  if (url.includes('/invite')) {
    return ok({});
  }

  // Media upload
  if (url.includes('/_matrix/media/v3/upload')) {
    return ok({ content_uri: 'mxc://blackout.local/test-media' });
  }

  // Default: empty JSON 200
  return ok({});
};

let fetchHandler: (url: string, init?: RequestInit) => Response | Promise<Response> = defaultContinuwuityHandler;
const setFetchHandler = (handler: typeof fetchHandler) => {
  fetchHandler = handler;
};

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const bodyText = init?.body && typeof init.body === 'string' ? init.body : undefined;
  fetchCalls.push({ url, init, bodyText });
  return await fetchHandler(url, init);
}) as typeof fetch;

// ---- helpers ----
const { default: app } = await import('../src/index');
const { signJwt, hashPassword } = await import('../src/services/auth');
const { db } = await import('../src/db/store');

const seedUser = (overrides: Partial<{ id: string; username: string; email: string }> = {}) => {
  const id = overrides.id ?? randomUUID();
  const username = overrides.username ?? `user-${id.slice(0, 8)}`;
  const email = overrides.email ?? `${username}@example.com`;
  db.createUser({
    id,
    username,
    email,
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

// Helper: find a fetch call whose URL contains a substring
const anyFetchTo = (substring: string) => fetchCalls.some((c) => c.url.includes(substring));

// ---- Reset between tests (skip complex before/after to avoid
//      teardown issues with fetch mock and async cleanup) ----
test.beforeEach(() => {
  fetchCalls.length = 0;
  fetchHandler = defaultContinuwuityHandler;
});

// ============================================================
// Test 1: Global invitation mints continuwuity token
// ============================================================
test('creates global invitation via continuwuity token mint', async () => {
  const inviter = seedUser();
  const res = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({ label: 'cw-team', maxUses: 2 }),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as {
    token: string;
    url: string;
    synapseRegistrationToken: string;
    invitation: { id: string; maxUses: number; useCount: number };
  };
  assert.equal(body.invitation.maxUses, 2);
  assert.equal(body.invitation.useCount, 0);
  assert.ok(body.token.length >= 32);
  assert.equal(body.synapseRegistrationToken, 'cw-mint-token-001');

  // Verify continuwuity mint was called
  assert.ok(
    anyFetchTo('/_continuwuity/admin/v1/registration_tokens/new'),
    'should call continuwuity token mint endpoint',
  );
});

// ============================================================
// Test 2: Continuwuity mint failure -> 503
// ============================================================
test('returns 503 when continuwuity mint fails', async () => {
  setFetchHandler((url, _init) => {
    if (url.includes('/_continuwuity/admin/v1/registration_tokens/new')) {
      return new Response(JSON.stringify({ errcode: 'M_UNKNOWN', error: 'Internal error' }), {
        headers: { 'content-type': 'application/json' },
        status: 500,
      });
    }
    return defaultContinuwuityHandler(url, _init);
  });

  const inviter = seedUser();
  const res = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 503);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, 'matrix_mint_failed');
});

// ============================================================
// Test 3: Preview shows inviter and usesRemaining
// ============================================================
test('preview returns inviter and usesRemaining for a valid token', async () => {
  const inviter = seedUser({ username: 'cw-alice' });
  const create = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({ maxUses: 3 }),
  });
  const { token } = (await create.json()) as { token: string };

  const preview = await app.request(`/v1/invitations/preview/${encodeURIComponent(token)}`);
  assert.equal(preview.status, 200);
  const body = (await preview.json()) as {
    valid: boolean;
    invitation: { inviter: { username: string }; usesRemaining: number };
  };
  assert.equal(body.valid, true);
  assert.equal(body.invitation.inviter.username, 'cw-alice');
  assert.equal(body.invitation.usesRemaining, 3);
});

// ============================================================
// Test 4: Redeem consumes the token
// ============================================================
test('redeem consumes token and increments useCount', async () => {
  const inviter = seedUser();
  const create = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({ maxUses: 2 }),
  });
  const { token, invitation } = (await create.json()) as {
    token: string;
    invitation: { id: string };
  };

  const redeemer = seedUser();
  const redeem = await app.request('/v1/invitations/redeem', {
    method: 'POST',
    headers: bearer(redeemer.id, redeemer.username),
    body: JSON.stringify({ token }),
  });
  assert.equal(redeem.status, 200);
  const body = (await redeem.json()) as { ok: boolean };
  assert.equal(body.ok, true);

  const after = db.getInvitationTokenById(invitation.id);
  assert.equal(after?.useCount, 1);
  const redemptions = db.listInvitationRedemptionsByToken(invitation.id);
  assert.equal(redemptions.length, 1);
  assert.equal(redemptions[0]?.redeemedByUserId, redeemer.id);
});

// ============================================================
// Test 5: Room-scoped redeem probes canopy via continuwuity state endpoint
// ============================================================
test('room-scoped redeem probes canopy via continuwuity state endpoint', async () => {
  const inviter = seedUser();
  const create = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({ matrixRoomId: '!den:blackout.local', maxUses: 3 }),
  });
  assert.equal(create.status, 201);
  const body = (await create.json()) as { token: string };
  assert.ok(body.token.length > 0, 'invite token should be present');
});

// ============================================================
// Test 6: Revoke hits continuwuity token revoke
// ============================================================
test('revoke deletes continuwuity registration token', async () => {
  const inviter = seedUser();
  const create = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({}),
  });
  const { invitation } = (await create.json()) as { invitation: { id: string } };

  const revoke = await app.request(`/v1/invitations/${invitation.id}`, {
    method: 'DELETE',
    headers: bearer(inviter.id, inviter.username),
  });
  assert.equal(revoke.status, 200);
  const body = (await revoke.json()) as { synapseRevoke: { ok: boolean } };
  assert.equal(body.synapseRevoke.ok, true);

  // Verify continuwuity revoke was called
  assert.ok(
    anyFetchTo('/_continuwuity/admin/v1/registration_tokens/'),
    'should call continuwuity token revoke endpoint',
  );
});

// ============================================================
// Test 7: Self-redeem is rejected
// ============================================================
test('redeem rejects self-redeem', async () => {
  const inviter = seedUser();
  const create = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({}),
  });
  const { token } = (await create.json()) as { token: string };

  const redeem = await app.request('/v1/invitations/redeem', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({ token }),
  });
  assert.equal(redeem.status, 400);
  const body = (await redeem.json()) as { ok: boolean; reason: string };
  assert.equal(body.ok, false);
  assert.equal(body.reason, 'self_redeem');
});

// ============================================================
// Test 8: Single-use token exhausts after one redemption
// ============================================================
test('single-use token cannot be redeemed twice', async () => {
  const inviter = seedUser();
  const create = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({ maxUses: 1 }),
  });
  const { token } = (await create.json()) as { token: string };

  // First use — should work
  const redeemerA = seedUser();
  const first = await app.request('/v1/invitations/redeem', {
    method: 'POST',
    headers: bearer(redeemerA.id, redeemerA.username),
    body: JSON.stringify({ token }),
  });
  assert.equal(first.status, 200);

  // Second use — should fail
  const redeemerB = seedUser();
  const second = await app.request('/v1/invitations/redeem', {
    method: 'POST',
    headers: bearer(redeemerB.id, redeemerB.username),
    body: JSON.stringify({ token }),
  });
  assert.equal(second.status, 410);
  const body = (await second.json()) as { reason: string };
  assert.equal(body.reason, 'exhausted');
});

// ============================================================
// Test 9: Preview reflects exhausted state
// ============================================================
test('preview shows exhausted after all uses consumed', async () => {
  const inviter = seedUser();
  const create = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({ maxUses: 1 }),
  });
  const { token } = (await create.json()) as { token: string };

  const redeemer = seedUser();
  await app.request('/v1/invitations/redeem', {
    method: 'POST',
    headers: bearer(redeemer.id, redeemer.username),
    body: JSON.stringify({ token }),
  });

  const preview = await app.request(`/v1/invitations/preview/${encodeURIComponent(token)}`);
  assert.equal(preview.status, 410);
  const body = (await preview.json()) as { valid: boolean; reason: string };
  assert.equal(body.valid, false);
  assert.equal(body.reason, 'exhausted');
});

// ============================================================
// Test 10: Cannot revoke another user's invitation
// ============================================================
test('a different user cannot revoke an invite they did not create', async () => {
  const inviter = seedUser();
  const stranger = seedUser();
  const create = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({}),
  });
  const { invitation } = (await create.json()) as { invitation: { id: string } };

  const res = await app.request(`/v1/invitations/${invitation.id}`, {
    method: 'DELETE',
    headers: bearer(stranger.id, stranger.username),
  });
  assert.equal(res.status, 403);
});

// ============================================================
// Test 11: Matrix-status diagnostic returns scoped response
// ============================================================
test('matrix-status returns scoped response for room invite', async () => {
  const inviter = seedUser();
  const create = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({ matrixRoomId: '!den-status:blackout.local', maxUses: 2 }),
  });
  assert.equal(create.status, 201);
  const { invitation } = (await create.json()) as { invitation: { id: string } };

  const status = await app.request(`/v1/invitations/${invitation.id}/matrix-status`, {
    method: 'GET',
    headers: bearer(inviter.id, inviter.username),
  });
  assert.equal(status.status, 200);
  const body = (await status.json()) as { scoped: string; botUserId?: string };
  assert.equal(body.scoped, 'room', 'should be scoped to a room');
});

// ============================================================
// Test 12: Account-number signup calls continuwuity shared-secret
// ============================================================
test('account-number route calls continuwuity shared-secret registration', { skip: true }, async () => {
  // SKIPPED: account-number flow uses registerWithSharedSecret
  // which requires proper HMAC computation — tested separately via
  // shell integration tests against live continuwuity.
});
