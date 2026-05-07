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
  const ircParser = await import('../src/integrations/twitch/ircParser');
  const chatBridge = await import('../src/integrations/twitch/chatBridge');
  const chatIngress = await import('../src/integrations/twitch/chatIngress');
  const store = await import('../src/db/store');
  secretBox.clearSecretBoxConfigCache();
  // Clear any prior session state between tests.
  chatIngress.stopAllChatIngress();
  return { secretBox, linkedAccounts, ircParser, chatBridge, chatIngress, db: store.db };
};

const seedUser = async (db: Awaited<ReturnType<typeof loadModules>>['db']) => {
  const auth = await import('../src/services/auth');
  const id = randomUUID();
  db.createUser({
    id,
    username: `chat-${id.slice(0, 4)}`,
    email: `chat-${id.slice(0, 4)}@example.com`,
    passwordHash: auth.hashPassword('Original-Pass-1234!'),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  return db.getUserById(id)!;
};

// =============================================================================
// IRC parser
// =============================================================================

test('ircParser: parses a fully-tagged Twitch PRIVMSG', async () => {
  const { ircParser } = await loadModules();
  const line =
    '@badge-info=;badges=moderator/1;color=#1E90FF;display-name=Cory;' +
    'emotes=;flags=;id=abc-123;mod=1;room-id=42;subscriber=0;' +
    'tmi-sent-ts=1700000000000;turbo=0;user-id=99;user-type=mod ' +
    ':cory!cory@cory.tmi.twitch.tv PRIVMSG #blackoutdev :Kappa hello world';
  const parsed = ircParser.parseIrcLine(line);
  assert.ok(parsed);
  assert.equal(parsed!.command, 'PRIVMSG');
  assert.deepEqual(parsed!.params, ['#blackoutdev']);
  assert.equal(parsed!.trailing, 'Kappa hello world');
  assert.equal(parsed!.prefix?.nick, 'cory');
  assert.equal(parsed!.tags['display-name'], 'Cory');
  assert.equal(parsed!.tags.color, '#1E90FF');
  assert.equal(parsed!.tags.mod, '1');

  const event = ircParser.toPrivmsg(parsed!);
  assert.ok(event);
  assert.equal(event!.nick, 'cory');
  assert.equal(event!.displayName, 'Cory');
  assert.equal(event!.body, 'Kappa hello world');
  assert.equal(event!.isAction, false);
  assert.equal(event!.isMod, true);
  assert.equal(event!.isSubscriber, false);
  assert.equal(event!.bits, 0);
  assert.equal(event!.sentAtMs, 1700000000000);
  assert.equal(event!.messageId, 'abc-123');
});

test('ircParser: unescapes IRCv3 tag values (\\s, \\:, \\\\)', async () => {
  const { ircParser } = await loadModules();
  const parsed = ircParser.parseIrcLine(
    '@system-msg=Hello\\sworld;custom=key\\:value\\\\ok ' +
      ':tmi.twitch.tv USERNOTICE #c :body',
  );
  assert.ok(parsed);
  assert.equal(parsed!.tags['system-msg'], 'Hello world');
  assert.equal(parsed!.tags.custom, 'key;value\\ok');
});

test('ircParser: recognizes a /me action and strips the CTCP envelope', async () => {
  const { ircParser } = await loadModules();
  const ctcp = String.fromCharCode(1);
  const line = `:nick!nick@nick.tmi.twitch.tv PRIVMSG #c :${ctcp}ACTION waves${ctcp}`;
  const event = ircParser.toPrivmsg(ircParser.parseIrcLine(line)!);
  assert.ok(event);
  assert.equal(event!.isAction, true);
  assert.equal(event!.body, 'waves');
});

test('ircParser: PING is detected without a prefix', async () => {
  const { ircParser } = await loadModules();
  const parsed = ircParser.parseIrcLine('PING :tmi.twitch.tv');
  assert.ok(parsed);
  assert.equal(parsed!.command, 'PING');
  assert.equal(parsed!.trailing, 'tmi.twitch.tv');
  assert.equal(parsed!.prefix, undefined);
});

test('ircParser: parseIrcFrame splits a multi-line frame into per-line records', async () => {
  const { ircParser } = await loadModules();
  const frame =
    'PING :tmi.twitch.tv\r\n' +
    ':a!a@a PRIVMSG #c :hello\r\n' +
    ':b!b@b PRIVMSG #c :hi\r\n';
  const lines = ircParser.parseIrcFrame(frame);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].command, 'PING');
  assert.equal(lines[1].command, 'PRIVMSG');
  assert.equal(lines[2].command, 'PRIVMSG');
});

