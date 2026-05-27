import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
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
process.env.BLACKOUT_EVENTSUB_CALLBACK_URL =
  'https://api.blackout.test/v1/integrations/twitch/eventsub';
process.env.TWITCH_EVENTSUB_SECRET = 'eventsub-test-secret';

const SECRET = process.env.TWITCH_EVENTSUB_SECRET!;

const loadModules = async () => {
  const helix = await import('../src/integrations/twitch/helix');
  const manager = await import('../src/services/twitchEventSubManager');
  const route = await import('../src/routes/twitchEventSub');
  const linkedAccounts = await import('../src/services/linkedAccounts');
  const secretBox = await import('../src/services/secretBox');
  const store = await import('../src/db/store');
  const oauth = await import('../src/integrations/twitch/oauth');
  helix.clearAppAccessTokenCache();
  oauth.clearTwitchOAuthConfigCache();
  secretBox.clearSecretBoxConfigCache();
  // Test isolation between cases.
  store.db.linkedAccounts.clear();
  store.db.twitchEventSubscriptions.clear();
  store.db.twitchChatBridges.clear();
  return { helix, manager, route, linkedAccounts, db: store.db };
};

const seedUser = async (db: Awaited<ReturnType<typeof loadModules>>['db']) => {
  const auth = await import('../src/services/auth');
  const id = randomUUID();
  db.createUser({
    id,
    username: `evsub-${id.slice(0, 4)}`,
    email: `evsub-${id.slice(0, 4)}@example.com`,
    passwordHash: auth.hashPassword('Original-Pass-1234!'),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  return db.getUserById(id)!;
};

const seedTwitchLink = async (userId: string, providerUserId = '42') => {
  const linkedAccounts = await import('../src/services/linkedAccounts');
  return linkedAccounts.upsertLinkedAccount({
    blackoutUserId: userId,
    provider: 'twitch',
    providerUserId,
    providerUsername: 'streamer',
    tokens: { accessToken: 'tok', refreshToken: 'r', expiresInSeconds: 3600, scopes: [] },
  });
};

// Direct import — must NOT re-enter loadModules(), which would clear the
// linkedAccounts / twitchEventSubscriptions / twitchChatBridges seeds we
// just placed.
const seedBridge = async (
  userId: string,
  twitchChannel: string,
  matrixRoomId: string,
) => {
  const store = await import('../src/db/store');
  return store.db.createTwitchChatBridge({
    id: randomUUID(),
    blackoutUserId: userId,
    twitchChannel,
    matrixRoomId,
    isActive: true,
  });
};

const sign = (id: string, ts: string, body: string): string => {
  const h = createHmac('sha256', SECRET).update(id).update(ts).update(body).digest('hex');
  return `sha256=${h}`;
};

// =============================================================================
// helix client
// =============================================================================

test('helix.getAppAccessToken: caches the token until close to expiry', async () => {
  const { helix } = await loadModules();
  let calls = 0;
  const stubFetch: typeof fetch = (async () => {
    calls += 1;
    return new Response(
      JSON.stringify({ access_token: 'app-tok-' + calls, expires_in: 7200, token_type: 'bearer' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof fetch;

  const a = await helix.getAppAccessToken({ fetch: stubFetch });
  const b = await helix.getAppAccessToken({ fetch: stubFetch });
  assert.equal(a.token, b.token);
  assert.equal(calls, 1);
});

test('helix.getAppAccessToken: re-fetches when within the leeway window', async () => {
  const { helix } = await loadModules();
  let calls = 0;
  const stubFetch: typeof fetch = (async () => {
    calls += 1;
    return new Response(
      JSON.stringify({ access_token: `tok-${calls}`, expires_in: 30 }), // <60s leeway
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof fetch;
  await helix.getAppAccessToken({ fetch: stubFetch });
  await helix.getAppAccessToken({ fetch: stubFetch });
  assert.equal(calls, 2, 'short-lived token should re-fetch on next request');
});

test('helix.createEventSubSubscription: builds the right POST and parses data[0]', async () => {
  const { helix } = await loadModules();
  let tokenFetchCalls = 0;
  let createCalls = 0;
  const stubFetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === 'https://id.twitch.tv/oauth2/token') {
      tokenFetchCalls += 1;
      return new Response(
        JSON.stringify({ access_token: 'app-tok', expires_in: 7200 }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url === 'https://api.twitch.tv/helix/eventsub/subscriptions') {
      createCalls += 1;
      const body = JSON.parse(String(init?.body ?? '{}'));
      assert.equal(body.type, 'channel.follow');
      assert.equal(body.version, '2');
      assert.deepEqual(body.condition, { broadcaster_user_id: '42', moderator_user_id: '42' });
      assert.equal(body.transport.method, 'webhook');
      assert.equal(body.transport.callback, 'https://x.test/cb');
      assert.equal(body.transport.secret, 'svc-sec');
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers?.['authorization'], 'Bearer app-tok');
      assert.equal(headers?.['client-id'], 'test-twitch-client-id');
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 'sub-aaa',
              status: 'webhook_callback_verification_pending',
              type: 'channel.follow',
              version: '2',
              cost: 0,
            },
          ],
        }),
        { status: 202, headers: { 'content-type': 'application/json' } },
      );
    }
    assert.fail(`unexpected fetch URL: ${url}`);
  }) as unknown as typeof fetch;

  const result = await helix.createEventSubSubscription(
    {
      type: 'channel.follow',
      version: '2',
      condition: { broadcaster_user_id: '42', moderator_user_id: '42' },
      callbackUrl: 'https://x.test/cb',
      secret: 'svc-sec',
    },
    { fetch: stubFetch },
  );
  assert.equal(tokenFetchCalls, 1);
  assert.equal(createCalls, 1);
  assert.equal(result.kind, 'ok');
  if (result.kind === 'ok') assert.equal(result.subscription.id, 'sub-aaa');
});

test('helix.createEventSubSubscription: maps 401/403/409/429/500 to typed outcomes', async () => {
  const { helix } = await loadModules();
  for (const [status, expected] of [
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [409, 'conflict'],
    [429, 'rate_limited'],
    [500, 'failed'],
  ] as Array<[number, string]>) {
    const stubFetch: typeof fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === 'https://id.twitch.tv/oauth2/token') {
        return new Response(JSON.stringify({ access_token: 'a', expires_in: 7200 }), { status: 200 });
      }
      return new Response('{"error":"x"}', {
        status,
        headers: status === 429 ? { 'retry-after': '12' } : undefined,
      });
    }) as unknown as typeof fetch;
    helix.clearAppAccessTokenCache();
    const out = await helix.createEventSubSubscription(
      {
        type: 'channel.follow',
        version: '2',
        condition: { broadcaster_user_id: '1', moderator_user_id: '1' },
        callbackUrl: 'https://x.test/cb',
        secret: 's',
      },
      { fetch: stubFetch },
    );
    assert.equal(out.kind, expected, `status ${status}`);
    if (status === 429 && out.kind === 'rate_limited') {
      assert.equal(out.retryAfterSeconds, 12);
    }
  }
});

