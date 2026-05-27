import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.JWT_SECRET_PRIMARY = generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api';
process.env.JWT_AUDIENCE = 'blackout-clients';
process.env.NODE_ENV = 'test';
process.env.BLACKOUT_DB_MODE = 'memory';

const loadModules = async () => {
  const service = await import('../src/services/discordCompatWebhooks');
  const store = await import('../src/db/store');
  store.db.discordCompatWebhooks.clear();
  return { service, db: store.db };
};

const seedUser = async (db: Awaited<ReturnType<typeof loadModules>>['db']) => {
  const auth = await import('../src/services/auth');
  const id = randomUUID();
  db.createUser({
    id,
    username: `dc-${id.slice(0, 4)}`,
    email: `dc-${id.slice(0, 4)}@example.com`,
    passwordHash: auth.hashPassword('Original-Pass-1234!'),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  return db.getUserById(id)!;
};

const buildFakeMatrix = () => {
  const calls: Array<{ roomId: string; content: Record<string, unknown> }> = [];
  const matrixClient = {
    sendEvent: async (roomId: string, content: Record<string, unknown>) => {
      calls.push({ roomId, content });
      return { ok: true, status: 200 };
    },
  };
  return { matrixClient, calls };
};

test('createWebhook: validates inputs (matrix room shape, name, avatar URL)', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);

  const bad: Array<{ patch: Record<string, unknown>; reason: string }> = [
    { patch: { matrixRoomId: 'not-a-room' }, reason: 'matrixRoomId must look like' },
    { patch: { matrixRoomId: '!ok:srv', name: '' }, reason: 'name is required' },
    { patch: { matrixRoomId: '!ok:srv', name: 'A'.repeat(81) }, reason: 'name must be ≤' },
    { patch: { matrixRoomId: '!ok:srv', name: 'GitHub', avatarUrl: 'ftp://x' }, reason: 'avatarUrl must be an http' },
  ];
  for (const { patch, reason } of bad) {
    const out = service.createWebhook({
      blackoutUserId: user.id,
      matrixRoomId: '!ok:srv',
      name: 'GitHub',
      ...patch,
    } as Parameters<typeof service.createWebhook>[0]);
    assert.equal(out.kind, 'invalid_input');
    if (out.kind === 'invalid_input') {
      assert.match(out.reason, new RegExp(reason));
    }
  }
});

test('createWebhook: returns plaintext token only once; persists sha256 hash only', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);
  const out = service.createWebhook({
    blackoutUserId: user.id,
    matrixRoomId: '!den:srv',
    name: 'GitHub',
  });
  assert.equal(out.kind, 'ok');
  if (out.kind !== 'ok') return;
  assert.ok(out.token.length >= 32, 'token should be high-entropy');
  const stored = db.getDiscordCompatWebhook(out.record.id);
  assert.ok(stored);
  assert.equal(stored!.tokenHash.length, 64); // sha256 hex
  assert.notEqual(stored!.tokenHash, out.token);
  // tokenHash should match sha256(token).
  assert.equal(stored!.tokenHash, service.__test__.sha256Hex(out.token));
});

test('deliverWebhookPayload: 404 on unknown id; 404 on bad token; 410 if inactive; 400 on empty', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);
  const created = service.createWebhook({
    blackoutUserId: user.id,
    matrixRoomId: '!den:srv',
    name: 'GitHub',
  });
  if (created.kind !== 'ok') return assert.fail();
  const fake = buildFakeMatrix();

  // unknown id
  const r1 = await service.deliverWebhookPayload(randomUUID(), 'whatever', { content: 'x' }, { matrixClient: fake.matrixClient });
  assert.equal(r1.kind, 'invalid_token');

  // wrong token for known id
  const r2 = await service.deliverWebhookPayload(created.record.id, 'badbadbad', { content: 'x' }, { matrixClient: fake.matrixClient });
  assert.equal(r2.kind, 'invalid_token');

  // empty payload (no content + no embeds)
  const r3 = await service.deliverWebhookPayload(created.record.id, created.token, {}, { matrixClient: fake.matrixClient });
  assert.equal(r3.kind, 'empty_payload');

  // inactive
  db.updateDiscordCompatWebhook(created.record.id, { isActive: false });
  const r4 = await service.deliverWebhookPayload(created.record.id, created.token, { content: 'x' }, { matrixClient: fake.matrixClient });
  assert.equal(r4.kind, 'inactive');

  // No matrix calls were made for any of the rejected paths.
  assert.equal(fake.calls.length, 0);
});

