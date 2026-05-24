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

// Minimal Synapse stub: the mint endpoint returns a token; everything else
// (account provisioning during register) gets an empty 200, which the register
// path tolerates — mirrors invitations.integration.test.ts.
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (url.includes('/_synapse/admin/v1/registration_tokens/new')) {
    return new Response(JSON.stringify({ token: `synapse-${randomUUID().slice(0, 8)}`, uses_allowed: null }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    });
  }
  return new Response(JSON.stringify({}), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  });
}) as typeof fetch;

const { default: app } = await import('../src/index');
const { signJwt, hashPassword } = await import('../src/services/auth');
const { db } = await import('../src/db/store');

const seedUser = (overrides: Partial<{ id: string; username: string }> = {}) => {
  const id = overrides.id ?? randomUUID();
  const username = overrides.username ?? `user-${id.slice(0, 8)}`;
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

const tokenFromShareUrl = (shareUrl: string): string =>
  decodeURIComponent(shareUrl.split('/i/')[1]);

const registerWith = async (token: string) => {
  const username = `redeemer-${randomUUID().slice(0, 8)}`;
  const res = await app.request('/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password: 'Original-Pass-1234!',
      inviteToken: token,
    }),
  });
  return { res, username };
};

test('follows: follow, list, idempotency, self-follow and unfollow', async () => {
  const a = seedUser();
  const b = seedUser();

  const follow = await app.request('/v1/follows', {
    method: 'POST',
    headers: bearer(a.id, a.username),
    body: JSON.stringify({ followeeId: b.id }),
  });
  assert.equal(follow.status, 201);
  assert.deepEqual(await follow.json(), { ok: true, following: true, created: true });

  const following = await app.request('/v1/follows/following', { headers: bearer(a.id, a.username) });
  const followingBody = (await following.json()) as { following: { userId: string; username: string }[] };
  assert.ok(followingBody.following.some((u) => u.userId === b.id && u.username === b.username));

  const followers = await app.request('/v1/follows/followers', { headers: bearer(b.id, b.username) });
  const followersBody = (await followers.json()) as { followers: { userId: string }[] };
  assert.ok(followersBody.followers.some((u) => u.userId === a.id));

  // Idempotent re-follow.
  const again = await app.request('/v1/follows', {
    method: 'POST',
    headers: bearer(a.id, a.username),
    body: JSON.stringify({ followeeId: b.id }),
  });
  assert.equal(again.status, 200);
  assert.equal(((await again.json()) as { created: boolean }).created, false);

  // Self-follow rejected.
  const selfFollow = await app.request('/v1/follows', {
    method: 'POST',
    headers: bearer(a.id, a.username),
    body: JSON.stringify({ followeeId: a.id }),
  });
  assert.equal(selfFollow.status, 400);

  // Unknown user rejected.
  const unknown = await app.request('/v1/follows', {
    method: 'POST',
    headers: bearer(a.id, a.username),
    body: JSON.stringify({ followeeId: randomUUID() }),
  });
  assert.equal(unknown.status, 404);

  // Unfollow.
  const unfollow = await app.request(`/v1/follows/${b.id}`, {
    method: 'DELETE',
    headers: bearer(a.id, a.username),
  });
  assert.equal(unfollow.status, 200);
  assert.equal(((await unfollow.json()) as { removed: boolean }).removed, true);
});

