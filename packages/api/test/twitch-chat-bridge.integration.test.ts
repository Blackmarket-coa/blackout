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
process.env.TWITCH_CLIENT_ID = 'test-twitch-client-id';
process.env.TWITCH_CLIENT_SECRET = 'test-twitch-client-secret';
process.env.TWITCH_OAUTH_REDIRECT_URI = 'http://localhost:3000/oauth/twitch/callback';

const loadModules = async () => {
  const secretBox = await import('../src/services/secretBox');
  const linkedAccounts = await import('../src/services/linkedAccounts');
  const twitchChatBridge = await import('../src/services/twitchChatBridge');
  const chatIngress = await import('../src/integrations/twitch/chatIngress');
  const store = await import('../src/db/store');
  secretBox.clearSecretBoxConfigCache();
  chatIngress.stopAllChatIngress();
  twitchChatBridge.__test__.liveSessions.clear();
  // Test-isolation: the in-memory store is module-scoped and survives
  // across tests in the same file. Clear the tables that this suite
  // mutates so resumeAllBridges + idempotency assertions see only the
  // current test's seed data.
  store.db.twitchChatBridges.clear();
  store.db.linkedAccounts.clear();
  store.db.pendingOAuthLinks.clear();
  return { secretBox, linkedAccounts, twitchChatBridge, chatIngress, db: store.db };
};

const seedUser = async (db: Awaited<ReturnType<typeof loadModules>>['db']) => {
  const auth = await import('../src/services/auth');
  const id = randomUUID();
  db.createUser({
    id,
    username: `bridge-${id.slice(0, 4)}`,
    email: `bridge-${id.slice(0, 4)}@example.com`,
    passwordHash: auth.hashPassword('Original-Pass-1234!'),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  return db.getUserById(id)!;
};

// Direct import — must NOT re-enter loadModules(), which would clear the
// stores we're about to seed.
const seedTwitchLink = async (userId: string) => {
  const linkedAccounts = await import('../src/services/linkedAccounts');
  return linkedAccounts.upsertLinkedAccount({
    blackoutUserId: userId,
    provider: 'twitch',
    providerUserId: '11223344',
    providerUsername: 'StreamerBob',
    tokens: { accessToken: 'tok', refreshToken: 'r', expiresInSeconds: 3600, scopes: [] },
  });
};

interface FakeSocket {
  sentLines: string[];
  emitOpen(): void;
  emitMessage(data: string): void;
  closed: boolean;
}

const buildFakeSocketFactory = () => {
  type Listeners = {
    open: Array<() => void>;
    message: Array<(event: { data: string | Buffer }) => void>;
    close: Array<(event: { code: number; reason: string }) => void>;
    error: Array<(event: unknown) => void>;
  };
  const listeners: Listeners = { open: [], message: [], close: [], error: [] };
  const fake: FakeSocket = {
    sentLines: [],
    emitOpen: () => listeners.open.forEach((l) => l()),
    emitMessage: (data) => listeners.message.forEach((l) => l({ data })),
    closed: false,
  };
  const factory = (() => ({
    send: (data: string) => fake.sentLines.push(data),
    close: () => {
      fake.closed = true;
      listeners.close.forEach((l) => l({ code: 1000, reason: 'shutdown' }));
    },
    addEventListener: (type: keyof Listeners, listener: (e: never) => void) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (listeners[type] as Array<(e: any) => void>).push(listener);
    },
  })) as unknown as import('../src/integrations/twitch/chatIngress').IrcSocketFactory;
  return { factory, fake };
};

interface MatrixSendCall {
  roomId: string;
  content: Record<string, unknown>;
  options?: { eventType?: string; txnId?: string };
}
const buildFakeMatrixClient = (overrides?: { fail?: boolean }) => {
  const calls: MatrixSendCall[] = [];
  const matrixClient: import('../src/services/twitchChatBridge').MatrixSendEventClient = {
    sendEvent: async (roomId, content, options) => {
      calls.push({ roomId, content, options });
      return overrides?.fail ? { ok: false, status: 502 } : { ok: true, status: 200 };
    },
  };
  return { matrixClient, calls };
};

// =============================================================================
// validation
// =============================================================================

test('createBridge: rejects an invalid Twitch login', async () => {
  const { twitchChatBridge, db } = await loadModules();
  const user = await seedUser(db);
  await seedTwitchLink(user.id);
  const outcome = await twitchChatBridge.createBridge({
    blackoutUserId: user.id,
    twitchChannel: 'has spaces!',
    matrixRoomId: '!room:server',
  });
  assert.equal(outcome.kind, 'invalid_input');
});

test('createBridge: rejects a malformed Matrix room id', async () => {
  const { twitchChatBridge, db } = await loadModules();
  const user = await seedUser(db);
  await seedTwitchLink(user.id);
  const outcome = await twitchChatBridge.createBridge({
    blackoutUserId: user.id,
    twitchChannel: 'gamer',
    matrixRoomId: 'not-a-room-id',
  });
  assert.equal(outcome.kind, 'invalid_input');
});

test('createBridge: rejects when the user has no linked Twitch account', async () => {
  const { twitchChatBridge, db } = await loadModules();
  const user = await seedUser(db);
  // No seedTwitchLink — Twitch is unlinked.
  const outcome = await twitchChatBridge.createBridge({
    blackoutUserId: user.id,
    twitchChannel: 'gamer',
    matrixRoomId: '!room:server',
  });
  assert.equal(outcome.kind, 'twitch_not_linked');
});

// =============================================================================
// happy path: create → ingress → matrix forward
// =============================================================================

test('createBridge: persists the row and starts an ingress that forwards into Matrix', async () => {
  const { twitchChatBridge, db } = await loadModules();
  const user = await seedUser(db);
  await seedTwitchLink(user.id);
  const { factory, fake } = buildFakeSocketFactory();
  const { matrixClient, calls } = buildFakeMatrixClient();

  const created = await twitchChatBridge.createBridge(
    { blackoutUserId: user.id, twitchChannel: 'BlackoutDev', matrixRoomId: '!den:bmc' },
    { matrixClient, socketFactory: factory, skipEventSub: true },
  );
  assert.equal(created.kind, 'ok');
  if (created.kind !== 'ok') return;

  // Persisted with lowercased channel.
  const row = db.findTwitchChatBridge(user.id, 'blackoutdev');
  assert.ok(row);
  assert.equal(row!.id, created.record.id);
  assert.equal(row!.twitchChannel, 'blackoutdev');
  assert.equal(row!.isActive, true);

  // Ingress wiring sent the auth handshake into our fake socket.
  fake.emitOpen();
  assert.match(fake.sentLines[0], /^CAP REQ /);
  assert.match(fake.sentLines[1], /^PASS oauth:/);

  // Drive a PRIVMSG through the bridge and verify Matrix received it.
  fake.emitMessage(':tmi.twitch.tv 001 streamerbob :Welcome\r\n');
  fake.emitMessage(
    '@display-name=Alice;tmi-sent-ts=1700000000000;id=msg-42;mod=0;subscriber=0;color=#00FF00;user-id=7 ' +
      ':alice!alice@alice.tmi.twitch.tv PRIVMSG #blackoutdev :hello there\r\n',
  );

  // Give the .then() in onMessage a chance to flush.
  await new Promise((r) => setImmediate(r));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].roomId, '!den:bmc');
  assert.equal(calls[0].content['m.blackout.origin'], 'twitch');
  assert.equal(calls[0].content['m.blackout.origin_channel'], 'blackoutdev');
  // The platform-message id is used as the Matrix txn id so retransmits
  // don't double-deliver.
  assert.equal(calls[0].options?.txnId, 'twitch-msg-42');
});

