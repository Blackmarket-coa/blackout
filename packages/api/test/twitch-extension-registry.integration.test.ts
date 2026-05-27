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
  const username = `ext-${id.slice(0, 6)}`;
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

const writeHeaders = (id: string, username: string) => ({
  authorization: `Bearer ${signJwt(id, username, 600)}`,
  'x-blackout-capabilities': 'streaming.read streaming.write',
  'content-type': 'application/json',
});

test('extension registry: create → list → appears on the creator stream → patch → delete', async () => {
  const creator = seedUser();
  const headers = writeHeaders(creator.id, creator.username);

  // Create a panel.
  const created = await app.request('/v1/streaming/extensions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      label: 'Sound Alerts',
      bundleUrl: 'https://cdn.example.com/ext/sound-alerts.js',
      capabilities: ['twitch.ext.identityShare'],
    }),
  });
  assert.equal(created.status, 201);
  const panel = (await created.json()) as { id: string; isActive: boolean };
  assert.equal(panel.isActive, true);

  // It lists for the creator.
  const listed = await app.request('/v1/streaming/extensions', { headers });
  const items = ((await listed.json()) as { items: { id: string }[] }).items;
  assert.ok(items.some((p) => p.id === panel.id));

  // It surfaces on the creator's stream response (public read).
  db.upsertStream({
    id: 'ext-stream',
    creatorId: creator.id,
    state: 'live',
    title: 'Live with extensions',
    tags: [],
    visibility: 'public',
    allowedSubscriberIds: [],
    latencyProfile: 'normal',
  });
  const streamRes = await app.request('/v1/streaming/streams/ext-stream', {
    headers: { authorization: headers.authorization, 'x-blackout-capabilities': 'streaming.read' },
  });
  const stream = (await streamRes.json()) as {
    extensions: { id: string; label: string; bundleUrl: string; capabilities: string[] }[];
  };
  assert.equal(stream.extensions.length, 1);
  assert.equal(stream.extensions[0].label, 'Sound Alerts');
  assert.equal(stream.extensions[0].bundleUrl, 'https://cdn.example.com/ext/sound-alerts.js');

  // Deactivating it removes it from the stream response.
  const patched = await app.request(`/v1/streaming/extensions/${panel.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ isActive: false }),
  });
  assert.equal(patched.status, 200);
  const afterPatch = await app.request('/v1/streaming/streams/ext-stream', {
    headers: { authorization: headers.authorization, 'x-blackout-capabilities': 'streaming.read' },
  });
  assert.equal(((await afterPatch.json()) as { extensions: unknown[] }).extensions.length, 0);

  // Delete.
  const deleted = await app.request(`/v1/streaming/extensions/${panel.id}`, {
    method: 'DELETE',
    headers,
  });
  assert.equal(deleted.status, 200);
  const afterDelete = await app.request('/v1/streaming/extensions', { headers });
  assert.equal(((await afterDelete.json()) as { items: unknown[] }).items.length, 0);
});

test('extension registry: rejects a non-https bundle URL', async () => {
  const creator = seedUser();
  const res = await app.request('/v1/streaming/extensions', {
    method: 'POST',
    headers: writeHeaders(creator.id, creator.username),
    body: JSON.stringify({ label: 'Bad', bundleUrl: 'http://insecure.example.com/x.js' }),
  });
  assert.equal(res.status, 400);
});

test('extension registry: rejects an unknown capability', async () => {
  const creator = seedUser();
  const res = await app.request('/v1/streaming/extensions', {
    method: 'POST',
    headers: writeHeaders(creator.id, creator.username),
    body: JSON.stringify({
      label: 'Sneaky',
      bundleUrl: 'https://cdn.example.com/x.js',
      capabilities: ['twitch.ext.identityShare', 'storage.write'],
    }),
  });
  assert.equal(res.status, 400);
});

test('extension registry: a creator cannot modify another creator panel', async () => {
  const owner = seedUser();
  const other = seedUser();
  const created = await app.request('/v1/streaming/extensions', {
    method: 'POST',
    headers: writeHeaders(owner.id, owner.username),
    body: JSON.stringify({ label: 'Owned', bundleUrl: 'https://cdn.example.com/owned.js' }),
  });
  const panel = (await created.json()) as { id: string };

  const patch = await app.request(`/v1/streaming/extensions/${panel.id}`, {
    method: 'PATCH',
    headers: writeHeaders(other.id, other.username),
    body: JSON.stringify({ label: 'Hijacked' }),
  });
  assert.equal(patch.status, 403);
});