test('helix.deleteEventSubSubscription: 204 → ok, 404 → not_found', async () => {
  const { helix } = await loadModules();
  for (const [status, expected] of [
    [204, 'ok'],
    [404, 'not_found'],
  ] as Array<[number, string]>) {
    const stubFetch: typeof fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === 'https://id.twitch.tv/oauth2/token') {
        return new Response(JSON.stringify({ access_token: 'a', expires_in: 7200 }), { status: 200 });
      }
      assert.match(url, /id=sub-x/);
      return new Response(null, { status });
    }) as unknown as typeof fetch;
    helix.clearAppAccessTokenCache();
    const out = await helix.deleteEventSubSubscription('sub-x', { fetch: stubFetch });
    assert.equal(out.kind, expected, `status ${status}`);
  }
});

// =============================================================================
// manager
// =============================================================================

test('manager.subscribeToBridgeEvents: creates one row per default type and persists', async () => {
  const { manager, db } = await loadModules();
  const user = await seedUser(db);
  await seedTwitchLink(user.id, '42');
  const bridge = await seedBridge(user.id, 'streamer', '!den:bmc');

  let createCalls = 0;
  const stubFetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === 'https://id.twitch.tv/oauth2/token') {
      return new Response(JSON.stringify({ access_token: 'a', expires_in: 7200 }), { status: 200 });
    }
    if (url === 'https://api.twitch.tv/helix/eventsub/subscriptions') {
      createCalls += 1;
      const body = JSON.parse(String(init?.body ?? '{}'));
      return new Response(
        JSON.stringify({
          data: [
            {
              id: `sub-${body.type}`,
              status: 'webhook_callback_verification_pending',
              type: body.type,
              version: body.version,
              cost: 0,
            },
          ],
        }),
        { status: 202, headers: { 'content-type': 'application/json' } },
      );
    }
    assert.fail(`unexpected URL: ${url}`);
  }) as unknown as typeof fetch;

  const result = await manager.subscribeToBridgeEvents(bridge, { fetch: stubFetch });
  // 10 default types: follow, subscribe, subscription.gift, cheer, raid,
  // stream.online, stream.offline, channel-points redemption, hype-train
  // begin + end.
  assert.equal(createCalls, 10);
  assert.equal(result.created.length, 10);
  assert.equal(result.alreadyPresent.length, 0);
  assert.equal(result.failures.length, 0);

  // Persisted one row per type.
  const persisted = db.listTwitchEventSubscriptionsForChannel(user.id, '42');
  const types = new Set(persisted.map((r) => r.subscriptionType));
  assert.deepEqual(
    [...types].sort(),
    [
      'channel.channel_points_custom_reward_redemption.add',
      'channel.cheer',
      'channel.follow',
      'channel.hype_train.begin',
      'channel.hype_train.end',
      'channel.raid',
      'channel.subscribe',
      'channel.subscription.gift',
      'stream.offline',
      'stream.online',
    ],
  );
});

