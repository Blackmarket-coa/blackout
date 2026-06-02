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

const channelHeaders = (userId: string, username: string) => ({
  authorization: `Bearer ${signJwt(userId, username, 600)}`,
  'content-type': 'application/json',
  'x-blackout-capabilities': 'channels.*',
});

test('POST /v1/channels creates a channel and GET lists it for the community', async () => {
  const user = seedUser(`chan-${randomUUID().slice(0, 6)}`);
  const communityId = randomUUID();

  const res = await app.request('/v1/channels', {
    method: 'POST',
    headers: channelHeaders(user.id, user.username),
    body: JSON.stringify({ communityId, name: 'general', description: 'town square' }),
  });

  assert.equal(res.status, 201);
  const created = (await res.json()) as {
    id: string;
    communityId: string;
    name: string;
    channelType: string;
    isPrivate: boolean;
  };
  assert.equal(created.communityId, communityId);
  assert.equal(created.name, 'general');
  // Optional fields default to a public text channel.
  assert.equal(created.channelType, 'text');
  assert.equal(created.isPrivate, false);

  const list = await app.request(`/v1/channels?communityId=${communityId}`, {
    method: 'GET',
    headers: channelHeaders(user.id, user.username),
  });
  assert.equal(list.status, 200);
  const channels = (await list.json()) as Array<{ id: string }>;
  assert.ok(channels.some((channel) => channel.id === created.id));
});

test('GET /v1/channels filters by communityId', async () => {
  const user = seedUser(`chan-${randomUUID().slice(0, 6)}`);
  const communityA = randomUUID();
  const communityB = randomUUID();

  for (const [communityId, name] of [
    [communityA, 'a-general'],
    [communityB, 'b-general'],
  ] as const) {
    const res = await app.request('/v1/channels', {
      method: 'POST',
      headers: channelHeaders(user.id, user.username),
      body: JSON.stringify({ communityId, name }),
    });
    assert.equal(res.status, 201);
  }

  const list = await app.request(`/v1/channels?communityId=${communityA}`, {
    method: 'GET',
    headers: channelHeaders(user.id, user.username),
  });
  const channels = (await list.json()) as Array<{ communityId: string }>;
  assert.ok(channels.length > 0);
  assert.ok(channels.every((channel) => channel.communityId === communityA));
});

test('channels endpoints require the channels capability', async () => {
  const user = seedUser(`chan-${randomUUID().slice(0, 6)}`);
  const res = await app.request('/v1/channels', {
    method: 'GET',
    headers: {
      authorization: `Bearer ${signJwt(user.id, user.username, 600)}`,
      'content-type': 'application/json',
    },
  });
  assert.equal(res.status, 403);
});
