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
// Configure Matrix env so the invitation create path actually invokes
// the mint code; the fetch stub below decides what Synapse returns.
process.env.MATRIX_HOMESERVER = process.env.MATRIX_HOMESERVER ?? 'https://matrix.test.local';
process.env.MATRIX_BOT_TOKEN = process.env.MATRIX_BOT_TOKEN ?? 'syt_test_admin_token';

// Tracks outbound fetches so tests can assert the Synapse mint endpoint
// was hit with the right shape. `setFetchHandler` lets individual tests
// inject a custom response (e.g. simulate a 500 from Synapse).
interface FetchCall {
  url: string;
  init: RequestInit | undefined;
  bodyText?: string;
}
const fetchCalls: FetchCall[] = [];
const defaultFetchHandler = (url: string, _init?: RequestInit): Response => {
  // Synapse registration-token mint: return a deterministic token so
  // tests can recognize it in subsequent assertions.
  if (url.includes('/_synapse/admin/v1/registration_tokens/new')) {
    return new Response(JSON.stringify({ token: 'synapse-test-token-001', uses_allowed: 1 }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    });
  }
  // Default: empty JSON 200, which is what the existing tests assumed.
  return new Response(JSON.stringify({}), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  });
};
let fetchHandler: (url: string, init?: RequestInit) => Response | Promise<Response> = defaultFetchHandler;
const setFetchHandler = (handler: typeof fetchHandler) => {
  fetchHandler = handler;
};
const resetFetchHandler = () => {
  fetchHandler = defaultFetchHandler;
  fetchCalls.length = 0;
};
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const bodyText =
    init?.body && typeof init.body === 'string' ? init.body : undefined;
  fetchCalls.push({ url, init, bodyText });
  return await fetchHandler(url, init);
}) as typeof fetch;

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
  assert.ok(
    body.url.includes(`/invite/${encodeURIComponent(body.token)}`),
    `url should embed the token in the path, got ${body.url}`,
  );
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