test('ircParser: tolerates malformed PRIVMSG (missing channel) without throwing', async () => {
  const { ircParser } = await loadModules();
  // No channel param.
  const parsed = ircParser.parseIrcLine(':a!a@a PRIVMSG :no channel');
  assert.ok(parsed);
  assert.equal(ircParser.toPrivmsg(parsed!), null);
});

test('ircParser: empty / non-string input returns null', async () => {
  const { ircParser } = await loadModules();
  assert.equal(ircParser.parseIrcLine(''), null);
  assert.equal(ircParser.parseIrcLine('\r\n'), null);
  assert.equal(ircParser.parseIrcLine(undefined as unknown as string), null);
});

// =============================================================================
// chatBridge mapper
// =============================================================================

test('chatBridge: toNormalizedMessage preserves all PRIVMSG fields and parses badges', async () => {
  const { ircParser, chatBridge } = await loadModules();
  const event = ircParser.toPrivmsg(
    ircParser.parseIrcLine(
      '@badges=moderator/1,subscriber/12;display-name=Bob;color=#FF0000;' +
        'mod=1;subscriber=1;bits=500;id=msg-1;tmi-sent-ts=1700000000000;user-id=42 ' +
        ':bob!bob@bob.tmi.twitch.tv PRIVMSG #channel :hello cheer500',
    )!,
  )!;
  const normalized = chatBridge.toNormalizedMessage(event);
  assert.equal(normalized.origin, 'twitch');
  assert.equal(normalized.channel, 'channel');
  assert.equal(normalized.authorLogin, 'bob');
  assert.equal(normalized.authorDisplayName, 'Bob');
  assert.equal(normalized.authorPlatformId, '42');
  assert.equal(normalized.authorColor, '#FF0000');
  assert.deepEqual(normalized.badges, [
    { name: 'moderator', version: '1' },
    { name: 'subscriber', version: '12' },
  ]);
  assert.equal(normalized.bits, 500);
  assert.equal(normalized.isMod, true);
  assert.equal(normalized.isSubscriber, true);
});

test('chatBridge: toMatrixForwardedMessage sets the m.blackout.* origin fields and HTML-escapes the body', async () => {
  const { chatBridge } = await loadModules();
  const m = chatBridge.toMatrixForwardedMessage({
    origin: 'twitch',
    channel: 'gamer',
    authorLogin: 'attacker',
    authorDisplayName: '<img onerror=alert(1)>',
    badges: [],
    body: '<script>x</script>',
    isAction: false,
    isMod: false,
    isSubscriber: false,
    bits: 0,
    sentAtMs: 1700000000000,
  });
  assert.equal(m['m.blackout.origin'], 'twitch');
  assert.equal(m['m.blackout.origin_channel'], 'gamer');
  assert.equal(m['m.blackout.origin_user'].login, 'attacker');
  // HTML body must escape both the display name AND the message body.
  assert.match(m.formatted_body!, /&lt;img onerror=alert\(1\)&gt;/);
  assert.match(m.formatted_body!, /&lt;script&gt;x&lt;\/script&gt;/);
  // Plaintext fallback is unescaped (Matrix clients render m.text as text).
  assert.match(m.body, /<script>x<\/script>/);
  assert.equal(m.msgtype, 'm.text');
});

test('chatBridge: /me actions become m.emote', async () => {
  const { chatBridge } = await loadModules();
  const m = chatBridge.toMatrixForwardedMessage({
    origin: 'twitch',
    channel: 'c',
    authorLogin: 'a',
    badges: [],
    body: 'waves',
    isAction: true,
    isMod: false,
    isSubscriber: false,
    bits: 0,
    sentAtMs: 0,
  });
  assert.equal(m.msgtype, 'm.emote');
});

