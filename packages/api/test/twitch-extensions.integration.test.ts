import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID, randomBytes } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api-test';
process.env.JWT_AUDIENCE = 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS = `v1:${randomBytes(32).toString('base64')}`;
process.env.TWITCH_EXTENSION_SECRET = 'ext-shared-secret-abc123';

const { default: app } = await import('../src/index');
const { signJwt, hashPassword } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { upsertLinkedAccount } = await import('../src/services/linkedAccounts');
const ebs = await import('../src/integrations/twitch/ebsJwt');

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

const seedLiveStream = (creatorId: string) => {
  const id = randomUUID();
  db.upsertStream({
    id,
    creatorId,
    state: 'live',
    title: 'Live',
    tags: [],
    visibility: 'public',
    allowedSubscriberIds: [],
    latencyProfile: 'normal',
  });
  return id;
};

const decodeJwtPayload = (token: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

// ----------------------------- ebsJwt unit -----------------------------

test('ebsJwt.buildOpaqueUserId: deterministic, U-prefixed, channel-scoped', () => {
  const a = ebs.buildOpaqueUserId('secret', 'user-1', 'chan-1');
  const a2 = ebs.buildOpaqueUserId('secret', 'user-1', 'chan-1');
  const b = ebs.buildOpaqueUserId('secret', 'user-1', 'chan-2');
  assert.equal(a, a2, 'stable for the same inputs');
  assert.notEqual(a, b, 'changes with channel');
  assert.match(a, /^U[0-9a-f]{64}$/);
});

test('ebsJwt.signEbsJwt: signs an HS256 JWT with the expected claims', () => {
  const now = () => 1_900_000_000_000;
  const signed = ebs.signEbsJwt({
    secret: 'ext-secret',
    channelId: 'chan-9',
    role: 'broadcaster',
    blackoutUserId: 'user-9',
    ttlSeconds: 3600,
    now,
  });
  const [h, p, sig] = signed.token.split('.');
  // Signature verifies against the secret.
  const expectedSig = createHmac('sha256', 'ext-secret').update(`${h}.${p}`).digest('base64url');
  assert.equal(sig, expectedSig);

  const payload = decodeJwtPayload(signed.token);
  assert.equal(payload.channel_id, 'chan-9');
  assert.equal(payload.role, 'broadcaster');
  assert.equal(payload.opaque_user_id, signed.opaqueUserId);
  assert.equal(payload.exp, Math.floor(now() / 1000) + 3600);
  assert.deepEqual(payload.pubsub_perms, { listen: ['broadcast'], send: [] });
  assert.equal(payload.user_id, undefined, 'no user_id without identity share');
});

test('ebsJwt.signEbsJwt: includes user_id when provided', () => {
  const signed = ebs.signEbsJwt({
    secret: 'ext-secret',
    channelId: 'chan-9',
    role: 'viewer',
    blackoutUserId: 'user-9',
    userId: '555',
  });
  assert.equal(decodeJwtPayload(signed.token).user_id, '555');
});

// ----------------------------- token route -----------------------------

test('extensions token: requires authentication', async () => {
  const res = await app.request('/v1/integrations/twitch/extensions/token?streamId=x', {
    method: 'GET',
  });
  assert.equal(res.status, 401);
});

test('extensions token: 400 when streamId is missing', async () => {
  const user = seedUser(`u-${randomUUID().slice(0, 6)}`);
  const res = await app.request('/v1/integrations/twitch/extensions/token', {
    method: 'GET',
    headers: bearer(user.id, user.username),
  });
  assert.equal(res.status, 400);
});

test('extensions token: 404 for an unknown stream', async () => {
  const user = seedUser(`u-${randomUUID().slice(0, 6)}`);
  const res = await app.request('/v1/integrations/twitch/extensions/token?streamId=nope', {
    method: 'GET',
    headers: bearer(user.id, user.username),
  });
  assert.equal(res.status, 404);
});

test('extensions token: creator gets the broadcaster role and channel id from their linked Twitch', async () => {
  const creator = seedUser(`creator-${randomUUID().slice(0, 6)}`);
  upsertLinkedAccount({
    blackoutUserId: creator.id,
    provider: 'twitch',
    providerUserId: '123456',
    providerUsername: 'CreatorTw',
    tokens: { accessToken: 'a', refreshToken: 'r', expiresInSeconds: 3600, scopes: [] },
  });
  const streamId = seedLiveStream(creator.id);
  const res = await app.request(
    `/v1/integrations/twitch/extensions/token?streamId=${streamId}`,
    { method: 'GET', headers: bearer(creator.id, creator.username) },
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.role, 'broadcaster');
  assert.equal(body.channelId, '123456');
  assert.equal(body.userId, null, 'no identity share requested');
  assert.match(String(body.opaqueUserId), /^U[0-9a-f]{64}$/);
  assert.equal(decodeJwtPayload(String(body.token)).role, 'broadcaster');
});

test('extensions token: a non-creator viewer gets the viewer role', async () => {
  const creator = seedUser(`creator-${randomUUID().slice(0, 6)}`);
  const viewer = seedUser(`viewer-${randomUUID().slice(0, 6)}`);
  const streamId = seedLiveStream(creator.id);
  const res = await app.request(
    `/v1/integrations/twitch/extensions/token?streamId=${streamId}`,
    { method: 'GET', headers: bearer(viewer.id, viewer.username) },
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.role, 'viewer');
  // No linked Twitch → channelId falls back to the creator's Blackout id.
  assert.equal(body.channelId, creator.id);
});

test('extensions token: shareIdentity=true surfaces the viewer real Twitch id', async () => {
  const creator = seedUser(`creator-${randomUUID().slice(0, 6)}`);
  const viewer = seedUser(`viewer-${randomUUID().slice(0, 6)}`);
  upsertLinkedAccount({
    blackoutUserId: viewer.id,
    provider: 'twitch',
    providerUserId: '999',
    providerUsername: 'ViewerTw',
    tokens: { accessToken: 'a', refreshToken: 'r', expiresInSeconds: 3600, scopes: [] },
  });
  const streamId = seedLiveStream(creator.id);
  const res = await app.request(
    `/v1/integrations/twitch/extensions/token?streamId=${streamId}&shareIdentity=true`,
    { method: 'GET', headers: bearer(viewer.id, viewer.username) },
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.userId, '999');
  assert.equal(decodeJwtPayload(String(body.token)).user_id, '999');
});