test('POST /v1/invitations/redeem consumes the token for an authed user', async () => {
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

test('POST /v1/invitations/redeem rejects the creator redeeming their own token', async () => {
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

test('POST /v1/invitations/redeem surfaces the right reason for each failure', async () => {
  const inviter = seedUser();
  const create = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({}),
  });
  const { token, invitation } = (await create.json()) as { token: string; invitation: { id: string } };

  // Revoke and confirm the reason surfaces.
  await app.request(`/v1/invitations/${invitation.id}`, {
    method: 'DELETE',
    headers: bearer(inviter.id, inviter.username),
  });
  const redeemer = seedUser();
  const revokedAttempt = await app.request('/v1/invitations/redeem', {
    method: 'POST',
    headers: bearer(redeemer.id, redeemer.username),
    body: JSON.stringify({ token }),
  });
  assert.equal(revokedAttempt.status, 410);
  const revokedBody = (await revokedAttempt.json()) as { reason: string };
  assert.equal(revokedBody.reason, 'revoked');

  // A completely unknown token should be `invalid` / 404.
  const bogusAttempt = await app.request('/v1/invitations/redeem', {
    method: 'POST',
    headers: bearer(redeemer.id, redeemer.username),
    body: JSON.stringify({ token: 'this-is-not-a-real-token' }),
  });
  assert.equal(bogusAttempt.status, 404);
  const bogusBody = (await bogusAttempt.json()) as { reason: string };
  assert.equal(bogusBody.reason, 'invalid');
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

test('POST /v1/invitations mints a Synapse registration token with matching limits', async () => {
  resetFetchHandler();
  const inviter = seedUser();
  const res = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({ maxUses: 5, expiresInHours: 24 }),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as {
    token: string;
    synapseRegistrationToken: string;
    url: string;
  };
  assert.equal(body.synapseRegistrationToken, 'synapse-test-token-001');
  // URL must embed the Synapse token in the fragment, not the query/path.
  assert.ok(
    body.url.includes('#registrationToken=synapse-test-token-001'),
    `expected fragment in url, got ${body.url}`,
  );
  assert.ok(body.url.includes(`/invite/${encodeURIComponent(body.token)}`));

  // Synapse mint call shape: uses_allowed must mirror maxUses, expiry_time
  // must be a ms-epoch number 24h in the future.
  const mintCall = fetchCalls.find((c) =>
    c.url.includes('/_synapse/admin/v1/registration_tokens/new'),
  );
  assert.ok(mintCall, 'expected a fetch to the Synapse mint endpoint');
  assert.equal(mintCall!.init?.method, 'POST');
  const mintBody = JSON.parse(mintCall!.bodyText ?? '{}') as {
    uses_allowed: number;
    expiry_time: number;
  };
  assert.equal(mintBody.uses_allowed, 5);
  assert.ok(typeof mintBody.expiry_time === 'number');
  const drift = mintBody.expiry_time - (Date.now() + 24 * 60 * 60 * 1000);
  assert.ok(Math.abs(drift) < 5_000, `expiry should be ~24h out (drift ${drift}ms)`);
});

test('GET /v1/invitations does NOT leak the Synapse registration token', async () => {
  resetFetchHandler();
  const inviter = seedUser();
  const create = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({}),
  });
  assert.equal(create.status, 201);

  const list = await app.request('/v1/invitations', {
    method: 'GET',
    headers: bearer(inviter.id, inviter.username),
  });
  assert.equal(list.status, 200);
  const body = (await list.json()) as {
    invitations: Record<string, unknown>[];
  };
  for (const row of body.invitations) {
    assert.ok(
      !('synapseRegistrationToken' in row),
      `list row leaked Synapse token: ${JSON.stringify(row)}`,
    );
  }
});

test('POST /v1/invitations returns 503 and writes no row when Synapse mint fails', async () => {
  resetFetchHandler();
  setFetchHandler((url) => {
    if (url.includes('/_synapse/admin/v1/registration_tokens/new')) {
      return new Response(JSON.stringify({ errcode: 'M_UNKNOWN', error: 'boom' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }
    return defaultFetchHandler(url);
  });

  const inviter = seedUser();
  const beforeList = await app.request('/v1/invitations', {
    method: 'GET',
    headers: bearer(inviter.id, inviter.username),
  });
  const before = ((await beforeList.json()) as { invitations: unknown[] }).invitations.length;

  const res = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 503);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, 'matrix_mint_failed');

  const afterList = await app.request('/v1/invitations', {
    method: 'GET',
    headers: bearer(inviter.id, inviter.username),
  });
  const after = ((await afterList.json()) as { invitations: unknown[] }).invitations.length;
  assert.equal(after, before, 'no invitation row should be persisted on mint failure');
});

test('DELETE /v1/invitations/:id revokes the Synapse token best-effort', async () => {
  resetFetchHandler();
  const inviter = seedUser();
  const create = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({}),
  });
  const { invitation } = (await create.json()) as { invitation: { id: string } };

  // Reset the call log to focus on the revoke side-effects.
  fetchCalls.length = 0;

  const revoke = await app.request(`/v1/invitations/${invitation.id}`, {
    method: 'DELETE',
    headers: bearer(inviter.id, inviter.username),
  });
  assert.equal(revoke.status, 200);
  const body = (await revoke.json()) as {
    synapseRevoke?: { ok: boolean };
    invitation: { revokedAt?: string };
  };
  assert.ok(body.invitation.revokedAt, 'local row should be marked revoked');
  assert.equal(body.synapseRevoke?.ok, true);

  const synapseDelete = fetchCalls.find((c) =>
    c.url.includes('/_synapse/admin/v1/registration_tokens/synapse-test-token-001'),
  );
  assert.ok(synapseDelete, 'expected DELETE to Synapse for the stored registration token');
  assert.equal(synapseDelete!.init?.method, 'DELETE');
});

test('DELETE /v1/invitations/:id revokes locally even if Synapse rejects', async () => {
  resetFetchHandler();
  const inviter = seedUser();
  const create = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({}),
  });
  const { invitation } = (await create.json()) as { invitation: { id: string } };

  setFetchHandler((url, init) => {
    if (
      url.includes('/_synapse/admin/v1/registration_tokens/') &&
      init?.method === 'DELETE'
    ) {
      return new Response('nope', { status: 500 });
    }
    return defaultFetchHandler(url, init);
  });

  const revoke = await app.request(`/v1/invitations/${invitation.id}`, {
    method: 'DELETE',
    headers: bearer(inviter.id, inviter.username),
  });
  assert.equal(revoke.status, 200);
  const body = (await revoke.json()) as {
    synapseRevoke?: { ok: boolean };
    invitation: { revokedAt?: string };
  };
  assert.ok(body.invitation.revokedAt, 'local row should still be marked revoked');
  assert.equal(body.synapseRevoke?.ok, false);
});

// --- Listing: filters, validation, redemption username surfacing ----------