test('deliverWebhookPayload: forwards content to matrix with origin extension fields', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);
  const created = service.createWebhook({
    blackoutUserId: user.id,
    matrixRoomId: '!den:srv',
    name: 'GitHub',
    avatarUrl: 'https://example.com/icon.png',
  });
  if (created.kind !== 'ok') return assert.fail();
  const fake = buildFakeMatrix();

  const out = await service.deliverWebhookPayload(
    created.record.id,
    created.token,
    {
      content: 'Pushed 3 commits to main',
      username: 'gh-actions',
      embeds: [
        {
          title: 'feat: add Discord webhook compat',
          description: 'shipped by alice',
          fields: [{ name: 'sha', value: 'abc123' }],
        },
      ],
    },
    { matrixClient: fake.matrixClient },
  );
  assert.equal(out.kind, 'ok');
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].roomId, '!den:srv');
  const content = fake.calls[0].content;
  assert.equal(content.msgtype, 'm.text');
  assert.match(String(content.body), /Pushed 3 commits/);
  assert.match(String(content.body), /feat: add Discord webhook compat/);
  assert.match(String(content.body), /sha: abc123/);
  assert.equal(content['m.blackout.origin'], 'discord_compat_webhook');
  // The per-call username from the payload wins over the webhook's stored name.
  assert.equal(content['m.blackout.origin_sender_username'], 'gh-actions');
  // Avatar URL falls back to the stored webhook avatar when payload omits it.
  assert.equal(content['m.blackout.origin_sender_avatar_url'], 'https://example.com/icon.png');

  // delivery_count + last_used_at updated.
  const updated = db.getDiscordCompatWebhook(created.record.id);
  assert.equal(updated!.deliveryCount, 1);
  assert.ok(updated!.lastUsedAt);
});

test('deliverWebhookPayload: renders embed timestamp and color into the matrix body', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);
  const created = service.createWebhook({
    blackoutUserId: user.id,
    matrixRoomId: '!den:srv',
    name: 'Grafana',
  });
  if (created.kind !== 'ok') return assert.fail();
  const fake = buildFakeMatrix();

  const out = await service.deliverWebhookPayload(
    created.record.id,
    created.token,
    {
      embeds: [
        {
          title: 'Alert firing',
          footer: { text: 'Grafana' },
          timestamp: '2026-05-27T12:00:00.000Z',
          color: 0xff0000,
        },
      ],
    },
    { matrixClient: fake.matrixClient },
  );
  assert.equal(out.kind, 'ok');
  assert.equal(fake.calls.length, 1);
  const body = String(fake.calls[0].content.body);
  assert.match(body, /Alert firing/);
  // Footer, timestamp and color collapse onto one metadata row.
  assert.match(body, /Grafana/);
  assert.match(body, /27 May 2026/);
  assert.match(body, /#ff0000/);
});

test('deleteWebhook: forbidden across users; not_found for unknown; ok then list empties', async () => {
  const { service, db } = await loadModules();
  const alice = await seedUser(db);
  const bob = await seedUser(db);
  const a = service.createWebhook({
    blackoutUserId: alice.id,
    matrixRoomId: '!a:srv',
    name: 'Sentry',
  });
  if (a.kind !== 'ok') return assert.fail();

  assert.equal(service.deleteWebhook(bob.id, a.record.id).kind, 'forbidden');
  assert.equal(service.deleteWebhook(alice.id, randomUUID()).kind, 'not_found');
  assert.equal(service.deleteWebhook(alice.id, a.record.id).kind, 'ok');
  assert.equal(service.listWebhooksForUser(alice.id).length, 0);
});