test('personal link is unlimited, never expires, and is stable across calls', async () => {
  const owner = seedUser({ username: 'bio-owner' });

  const first = await app.request('/v1/invitations/personal', { headers: bearer(owner.id, owner.username) });
  assert.equal(first.status, 200);
  const firstBody = (await first.json()) as {
    invitation: { id: string; unlimited: boolean; usesRemaining: number | null; expiresAt?: string };
    url: string;
    shareUrl: string;
  };
  assert.equal(firstBody.invitation.unlimited, true);
  assert.equal(firstBody.invitation.usesRemaining, null);
  assert.equal(firstBody.invitation.expiresAt, undefined);
  assert.ok(
    firstBody.shareUrl.includes('/v1/i/'),
    `shareUrl should be the /v1-hosted OG link, got ${firstBody.shareUrl}`,
  );

  // Idempotent: same stable link on the second call.
  const second = await app.request('/v1/invitations/personal', { headers: bearer(owner.id, owner.username) });
  const secondBody = (await second.json()) as { invitation: { id: string }; shareUrl: string };
  assert.equal(secondBody.invitation.id, firstBody.invitation.id);
  assert.equal(secondBody.shareUrl, firstBody.shareUrl);
});

test('signing up via a personal link follows the owner and the link never exhausts', async () => {
  const owner = seedUser({ username: 'creator-x' });
  const personal = await app.request('/v1/invitations/personal', { headers: bearer(owner.id, owner.username) });
  const { shareUrl, invitation } = (await personal.json()) as {
    shareUrl: string;
    invitation: { id: string };
  };
  const token = tokenFromShareUrl(shareUrl);

  const first = await registerWith(token);
  assert.equal(first.res.status, 201);
  const firstUserId = ((await first.res.json()) as { userId: string }).userId;

  // A second, different person can still redeem the same link (unlimited).
  const second = await registerWith(token);
  assert.equal(second.res.status, 201);

  // Both redeemers now follow the owner.
  const followers = await app.request('/v1/follows/followers', { headers: bearer(owner.id, owner.username) });
  const followerIds = ((await followers.json()) as { followers: { userId: string }[] }).followers.map(
    (u) => u.userId,
  );
  assert.ok(followerIds.includes(firstUserId), 'first redeemer should follow the owner');
  assert.equal(followerIds.length >= 2, true, 'both redeemers should follow the owner');

  // Use count advanced but the link is not exhausted.
  const record = db.getInvitationTokenById(invitation.id);
  assert.equal(record?.useCount, 2);
  assert.equal(record?.unlimited, true);
});

test('GET /v1/i/:token renders OG tags and redirects carrying the registration token', async () => {
  const owner = seedUser({ username: 'og-owner' });
  const personal = await app.request('/v1/invitations/personal', { headers: bearer(owner.id, owner.username) });
  const { shareUrl } = (await personal.json()) as { shareUrl: string };
  const token = tokenFromShareUrl(shareUrl);

  // The /v1-hosted path is the one shared (reachable without an nginx deploy).
  const og = await app.request(`/v1/i/${encodeURIComponent(token)}`);
  assert.equal(og.status, 200);
  assert.match(og.headers.get('content-type') ?? '', /text\/html/);
  const html = await og.text();
  assert.match(html, /property="og:title" content="Join og-owner on Blackout"/);
  assert.match(html, /property="og:image"/);
  assert.ok(html.includes(`/invite/${token}`), 'should redirect to the SPA invite route');
  // Personal link → the redirect must carry the registration token so signup works.
  assert.match(html, /#registrationToken=/, 'redirect must include the registration token fragment');

  // The pretty top-level /i/<token> still renders the same page (works once nginx is deployed).
  const pretty = await app.request(`/i/${encodeURIComponent(token)}`);
  assert.equal(pretty.status, 200);
});

test('a non-personal invite OG page does not leak a registration token', async () => {
  const owner = seedUser({ username: 'room-inviter' });
  const create = await app.request('/v1/invitations', {
    method: 'POST',
    headers: bearer(owner.id, owner.username),
    body: JSON.stringify({ maxUses: 5 }),
  });
  const { token } = (await create.json()) as { token: string };

  const og = await app.request(`/v1/i/${encodeURIComponent(token)}`);
  assert.equal(og.status, 200);
  const html = await og.text();
  assert.ok(html.includes(`/invite/${token}`), 'should still redirect to the SPA invite route');
  assert.doesNotMatch(
    html,
    /#registrationToken=/,
    'non-personal invites must not expose their registration token via the public page',
  );
});
