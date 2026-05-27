import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '10000';
process.env.BLACKOUT_DB_MODE = 'memory';

const { default: app } = await import('../src/index');
const { signJwt, hashPassword } = await import('../src/services/auth');
const { db } = await import('../src/db/store');

const seedUser = () => {
  const id = randomUUID();
  const username = `cp-${id.slice(0, 6)}`;
  db.createUser({
    id,
    username,
    email: `${username}@example.com`,
    passwordHash: hashPassword('Original-Pass-1234!'),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  return { id, username };
};

const headers = (id: string, username: string) => ({
  authorization: `Bearer ${signJwt(id, username, 600)}`,
  'content-type': 'application/json',
});

test('channel points: grant → balance → create reward → redeem → balance debited', async () => {
  const creator = seedUser();
  const viewer = seedUser();
  const creatorH = headers(creator.id, creator.username);
  const viewerH = headers(viewer.id, viewer.username);

  // Creator grants the viewer 500 points.
  const grant = await app.request(`/v1/channel-points/channels/${creator.id}/grant`, {
    method: 'POST',
    headers: creatorH,
    body: JSON.stringify({ userId: viewer.id, points: 500 }),
  });
  assert.equal(grant.status, 201);
  assert.equal(((await grant.json()) as { balance: number }).balance, 500);

  // Viewer sees their balance.
  const bal = await app.request(`/v1/channel-points/channels/${creator.id}/balance`, {
    headers: viewerH,
  });
  assert.equal(((await bal.json()) as { balance: number }).balance, 500);

  // Creator defines a reward costing 200.
  const rewardRes = await app.request('/v1/channel-points/rewards', {
    method: 'POST',
    headers: creatorH,
    body: JSON.stringify({ title: 'Play my song', cost: 200, prompt: 'Drop a link' }),
  });
  assert.equal(rewardRes.status, 201);
  const reward = (await rewardRes.json()) as { id: string };

  // Viewer redeems it.
  const redeem = await app.request(`/v1/channel-points/channels/${creator.id}/redeem`, {
    method: 'POST',
    headers: viewerH,
    body: JSON.stringify({ rewardId: reward.id, userInput: 'https://song.example/abc' }),
  });
  assert.equal(redeem.status, 201);
  assert.equal(((await redeem.json()) as { balance: number }).balance, 300);

  // The creator's redemption feed shows it.
  const feed = await app.request(`/v1/channel-points/channels/${creator.id}/redemptions`, {
    headers: creatorH,
  });
  const items = ((await feed.json()) as {
    items: { rewardId: string; cost: number; userInput?: string; userId: string }[];
  }).items;
  assert.equal(items.length, 1);
  assert.equal(items[0].rewardId, reward.id);
  assert.equal(items[0].cost, 200);
  assert.equal(items[0].userInput, 'https://song.example/abc');
  assert.equal(items[0].userId, viewer.id);
});

test('channel points: redeem rejects when the balance is insufficient', async () => {
  const creator = seedUser();
  const viewer = seedUser();
  const rewardRes = await app.request('/v1/channel-points/rewards', {
    method: 'POST',
    headers: headers(creator.id, creator.username),
    body: JSON.stringify({ title: 'Expensive', cost: 9999 }),
  });
  const reward = (await rewardRes.json()) as { id: string };

  const redeem = await app.request(`/v1/channel-points/channels/${creator.id}/redeem`, {
    method: 'POST',
    headers: headers(viewer.id, viewer.username),
    body: JSON.stringify({ rewardId: reward.id }),
  });
  assert.equal(redeem.status, 409);
  const body = (await redeem.json()) as { code: string; balance: number; cost: number };
  assert.equal(body.code, 'insufficient_points');
  assert.equal(body.balance, 0);
  assert.equal(body.cost, 9999);
});

test('channel points: redeeming an inactive reward is rejected', async () => {
  const creator = seedUser();
  const viewer = seedUser();
  const creatorH = headers(creator.id, creator.username);
  // Fund the viewer generously so only the inactive state can block it.
  await app.request(`/v1/channel-points/channels/${creator.id}/grant`, {
    method: 'POST',
    headers: creatorH,
    body: JSON.stringify({ userId: viewer.id, points: 1000 }),
  });
  const rewardRes = await app.request('/v1/channel-points/rewards', {
    method: 'POST',
    headers: creatorH,
    body: JSON.stringify({ title: 'Retired', cost: 100 }),
  });
  const reward = (await rewardRes.json()) as { id: string };
  // Deactivate it.
  await app.request(`/v1/channel-points/rewards/${reward.id}`, {
    method: 'PATCH',
    headers: creatorH,
    body: JSON.stringify({ isActive: false }),
  });

  const redeem = await app.request(`/v1/channel-points/channels/${creator.id}/redeem`, {
    method: 'POST',
    headers: headers(viewer.id, viewer.username),
    body: JSON.stringify({ rewardId: reward.id }),
  });
  assert.equal(redeem.status, 409);
  assert.equal(((await redeem.json()) as { code: string }).code, 'reward_inactive');
});

test('channel points: only the channel owner can grant points', async () => {
  const creator = seedUser();
  const stranger = seedUser();
  const res = await app.request(`/v1/channel-points/channels/${creator.id}/grant`, {
    method: 'POST',
    headers: headers(stranger.id, stranger.username),
    body: JSON.stringify({ userId: stranger.id, points: 100 }),
  });
  assert.equal(res.status, 403);
});

test('channel points: only the owner can edit a reward', async () => {
  const owner = seedUser();
  const other = seedUser();
  const rewardRes = await app.request('/v1/channel-points/rewards', {
    method: 'POST',
    headers: headers(owner.id, owner.username),
    body: JSON.stringify({ title: 'Owned', cost: 50 }),
  });
  const reward = (await rewardRes.json()) as { id: string };
  const patch = await app.request(`/v1/channel-points/rewards/${reward.id}`, {
    method: 'PATCH',
    headers: headers(other.id, other.username),
    body: JSON.stringify({ cost: 1 }),
  });
  assert.equal(patch.status, 403);
});
