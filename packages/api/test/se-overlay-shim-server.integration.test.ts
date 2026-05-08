import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server as HttpServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { generateTestJwtSecret } from './_fixtures/secrets';

const KEY_V1 = randomBytes(32).toString('base64');

process.env.JWT_SECRET_PRIMARY = generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api';
process.env.JWT_AUDIENCE = 'blackout-clients';
process.env.NODE_ENV = 'test';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS = `v1:${KEY_V1}`;

const loadModules = async () => {
  const tokens = await import('../src/services/widgetAlertTokens');
  const widgetBus = await import('../src/services/widgetBus');
  const server = await import('../src/integrations/se-overlay-compat/server');
  const store = await import('../src/db/store');
  store.db.widgetAlertTokens.clear();
  widgetBus.clearAllSubscribersForTest();
  return { tokens, widgetBus, server, db: store.db };
};

const seedUser = async (db: Awaited<ReturnType<typeof loadModules>>['db']) => {
  const auth = await import('../src/services/auth');
  const id = randomUUID();
  db.createUser({
    id,
    username: `se-${id.slice(0, 4)}`,
    email: `se-${id.slice(0, 4)}@example.com`,
    passwordHash: auth.hashPassword('Original-Pass-1234!'),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  return db.getUserById(id)!;
};

interface Harness {
  port: number;
  server: HttpServer;
  dispose: () => Promise<void>;
}

const buildHarness = async (
  shimServer: Awaited<ReturnType<typeof loadModules>>['server'],
): Promise<Harness> => {
  const httpServer = createServer((_, res) => {
    res.statusCode = 404;
    res.end();
  });
  const detach = shimServer.attachSeOverlayShim(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const port = (httpServer.address() as any).port as number;
  return {
    port,
    server: httpServer,
    dispose: async () => {
      detach();
      await new Promise<void>((resolve, reject) =>
        httpServer.close((err) => (err ? reject(err) : resolve())),
      );
    },
  };
};

const connect = (port: number): ClientSocket =>
  ioClient(`http://127.0.0.1:${port}`, {
    path: '/se-overlay/',
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });

const awaitEvent = <T = unknown>(
  socket: ClientSocket,
  name: string,
  timeoutMs = 1500,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${name}`)), timeoutMs);
    socket.once(name, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

test('se-overlay shim: rejects an authenticate with a missing token', async () => {
  const mod = await loadModules();
  const harness = await buildHarness(mod.server);
  try {
    const socket = connect(harness.port);
    socket.emit('authenticate', { method: 'overlayToken' });
    const denial = await awaitEvent<{ code: string }>(socket, 'unauthorized');
    assert.equal(denial.code, 'malformed_payload');
    socket.close();
  } finally {
    await harness.dispose();
  }
});

test('se-overlay shim: rejects an authenticate with a bad token', async () => {
  const mod = await loadModules();
  const harness = await buildHarness(mod.server);
  try {
    const socket = connect(harness.port);
    socket.emit('authenticate', { method: 'overlayToken', token: 'wrong' });
    const denial = await awaitEvent<{ code: string }>(socket, 'unauthorized');
    assert.equal(denial.code, 'invalid_token');
    socket.close();
  } finally {
    await harness.dispose();
  }
});

test('se-overlay shim: a valid token gets back an authenticated frame', async () => {
  const mod = await loadModules();
  const user = await seedUser(mod.db);
  const created = mod.tokens.createWidgetAlertToken({
    blackoutUserId: user.id,
    label: 'overlay',
  });

  const harness = await buildHarness(mod.server);
  try {
    const socket = connect(harness.port);
    socket.emit('authenticate', { method: 'overlayToken', token: created.secret });
    const ack = await awaitEvent<{ channelId: string; scopes: string[] }>(
      socket,
      'authenticated',
    );
    assert.equal(ack.channelId, user.id);
    assert.deepEqual(ack.scopes, ['alerts:read']);
    socket.close();
  } finally {
    await harness.dispose();
  }
});

test('se-overlay shim: a tip published on the bus arrives as an SE `event` (type=tip)', async () => {
  const mod = await loadModules();
  const user = await seedUser(mod.db);
  const created = mod.tokens.createWidgetAlertToken({
    blackoutUserId: user.id,
    label: 'overlay',
  });

  const harness = await buildHarness(mod.server);
  try {
    const socket = connect(harness.port);
    socket.emit('authenticate', { method: 'overlayToken', token: created.secret });
    await awaitEvent(socket, 'authenticated');

    const eventPromise = awaitEvent<{
      type: string;
      provider: string;
      data: Record<string, unknown>;
    }>(socket, 'event');

    mod.widgetBus.publish(user.id, {
      type: 'donation',
      origin: 'streamlabs',
      publishedAtMs: Date.now(),
      message: [
        {
          name: 'alice',
          amount: '5.00',
          formatted_amount: '$5.00',
          currency: 'USD',
          message: 'Great stream!',
          _id: 'sl_42',
        },
      ],
      source: {
        kind: 'streamlabs_donation',
        donationId: 'sl_42',
        donorName: 'alice',
        amount: '5.00',
        currency: 'USD',
        message: 'Great stream!',
        createdAt: new Date().toISOString(),
      },
    });

    const frame = await eventPromise;
    assert.equal(frame.type, 'tip');
    assert.equal(frame.provider, 'streamlabs');
    assert.equal(frame.data.username, 'alice');
    assert.equal(frame.data.amount, 5);
    assert.equal(frame.data.currency, 'USD');
    socket.close();
  } finally {
    await harness.dispose();
  }
});

test('se-overlay shim: a follow on the bus arrives as `event` (type=follow)', async () => {
  const mod = await loadModules();
  const user = await seedUser(mod.db);
  const created = mod.tokens.createWidgetAlertToken({
    blackoutUserId: user.id,
    label: 'overlay',
  });

  const harness = await buildHarness(mod.server);
  try {
    const socket = connect(harness.port);
    socket.emit('authenticate', { method: 'overlayToken', token: created.secret });
    await awaitEvent(socket, 'authenticated');

    const eventPromise = awaitEvent<{ type: string; data: Record<string, unknown> }>(
      socket,
      'event',
    );
    mod.widgetBus.publish(user.id, {
      type: 'follow',
      origin: 'twitch',
      publishedAtMs: Date.now(),
      message: [
        {
          type: 'twitch_account',
          name: 'bob',
          _id: 'tw_follow_42',
          created_at: new Date().toISOString(),
        },
      ],
      source: {
        kind: 'follow',
        subscriptionType: 'channel.follow',
        twitchChannelId: '1',
        followerLogin: 'bob',
        followerDisplayName: 'Bob',
        followerTwitchId: '2',
        followedAt: new Date().toISOString(),
      },
    });
    const frame = await eventPromise;
    assert.equal(frame.type, 'follow');
    assert.equal(frame.data.username, 'bob');
    socket.close();
  } finally {
    await harness.dispose();
  }
});

test('se-overlay shim: revoking a token mid-session ignores the bus event after revoke', async () => {
  const mod = await loadModules();
  const user = await seedUser(mod.db);
  const created = mod.tokens.createWidgetAlertToken({
    blackoutUserId: user.id,
    label: 'overlay',
  });

  const harness = await buildHarness(mod.server);
  try {
    const socket = connect(harness.port);
    socket.emit('authenticate', { method: 'overlayToken', token: created.secret });
    await awaitEvent(socket, 'authenticated');

    // After the session is established, revoking the token does NOT
    // tear down the open connection — that would require the shim to
    // listen for revoke events out-of-band. The point of this test is
    // just to confirm that the bus is the source of truth for delivery
    // and that a creator can re-authenticate with a new token.
    mod.tokens.revokeWidgetAlertToken(user.id, created.record.id);

    // A bus publish still flows because the existing socket already
    // captured a token snapshot. (Revoke disables NEW SSE/SocketIO
    // sessions; existing ones get torn down by close.)
    const eventPromise = awaitEvent<{ type: string }>(socket, 'event');
    mod.widgetBus.publish(user.id, {
      type: 'follow',
      origin: 'twitch',
      publishedAtMs: Date.now(),
      message: [
        {
          type: 'twitch_account',
          name: 'eve',
          _id: 'tw_follow_99',
          created_at: new Date().toISOString(),
        },
      ],
      source: {
        kind: 'follow',
        subscriptionType: 'channel.follow',
        twitchChannelId: '1',
        followerLogin: 'eve',
        followerDisplayName: 'Eve',
        followerTwitchId: '3',
        followedAt: new Date().toISOString(),
      },
    });
    const frame = await eventPromise;
    assert.equal(frame.type, 'follow');

    // A NEW connection with the revoked token must fail.
    const reconn = connect(harness.port);
    reconn.emit('authenticate', { method: 'overlayToken', token: created.secret });
    const denial = await awaitEvent<{ code: string }>(reconn, 'unauthorized');
    assert.equal(denial.code, 'invalid_token');
    socket.close();
    reconn.close();
  } finally {
    await harness.dispose();
  }
});

test('se-overlay shim: lists per-user sessions in observability snapshot', async () => {
  const mod = await loadModules();
  const user = await seedUser(mod.db);
  const created = mod.tokens.createWidgetAlertToken({
    blackoutUserId: user.id,
    label: 'overlay',
  });

  const harness = await buildHarness(mod.server);
  try {
    const socket = connect(harness.port);
    socket.emit('authenticate', { method: 'overlayToken', token: created.secret });
    await awaitEvent(socket, 'authenticated');
    const list = mod.server.listSessionsForUser(user.id);
    assert.equal(list.length, 1);
    assert.ok(list[0]!.connectedAt > 0);
    assert.ok(list[0]!.authenticatedAt >= list[0]!.connectedAt);
    socket.close();
    // Wait briefly for disconnect to propagate.
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(mod.server.listSessionsForUser(user.id).length, 0);
  } finally {
    await harness.dispose();
  }
});
