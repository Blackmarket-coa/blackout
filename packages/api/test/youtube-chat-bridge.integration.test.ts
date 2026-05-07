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
process.env.YOUTUBE_CLIENT_ID = 'test-yt-client';
process.env.YOUTUBE_CLIENT_SECRET = 'test-yt-secret';
process.env.YOUTUBE_OAUTH_REDIRECT_URI = 'http://localhost:3000/oauth/youtube/callback';

const VALID_CHANNEL_ID = 'UCabcdefghijklmnopqrstuv'; // UC + 22 chars

const loadModules = async () => {
  const api = await import('../src/integrations/youtube/api');
  const chatBridge = await import('../src/integrations/youtube/chatBridge');
  const service = await import('../src/services/youtubeChatBridge');
  const scheduler = await import('../src/services/youtubeChatBridgeScheduler');
  const oauth = await import('../src/integrations/youtube/oauth');
  const widgetBus = await import('../src/services/widgetBus');
  const secretBox = await import('../src/services/secretBox');
  const store = await import('../src/db/store');
  oauth.clearYoutubeOAuthConfigCache();
  secretBox.clearSecretBoxConfigCache();
  widgetBus.clearAllSubscribersForTest();
  scheduler.stopYoutubeChatScheduler();
  store.db.linkedAccounts.clear();
  store.db.youtubeChatBridges.clear();
  return { api, chatBridge, service, scheduler, db: store.db };
};

