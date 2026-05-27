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

const modHeaders = (userId: string, username: string) => ({
  authorization: `Bearer ${signJwt(userId, username, 600)}`,
  'content-type': 'application/json',
  'x-blackout-capabilities': 'moderation.*',
});

test('POST /v1/moderation/actions persists optional metadata and returns it', async () => {
  const mod = seedUser(`mod-${randomUUID().slice(0, 6)}`);
  const communityId = randomUUID();

  const res = await app.request('/v1/moderation/actions', {
    method: 'POST',
    headers: modHeaders(mod.id, mod.username),
    body: JSON.stringify({
      communityId,
      actorId: mod.id,
      targetId: randomUUID(),
      action: 'timeout',
      reason: 'spam',
      metadata: { durationMs: 300000, source: 'composer' },
    }),
  });

  assert.equal(res.status, 201);
  const created = (await res.json()) as { id: string; metadata?: Record<string, unknown> };
  assert.deepEqual(created.metadata, { durationMs: 300000, source: 'composer' });

  const list = await app.request(`/v1/moderation/actions?communityId=${communityId}`, {
    method: 'GET',
    headers: modHeaders(mod.id, mod.username),
  });
  assert.equal(list.status, 200);
  const actions = (await list.json()) as Array<{ id: string; metadata?: Record<string, unknown> }>;
  const stored = actions.find((a) => a.id === created.id);
  assert.ok(stored);
  assert.deepEqual(stored!.metadata, { durationMs: 300000, source: 'composer' });
});

test('POST /v1/moderation/actions accepts the new timeout/slowmode action types', async () => {
  const mod = seedUser(`mod-${randomUUID().slice(0, 6)}`);
  const res = await app.request('/v1/moderation/actions', {
    method: 'POST',
    headers: modHeaders(mod.id, mod.username),
    body: JSON.stringify({
      communityId: randomUUID(),
      actorId: mod.id,
      targetId: randomUUID(),
      action: 'slowmode',
      reason: 'raid mitigation',
    }),
  });
  assert.equal(res.status, 201);
});