test('manager.subscribeToBridgeEvents: idempotent — does not re-create existing types', async () => {
  const { manager, db } = await loadModules();
  const user = await seedUser(db);
  await seedTwitchLink(user.id, '42');
  const bridge = await seedBridge(user.id, 'streamer', '!den:bmc');

  // Pre-existing channel.follow row.
  db.createTwitchEventSubscription({
    id: randomUUID(),
    blackoutUserId: user.id,
    twitchUserId: '42',
    subscriptionType: 'channel.follow',
    helixSubscriptionId: 'sub-already-here',
    status: 'enabled',
  });

  let createCalls = 0;
  const stubFetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === 'https://id.twitch.tv/oauth2/token') {
      return new Response(JSON.stringify({ access_token: 'a', expires_in: 7200 }), { status: 200 });
    }
    createCalls += 1;
    const body = JSON.parse(String(init?.body ?? '{}'));
    // The follow type should NOT be re-requested.
    assert.notEqual(body.type, 'channel.follow');
    return new Response(
      JSON.stringify({
        data: [{ id: `sub-${body.type}`, status: 'enabled', type: body.type, version: body.version, cost: 0 }],
      }),
      { status: 202, headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof fetch;

  const result = await manager.subscribeToBridgeEvents(bridge, { fetch: stubFetch });
  assert.equal(createCalls, 9, '10 types - 1 already-present');
  assert.deepEqual(result.alreadyPresent, ['channel.follow']);
});

test('manager.unsubscribeBridgeEvents: deletes every persisted row via Helix DELETE', async () => {
  const { manager, db } = await loadModules();
  const user = await seedUser(db);
  await seedTwitchLink(user.id, '42');
  const bridge = await seedBridge(user.id, 'streamer', '!den:bmc');

  for (const type of ['channel.follow', 'channel.subscribe', 'channel.cheer']) {
    db.createTwitchEventSubscription({
      id: randomUUID(),
      blackoutUserId: user.id,
      twitchUserId: '42',
      subscriptionType: type,
      helixSubscriptionId: `sub-${type}`,
      status: 'enabled',
    });
  }

  const deletedIds: string[] = [];
  const stubFetch: typeof fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === 'https://id.twitch.tv/oauth2/token') {
      return new Response(JSON.stringify({ access_token: 'a', expires_in: 7200 }), { status: 200 });
    }
    const m = url.match(/id=([^&]+)/);
    if (m) deletedIds.push(decodeURIComponent(m[1]));
    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;

  const out = await manager.unsubscribeBridgeEvents(bridge, { fetch: stubFetch });
  assert.equal(out.deleted, 3);
  assert.equal(out.failed.length, 0);
  assert.deepEqual(deletedIds.sort(), ['sub-channel.cheer', 'sub-channel.follow', 'sub-channel.subscribe']);
  assert.equal(db.listTwitchEventSubscriptionsForChannel(user.id, '42').length, 0);
});