test('GET /v1/invitations filters by state (active vs revoked)', async () => {
  resetFetchHandler();
  const inviter = seedUser();

  // Three invites: one we leave active, one we revoke, one with a label.
  const mk = (body: object) =>
    app.request('/v1/invitations', {
      method: 'POST',
      headers: bearer(inviter.id, inviter.username),
      body: JSON.stringify(body),
    });
  const active = (await (await mk({ label: 'still-here' })).json()) as {
    invitation: { id: string };
  };
  const toRevoke = (await (await mk({ label: 'gone-soon' })).json()) as {
    invitation: { id: string };
  };
  await mk({ label: 'also-here' });

  await app.request(`/v1/invitations/${toRevoke.invitation.id}`, {
    method: 'DELETE',
    headers: bearer(inviter.id, inviter.username),
  });

  const activeRes = await app.request('/v1/invitations?state=active', {
    method: 'GET',
    headers: bearer(inviter.id, inviter.username),
  });
  assert.equal(activeRes.status, 200);
  const activeBody = (await activeRes.json()) as {
    invitations: Array<{ id: string; revokedAt?: string }>;
  };
  assert.ok(
    activeBody.invitations.some((r) => r.id === active.invitation.id),
    'active filter should include the un-revoked invite',
  );
  assert.ok(
    !activeBody.invitations.some((r) => r.id === toRevoke.invitation.id),
    'active filter should NOT include the revoked invite',
  );
  for (const r of activeBody.invitations) {
    assert.equal(r.revokedAt, undefined, 'active rows must not have revokedAt');
  }

  const revokedRes = await app.request('/v1/invitations?state=revoked', {
    method: 'GET',
    headers: bearer(inviter.id, inviter.username),
  });
  const revokedBody = (await revokedRes.json()) as {
    invitations: Array<{ id: string; revokedAt?: string }>;
  };
  assert.ok(
    revokedBody.invitations.some((r) => r.id === toRevoke.invitation.id),
    'revoked filter should include the revoked invite',
  );
  for (const r of revokedBody.invitations) {
    assert.ok(r.revokedAt, 'revoked rows must have revokedAt set');
  }
});

test('GET /v1/invitations filters by label substring, case-insensitive', async () => {
  resetFetchHandler();
  const inviter = seedUser();
  const mk = (label: string) =>
    app.request('/v1/invitations', {
      method: 'POST',
      headers: bearer(inviter.id, inviter.username),
      body: JSON.stringify({ label }),
    });
  await mk('Alpha-cohort');
  await mk('alphabet-team');
  await mk('Beta-release');

  const aRes = await app.request('/v1/invitations?label=alpha', {
    method: 'GET',
    headers: bearer(inviter.id, inviter.username),
  });
  const aBody = (await aRes.json()) as { invitations: Array<{ label?: string }> };
  const aLabels = aBody.invitations.map((r) => r.label);
  assert.ok(aLabels.includes('Alpha-cohort'), 'should match Alpha-cohort');
  assert.ok(aLabels.includes('alphabet-team'), 'should match alphabet-team');
  assert.ok(!aLabels.includes('Beta-release'), 'should not match Beta-release');

  const bRes = await app.request('/v1/invitations?label=beta', {
    method: 'GET',
    headers: bearer(inviter.id, inviter.username),
  });
  const bBody = (await bRes.json()) as { invitations: Array<{ label?: string }> };
  assert.deepEqual(
    bBody.invitations.map((r) => r.label),
    ['Beta-release'],
  );
});

test('GET /v1/invitations rejects unknown state filter with 400', async () => {
  resetFetchHandler();
  const inviter = seedUser();
  const res = await app.request('/v1/invitations?state=bogus', {
    method: 'GET',
    headers: bearer(inviter.id, inviter.username),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, 'bad_request');
});

test('GET /v1/invitations surfaces the redeemer username on each redemption', async () => {
  resetFetchHandler();
  const inviter = seedUser();
  const create = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({ maxUses: 1 }),
  });
  const { token, invitation } = (await create.json()) as {
    token: string;
    invitation: { id: string };
  };

  const redeemer = seedUser({ username: 'bob-redeemer' });
  const redeem = await app.request('/v1/invitations/redeem', {
    method: 'POST',
    headers: bearer(redeemer.id, redeemer.username),
    body: JSON.stringify({ token }),
  });
  assert.equal(redeem.status, 200);

  const list = await app.request('/v1/invitations', {
    method: 'GET',
    headers: bearer(inviter.id, inviter.username),
  });
  const body = (await list.json()) as {
    invitations: Array<{
      id: string;
      redemptions: Array<{ userId: string; username: string; at: string }>;
    }>;
  };
  const row = body.invitations.find((r) => r.id === invitation.id);
  assert.ok(row, 'invite should be present in the list');
  assert.equal(row!.redemptions.length, 1);
  assert.equal(row!.redemptions[0]!.username, 'bob-redeemer');
  assert.equal(row!.redemptions[0]!.userId, redeemer.id);
  assert.ok(row!.redemptions[0]!.at, 'redemption row should carry a timestamp');
});