const seedUser = async (db: Awaited<ReturnType<typeof loadModules>>['db']) => {
  const auth = await import('../src/services/auth');
  const id = randomUUID();
  db.createUser({
    id,
    username: `yt-${id.slice(0, 4)}`,
    email: `yt-${id.slice(0, 4)}@example.com`,
    passwordHash: auth.hashPassword('Original-Pass-1234!'),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  return db.getUserById(id)!;
};

const seedYoutubeLink = async (blackoutUserId: string) => {
  const linkedAccounts = await import('../src/services/linkedAccounts');
  return linkedAccounts.upsertLinkedAccount({
    blackoutUserId,
    provider: 'youtube',
    providerUserId: 'google-sub-12345',
    providerUsername: 'TestStreamer',
    tokens: { accessToken: 'yt-access', refreshToken: 'yt-r', expiresInSeconds: 3600, scopes: [] },
  });
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

// =============================================================================
// API client
// =============================================================================

test('youtube/api findActiveLiveBroadcast: bearer-auth GET /liveBroadcasts; returns first item with liveChatId', async () => {
  const { api } = await loadModules();
  const stubFetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    assert.match(url, /^https:\/\/www\.googleapis\.com\/youtube\/v3\/liveBroadcasts\?/);
    assert.match(url, /broadcastStatus=active/);
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers?.authorization, 'Bearer test-token');
    return new Response(
      JSON.stringify({
        items: [
          { id: 'b1', snippet: { title: 'Stream', liveChatId: 'lc-abc' } },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof fetch;
  const out = await api.findActiveLiveBroadcast('test-token', { fetch: stubFetch });
  assert.equal(out.kind, 'ok');
  if (out.kind === 'ok') {
    assert.equal(out.broadcast?.snippet.liveChatId, 'lc-abc');
  }
});

test('youtube/api findActiveLiveBroadcast: returns null when no broadcast has a liveChatId', async () => {
  const { api } = await loadModules();
  const stubFetch: typeof fetch = (async () =>
    new Response(JSON.stringify({ items: [{ id: 'b1', snippet: {} }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
  const out = await api.findActiveLiveBroadcast('t', { fetch: stubFetch });
  assert.equal(out.kind, 'ok');
  if (out.kind === 'ok') assert.equal(out.broadcast, null);
});

test('youtube/api findActiveLiveBroadcast: 403 + quotaExceeded → rate_limited', async () => {
  const { api } = await loadModules();
  const stubFetch: typeof fetch = (async () =>
    new Response('{"error":"quotaExceeded"}', { status: 403 })) as unknown as typeof fetch;
  const out = await api.findActiveLiveBroadcast('t', { fetch: stubFetch });
  assert.equal(out.kind, 'rate_limited');
});

test('youtube/api listLiveChatMessages: passes liveChatId + pageToken; parses items + cursor', async () => {
  const { api } = await loadModules();
  const stubFetch: typeof fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    assert.match(url, /\/liveChat\/messages\?/);
    assert.match(url, /liveChatId=lc-abc/);
    assert.match(url, /pageToken=ptok-1/);
    return new Response(
      JSON.stringify({
        items: [
          {
            id: 'm-1',
            snippet: {
              type: 'textMessageEvent',
              publishedAt: '2026-05-07T00:00:00Z',
              displayMessage: 'hi',
            },
            authorDetails: { channelId: 'UC-author', displayName: 'Alice' },
          },
        ],
        nextPageToken: 'ptok-2',
        pollingIntervalMillis: 5000,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof fetch;
  const out = await api.listLiveChatMessages('t', {
    liveChatId: 'lc-abc',
    pageToken: 'ptok-1',
    fetch: stubFetch,
  });
  assert.equal(out.kind, 'ok');
  if (out.kind === 'ok') {
    assert.equal(out.page.items.length, 1);
    assert.equal(out.page.nextPageToken, 'ptok-2');
    assert.equal(out.page.pollingIntervalMillis, 5000);
  }
});

// =============================================================================
// chatBridge: normalize + Matrix mapping
// =============================================================================

test('chatBridge.toNormalizedYoutubeChatMessage: text message extracts displayMessage + author flags', async () => {
  const { chatBridge } = await loadModules();
  const out = chatBridge.toNormalizedYoutubeChatMessage(
    {
      id: 'm-1',
      snippet: {
        type: 'textMessageEvent',
        publishedAt: '2026-05-07T00:00:00.000Z',
        displayMessage: 'hello',
      },
      authorDetails: {
        channelId: 'UC-author',
        displayName: 'Alice',
        profileImageUrl: 'https://yt.com/alice.png',
        isChatOwner: false,
        isChatModerator: true,
        isChatSponsor: true,
        isVerified: false,
      },
    },
    'UC-broadcaster',
  );
  assert.equal(out.origin, 'youtube');
  assert.equal(out.body, 'hello');
  assert.equal(out.channel, 'UC-broadcaster');
  assert.equal(out.authorChannelId, 'UC-author');
  assert.equal(out.isModerator, true);
  assert.equal(out.isSponsor, true);
  assert.equal(out.isOwner, false);
});

test('chatBridge.toNormalizedYoutubeChatMessage: superChat extracts userComment + amount', async () => {
  const { chatBridge } = await loadModules();
  const out = chatBridge.toNormalizedYoutubeChatMessage(
    {
      id: 'm-2',
      snippet: {
        type: 'superChatEvent',
        publishedAt: '2026-05-07T00:00:00.000Z',
        superChatDetails: {
          amountDisplayString: '$5.00',
          userComment: 'wow!',
          tier: 1,
        },
      },
      authorDetails: { channelId: 'UC-fan', displayName: 'Fan' },
    },
    'UC-broadcaster',
  );
  assert.equal(out.body, 'wow!');
  assert.equal(out.snippetType, 'superChatEvent');
  assert.equal(out.superChatAmountDisplay, '$5.00');
});

test('chatBridge.toMatrixForwardedMessage: builds m.room.message content with HTML-escaped body + origin metadata', async () => {
  const { chatBridge } = await loadModules();
  const m = chatBridge.toMatrixForwardedMessage({
    origin: 'youtube',
    channel: 'UC-broadcaster',
    authorChannelId: 'UC-fan',
    authorDisplayName: '<script>x</script>',
    body: '<img onerror=alert(1)>',
    isOwner: false,
    isModerator: false,
    isSponsor: false,
    isVerified: false,
    platformMessageId: 'msg-id',
    sentAtMs: 1700000000000,
    snippetType: 'textMessageEvent',
  });
  assert.equal(m.msgtype, 'm.text');
  assert.equal(m['m.blackout.origin'], 'youtube');
  assert.equal(m['m.blackout.origin_message_id'], 'msg-id');
  // HTML escaping covers both display name AND body.
  assert.match(m.formatted_body, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.match(m.formatted_body, /&lt;img onerror=alert\(1\)&gt;/);
});

test('chatBridge.toMatrixForwardedMessage: superChat is m.notice with amount metadata', async () => {
  const { chatBridge } = await loadModules();
  const m = chatBridge.toMatrixForwardedMessage({
    origin: 'youtube',
    channel: 'UC-b',
    authorChannelId: 'UC-fan',
    authorDisplayName: 'Fan',
    body: 'wow',
    isOwner: false,
    isModerator: false,
    isSponsor: false,
    isVerified: false,
    platformMessageId: 'm',
    sentAtMs: 0,
    snippetType: 'superChatEvent',
    superChatAmountDisplay: '$5.00',
  });
  assert.equal(m.msgtype, 'm.notice');
  assert.equal(m['m.blackout.origin_snippet_type'], 'superChatEvent');
  assert.equal(m['m.blackout.origin_superchat_amount_display'], '$5.00');
});

// =============================================================================
// service: createBridge / deleteBridge
// =============================================================================

test('service.createBridge: invalid YouTube channel id is rejected', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);
  await seedYoutubeLink(user.id);
  const out = service.createBridge({
    blackoutUserId: user.id,
    youtubeChannelId: 'not-a-channel',
    matrixRoomId: '!room:srv',
  });
  assert.equal(out.kind, 'invalid_input');
});

test('service.createBridge: rejects when YouTube is not linked', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);
  // No seedYoutubeLink.
  const out = service.createBridge({
    blackoutUserId: user.id,
    youtubeChannelId: VALID_CHANNEL_ID,
    matrixRoomId: '!room:srv',
  });
  assert.equal(out.kind, 'youtube_not_linked');
});

test('service.createBridge: idempotent on (user, channel, room); conflict on different room', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);
  await seedYoutubeLink(user.id);
  const a = service.createBridge({
    blackoutUserId: user.id,
    youtubeChannelId: VALID_CHANNEL_ID,
    matrixRoomId: '!a:srv',
  });
  const b = service.createBridge({
    blackoutUserId: user.id,
    youtubeChannelId: VALID_CHANNEL_ID,
    matrixRoomId: '!a:srv',
  });
  assert.equal(a.kind, 'ok');
  assert.equal(b.kind, 'ok');
  if (a.kind === 'ok' && b.kind === 'ok') assert.equal(a.record.id, b.record.id);

  const conflict = service.createBridge({
    blackoutUserId: user.id,
    youtubeChannelId: VALID_CHANNEL_ID,
    matrixRoomId: '!b:srv',
  });
  assert.equal(conflict.kind, 'already_bridged');
  assert.equal(db.listYoutubeChatBridgesForUser(user.id).length, 1);
});

test('service.deleteBridge: forbidden when one user deletes another\'s bridge', async () => {
  const { service, db } = await loadModules();
  const alice = await seedUser(db);
  await seedYoutubeLink(alice.id);
  const bob = await seedUser(db);
  const created = service.createBridge({
    blackoutUserId: alice.id,
    youtubeChannelId: VALID_CHANNEL_ID,
    matrixRoomId: '!a:srv',
  });
  if (created.kind !== 'ok') return assert.fail();
  const out = service.deleteBridge(bob.id, created.record.id);
  assert.equal(out.kind, 'forbidden');
});

// =============================================================================
// service: syncBridge end-to-end
// =============================================================================

test('service.syncBridge: pulls broadcast → messages → forwards into Matrix; advances cursor', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);
  await seedYoutubeLink(user.id);
  const created = service.createBridge({
    blackoutUserId: user.id,
    youtubeChannelId: VALID_CHANNEL_ID,
    matrixRoomId: '!den:srv',
  });
  if (created.kind !== 'ok') return assert.fail();

  const { matrixClient, calls } = buildFakeMatrix();
  const stubFetch: typeof fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/liveBroadcasts')) {
      return new Response(
        JSON.stringify({
          items: [{ id: 'b1', snippet: { liveChatId: 'lc-abc' } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.includes('/liveChat/messages')) {
      assert.match(url, /liveChatId=lc-abc/);
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'msg-1',
              snippet: {
                type: 'textMessageEvent',
                publishedAt: '2026-05-07T00:00:00Z',
                displayMessage: 'hello world',
              },
              authorDetails: { channelId: 'UC-author', displayName: 'Alice' },
            },
          ],
          nextPageToken: 'cursor-after-msg-1',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    assert.fail(`unexpected URL: ${url}`);
  }) as unknown as typeof fetch;

  const outcome = await service.syncBridge(created.record, { matrixClient, fetch: stubFetch });
  assert.equal(outcome.kind, 'ok');
  if (outcome.kind === 'ok') {
    assert.equal(outcome.messages, 1);
    assert.equal(outcome.delivered, 1);
    assert.equal(outcome.nextPageToken, 'cursor-after-msg-1');
  }

  // Matrix received the message into the bridge's room.
  assert.equal(calls.length, 1);
  assert.equal(calls[0].roomId, '!den:srv');
  assert.equal(calls[0].content['m.blackout.origin'], 'youtube');
  assert.equal(calls[0].content['m.blackout.origin_message_id'], 'msg-1');

  // Cursor was persisted on linked_accounts.
  assert.equal(
    db.getLinkedAccount(user.id, 'youtube')?.syncCursor,
    'cursor-after-msg-1',
  );
});

test('service.syncBridge: no_active_broadcast when YouTube returns no live broadcast', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);
  await seedYoutubeLink(user.id);
  const created = service.createBridge({
    blackoutUserId: user.id,
    youtubeChannelId: VALID_CHANNEL_ID,
    matrixRoomId: '!den:srv',
  });
  if (created.kind !== 'ok') return assert.fail();
  const { matrixClient } = buildFakeMatrix();
  const stubFetch: typeof fetch = (async () =>
    new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
  const outcome = await service.syncBridge(created.record, { matrixClient, fetch: stubFetch });
  assert.equal(outcome.kind, 'no_active_broadcast');
});

// =============================================================================
// scheduler
// =============================================================================

test('scheduler.runYoutubePoll: walks every active bridge; one no_active_broadcast does not block another', async () => {
  const { service, scheduler, db } = await loadModules();
  const alice = await seedUser(db);
  const bob = await seedUser(db);
  await seedYoutubeLink(alice.id);
  await seedYoutubeLink(bob.id);
  service.createBridge({
    blackoutUserId: alice.id,
    youtubeChannelId: VALID_CHANNEL_ID,
    matrixRoomId: '!a:srv',
  });
  service.createBridge({
    blackoutUserId: bob.id,
    youtubeChannelId: 'UCanotherchannelidxxxxxxxx',
    matrixRoomId: '!b:srv',
  });
  const { matrixClient } = buildFakeMatrix();

  let liveBroadcastCalls = 0;
  const stubFetch: typeof fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/liveBroadcasts')) {
      liveBroadcastCalls += 1;
      // First user has no active broadcast; second has one.
      if (liveBroadcastCalls === 1) {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({ items: [{ id: 'b1', snippet: { liveChatId: 'lc-2' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(
      JSON.stringify({
        items: [
          {
            id: 'msg-x',
            snippet: { type: 'textMessageEvent', publishedAt: '2026-05-07T00:00:00Z', displayMessage: 'hi' },
            authorDetails: { channelId: 'UC-x', displayName: 'X' },
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof fetch;

  const result = await scheduler.runYoutubePoll({ matrixClient, fetch: stubFetch });
  assert.equal(result.inspected, 2);
  assert.equal(result.noActiveBroadcast, 1);
  assert.equal(result.delivered, 1, 'second user still delivered');
});

test('scheduler.start/stop: idempotent + restartable', async () => {
  const { scheduler } = await loadModules();
  assert.equal(scheduler.isYoutubeChatSchedulerRunning(), false);
  const a = scheduler.startYoutubeChatScheduler(60_000);
  const b = scheduler.startYoutubeChatScheduler(60_000);
  assert.equal(a.stop, b.stop);
  a.stop();
  assert.equal(scheduler.isYoutubeChatSchedulerRunning(), false);
  const c = scheduler.startYoutubeChatScheduler(60_000);
  c.stop();
});

// =============================================================================
// outbound: sendBridgeMessage / liveChatMessages.insert
// =============================================================================

test('api.insertLiveChatMessage: POSTs textMessageEvent with the right body shape', async () => {
  const { api } = await loadModules();
  const stubFetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    assert.match(url, /\/youtube\/v3\/liveChat\/messages\?part=snippet$/);
    assert.equal(init?.method, 'POST');
    const body = JSON.parse(String(init?.body ?? '{}'));
    assert.equal(body.snippet.type, 'textMessageEvent');
    assert.equal(body.snippet.liveChatId, 'lc-abc');
    assert.equal(body.snippet.textMessageDetails.messageText, 'hello');
    return new Response(JSON.stringify({ id: 'inserted-1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  const out = await api.insertLiveChatMessage('tok', {
    liveChatId: 'lc-abc',
    body: 'hello',
    fetch: stubFetch,
  });
  assert.equal(out.kind, 'ok');
  if (out.kind === 'ok') assert.equal(out.messageId, 'inserted-1');
});

test('service.sendBridgeMessage: resolves liveChatId then inserts; returns ok', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);
  await seedYoutubeLink(user.id);
  const created = service.createBridge({
    blackoutUserId: user.id,
    youtubeChannelId: VALID_CHANNEL_ID,
    matrixRoomId: '!den:srv',
  });
  if (created.kind !== 'ok') return assert.fail();

  let insertCalled = false;
  const stubFetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/liveBroadcasts')) {
      return new Response(
        JSON.stringify({ items: [{ id: 'b1', snippet: { liveChatId: 'lc-out' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.includes('/liveChat/messages')) {
      assert.equal(init?.method, 'POST');
      const body = JSON.parse(String(init?.body ?? '{}'));
      assert.equal(body.snippet.liveChatId, 'lc-out');
      assert.equal(body.snippet.textMessageDetails.messageText, 'hello chat');
      insertCalled = true;
      return new Response(JSON.stringify({ id: 'msg-out' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    assert.fail(`unexpected URL: ${url}`);
  }) as unknown as typeof fetch;

  const out = await service.sendBridgeMessage(created.record, 'hello chat', { fetch: stubFetch });
  assert.equal(out.kind, 'ok');
  assert.equal(insertCalled, true);
});

test('service.sendBridgeMessage: empty body / whitespace-only → invalid_body', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);
  await seedYoutubeLink(user.id);
  const created = service.createBridge({
    blackoutUserId: user.id,
    youtubeChannelId: VALID_CHANNEL_ID,
    matrixRoomId: '!d:srv',
  });
  if (created.kind !== 'ok') return assert.fail();
  for (const body of ['', '   ', '\n\n']) {
    const out = await service.sendBridgeMessage(created.record, body);
    assert.equal(out.kind, 'invalid_body', `body=${JSON.stringify(body)}`);
  }
});

test('service.sendBridgeMessage: truncates bodies past YouTube\'s 200-char cap', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);
  await seedYoutubeLink(user.id);
  const created = service.createBridge({
    blackoutUserId: user.id,
    youtubeChannelId: VALID_CHANNEL_ID,
    matrixRoomId: '!d:srv',
  });
  if (created.kind !== 'ok') return assert.fail();
  let sentBody = '';
  const stubFetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/liveBroadcasts')) {
      return new Response(
        JSON.stringify({ items: [{ id: 'b1', snippet: { liveChatId: 'lc' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    sentBody = JSON.parse(String(init?.body)).snippet.textMessageDetails.messageText;
    return new Response(JSON.stringify({ id: 'm' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  await service.sendBridgeMessage(created.record, 'x'.repeat(500), { fetch: stubFetch });
  assert.equal(sentBody.length, 200, 'body truncated to 200 chars');
});

test('service.sendBridgeMessage: no_active_broadcast when YT returns no items', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);
  await seedYoutubeLink(user.id);
  const created = service.createBridge({
    blackoutUserId: user.id,
    youtubeChannelId: VALID_CHANNEL_ID,
    matrixRoomId: '!d:srv',
  });
  if (created.kind !== 'ok') return assert.fail();
  const stubFetch: typeof fetch = (async () =>
    new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
  const out = await service.sendBridgeMessage(created.record, 'hi', { fetch: stubFetch });
  assert.equal(out.kind, 'no_active_broadcast');
});

test('service.sendBridgeMessage: strips CR/LF defensively', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);
  await seedYoutubeLink(user.id);
  const created = service.createBridge({
    blackoutUserId: user.id,
    youtubeChannelId: VALID_CHANNEL_ID,
    matrixRoomId: '!d:srv',
  });
  if (created.kind !== 'ok') return assert.fail();
  let sentBody = '';
  const stubFetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/liveBroadcasts')) {
      return new Response(
        JSON.stringify({ items: [{ id: 'b1', snippet: { liveChatId: 'lc' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    sentBody = JSON.parse(String(init?.body)).snippet.textMessageDetails.messageText;
    return new Response(JSON.stringify({ id: 'm' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  await service.sendBridgeMessage(created.record, 'hi\r\nthere', { fetch: stubFetch });
  assert.equal(sentBody, 'hi there');
});

test('service.syncBridge: a YouTube SuperChat message dispatches cheer.received in addition to chat.message.received', async () => {
  const { service, db } = await loadModules();
  const user = await seedUser(db);
  await seedYoutubeLink(user.id);
  const created = service.createBridge({
    blackoutUserId: user.id,
    youtubeChannelId: VALID_CHANNEL_ID,
    matrixRoomId: '!den:srv',
  });
  if (created.kind !== 'ok') return assert.fail();

  // Register an outbound webhook subscribing to BOTH event types so we
  // can assert exactly two deliveries fire from this one SuperChat.
  const outbound = await import('../src/services/outboundEventWebhooks');
  const sub = outbound.register({
    blackoutUserId: user.id,
    name: 'cheers',
    targetUrl: 'https://example.com/hook',
    eventTypes: ['cheer.received', 'chat.message.received'],
  });
  if (sub.kind !== 'ok') return assert.fail();

  const outboundCalls: Array<{ url: string; body: string }> = [];
  const originalFetch = globalThis.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.fetch = (async (url: any, init: any) => {
    outboundCalls.push({ url: String(url), body: String(init?.body ?? '') });
    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;

  const { matrixClient } = buildFakeMatrix();
  const stubFetch: typeof fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/liveBroadcasts')) {
      return new Response(
        JSON.stringify({ items: [{ id: 'b1', snippet: { liveChatId: 'lc-sc' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.includes('/liveChat/messages')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'sc-msg-1',
              snippet: {
                type: 'superChatEvent',
                publishedAt: '2026-05-07T00:00:00Z',
                superChatDetails: {
                  amountDisplayString: '$5.00',
                  userComment: 'great stream',
                },
              },
              authorDetails: { channelId: 'UC-author', displayName: 'Big Fan' },
            },
          ],
          nextPageToken: 'cursor-after-sc-1',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    assert.fail(`unexpected URL: ${url}`);
  }) as unknown as typeof fetch;

  try {
    const outcome = await service.syncBridge(created.record, { matrixClient, fetch: stubFetch });
    assert.equal(outcome.kind, 'ok');
    // Outbound delivery is fire-and-forget — give microtasks a chance.
    for (let i = 0; i < 30 && outboundCalls.length < 2; i++) {
      await new Promise((r) => setImmediate(r));
    }
    assert.equal(
      outboundCalls.length,
      2,
      'SuperChat fires both chat.message.received and cheer.received',
    );
    const titles = outboundCalls
      .map((c) => JSON.parse(c.body).embeds[0].title)
      .sort();
    assert.deepEqual(titles, ['Chat message', 'Cheer / Bits']);

    // The cheer.received delivery carries the SuperChat amount.
    const cheerBody = outboundCalls
      .map((c) => JSON.parse(c.body))
      .find((b) => b.embeds[0].title === 'Cheer / Bits');
    const cheerField = (n: string) =>
      cheerBody.embeds[0].fields.find((f: { name: string }) => f.name === n)?.value;
    assert.equal(cheerField('superChatAmountDisplay'), '$5.00');
    assert.equal(cheerField('source'), 'youtube');
    assert.equal(cheerField('snippetType'), 'superChatEvent');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