// =============================================================================
// idempotency + conflict
// =============================================================================

test('createBridge: re-posting the same (channel, room) is idempotent', async () => {
  const { twitchChatBridge, db } = await loadModules();
  const user = await seedUser(db);
  await seedTwitchLink(user.id);
  const { factory } = buildFakeSocketFactory();
  const { matrixClient } = buildFakeMatrixClient();

  const a = await twitchChatBridge.createBridge(
    { blackoutUserId: user.id, twitchChannel: 'gamer', matrixRoomId: '!room:srv' },
    { matrixClient, socketFactory: factory, skipEventSub: true },
  );
  const b = await twitchChatBridge.createBridge(
    { blackoutUserId: user.id, twitchChannel: 'gamer', matrixRoomId: '!room:srv' },
    { matrixClient, socketFactory: factory, skipEventSub: true },
  );
  assert.equal(a.kind, 'ok');
  assert.equal(b.kind, 'ok');
  if (a.kind === 'ok' && b.kind === 'ok') {
    assert.equal(a.record.id, b.record.id, 'second call should return the same row, not create a new one');
  }
  assert.equal(db.listTwitchChatBridgesForUser(user.id).length, 1);
});

test('createBridge: re-posting the same channel into a different room returns already_bridged', async () => {
  const { twitchChatBridge, db } = await loadModules();
  const user = await seedUser(db);
  await seedTwitchLink(user.id);
  const { factory } = buildFakeSocketFactory();
  const { matrixClient } = buildFakeMatrixClient();

  await twitchChatBridge.createBridge(
    { blackoutUserId: user.id, twitchChannel: 'gamer', matrixRoomId: '!a:srv' },
    { matrixClient, socketFactory: factory, skipEventSub: true },
  );
  const conflict = await twitchChatBridge.createBridge(
    { blackoutUserId: user.id, twitchChannel: 'gamer', matrixRoomId: '!b:srv' },
    { matrixClient, socketFactory: factory, skipEventSub: true },
  );
  assert.equal(conflict.kind, 'already_bridged');
  if (conflict.kind === 'already_bridged') {
    assert.equal(conflict.record.matrixRoomId, '!a:srv');
  }
  // Still only one row.
  assert.equal(db.listTwitchChatBridgesForUser(user.id).length, 1);
});

// =============================================================================
// delete
// =============================================================================