// --- Metrics --------------------------------------------------------------

const readMetric = async (
  name: string,
  labels: Record<string, string> = {},
): Promise<number> => {
  const res = await app.request('/metrics', { method: 'GET' });
  const text = await res.text();
  // Lines look like: invitations_created_total{scoped="global"} 3
  const labelKey = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
  const needle = labelKey ? `${name}{${labelKey}}` : name;
  for (const line of text.split('\n')) {
    if (line.startsWith('#')) continue;
    if (line.startsWith(`${needle} `)) {
      const value = Number(line.slice(needle.length + 1).trim());
      return Number.isFinite(value) ? value : 0;
    }
  }
  return 0;
};

test('metrics: invitations_created_total increments on successful create', async () => {
  resetFetchHandler();
  const inviter = seedUser();
  const before = await readMetric('invitations_created_total', { scoped: 'global' });
  const res = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 201);
  const after = await readMetric('invitations_created_total', { scoped: 'global' });
  assert.equal(after, before + 1, 'global-scoped create should bump the counter by 1');
});

test('metrics: invitations_redeemed_total increments per outcome', async () => {
  resetFetchHandler();
  const inviter = seedUser();
  const create = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({ maxUses: 1 }),
  });
  const { token } = (await create.json()) as { token: string };

  const okBefore = await readMetric('invitations_redeemed_total', { outcome: 'ok' });
  const redeemer = seedUser();
  await app.request('/v1/invitations/redeem', {
    method: 'POST',
    headers: bearer(redeemer.id, redeemer.username),
    body: JSON.stringify({ token }),
  });
  const okAfter = await readMetric('invitations_redeemed_total', { outcome: 'ok' });
  assert.equal(okAfter, okBefore + 1, 'ok redemption should bump outcome="ok"');

  // Now exhausted: same single-use token, different redeemer.
  const exhaustedBefore = await readMetric('invitations_redeemed_total', {
    outcome: 'exhausted',
  });
  const second = seedUser();
  await app.request('/v1/invitations/redeem', {
    method: 'POST',
    headers: bearer(second.id, second.username),
    body: JSON.stringify({ token }),
  });
  const exhaustedAfter = await readMetric('invitations_redeemed_total', {
    outcome: 'exhausted',
  });
  assert.equal(
    exhaustedAfter,
    exhaustedBefore + 1,
    'second redemption should bump outcome="exhausted"',
  );

  // Unknown token → invalid.
  const invalidBefore = await readMetric('invitations_redeemed_total', {
    outcome: 'invalid',
  });
  await app.request('/v1/invitations/redeem', {
    method: 'POST',
    headers: bearer(second.id, second.username),
    body: JSON.stringify({ token: 'not-a-real-token-xyz' }),
  });
  const invalidAfter = await readMetric('invitations_redeemed_total', {
    outcome: 'invalid',
  });
  assert.equal(invalidAfter, invalidBefore + 1, 'unknown token should bump outcome="invalid"');
});