test('manager.findBridgeForEvent: resolves via channel id; raid uses to_channel id', async () => {
  const { manager, db } = await loadModules();
  const user = await seedUser(db);
  await seedTwitchLink(user.id, '42');
  await seedBridge(user.id, 'streamer', '!den:bmc');
  // Subscription row that links Twitch user 42 → this user's bridge.
  db.createTwitchEventSubscription({
    id: randomUUID(),
    blackoutUserId: user.id,
    twitchUserId: '42',
    subscriptionType: 'channel.follow',
    helixSubscriptionId: 'sub-fol',
    status: 'enabled',
  });

  const followBridge = manager.findBridgeForEvent({
    kind: 'follow',
    subscriptionType: 'channel.follow',
    twitchChannelId: '42',
    followerLogin: 'x',
    followerTwitchId: 'y',
    followedAt: 'z',
  });
  assert.ok(followBridge);
  assert.equal(followBridge!.matrixRoomId, '!den:bmc');

  const raidBridge = manager.findBridgeForEvent({
    kind: 'raid',
    subscriptionType: 'channel.raid',
    fromChannelId: '999',
    fromChannelLogin: 'someone',
    toChannelId: '42',
    viewers: 5,
  });
  assert.ok(raidBridge);

  const unknownBridge = manager.findBridgeForEvent({
    kind: 'follow',
    subscriptionType: 'channel.follow',
    twitchChannelId: '999',
    followerLogin: 'x',
    followerTwitchId: 'y',
    followedAt: 'z',
  });
  assert.equal(unknownBridge, null);
});

// =============================================================================
// route default forwarder
// =============================================================================

test('route default forwarder: notification → m.room.message into the bridged Matrix room', async () => {
  const { route, db } = await loadModules();
  const user = await seedUser(db);
  await seedTwitchLink(user.id, '42');
  await seedBridge(user.id, 'streamer', '!den:bmc');
  db.createTwitchEventSubscription({
    id: randomUUID(),
    blackoutUserId: user.id,
    twitchUserId: '42',
    subscriptionType: 'channel.follow',
    helixSubscriptionId: 'sub-fol',
    status: 'enabled',
  });

  const matrixCalls: Array<{ roomId: string; content: Record<string, unknown> }> = [];
  const matrixClient = {
    sendEvent: async (
      roomId: string,
      content: Record<string, unknown>,
    ): Promise<{ ok: boolean; status?: number }> => {
      matrixCalls.push({ roomId, content });
      return { ok: true, status: 200 };
    },
  };

  const router = route.buildTwitchEventSubRoute({ matrixClient });
  const messageId = 'm-1';
  const ts = new Date().toISOString();
  const body = JSON.stringify({
    subscription: {
      id: 'sub-fol',
      type: 'channel.follow',
      version: '2',
      status: 'enabled',
      cost: 0,
      condition: { broadcaster_user_id: '42' },
      created_at: ts,
    },
    event: {
      user_id: '99',
      user_login: 'follower',
      user_name: 'Follower',
      broadcaster_user_id: '42',
      followed_at: ts,
    },
  });
  const res = await router.fetch(
    new Request('http://x/', {
      method: 'POST',
      body,
      headers: {
        'twitch-eventsub-message-id': messageId,
        'twitch-eventsub-message-timestamp': ts,
        'twitch-eventsub-message-signature': sign(messageId, ts, body),
        'twitch-eventsub-message-type': 'notification',
        'twitch-eventsub-subscription-type': 'channel.follow',
      },
    }),
  );
  assert.equal(res.status, 200);
  assert.equal(matrixCalls.length, 1);
  assert.equal(matrixCalls[0].roomId, '!den:bmc');
  assert.equal(matrixCalls[0].content['m.blackout.origin'], 'twitch');
  assert.equal(matrixCalls[0].content['m.blackout.alert_kind'], 'follow');
  assert.match(String(matrixCalls[0].content.body), /Follower just followed/);
});

test('route default forwarder: no bridge for the event → no Matrix send, ack 200', async () => {
  const { route } = await loadModules();
  // No seed bridges or subscriptions in DB.
  let calls = 0;
  const matrixClient = {
    sendEvent: async () => {
      calls += 1;
      return { ok: true, status: 200 };
    },
  };
  const router = route.buildTwitchEventSubRoute({ matrixClient });
  const messageId = 'm-2';
  const ts = new Date().toISOString();
  const body = JSON.stringify({
    subscription: {
      id: 'sub-orphan',
      type: 'channel.follow',
      version: '2',
      status: 'enabled',
      cost: 0,
      condition: {},
      created_at: ts,
    },
    event: {
      user_id: '99',
      user_login: 'follower',
      broadcaster_user_id: '999',
      followed_at: ts,
    },
  });
  const res = await router.fetch(
    new Request('http://x/', {
      method: 'POST',
      body,
      headers: {
        'twitch-eventsub-message-id': messageId,
        'twitch-eventsub-message-timestamp': ts,
        'twitch-eventsub-message-signature': sign(messageId, ts, body),
        'twitch-eventsub-message-type': 'notification',
        'twitch-eventsub-subscription-type': 'channel.follow',
      },
    }),
  );
  assert.equal(res.status, 200);
  assert.equal(calls, 0);
});