test('deleteBridge: stops the ingress, removes the row, returns ok', async () => {
  const { twitchChatBridge, chatIngress, db } = await loadModules();
  const user = await seedUser(db);
  await seedTwitchLink(user.id);
  const { factory } = buildFakeSocketFactory();
  const { matrixClient } = buildFakeMatrixClient();

  const created = await twitchChatBridge.createBridge(
    { blackoutUserId: user.id, twitchChannel: 'gamer', matrixRoomId: '!a:srv' },
    { matrixClient, socketFactory: factory, skipEventSub: true },
  );
  assert.equal(created.kind, 'ok');
  if (created.kind !== 'ok') return;

  assert.equal(chatIngress.__test__.sessions.size, 1);

  const out = await twitchChatBridge.deleteBridge(user.id, created.record.id);
  assert.equal(out.kind, 'ok');
  assert.equal(db.findTwitchChatBridge(user.id, 'gamer'), undefined);
  assert.equal(chatIngress.__test__.sessions.size, 0);
  assert.equal(twitchChatBridge.__test__.liveSessions.size, 0);
});

test('deleteBridge: returns forbidden when one user tries to delete another user\'s bridge', async () => {
  const { twitchChatBridge, db } = await loadModules();
  const alice = await seedUser(db);
  await seedTwitchLink(alice.id);
  const bob = await seedUser(db);
  const { factory } = buildFakeSocketFactory();
  const { matrixClient } = buildFakeMatrixClient();

  const created = await twitchChatBridge.createBridge(
    { blackoutUserId: alice.id, twitchChannel: 'gamer', matrixRoomId: '!a:srv' },
    { matrixClient, socketFactory: factory, skipEventSub: true },
  );
  assert.equal(created.kind, 'ok');
  if (created.kind !== 'ok') return;

  const out = await twitchChatBridge.deleteBridge(bob.id, created.record.id);
  assert.equal(out.kind, 'forbidden');
  // Row is still there.
  assert.ok(db.findTwitchChatBridge(alice.id, 'gamer'));
});

test('deleteBridge: returns not_found for unknown bridge id', async () => {
  const { twitchChatBridge, db } = await loadModules();
  const user = await seedUser(db);
  const out = await twitchChatBridge.deleteBridge(user.id, randomUUID());
  assert.equal(out.kind, 'not_found');
});

// =============================================================================
// resumeAllBridges
// =============================================================================

test('resumeAllBridges: starts ingress for each active bridge whose creator still has Twitch linked', async () => {
  const { twitchChatBridge, chatIngress, db } = await loadModules();
  const a = await seedUser(db);
  const b = await seedUser(db);
  await seedTwitchLink(a.id);
  await seedTwitchLink(b.id);
  const { factory: factoryA } = buildFakeSocketFactory();
  const { factory: factoryB } = buildFakeSocketFactory();
  const { matrixClient } = buildFakeMatrixClient();

  const aBridge = await twitchChatBridge.createBridge(
    { blackoutUserId: a.id, twitchChannel: 'astream', matrixRoomId: '!a:srv' },
    { matrixClient, socketFactory: factoryA, skipEventSub: true },
  );
  const bBridge = await twitchChatBridge.createBridge(
    { blackoutUserId: b.id, twitchChannel: 'bstream', matrixRoomId: '!b:srv' },
    { matrixClient, socketFactory: factoryB, skipEventSub: true },
  );
  assert.equal(aBridge.kind, 'ok');
  assert.equal(bBridge.kind, 'ok');

  // Simulate restart: drop in-process ingress + bridge sessions, then resume.
  chatIngress.stopAllChatIngress();
  twitchChatBridge.__test__.liveSessions.clear();
  assert.equal(chatIngress.__test__.sessions.size, 0);

  const result = await twitchChatBridge.resumeAllBridges({
    matrixClient,
    socketFactory: factoryA, // re-use; both sessions share the factory in tests
  });
  assert.equal(result.resumed, 2);
  assert.equal(result.skipped, 0);
  assert.equal(chatIngress.__test__.sessions.size, 2);
});

test('resumeAllBridges: skips bridges whose creator has unlinked Twitch since the bridge was created', async () => {
  const { twitchChatBridge, linkedAccounts, chatIngress, db } = await loadModules();
  const user = await seedUser(db);
  await seedTwitchLink(user.id);
  const { factory } = buildFakeSocketFactory();
  const { matrixClient } = buildFakeMatrixClient();

  await twitchChatBridge.createBridge(
    { blackoutUserId: user.id, twitchChannel: 'gone', matrixRoomId: '!r:srv' },
    { matrixClient, socketFactory: factory, skipEventSub: true },
  );

  // User unlinks Twitch.
  linkedAccounts.unlinkAccount(user.id, 'twitch');

  // Restart simulation: drop in-process state, attempt resume.
  chatIngress.stopAllChatIngress();
  twitchChatBridge.__test__.liveSessions.clear();

  const result = await twitchChatBridge.resumeAllBridges({ matrixClient, socketFactory: factory });
  assert.equal(result.resumed, 0);
  assert.equal(result.skipped, 1);
  assert.equal(chatIngress.__test__.sessions.size, 0);
});