test('metrics: invitations_matrix_mint_failures_total increments on Synapse failure', async () => {
  resetFetchHandler();
  setFetchHandler((url) => {
    if (url.includes('/_synapse/admin/v1/registration_tokens/new')) {
      return new Response(JSON.stringify({ errcode: 'M_UNKNOWN', error: 'boom' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }
    return defaultFetchHandler(url);
  });

  const inviter = seedUser();
  const before = await readMetric('invitations_matrix_mint_failures_total', {
    reason: 'synapse_rejected',
  });
  const res = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 503);
  const after = await readMetric('invitations_matrix_mint_failures_total', {
    reason: 'synapse_rejected',
  });
  assert.equal(after, before + 1, 'mint failure should bump reason="synapse_rejected"');
});

// --- Canopy resolution: redeeming a room-scoped invite surfaces the parent space

test('POST /v1/invitations/redeem force-joins the redeemer and returns the parent canopy id', async () => {
  resetFetchHandler();
  const roomId = '!den:server';
  const canopyId = '!canopy:server';
  setFetchHandler((url, init) => {
    // Canopy resolution via the Synapse admin state endpoint (works even when
    // the bot is not a room member).
    if (url.includes(`/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/state`)) {
      return new Response(
        JSON.stringify({
          state: [
            { type: 'm.room.create', content: { creator: '@bot:server' } },
            {
              type: 'm.space.parent',
              state_key: canopyId,
              content: { via: ['server'] },
            },
          ],
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      );
    }
    return defaultFetchHandler(url, init);
  });

  const inviter = seedUser();
  const create = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({ matrixRoomId: roomId }),
  });
  const { token } = (await create.json()) as { token: string };

  // Focus the call log on the redeem side-effects.
  fetchCalls.length = 0;

  const redeemer = seedUser();
  const redeem = await app.request('/v1/invitations/redeem', {
    method: 'POST',
    headers: bearer(redeemer.id, redeemer.username),
    body: JSON.stringify({ token }),
  });
  assert.equal(redeem.status, 200);
  const body = (await redeem.json()) as { ok: boolean; canopyId?: string };
  assert.equal(body.ok, true);
  assert.equal(body.canopyId, canopyId, 'redeem should surface the resolved parent canopy');

  // The redeemer is force-joined via the Synapse admin join endpoint (which
  // works for member-created dens where the bot can't invite).
  const joinCall = fetchCalls.find(
    (c) =>
      c.url.includes(`/_synapse/admin/v1/join/${encodeURIComponent(roomId)}`) &&
      c.init?.method === 'POST',
  );
  assert.ok(joinCall, 'expected a Synapse admin join POST for the room-scoped invite');

  // Admin join succeeded, so no fallback bot invite should have been issued.
  const inviteCall = fetchCalls.find(
    (c) => c.url.includes(`/rooms/${encodeURIComponent(roomId)}/invite`) && c.init?.method === 'POST',
  );
  assert.equal(inviteCall, undefined, 'admin join succeeded; no fallback invite expected');

  resetFetchHandler();
});

test('POST /v1/invitations/redeem falls back to a bot invite when admin join fails', async () => {
  resetFetchHandler();
  const roomId = '!den2:server';
  setFetchHandler((url, init) => {
    // Admin join is unavailable / forbidden -> non-2xx.
    if (url.includes(`/_synapse/admin/v1/join/${encodeURIComponent(roomId)}`)) {
      return new Response('nope', { status: 403 });
    }
    return defaultFetchHandler(url, init);
  });

  const inviter = seedUser();
  const create = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({ matrixRoomId: roomId }),
  });
  const { token } = (await create.json()) as { token: string };

  fetchCalls.length = 0;

  const redeemer = seedUser();
  const redeem = await app.request('/v1/invitations/redeem', {
    method: 'POST',
    headers: bearer(redeemer.id, redeemer.username),
    body: JSON.stringify({ token }),
  });
  assert.equal(redeem.status, 200);

  const joinCall = fetchCalls.find(
    (c) =>
      c.url.includes(`/_synapse/admin/v1/join/${encodeURIComponent(roomId)}`) &&
      c.init?.method === 'POST',
  );
  assert.ok(joinCall, 'expected the admin join attempt first');

  const inviteCall = fetchCalls.find(
    (c) => c.url.includes(`/rooms/${encodeURIComponent(roomId)}/invite`) && c.init?.method === 'POST',
  );
  assert.ok(inviteCall, 'expected a fallback bot invite after admin join failed');

  resetFetchHandler();
});

test('POST /v1/invitations/redeem omits canopyId for a global (account-only) invite', async () => {
  resetFetchHandler();
  const inviter = seedUser();
  const create = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(inviter.id, inviter.username),
    body: JSON.stringify({}),
  });
  const { token } = (await create.json()) as { token: string };

  const redeemer = seedUser();
  const redeem = await app.request('/v1/invitations/redeem', {
    method: 'POST',
    headers: bearer(redeemer.id, redeemer.username),
    body: JSON.stringify({ token }),
  });
  assert.equal(redeem.status, 200);
  const body = (await redeem.json()) as { ok: boolean; canopyId?: string };
  assert.equal(body.ok, true);
  assert.equal(body.canopyId, undefined, 'a global invite has no room and thus no canopy');
});
