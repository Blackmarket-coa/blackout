import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

const KEY_V1 = randomBytes(32).toString('base64');

process.env.JWT_SECRET_PRIMARY = generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api';
process.env.JWT_AUDIENCE = 'blackout-clients';
process.env.NODE_ENV = 'test';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS = `v1:${KEY_V1}`;

const loadModules = async () => {
  const pusher = await import('../src/integrations/kick/pusherProtocol');
  const chatBridge = await import('../src/integrations/kick/chatBridge');
  const chatIngress = await import('../src/integrations/kick/chatIngress');
  chatIngress.stopAllKickChatIngress();
  return { pusher, chatBridge, chatIngress };
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
  let closed = false;
  const factory = (() => ({
    send: (data: string) => sentLines.push(data),
    close: () => {
      closed = true;
      listeners.close.forEach((l) => l({ code: 1000, reason: 'shutdown' }));
    },
    addEventListener: (type: keyof Listeners, listener: (e: never) => void) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (listeners[type] as Array<(e: any) => void>).push(listener);
    },
  })) as unknown as import('../src/integrations/kick/chatIngress').KickSocketFactory;
  return {
    factory,
    sentLines,
    emitMessage: (data: string) => listeners.message.forEach((l) => l({ data })),
    emitClose: () => listeners.close.forEach((l) => l({ code: 1006, reason: 'mock' })),
    get closed() {
      return closed;
    },
  };
};

// =============================================================================
// pusherProtocol parser
// =============================================================================

test('parsePusherFrame: unwraps a JSON-encoded `data` string lazily', async () => {
  const { pusher } = await loadModules();
  const frame = pusher.parsePusherFrame(
    JSON.stringify({
      event: 'pusher:connection_established',
      data: JSON.stringify({ socket_id: '12345.67', activity_timeout: 120 }),
    }),
  );
  assert.ok(frame);
  assert.equal(frame!.event, 'pusher:connection_established');
  const data = frame!.data as { socket_id: string };
  assert.equal(data.socket_id, '12345.67');
});

test('parsePusherFrame: leaves `data` as-is when it is not JSON', async () => {
  const { pusher } = await loadModules();
  const frame = pusher.parsePusherFrame(JSON.stringify({ event: 'pusher:ping', data: '' }));
  assert.ok(frame);
  assert.equal(frame!.event, 'pusher:ping');
});

test('parsePusherFrame: returns null for malformed input', async () => {
  const { pusher } = await loadModules();
  assert.equal(pusher.parsePusherFrame(''), null);
  assert.equal(pusher.parsePusherFrame('not json'), null);
  assert.equal(pusher.parsePusherFrame(JSON.stringify({})), null); // no event
});

test('toKickChatMessage: projects a chat-message frame into the typed shape', async () => {
  const { pusher } = await loadModules();
  const frame = pusher.parsePusherFrame(
    JSON.stringify({
      event: 'App\\Events\\ChatMessageEvent',
      channel: 'chatrooms.42.v2',
      data: JSON.stringify({
        id: 'msg-1',
        chatroom_id: 42,
        content: 'hello kick',
        type: 'message',
        created_at: '2026-05-07T00:00:00Z',
        sender: {
          id: 99,
          username: 'streamerfan',
          slug: 'streamerfan',
          identity: {
            color: '#ff0000',
            badges: [{ type: 'subscriber', count: 12 }],
          },
        },
      }),
    }),
  );
  assert.ok(frame);
  const msg = pusher.toKickChatMessage(frame!);
  assert.ok(msg);
  assert.equal(msg!.id, 'msg-1');
  assert.equal(msg!.content, 'hello kick');
  assert.equal(msg!.senderUsername, 'streamerfan');
  assert.equal(msg!.senderColor, '#ff0000');
  assert.deepEqual(msg!.badges, [{ type: 'subscriber', text: undefined, count: 12 }]);
});

test('toKickChatMessage: returns null for non-chat events', async () => {
  const { pusher } = await loadModules();
  const frame = pusher.parsePusherFrame(JSON.stringify({ event: 'pusher:ping', data: '' }));
  assert.equal(pusher.toKickChatMessage(frame!), null);
});

// =============================================================================
// chatBridge mapper
// =============================================================================

