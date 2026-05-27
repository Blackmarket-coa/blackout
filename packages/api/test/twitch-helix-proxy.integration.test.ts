import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api-test';
process.env.JWT_AUDIENCE = 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS = `v1:${randomBytes(32).toString('base64')}`;

const { default: app } = await import('../src/index');
const { signJwt, hashPassword } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { upsertLinkedAccount } = await import('../src/services/linkedAccounts');

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

const linkTwitch = (userId: string, providerUserId: string, username: string) =>
  upsertLinkedAccount({
    blackoutUserId: userId,
    provider: 'twitch',
    providerUserId,
    providerUsername: username,
    tokens: { accessToken: 'a', refreshToken: 'r', expiresInSeconds: 3600, scopes: [] },
  });

test('helix-proxy GET /users requires authentication', async () => {
  const res = await app.request('/v1/integrations/twitch/helix-proxy/users', { method: 'GET' });
  assert.equal(res.status, 401);
});

test('helix-proxy GET /users returns the caller shaped as a Helix user, preferring the linked Twitch id', async () => {
  const user = seedUser(`creator-${randomUUID().slice(0, 6)}`);
  linkTwitch(user.id, '424242', 'StreamerBob');
  const res = await app.request('/v1/integrations/twitch/helix-proxy/users', {
    method: 'GET',
    headers: bearer(user.id, user.username),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: Array<Record<string, unknown>> };
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].id, '424242');
  assert.equal(body.data[0].login, 'streamerbob');
  assert.equal(body.data[0].display_name, 'StreamerBob');
});

test('helix-proxy GET /users falls back to the Blackout id when no Twitch is linked', async () => {
  const user = seedUser(`solo-${randomUUID().slice(0, 6)}`);
  const res = await app.request('/v1/integrations/twitch/helix-proxy/users', {
    method: 'GET',
    headers: bearer(user.id, user.username),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: Array<Record<string, unknown>> };
  assert.equal(body.data[0].id, user.id);
  assert.equal(body.data[0].login, user.username.toLowerCase());
});

test('helix-proxy GET /streams returns only live streams in Helix shape', async () => {
  const user = seedUser(`streamer-${randomUUID().slice(0, 6)}`);
  linkTwitch(user.id, '777', 'LiveOne');
  db.upsertStream({
    id: randomUUID(),
    creatorId: user.id,
    state: 'live',
    title: 'Live now',
    category: 'Just Chatting',
    tags: ['cozy'],
    visibility: 'public',
    allowedSubscriberIds: [],
    latencyProfile: 'normal',
  });
  db.upsertStream({
    id: randomUUID(),
    creatorId: user.id,
    state: 'offline',
    title: 'Past stream',
    tags: [],
    visibility: 'public',
    allowedSubscriberIds: [],
    latencyProfile: 'normal',
  });

  const res = await app.request('/v1/integrations/twitch/helix-proxy/streams', {
    method: 'GET',
    headers: bearer(user.id, user.username),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: Array<Record<string, unknown>> };
  assert.equal(body.data.length, 1, 'only the live stream is returned');
  assert.equal(body.data[0].title, 'Live now');
  assert.equal(body.data[0].type, 'live');
  assert.equal(body.data[0].game_name, 'Just Chatting');
  assert.equal(body.data[0].user_id, '777');
  assert.deepEqual(body.data[0].tags, ['cozy']);
});

test('helix-proxy GET /subscriptions maps active creator-subs to Helix subscriptions', async () => {
  const creator = seedUser(`broadcaster-${randomUUID().slice(0, 6)}`);
  const fan = seedUser(`fan-${randomUUID().slice(0, 6)}`);
  linkTwitch(creator.id, '9001', 'BroadcasterX');

  const tierId = randomUUID();
  db.insertCreatorSubscriptionTier({
    id: tierId,
    creatorUserId: creator.id,
    name: 'Gold',
    description: null,
    priceCents: 999,
    currency: 'USD',
    providerId: 'freeblackmarket',
    fbmListingId: null,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  db.insertCreatorSubscription({
    id: randomUUID(),
    subscriberUserId: fan.id,
    creatorUserId: creator.id,
    tierId,
    providerId: 'freeblackmarket',
    fbmSubscriptionId: null,
    status: 'active',
    startedAt: new Date().toISOString(),
    currentPeriodEndsAt: null,
    canceledAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  // A canceled sub that must NOT appear.
  db.insertCreatorSubscription({
    id: randomUUID(),
    subscriberUserId: seedUser(`ex-fan-${randomUUID().slice(0, 6)}`).id,
    creatorUserId: creator.id,
    tierId,
    providerId: 'freeblackmarket',
    fbmSubscriptionId: null,
    status: 'canceled',
    startedAt: new Date().toISOString(),
    currentPeriodEndsAt: null,
    canceledAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const res = await app.request('/v1/integrations/twitch/helix-proxy/subscriptions', {
    method: 'GET',
    headers: bearer(creator.id, creator.username),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: Array<Record<string, unknown>>; total: number };
  assert.equal(body.total, 1, 'only the active sub is returned');
  assert.equal(body.data[0].broadcaster_id, '9001');
  assert.equal(body.data[0].tier, '2000', '999c maps to the 2000 sub-plan code');
  assert.equal(body.data[0].plan_name, 'Gold');
  assert.equal(body.data[0].user_id, fan.id);
});

test('helix-proxy denies writes with 403', async () => {
  const user = seedUser(`writer-${randomUUID().slice(0, 6)}`);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const res = await app.request('/v1/integrations/twitch/helix-proxy/users', {
      method,
      headers: bearer(user.id, user.username),
    });
    assert.equal(res.status, 403, `${method} should be denied`);
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, 'helix_write_denied');
  }
});