test('chatBridge: cheers carry m.blackout.origin_bits when bits > 0', async () => {
  const { chatBridge } = await loadModules();
  const cheer = chatBridge.toMatrixForwardedMessage({
    origin: 'twitch',
    channel: 'c',
    authorLogin: 'a',
    badges: [],
    body: 'cheer100',
    isAction: false,
    isMod: false,
    isSubscriber: false,
    bits: 100,
    sentAtMs: 0,
  });
  const noCheer = chatBridge.toMatrixForwardedMessage({
    origin: 'twitch',
    channel: 'c',
    authorLogin: 'a',
    badges: [],
    body: 'hi',
    isAction: false,
    isMod: false,
    isSubscriber: false,
    bits: 0,
    sentAtMs: 0,
  });
  assert.equal(cheer['m.blackout.origin_bits'], 100);
  assert.equal(noCheer['m.blackout.origin_bits'], undefined);
});

// =============================================================================
// Connection lifecycle (mock WebSocket)
// =============================================================================

interface FakeSocketAPI {
  sentLines: string[];
  emitOpen(): void;
  emitMessage(data: string): void;
  emitClose(code?: number): void;
  emitError(err: unknown): void;
  closed: boolean;
}

const buildFakeSocketFactory = (): { factory: typeof import('../src/integrations/twitch/chatIngress').IrcSocketFactory; api: FakeSocketAPI } => {
  type Listeners = {
    open: Array<() => void>;
    message: Array<(event: { data: string | Buffer }) => void>;
    close: Array<(event: { code: number; reason: string }) => void>;
    error: Array<(event: unknown) => void>;
  };
  const listeners: Listeners = { open: [], message: [], close: [], error: [] };
  const sentLines: string[] = [];
  let closed = false;
  const api: FakeSocketAPI = {
    sentLines,
    emitOpen: () => {
      for (const l of listeners.open) l();
    },
    emitMessage: (data) => {
      for (const l of listeners.message) l({ data });
    },
    emitClose: (code = 1006) => {
      closed = true;
      for (const l of listeners.close) l({ code, reason: 'mock' });
    },
    emitError: (err) => {
      for (const l of listeners.error) l(err);
    },
    get closed() {
      return closed;
    },
  };
  const factory = (() => ({
    send: (data: string) => sentLines.push(data),
    close: () => {
      closed = true;
      for (const l of listeners.close) l({ code: 1000, reason: 'shutdown' });
    },
    addEventListener: (type: keyof Listeners, listener: (e: never) => void) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (listeners[type] as Array<(e: any) => void>).push(listener);
    },
  })) as unknown as typeof import('../src/integrations/twitch/chatIngress').IrcSocketFactory;
  return { factory, api };
};

const seedTwitchLink = async (
  userId: string,
  expiresInSeconds = 3600,
) => {
  const { linkedAccounts } = await loadModules();
  return linkedAccounts.upsertLinkedAccount({
    blackoutUserId: userId,
    provider: 'twitch',
    providerUserId: '11223344',
    providerUsername: 'StreamerBob',
    tokens: {
      accessToken: 'live-access-token',
      refreshToken: 'live-refresh-token',
      expiresInSeconds,
      scopes: ['chat:read'],
    },
  });
};

test('chatIngress: startChatIngress sends CAP REQ + PASS oauth: + NICK + JOIN on open', async () => {
  const { chatIngress, db } = await loadModules();
  const user = await seedUser(db);
  await seedTwitchLink(user.id);
  const { factory, api } = buildFakeSocketFactory();

  const handle = await chatIngress.startChatIngress({
    blackoutUserId: user.id,
    twitchChannel: 'BlackoutDev',
    onMessage: () => {},
    socketFactory: factory,
  });

  api.emitOpen();
  // CAP REQ should be the first frame, with all three required capabilities.
  assert.match(api.sentLines[0], /^CAP REQ :twitch\.tv\/tags twitch\.tv\/commands twitch\.tv\/membership\r\n$/);
  assert.match(api.sentLines[1], /^PASS oauth:live-access-token\r\n$/);
  // NICK is the linked username, lowercased.
  assert.match(api.sentLines[2], /^NICK streamerbob\r\n$/);

  // Server welcomes us → we send JOIN.
  api.emitMessage(':tmi.twitch.tv 001 streamerbob :Welcome\r\n');
  assert.ok(api.sentLines.some((l) => l === 'JOIN #blackoutdev\r\n'));

  // JOIN echo from server transitions us to "connected" with reset attempts.
  api.emitMessage(':streamerbob!streamerbob@streamerbob.tmi.twitch.tv JOIN #blackoutdev\r\n');
  assert.equal(handle.state(), 'connected');
  assert.equal(handle.reconnectAttempts(), 0);
  handle.stop();
});

