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
  const service = await import('../src/services/kickChatBridge');
  const chatIngress = await import('../src/integrations/kick/chatIngress');
  const secretBox = await import('../src/services/secretBox');
  const store = await import('../src/db/store');
  secretBox.clearSecretBoxConfigCache();
  chatIngress.stopAllKickChatIngress();
  service.__test__.liveSessions.clear();
  store.db.kickChatBridges.clear();
  return { service, chatIngress, db: store.db };
};

const seedUser = async (db: Awaited<ReturnType<typeof loadModules>>['db']) => {
  const auth = await import('../src/services/auth');
  const id = randomUUID();
  db.createUser({
    id,
    username: `k-${id.slice(0, 4)}`,
    email: `k-${id.slice(0, 4)}@example.com`,
    passwordHash: auth.hashPassword('Original-Pass-1234!'),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  return db.getUserById(id)!;
};

const buildFakeMatrix = () => {
  const calls: Array<{ roomId: string; content: Record<string, unknown>; options?: unknown }> = [];
  const matrixClient = {
    sendEvent: async (
      roomId: string,
      content: Record<string, unknown>,
      options?: { eventType?: string; txnId?: string },
    ) => {
      calls.push({ roomId, content, options });
      return { ok: true, status: 200 };
    },
  };
  return { matrixClient, calls };
};

const buildFakeSocket = () => {
  type Listeners = {
    open: Array<() => void>;
    message: Array<(event: { data: string }) => void>;
    close: Array<(event: { code: number; reason: string }) => void>;
    error: Array<(event: unknown) => void>;
  };
  const listeners: Listeners = { open: [], message: [], close: [], error: [] };
  const sentLines: string[] = [];
  const factory = (() => ({
    send: (data: string) => sentLines.push(data),
    close: () => listeners.close.forEach((l) => l({ code: 1000, reason: 'shutdown' })),
    addEventListener: (type: keyof Listeners, listener: (e: never) => void) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (listeners[type] as Array<(e: any) => void>).push(listener);
    },
  })) as unknown as import('../src/integrations/kick/chatIngress').KickSocketFactory;
  return {
    factory,
    sentLines,
    emitMessage: (data: string) => listeners.message.forEach((l) => l({ data })),
  };
};

test('createBridge: validates chatroom id; rejects non-numeric / spaces', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);
  for (const bad of ['abc', '0123', '', 'has space', '12 34']) {
    const out = service.createBridge({
      blackoutUserId: user.id,
      kickChatroomId: bad,
      matrixRoomId: '!den:srv',
    });
    assert.equal(out.kind, 'invalid_input', `bad chatroomId=${JSON.stringify(bad)}`);
  }
});

test('createBridge: persists row + starts ingress; PRIVMSG forwards to Matrix', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);
  const fake = buildFakeSocket();
  const { matrixClient, calls } = buildFakeMatrix();

  const out = service.createBridge(
    {
      blackoutUserId: user.id,
      kickChatroomId: '42',
      matrixRoomId: '!den:srv',
    },
    { matrixClient, socketFactory: fake.factory },
  );
  assert.equal(out.kind, 'ok');
  if (out.kind !== 'ok') return;

  const row = db.findKickChatBridge(user.id, '42');
  assert.ok(row);
  assert.equal(row!.id, out.record.id);
  assert.equal(row!.isActive, true);

  // Drive the Pusher handshake → subscribe → chat-message flow.
  fake.emitMessage(
    JSON.stringify({
      event: 'pusher:connection_established',
      data: JSON.stringify({ socket_id: '1.1', activity_timeout: 120 }),
    }),
  );
  // Subscribe frame went out.
  assert.equal(fake.sentLines.length, 1);
  assert.match(fake.sentLines[0], /chatrooms\.42\.v2/);

  fake.emitMessage(
    JSON.stringify({
      event: 'App\\Events\\ChatMessageEvent',
      channel: 'chatrooms.42.v2',
      data: JSON.stringify({
        id: 'msg-1',
        chatroom_id: 42,
        content: 'hi kick',
        type: 'message',
        created_at: '2026-05-07T00:00:00Z',
        sender: { id: 7, username: 'fan' },
      }),
    }),
  );
  // Give the .then() in the onMessage forwarder a tick to flush.
  await new Promise((r) => setImmediate(r));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].roomId, '!den:srv');
  assert.equal(calls[0].content['m.blackout.origin'], 'kick');
  assert.equal(calls[0].content['m.blackout.origin_message_id'], 'msg-1');
  // Per-message txn id keeps retransmits from double-delivering.
  assert.equal((calls[0].options as { txnId?: string })?.txnId, 'kick-msg-1');
});

