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
process.env.TWITCH_CLIENT_ID = 'test';
process.env.TWITCH_CLIENT_SECRET = 'test';
process.env.TWITCH_OAUTH_REDIRECT_URI = 'http://localhost/cb';
process.env.YOUTUBE_CLIENT_ID = 'test';
process.env.YOUTUBE_CLIENT_SECRET = 'test';
process.env.YOUTUBE_OAUTH_REDIRECT_URI = 'http://localhost/cb';

const loadModules = async () => {
  const router = await import('../src/services/outboundMessageRouter');
  const linkedAccounts = await import('../src/services/linkedAccounts');
  const chatIngress = await import('../src/integrations/twitch/chatIngress');
  const secretBox = await import('../src/services/secretBox');
  const store = await import('../src/db/store');
  secretBox.clearSecretBoxConfigCache();
  chatIngress.stopAllChatIngress();
  store.db.linkedAccounts.clear();
  store.db.twitchChatBridges.clear();
  store.db.youtubeChatBridges.clear();
  return { router, linkedAccounts, chatIngress, db: store.db };
};

const seedUser = async (db: Awaited<ReturnType<typeof loadModules>>['db']) => {
  const auth = await import('../src/services/auth');
  const id = randomUUID();
  db.createUser({
    id,
    username: `r-${id.slice(0, 4)}`,
    email: `r-${id.slice(0, 4)}@example.com`,
    passwordHash: auth.hashPassword('Original-Pass-1234!'),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  return db.getUserById(id)!;
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
    close: () => {
      listeners.close.forEach((l) => l({ code: 1000, reason: 'shutdown' }));
    },
    addEventListener: (type: keyof Listeners, listener: (e: never) => void) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (listeners[type] as Array<(e: any) => void>).push(listener);
    },
  })) as unknown as import('../src/integrations/twitch/chatIngress').IrcSocketFactory;
  return {
    factory,
    sentLines,
    emitOpen: () => listeners.open.forEach((l) => l()),
    emitMessage: (data: string) => listeners.message.forEach((l) => l({ data })),
  };
};

test('shouldRouteOutbound: filters out messages tagged with m.blackout.origin (loop prevention)', async () => {
  const { router } = await loadModules();
  assert.equal(
    router.shouldRouteOutbound({ msgtype: 'm.text', body: 'hi', 'm.blackout.origin': 'twitch' }),
    false,
    'forwarded ingress messages must NOT round-trip',
  );
  assert.equal(router.shouldRouteOutbound({ msgtype: 'm.text', body: 'hi' }), true);
  assert.equal(router.shouldRouteOutbound({ msgtype: 'm.notice', body: 'hi' }), true);
});

test('shouldRouteOutbound: skips non-text msgtypes', async () => {
  const { router } = await loadModules();
  assert.equal(router.shouldRouteOutbound({ msgtype: 'm.image' }), false);
  assert.equal(router.shouldRouteOutbound({}), false);
});

test('routeOutboundMatrixMessage: walks Twitch chat bridges for the matched room and uses sendChatMessage', async () => {
  // Single loadModules call — calling it twice would clear the seeds we
  // just placed via the per-test isolation guard.
  const { router, db, chatIngress } = await loadModules();
  const user = await seedUser(db);
  const linkedAccounts = await import('../src/services/linkedAccounts');
  linkedAccounts.upsertLinkedAccount({
    blackoutUserId: user.id,
    provider: 'twitch',
    providerUserId: '99',
    providerUsername: 'streamer',
    tokens: { accessToken: 'a', refreshToken: 'r', expiresInSeconds: 3600, scopes: [] },
  });
  db.createTwitchChatBridge({
    id: randomUUID(),
    blackoutUserId: user.id,
    twitchChannel: 'streamer',
    matrixRoomId: '!den:srv',
    isActive: true,
  });
  const fake = buildFakeSocket();
  await chatIngress.startChatIngress({
    blackoutUserId: user.id,
    twitchChannel: 'streamer',
    onMessage: () => {},
    socketFactory: fake.factory,
  });
  fake.emitOpen();
  fake.emitMessage(':tmi.twitch.tv 001 streamerbob :Welcome\r\n');
  fake.emitMessage(':streamerbob!streamerbob@streamerbob.tmi.twitch.tv JOIN #streamer\r\n');
  fake.sentLines.length = 0;

  const out = await router.routeOutboundMatrixMessage('!den:srv', 'hello chat');
  assert.equal(out.delivered, 1);
  assert.equal(out.targets.length, 1);
  assert.equal(out.targets[0].target, 'twitch:streamer');
  assert.equal(out.targets[0].kind, 'ok');
  assert.deepEqual(fake.sentLines, ['PRIVMSG #streamer :hello chat\r\n']);
});

test('routeOutboundMatrixMessage: walks YouTube bridges; uses the YT outbound + a stubbed fetch', async () => {
  const { router, db } = await loadModules();
  const user = await seedUser(db);
  const linkedAccounts = await import('../src/services/linkedAccounts');
  linkedAccounts.upsertLinkedAccount({
    blackoutUserId: user.id,
    provider: 'youtube',
    providerUserId: 'g-1',
    providerUsername: 'yt',
    tokens: { accessToken: 'yt-a', refreshToken: 'r', expiresInSeconds: 3600, scopes: [] },
  });
  db.createYoutubeChatBridge({
    id: randomUUID(),
    blackoutUserId: user.id,
    youtubeChannelId: 'UCxxxxxxxxxxxxxxxxxxxxxx',
    matrixRoomId: '!den:srv',
    isActive: true,
  });

  let insertCalled = false;
  const stubFetch: typeof fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/liveBroadcasts')) {
      return new Response(
        JSON.stringify({ items: [{ id: 'b', snippet: { liveChatId: 'lc' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    insertCalled = true;
    return new Response(JSON.stringify({ id: 'm-1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;

  const out = await router.routeOutboundMatrixMessage('!den:srv', 'hello yt', {
    fetch: stubFetch,
  });
  assert.equal(out.delivered, 1);
  assert.equal(out.targets[0].target, 'youtube:UCxxxxxxxxxxxxxxxxxxxxxx');
  assert.equal(out.targets[0].kind, 'ok');
  assert.equal(insertCalled, true);
});

test('routeOutboundMatrixMessage: room with NO matching bridges returns delivered=0 cleanly', async () => {
  const { router } = await loadModules();
  const out = await router.routeOutboundMatrixMessage('!nothing:srv', 'hi');
  assert.equal(out.delivered, 0);
  assert.equal(out.targets.length, 0);
});

test('routeOutboundMatrixMessage: skips inactive bridges', async () => {
  const { router, db } = await loadModules();
  const user = await seedUser(db);
  db.createTwitchChatBridge({
    id: randomUUID(),
    blackoutUserId: user.id,
    twitchChannel: 'streamer',
    matrixRoomId: '!den:srv',
    isActive: false,
  });
  const out = await router.routeOutboundMatrixMessage('!den:srv', 'hi');
  assert.equal(out.targets.length, 0);
  assert.equal(out.delivered, 0);
});