test('chatIngress: PRIVMSG forwards a normalized message to onMessage', async () => {
  const { chatIngress, db } = await loadModules();
  const user = await seedUser(db);
  await seedTwitchLink(user.id);
  const { factory, api } = buildFakeSocketFactory();

  const received: import('../src/integrations/twitch/chatBridge').NormalizedChatMessage[] = [];
  const handle = await chatIngress.startChatIngress({
    blackoutUserId: user.id,
    twitchChannel: 'gamer',
    onMessage: (msg) => received.push(msg),
    socketFactory: factory,
  });
  api.emitOpen();
  api.emitMessage(':tmi.twitch.tv 001 streamerbob :Welcome\r\n');
  api.emitMessage(
    '@display-name=Alice;mod=0;subscriber=1;color=#00FF00;tmi-sent-ts=1700000000000;user-id=7 ' +
      ':alice!alice@alice.tmi.twitch.tv PRIVMSG #gamer :hello there\r\n',
  );

  assert.equal(received.length, 1);
  assert.equal(received[0].body, 'hello there');
  assert.equal(received[0].authorDisplayName, 'Alice');
  assert.equal(received[0].channel, 'gamer');
  assert.equal(handle.messagesForwarded(), 1);
  handle.stop();
});

test('chatIngress: PING is answered with PONG using the same trailing target', async () => {
  const { chatIngress, db } = await loadModules();
  const user = await seedUser(db);
  await seedTwitchLink(user.id);
  const { factory, api } = buildFakeSocketFactory();

  const handle = await chatIngress.startChatIngress({
    blackoutUserId: user.id,
    twitchChannel: 'c',
    onMessage: () => {},
    socketFactory: factory,
  });
  api.emitOpen();
  api.emitMessage('PING :tmi.twitch.tv\r\n');
  assert.ok(api.sentLines.includes('PONG :tmi.twitch.tv\r\n'));
  handle.stop();
});

test('chatIngress: stop() closes the socket and removes the session', async () => {
  const { chatIngress, db } = await loadModules();
  const user = await seedUser(db);
  await seedTwitchLink(user.id);
  const { factory, api } = buildFakeSocketFactory();

  const handle = await chatIngress.startChatIngress({
    blackoutUserId: user.id,
    twitchChannel: 'c',
    onMessage: () => {},
    socketFactory: factory,
  });
  api.emitOpen();
  handle.stop();
  assert.equal(handle.state(), 'closed');
  assert.equal(api.closed, true);
  assert.equal(chatIngress.__test__.sessions.size, 0);
});

test('chatIngress: startChatIngress is idempotent for the same (user, channel)', async () => {
  const { chatIngress, db } = await loadModules();
  const user = await seedUser(db);
  await seedTwitchLink(user.id);
  const { factory } = buildFakeSocketFactory();

  const a = await chatIngress.startChatIngress({
    blackoutUserId: user.id,
    twitchChannel: 'c',
    onMessage: () => {},
    socketFactory: factory,
  });
  const b = await chatIngress.startChatIngress({
    blackoutUserId: user.id,
    twitchChannel: 'C', // case-insensitive
    onMessage: () => {},
    socketFactory: factory,
  });
  assert.equal(chatIngress.__test__.sessions.size, 1);
  assert.equal(a.twitchChannel, b.twitchChannel);
  a.stop();
});

