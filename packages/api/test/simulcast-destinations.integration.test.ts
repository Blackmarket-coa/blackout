import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

const KEY_V1 = randomBytes(32).toString('base64');

process.env.JWT_SECRET_PRIMARY = generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api';
process.env.JWT_AUDIENCE = 'blackout-clients';
process.env.NODE_ENV = 'test';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS = `v1:${KEY_V1}`;

const loadModules = async () => {
  const service = await import('../src/services/simulcastDestinations');
  const secretBox = await import('../src/services/secretBox');
  const store = await import('../src/db/store');
  secretBox.clearSecretBoxConfigCache();
  store.db.simulcastDestinations.clear();
  return { service, db: store.db };
};

const seedUser = async (db: Awaited<ReturnType<typeof loadModules>>['db']) => {
  const auth = await import('../src/services/auth');
  const id = randomUUID();
  db.createUser({
    id,
    username: `s-${id.slice(0, 4)}`,
    email: `s-${id.slice(0, 4)}@example.com`,
    passwordHash: auth.hashPassword('Original-Pass-1234!'),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  return db.getUserById(id)!;
};

test('createDestination: encrypts the stream key; summary projection NEVER reveals it', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);
  const out = service.createDestination({
    blackoutUserId: user.id,
    provider: 'twitch',
    label: 'Main Twitch',
    ingestUrl: 'rtmp://live.twitch.tv/app',
    streamKey: 'live_111_secrettttt',
  });
  assert.equal(out.kind, 'ok');
  if (out.kind !== 'ok') return;

  // Persisted ciphertext is NOT the plaintext.
  assert.notEqual(out.record.streamKeyCiphertext, 'live_111_secrettttt');
  assert.match(out.record.streamKeyCiphertext, /^v1:/);

  // Summary projection has no `streamKey*` field at all.
  const summary = service.toSummary(out.record);
  for (const key of Object.keys(summary)) {
    assert.equal(/streamkey/i.test(key), false, `summary leaked field "${key}"`);
  }

  // Defense-in-depth: the plaintext key MUST NOT appear anywhere in the
  // serialized summary.
  assert.equal(JSON.stringify(summary).includes('live_111_secrettttt'), false);
});

test('decryptDestination: round-trips the plaintext for server-internal callers (fan-out worker)', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);
  const out = service.createDestination({
    blackoutUserId: user.id,
    provider: 'youtube',
    ingestUrl: 'rtmp://a.rtmp.youtube.com/live2',
    streamKey: 'yt-key-zzzzz',
  });
  if (out.kind !== 'ok') return assert.fail();
  const decrypted = service.decryptDestination(out.record.id);
  assert.ok(decrypted);
  assert.equal(decrypted!.streamKey, 'yt-key-zzzzz');
});

test('createDestination: rejects non-RTMP URLs / blank keys / weird providers', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);
  // Non-RTMP scheme.
  let out = service.createDestination({
    blackoutUserId: user.id,
    provider: 'twitch',
    ingestUrl: 'https://not-rtmp.example/',
    streamKey: 'k',
  });
  assert.equal(out.kind, 'invalid_input');
  // Blank key.
  out = service.createDestination({
    blackoutUserId: user.id,
    provider: 'twitch',
    ingestUrl: 'rtmp://x/',
    streamKey: '',
  });
  assert.equal(out.kind, 'invalid_input');
  // Provider with caps / spaces.
  out = service.createDestination({
    blackoutUserId: user.id,
    provider: 'Twitch With Spaces',
    ingestUrl: 'rtmp://x/',
    streamKey: 'k',
  });
  assert.equal(out.kind, 'invalid_input');
});

test('listForUser: returns summaries scoped to the user; cross-user isolation', async () => {
  const { service, db } = await loadModules();
  const alice = await seedUser(db);
  const bob = await seedUser(db);
  service.createDestination({
    blackoutUserId: alice.id,
    provider: 'twitch',
    ingestUrl: 'rtmp://t/',
    streamKey: 'a',
  });
  service.createDestination({
    blackoutUserId: bob.id,
    provider: 'youtube',
    ingestUrl: 'rtmp://y/',
    streamKey: 'b',
  });
  assert.equal(service.listForUser(alice.id).length, 1);
  assert.equal(service.listForUser(alice.id)[0].provider, 'twitch');
  assert.equal(service.listForUser(bob.id).length, 1);
  assert.equal(service.listForUser(bob.id)[0].provider, 'youtube');
});

test('setEnabled: forbidden across users; toggles the persisted flag', async () => {
  const { service, db } = await loadModules();
  const alice = await seedUser(db);
  const bob = await seedUser(db);
  const created = service.createDestination({
    blackoutUserId: alice.id,
    provider: 'twitch',
    ingestUrl: 'rtmp://t/',
    streamKey: 'a',
  });
  if (created.kind !== 'ok') return assert.fail();

  const forbidden = service.setEnabled(bob.id, created.record.id, false);
  assert.equal(forbidden.kind, 'forbidden');

  const ok = service.setEnabled(alice.id, created.record.id, false);
  assert.equal(ok.kind, 'ok');
  if (ok.kind === 'ok') assert.equal(ok.record.isEnabled, false);

  const reenabled = service.setEnabled(alice.id, created.record.id, true);
  if (reenabled.kind === 'ok') assert.equal(reenabled.record.isEnabled, true);
});

test('deleteDestination: forbidden across users; ok wipes the row', async () => {
  const { service, db } = await loadModules();
  const alice = await seedUser(db);
  const bob = await seedUser(db);
  const created = service.createDestination({
    blackoutUserId: alice.id,
    provider: 'twitch',
    ingestUrl: 'rtmp://t/',
    streamKey: 'a',
  });
  if (created.kind !== 'ok') return assert.fail();
  assert.equal(service.deleteDestination(bob.id, created.record.id).kind, 'forbidden');
  assert.equal(service.deleteDestination(alice.id, created.record.id).kind, 'ok');
  assert.equal(service.deleteDestination(alice.id, created.record.id).kind, 'not_found');
});

test('AAD binding: tampering with the destination id breaks decrypt', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);
  const a = service.createDestination({
    blackoutUserId: user.id,
    provider: 'twitch',
    ingestUrl: 'rtmp://t/',
    streamKey: 'plaintext-A',
  });
  const b = service.createDestination({
    blackoutUserId: user.id,
    provider: 'youtube',
    ingestUrl: 'rtmp://y/',
    streamKey: 'plaintext-B',
  });
  if (a.kind !== 'ok' || b.kind !== 'ok') return assert.fail();
  // Swap the ciphertexts in the DB; decrypt MUST fail because the AAD
  // encodes the destination id and the (forged) row's id no longer
  // matches the AAD the ciphertext was sealed with.
  db.updateSimulcastDestination(a.record.id, {
    streamKeyCiphertext: b.record.streamKeyCiphertext,
  });
  assert.throws(() => service.decryptDestination(a.record.id));
});

test('listEnabledSimulcastDestinations: only enabled rows; used by the fan-out worker', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);
  service.createDestination({
    blackoutUserId: user.id,
    provider: 'twitch',
    ingestUrl: 'rtmp://t/',
    streamKey: 'a',
  });
  const yt = service.createDestination({
    blackoutUserId: user.id,
    provider: 'youtube',
    ingestUrl: 'rtmp://y/',
    streamKey: 'b',
  });
  if (yt.kind === 'ok') service.setEnabled(user.id, yt.record.id, false);

  const enabled = db.listEnabledSimulcastDestinations();
  assert.equal(enabled.length, 1);
  assert.equal(enabled[0].provider, 'twitch');
});