test('toMatrixForwardedMessage: HTML-escapes name + body; sets m.blackout.* metadata', async () => {
  const { chatBridge } = await loadModules();
  const m = chatBridge.toMatrixForwardedMessage({
    origin: 'kick',
    chatroomId: '42',
    authorId: '99',
    authorUsername: '<scary>',
    authorColor: '#ff0000',
    body: '<img onerror=alert(1)>',
    pusherType: 'message',
    platformMessageId: 'msg-1',
    sentAtMs: 1700000000000,
  });
  assert.equal(m.msgtype, 'm.text');
  assert.equal(m['m.blackout.origin'], 'kick');
  assert.equal(m['m.blackout.origin_chatroom'], '42');
  assert.match(m.formatted_body, /&lt;scary&gt;/);
  assert.match(m.formatted_body, /&lt;img onerror=alert\(1\)&gt;/);
  // Color is escaped + applied as a font tag.
  assert.match(m.formatted_body, /<font color="#ff0000">/);
});

test('toMatrixForwardedMessage: non-message subtype renders as m.notice with type metadata', async () => {
  const { chatBridge } = await loadModules();
  const m = chatBridge.toMatrixForwardedMessage({
    origin: 'kick',
    chatroomId: '1',
    authorId: '2',
    authorUsername: 'fan',
    body: 'celebration',
    pusherType: 'celebration',
    platformMessageId: 'm',
    sentAtMs: 0,
  });
  assert.equal(m.msgtype, 'm.notice');
  assert.equal(m['m.blackout.origin_pusher_type'], 'celebration');
});

// =============================================================================
// connection lifecycle (mock socket)
// =============================================================================

test('chatIngress: subscribes after connection_established; PRIVMSG events forwarded', async () => {
  const { chatIngress } = await loadModules();
  const fake = buildFakeSocket();
  const received: import('../src/integrations/kick/chatBridge').NormalizedKickChatMessage[] = [];
  const handle = chatIngress.startKickChatIngress({
    blackoutUserId: 'u-1',
    chatroomId: '42',
    onMessage: (msg) => received.push(msg),
    socketFactory: fake.factory,
  });

  // Simulate Pusher's connection_established frame.
  fake.emitMessage(
    JSON.stringify({
      event: 'pusher:connection_established',
      data: JSON.stringify({ socket_id: '1.1', activity_timeout: 120 }),
    }),
  );
  assert.equal(fake.sentLines.length, 1);
  const subscribe = JSON.parse(fake.sentLines[0]);
  assert.equal(subscribe.event, 'pusher:subscribe');
  assert.equal(subscribe.data.channel, 'chatrooms.42.v2');

  // Subscription succeeded → state should flip.
  fake.emitMessage(
    JSON.stringify({
      event: 'pusher_internal:subscription_succeeded',
      channel: 'chatrooms.42.v2',
      data: '{}',
    }),
  );
  assert.equal(handle.state(), 'subscribed');

  // Drive a chat message through the bridge.
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
  assert.equal(received.length, 1);
  assert.equal(received[0].body, 'hi kick');
  assert.equal(received[0].chatroomId, '42');
  assert.equal(handle.messagesForwarded(), 1);
  handle.stop();
});

test('chatIngress: pusher:ping → pong frame sent back', async () => {
  const { chatIngress } = await loadModules();
  const fake = buildFakeSocket();
  const handle = chatIngress.startKickChatIngress({
    blackoutUserId: 'u',
    chatroomId: '42',
    onMessage: () => {},
    socketFactory: fake.factory,
  });
  fake.emitMessage(JSON.stringify({ event: 'pusher:ping', data: '{}' }));
  // First sent line is the pong (no connection_established came first, so
  // the subscribe frame hasn't been emitted yet).
  assert.equal(fake.sentLines.length, 1);
  const pong = JSON.parse(fake.sentLines[0]);
  assert.equal(pong.event, 'pusher:pong');
  handle.stop();
});

test('chatIngress: stop() closes the socket and removes the session', async () => {
  const { chatIngress } = await loadModules();
  const fake = buildFakeSocket();
  const handle = chatIngress.startKickChatIngress({
    blackoutUserId: 'u',
    chatroomId: '42',
    onMessage: () => {},
    socketFactory: fake.factory,
  });
  handle.stop();
  assert.equal(handle.state(), 'closed');
  assert.equal(fake.closed, true);
  assert.equal(chatIngress.__test__.sessions.size, 0);
});

test('chatIngress: idempotent for the same (user, chatroom)', async () => {
  const { chatIngress } = await loadModules();
  const fake = buildFakeSocket();
  const a = chatIngress.startKickChatIngress({
    blackoutUserId: 'u',
    chatroomId: '42',
    onMessage: () => {},
    socketFactory: fake.factory,
  });
  const b = chatIngress.startKickChatIngress({
    blackoutUserId: 'u',
    chatroomId: '42',
    onMessage: () => {},
    socketFactory: fake.factory,
  });
  assert.equal(chatIngress.__test__.sessions.size, 1);
  assert.equal(a.chatroomId, b.chatroomId);
  a.stop();
});
