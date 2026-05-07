import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server as HttpServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - ws has no bundled types
import WebSocket from 'ws';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.JWT_SECRET_PRIMARY = generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api';
process.env.JWT_AUDIENCE = 'blackout-clients';
process.env.NODE_ENV = 'test';
process.env.BLACKOUT_DB_MODE = 'memory';

const loadModules = async () => {
  const tokens = await import('../src/services/twitchIrcBotTokens');
  const shim = await import('../src/integrations/twitch-compat/ircServer');
  const hub = await import('../src/services/chatMessageHub');
  const store = await import('../src/db/store');
  store.db.twitchIrcBotTokens.clear();
  store.db.twitchChatBridges.clear();
  hub.__test__.reset();
  return { tokens, shim, hub, db: store.db };
};

const seedUser = async (db: Awaited<ReturnType<typeof loadModules>>['db']) => {
  const auth = await import('../src/services/auth');
  const id = randomUUID();
  db.createUser({
    id,
    username: `irc-${id.slice(0, 4)}`,
    email: `irc-${id.slice(0, 4)}@example.com`,
    passwordHash: auth.hashPassword('Original-Pass-1234!'),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  return db.getUserById(id)!;
};

interface Harness {
  port: number;
  url: string;
  matrixCalls: Array<{ roomId: string; content: Record<string, unknown> }>;
  dispose: () => Promise<void>;
}

const buildHarness = async (
  shim: Awaited<ReturnType<typeof loadModules>>['shim'],
): Promise<Harness & { server: HttpServer }> => {
  const matrixCalls: Array<{ roomId: string; content: Record<string, unknown> }> = [];
  const matrixClient = {
    sendEvent: async (roomId: string, content: Record<string, unknown>) => {
      matrixCalls.push({ roomId, content });
      return { ok: true as const, status: 200 };
    },
  };
  const server = createServer((_, res) => {
    res.statusCode = 404;
    res.end();
  });
  const detach = shim.attachTwitchIrcShim(server, { matrixClient });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const port = (server.address() as any).port as number;
  return {
    server,
    port,
    url: `ws://127.0.0.1:${port}/twitch-irc`,
    matrixCalls,
    dispose: async () => {
      detach();
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    },
  };
};

interface BotClient {
  send(line: string): void;
  close(): void;
  /** Wait for a line that matches the predicate; rejects on timeout. */
  awaitLine(predicate: (line: string) => boolean, timeoutMs?: number): Promise<string>;
  allReceived(): string[];
}

const connectBot = async (url: string): Promise<BotClient> => {
  const ws = new WebSocket(url);
  const received: string[] = [];
  const waiters: Array<{
    predicate: (line: string) => boolean;
    resolve: (line: string) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];
  ws.on('message', (data: Buffer) => {
    const text = data.toString('utf8');
    for (const raw of text.split(/\r?\n/)) {
      if (!raw) continue;
      received.push(raw);
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].predicate(raw)) {
          clearTimeout(waiters[i].timer);
          waiters[i].resolve(raw);
          waiters.splice(i, 1);
        }
      }
    }
  });
  await once(ws, 'open');
  return {
    send: (line: string) => ws.send(line),
    close: () => ws.close(),
    awaitLine: (predicate, timeoutMs = 1500) =>
      new Promise<string>((resolve, reject) => {
        // Already-received lines.
        for (const r of received) {
          if (predicate(r)) return resolve(r);
        }
        const timer = setTimeout(() => {
          const idx = waiters.findIndex((w) => w.timer === timer);
          if (idx >= 0) waiters.splice(idx, 1);
          reject(
            new Error(
              `Timed out waiting for line. Received so far: ${JSON.stringify(received)}`,
            ),
          );
        }, timeoutMs);
        waiters.push({ predicate, resolve, reject, timer });
      }),
    allReceived: () => [...received],
  };
};