test('createBridge: re-posting (user, chatroom, room) is idempotent; different room → already_bridged', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);
  const fake = buildFakeSocket();
  const { matrixClient } = buildFakeMatrix();

  const a = service.createBridge(
    { blackoutUserId: user.id, kickChatroomId: '42', matrixRoomId: '!a:srv' },
    { matrixClient, socketFactory: fake.factory },
  );
  const b = service.createBridge(
    { blackoutUserId: user.id, kickChatroomId: '42', matrixRoomId: '!a:srv' },
    { matrixClient, socketFactory: fake.factory },
  );
  assert.equal(a.kind, 'ok');
  assert.equal(b.kind, 'ok');
  if (a.kind === 'ok' && b.kind === 'ok') assert.equal(a.record.id, b.record.id);
  assert.equal(db.listKickChatBridgesForUser(user.id).length, 1);

  const conflict = service.createBridge(
    { blackoutUserId: user.id, kickChatroomId: '42', matrixRoomId: '!b:srv' },
    { matrixClient, socketFactory: fake.factory },
  );
  assert.equal(conflict.kind, 'already_bridged');
});

test('deleteBridge: stops the ingress, removes the row, returns ok', async () => {
  const { service, chatIngress, db } = await loadModules();
  const user = await seedUser(db);
  const fake = buildFakeSocket();
  const { matrixClient } = buildFakeMatrix();

  const created = service.createBridge(
    { blackoutUserId: user.id, kickChatroomId: '42', matrixRoomId: '!a:srv' },
    { matrixClient, socketFactory: fake.factory },
  );
  if (created.kind !== 'ok') return assert.fail();
  assert.equal(chatIngress.__test__.sessions.size, 1);

  const out = service.deleteBridge(user.id, created.record.id);
  assert.equal(out.kind, 'ok');
  assert.equal(db.findKickChatBridge(user.id, '42'), undefined);
  assert.equal(chatIngress.__test__.sessions.size, 0);
  assert.equal(service.__test__.liveSessions.size, 0);
});

test('deleteBridge: forbidden across users; not_found for unknown id', async () => {
  const { service, db } = await loadModules();
  const alice = await seedUser(db);
  const bob = await seedUser(db);
  const fake = buildFakeSocket();
  const { matrixClient } = buildFakeMatrix();
  const created = service.createBridge(
    { blackoutUserId: alice.id, kickChatroomId: '42', matrixRoomId: '!a:srv' },
    { matrixClient, socketFactory: fake.factory },
  );
  if (created.kind !== 'ok') return assert.fail();
  assert.equal(service.deleteBridge(bob.id, created.record.id).kind, 'forbidden');
  assert.equal(service.deleteBridge(alice.id, randomUUID()).kind, 'not_found');
});

test('resumeAllBridges: re-establishes a session for every active bridge', async () => {
  const { service, chatIngress, db } = await loadModules();
  const alice = await seedUser(db);
  const bob = await seedUser(db);
  const fake = buildFakeSocket();
  const { matrixClient } = buildFakeMatrix();

  service.createBridge(
    { blackoutUserId: alice.id, kickChatroomId: '42', matrixRoomId: '!a:srv' },
    { matrixClient, socketFactory: fake.factory },
  );
  service.createBridge(
    { blackoutUserId: bob.id, kickChatroomId: '99', matrixRoomId: '!b:srv' },
    { matrixClient, socketFactory: fake.factory },
  );

  // Simulate restart: drop in-process state, then resume.
  chatIngress.stopAllKickChatIngress();
  service.__test__.liveSessions.clear();
  assert.equal(chatIngress.__test__.sessions.size, 0);

  const result = service.resumeAllBridges({ matrixClient, socketFactory: fake.factory });
  assert.equal(result.resumed, 2);
  assert.equal(chatIngress.__test__.sessions.size, 2);
});
