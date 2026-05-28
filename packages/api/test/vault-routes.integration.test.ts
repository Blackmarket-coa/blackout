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
  return id;
};

const bearer = (userId: string, username: string) => ({
  authorization: `Bearer ${signJwt(userId, username, 600)}`,
  'content-type': 'application/json',
});

const blob = () => randomBytes(24).toString('base64');

test('vault: create, list, update, delete is owner-scoped end to end', async () => {
  const userId = seedUser(`vault_${randomUUID().slice(0, 8)}`);
  const headers = bearer(userId, 'vaultuser');

  // Create
  const createRes = await app.fetch(
    new Request('http://local/v1/vault/items', {
      method: 'POST',
      headers,
      body: JSON.stringify({ label: 'API key', ciphertext: blob(), iv: blob() }),
    }),
  );
  assert.equal(createRes.status, 201);
  const { item } = (await createRes.json()) as { item: { id: string; algo: string } };
  assert.ok(item.id);
  assert.equal(item.algo, 'AES-GCM');

  // List
  const listRes = await app.fetch(
    new Request('http://local/v1/vault/items', { headers }),
  );
  assert.equal(listRes.status, 200);
  const { items } = (await listRes.json()) as { items: Array<{ id: string }> };
  assert.equal(items.length, 1);

  // Update
  const updateRes = await app.fetch(
    new Request(`http://local/v1/vault/items/${item.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ label: 'Renamed key' }),
    }),
  );
  assert.equal(updateRes.status, 200);
  const updated = (await updateRes.json()) as { item: { label: string } };
  assert.equal(updated.item.label, 'Renamed key');

  // Delete
  const deleteRes = await app.fetch(
    new Request(`http://local/v1/vault/items/${item.id}`, { method: 'DELETE', headers }),
  );
  assert.equal(deleteRes.status, 200);
  const afterRes = await app.fetch(new Request('http://local/v1/vault/items', { headers }));
  const after = (await afterRes.json()) as { items: unknown[] };
  assert.equal(after.items.length, 0);
});

test('vault: another user cannot see or mutate items they do not own', async () => {
  const ownerId = seedUser(`owner_${randomUUID().slice(0, 8)}`);
  const otherId = seedUser(`other_${randomUUID().slice(0, 8)}`);

  const createRes = await app.fetch(
    new Request('http://local/v1/vault/items', {
      method: 'POST',
      headers: bearer(ownerId, 'owner'),
      body: JSON.stringify({ label: 'secret', ciphertext: blob(), iv: blob() }),
    }),
  );
  const { item } = (await createRes.json()) as { item: { id: string } };

  // Other user's list is empty.
  const otherList = await app.fetch(
    new Request('http://local/v1/vault/items', { headers: bearer(otherId, 'other') }),
  );
  const { items } = (await otherList.json()) as { items: unknown[] };
  assert.equal(items.length, 0);

  // Other user gets 404 on update/delete (not 403, to avoid id enumeration).
  const updateRes = await app.fetch(
    new Request(`http://local/v1/vault/items/${item.id}`, {
      method: 'PUT',
      headers: bearer(otherId, 'other'),
      body: JSON.stringify({ label: 'hijack' }),
    }),
  );
  assert.equal(updateRes.status, 404);
});

test('vault: unauthenticated requests are rejected', async () => {
  const res = await app.fetch(
    new Request('http://local/v1/vault/items', {
      headers: { 'content-type': 'application/json' },
    }),
  );
  assert.equal(res.status, 401);
});