test('IRC shim: bot with valid bearer goes through CAP / PASS / NICK / 001 / JOIN handshake', async () => {
  const { tokens, shim, db } = await loadModules();
  const user = await seedUser(db);
  // Seed an active Twitch chat bridge so the bot can JOIN #foo.
  db.createTwitchChatBridge({
    id: randomUUID(),
    blackoutUserId: user.id,
    twitchUserId: '1',
    twitchChannel: 'foo',
    matrixRoomId: '!den:srv',
    isActive: true,
  });
  const minted = tokens.mint({ blackoutUserId: user.id, label: 'TestBot' });
  if (minted.kind !== 'ok') return assert.fail();

  const h = await buildHarness(shim);
  try {
    const bot = await connectBot(h.url);
    bot.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
    bot.send(`PASS oauth:${minted.secret}`);
    bot.send('NICK TestBot');
    await bot.awaitLine((l) => /:tmi\.twitch\.tv 376 testbot/.test(l));
    // 001 also arrived.
    assert.ok(bot.allReceived().some((l) => /:tmi\.twitch\.tv 001 testbot/.test(l)));
    bot.send('JOIN #foo');
    await bot.awaitLine((l) => /:tmi\.twitch\.tv 366 testbot/.test(l) || /366 testbot #foo/.test(l));
    assert.ok(
      bot.allReceived().some((l) =>
        /:testbot!testbot@testbot\.tmi\.twitch\.tv JOIN #foo/.test(l),
      ),
    );
    bot.close();
  } finally {
    await h.dispose();
  }
});

test('IRC shim: invalid PASS → NOTICE Login authentication failed + close', async () => {
  const { shim, db } = await loadModules();
  await seedUser(db);
  const h = await buildHarness(shim);
  try {
    const bot = await connectBot(h.url);
    bot.send('PASS oauth:totally-bogus-bearer');
    bot.send('NICK Naughty');
    await bot.awaitLine((l) => /Login authentication failed/.test(l));
  } finally {
    await h.dispose();
  }
});

test('IRC shim: JOIN to a channel the creator has not bridged → 475 (Cannot join)', async () => {
  const { tokens, shim, db } = await loadModules();
  const user = await seedUser(db);
  const minted = tokens.mint({ blackoutUserId: user.id });
  if (minted.kind !== 'ok') return assert.fail();
  const h = await buildHarness(shim);
  try {
    const bot = await connectBot(h.url);
    bot.send('CAP REQ :twitch.tv/tags');
    bot.send(`PASS oauth:${minted.secret}`);
    bot.send('NICK MyBot');
    await bot.awaitLine((l) => /:tmi\.twitch\.tv 376/.test(l));
    bot.send('JOIN #notbridged');
    await bot.awaitLine((l) => /475 mybot #notbridged/.test(l));
  } finally {
    await h.dispose();
  }
});

test('IRC shim: bridge → hub → bot fan-out delivers Twitch chat as Twitch-shape PRIVMSG', async () => {
  const { tokens, shim, hub, db } = await loadModules();
  const user = await seedUser(db);
  db.createTwitchChatBridge({
    id: randomUUID(),
    blackoutUserId: user.id,
    twitchUserId: '1',
    twitchChannel: 'streamer',
    matrixRoomId: '!den:srv',
    isActive: true,
  });
  const minted = tokens.mint({ blackoutUserId: user.id });
  if (minted.kind !== 'ok') return assert.fail();
  const h = await buildHarness(shim);
  try {
    const bot = await connectBot(h.url);
    bot.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
    bot.send(`PASS oauth:${minted.secret}`);
    bot.send('NICK MyBot');
    bot.send('JOIN #streamer');
    await bot.awaitLine((l) => /JOIN #streamer/.test(l));
    // Now publish a chat message into the hub the way twitchChatBridge does.
    hub.publishChatMessage(
      { blackoutUserId: user.id, channelKey: '#streamer' },
      {
        source: 'twitch',
        authorLogin: 'fan',
        authorDisplayName: 'Fan',
        body: 'first chat over the shim',
        platformMessageId: 'msg-7',
        tags: { 'display-name': 'Fan', id: 'msg-7' },
      },
    );
    const line = await bot.awaitLine((l) => /PRIVMSG #streamer :first chat over the shim/.test(l));
    assert.match(line, /^@/, 'tags should be present');
    assert.match(line, /display-name=Fan/);
    assert.match(line, /:fan!fan@fan\.tmi\.twitch\.tv PRIVMSG #streamer/);
  } finally {
    await h.dispose();
  }
});

test('IRC shim: bot PRIVMSG forwards into the bridge’s Matrix room with origin tag', async () => {
  const { tokens, shim, db } = await loadModules();
  const user = await seedUser(db);
  db.createTwitchChatBridge({
    id: randomUUID(),
    blackoutUserId: user.id,
    twitchUserId: '1',
    twitchChannel: 'streamer',
    matrixRoomId: '!den:srv',
    isActive: true,
  });
  const minted = tokens.mint({ blackoutUserId: user.id });
  if (minted.kind !== 'ok') return assert.fail();
  const h = await buildHarness(shim);
  try {
    const bot = await connectBot(h.url);
    bot.send('CAP REQ :twitch.tv/commands');
    bot.send(`PASS oauth:${minted.secret}`);
    bot.send('NICK MyBot');
    bot.send('JOIN #streamer');
    await bot.awaitLine((l) => /JOIN #streamer/.test(l));
    bot.send('PRIVMSG #streamer :hello from the bot');
    // Allow the matrix send promise to flush.
    for (let i = 0; i < 30 && h.matrixCalls.length === 0; i++) {
      await new Promise((r) => setImmediate(r));
    }
    assert.equal(h.matrixCalls.length, 1);
    assert.equal(h.matrixCalls[0].roomId, '!den:srv');
    assert.equal(h.matrixCalls[0].content.body, 'hello from the bot');
    assert.equal(
      h.matrixCalls[0].content['m.blackout.origin'],
      'twitch_irc_compat_bot',
    );
    assert.equal(
      h.matrixCalls[0].content['m.blackout.origin_sender_username'],
      'mybot',
    );
  } finally {
    await h.dispose();
  }
});

test('IRC shim: PING from bot is answered with PONG echoing the payload', async () => {
  const { tokens, shim, db } = await loadModules();
  const user = await seedUser(db);
  db.createTwitchChatBridge({
    id: randomUUID(),
    blackoutUserId: user.id,
    twitchUserId: '1',
    twitchChannel: 'foo',
    matrixRoomId: '!den:srv',
    isActive: true,
  });
  const minted = tokens.mint({ blackoutUserId: user.id });
  if (minted.kind !== 'ok') return assert.fail();
  const h = await buildHarness(shim);
  try {
    const bot = await connectBot(h.url);
    bot.send('CAP REQ :twitch.tv/tags');
    bot.send(`PASS oauth:${minted.secret}`);
    bot.send('NICK MyBot');
    await bot.awaitLine((l) => /:tmi\.twitch\.tv 376/.test(l));
    bot.send('PING :tmi.twitch.tv');
    await bot.awaitLine((l) => /^:tmi\.twitch\.tv PONG tmi\.twitch\.tv :tmi\.twitch\.tv/.test(l));
  } finally {
    await h.dispose();
  }
});
