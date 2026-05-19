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

// Stub Matrix calls so the suite has no network dependency. The
// invitation flow tolerates `matrix_not_configured`, so we just confirm
// it doesn't blow up.
globalThis.fetch = (async () =>
  new Response(JSON.stringify({}), { headers: { 'content-type': 'application/json' } })) as typeof fetch;

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

test('POST /v1/invitations issues a single-use token by default', async () => {
  const inviter = seedUser();
  const res = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({ label: 'team launch' }),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as {
    token: string;
    url: string;
    invitation: { id: string; maxUses: number; useCount: number; label?: string };
  };
  assert.equal(body.invitation.maxUses, 1);
  assert.equal(body.invitation.useCount, 0);
  assert.equal(body.invitation.label, 'team launch');
  assert.ok(body.token.length >= 32, 'token should be at least 32 chars');
  assert.ok(body.url.endsWith(encodeURIComponent(body.token)), 'url should embed the token');
});

test('preview returns inviter and usesRemaining for a valid token', async () => {
  const inviter = seedUser({ username: 'alice-preview' });
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
  assert.equal(body.invitation.inviter.username, 'alice-preview');
  assert.equal(body.invitation.usesRemaining, 3);
});

test('register consumes the invite token and increments useCount', async () => {
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

  const username = `redeemer-${randomUUID().slice(0, 8)}`;
  const register = await app.request('/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password: 'Original-Pass-1234!',
      inviteToken: token,
    }),
  });
  assert.equal(register.status, 201);
  const regBody = (await register.json()) as { invite?: { ok: boolean } };
  assert.equal(regBody.invite?.ok, true);

  const after = db.getInvitationTokenById(invitation.id);
  assert.equal(after?.useCount, 1);
  const redemptions = db.listInvitationRedemptionsByToken(invitation.id);
  assert.equal(redemptions.length, 1);
});

test('register rejects a revoked token and does not create the user', async () => {
  const inviter = seedUser();
  const create = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({}),
  });
  const { token, invitation } = (await create.json()) as { token: string; invitation: { id: string } };

  const revoke = await app.request(`/v1/invitations/${invitation.id}`, {
    method: 'DELETE',
    headers: bearer(inviter.id, inviter.username),
  });
  assert.equal(revoke.status, 200);

  const username = `revoked-${randomUUID().slice(0, 8)}`;
  const register = await app.request('/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password: 'Original-Pass-1234!',
      inviteToken: token,
    }),
  });
  assert.equal(register.status, 400);
  const body = (await register.json()) as { code: string; reason?: string };
  assert.equal(body.code, 'invite_token_invalid');
  assert.equal(body.reason, 'revoked');
  assert.equal(db.findUserByUsername(username), undefined, 'user should have been rolled back');
});

test('single-use token cannot be redeemed twice', async () => {
  const inviter = seedUser();
  const create = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({}),
  });
  const { token } = (await create.json()) as { token: string };

  const usernameA = `firstuse-${randomUUID().slice(0, 8)}`;
  const firstUse = await app.request('/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: usernameA,
      email: `${usernameA}@example.com`,
      password: 'Original-Pass-1234!',
      inviteToken: token,
    }),
  });
  assert.equal(firstUse.status, 201);

  const usernameB = `seconduse-${randomUUID().slice(0, 8)}`;
  const secondUse = await app.request('/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: usernameB,
      email: `${usernameB}@example.com`,
      password: 'Original-Pass-1234!',
      inviteToken: token,
    }),
  });
  assert.equal(secondUse.status, 400);
  const body = (await secondUse.json()) as { reason: string };
  assert.equal(body.reason, 'exhausted');

  const preview = await app.request(`/v1/invitations/preview/${encodeURIComponent(token)}`);
  assert.equal(preview.status, 410);
  const previewBody = (await preview.json()) as { valid: boolean; reason: string };
  assert.equal(previewBody.valid, false);
  assert.equal(previewBody.reason, 'exhausted');
});

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

test('REQUIRE_INVITE_TOKEN closes self-serve registration', async () => {
  process.env.REQUIRE_INVITE_TOKEN = '1';
  try {
    const username = `walkin-${randomUUID().slice(0, 8)}`;
    const res = await app.request('/v1/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username,
        email: `${username}@example.com`,
        password: 'Original-Pass-1234!',
      }),
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, 'invite_required');
  } finally {
    delete process.env.REQUIRE_INVITE_TOKEN;
  }
});

test('inviter cannot redeem their own invitation', async () => {
  const inviter = seedUser();
  const create = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({}),
  });
  const { token } = (await create.json()) as { token: string };

  const { redeemInvitation } = await import('../src/services/invitations');
  const outcome = await redeemInvitation(token, inviter);
  assert.equal(outcome.kind, 'self_redeem');
});