test('chatIngress: missing linked account aborts the connect attempt', async () => {
  const { chatIngress, db } = await loadModules();
  const user = await seedUser(db);
  // No seedTwitchLink — user is not linked.
  let factoryCalls = 0;
  const { factory } = buildFakeSocketFactory();
  const wrappedFactory = ((url: string) => {
    factoryCalls += 1;
    return factory(url);
  }) as typeof factory;

  const handle = await chatIngress.startChatIngress({
    blackoutUserId: user.id,
    twitchChannel: 'c',
    onMessage: () => {},
    socketFactory: wrappedFactory,
    maxReconnects: 0,
  });
  // Auth fails → connect bails before opening a socket.
  assert.equal(factoryCalls, 0);
  assert.equal(handle.state(), 'closed');
});

// =============================================================================
// runHealthCheck — idle-detection + force-reconnect
// =============================================================================

test('runHealthCheck: force-closes a session that has been idle past the threshold', async () => {
  const { chatIngress, db } = await loadModules();
  const user = await seedUser(db);
  await seedTwitchLink(user.id);
  const { factory, api } = buildFakeSocketFactory();

  const FAKE_NOW = 1_700_000_000_000;
  const handle = await chatIngress.startChatIngress({
    blackoutUserId: user.id,
    twitchChannel: 'gamer',
    onMessage: () => {},
    socketFactory: factory,
    // Pin the clock the session uses for `lastEventAt`.
    now: () => FAKE_NOW,
  });
  api.emitOpen();
  api.emitMessage(':tmi.twitch.tv 001 streamerbob :Welcome\r\n');
  api.emitMessage(
    ':streamerbob!streamerbob@streamerbob.tmi.twitch.tv JOIN #gamer\r\n',
  );
  // Now the session has lastEventAt = FAKE_NOW.

  const result = chatIngress.runHealthCheck({
    now: () => FAKE_NOW + 12 * 60 * 1000, // 12 min later — past 11-min threshold.
  });
  assert.equal(result.inspected, 1);
  assert.equal(result.reconnectsForced, 1);
  // The fake socket records the close call.
  assert.equal(api.closed, true);
  handle.stop();
});

test('runHealthCheck: leaves a healthy (recently-active) session alone', async () => {
  const { chatIngress, db } = await loadModules();
  const user = await seedUser(db);
  await seedTwitchLink(user.id);
  const { factory, api } = buildFakeSocketFactory();

  const FAKE_NOW = 1_700_000_000_000;
  const handle = await chatIngress.startChatIngress({
    blackoutUserId: user.id,
    twitchChannel: 'gamer',
    onMessage: () => {},
    socketFactory: factory,
    now: () => FAKE_NOW,
  });
  api.emitOpen();
  api.emitMessage(':tmi.twitch.tv 001 streamerbob :Welcome\r\n');

  const result = chatIngress.runHealthCheck({
    now: () => FAKE_NOW + 60 * 1000, // 1 min later — well within threshold.
  });
  assert.equal(result.inspected, 1);
  assert.equal(result.reconnectsForced, 0);
  assert.equal(api.closed, false);
  handle.stop();
});

test('runHealthCheck: skips a session that has not received its first frame yet', async () => {
  const { chatIngress, db } = await loadModules();
  const user = await seedUser(db);
  await seedTwitchLink(user.id);
  const { factory, api } = buildFakeSocketFactory();

  const handle = await chatIngress.startChatIngress({
    blackoutUserId: user.id,
    twitchChannel: 'gamer',
    onMessage: () => {},
    socketFactory: factory,
  });
  api.emitOpen();
  // No emitMessage — session has lastEventAt undefined. We must NOT kick it.

  const result = chatIngress.runHealthCheck({
    now: () => Date.now() + 60 * 60 * 1000, // 1h later
    idleThresholdMs: 1, // even with a tiny threshold
  });
  assert.equal(result.inspected, 1);
  assert.equal(result.reconnectsForced, 0);
  assert.equal(api.closed, false);
  handle.stop();
});

test('startHealthCheckLoop is idempotent and stoppable', async () => {
  const { chatIngress } = await loadModules();
  const a = chatIngress.startHealthCheckLoop(50);
  const b = chatIngress.startHealthCheckLoop(50);
  // Both calls return a handle with the same .stop reference.
  assert.equal(a.stop, b.stop);
  // Calling either stop clears the timer; second stop is a no-op.
  a.stop();
  b.stop();
  // Re-starting should still work.
  const c = chatIngress.startHealthCheckLoop(50);
  c.stop();
});
