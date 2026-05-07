import {
  PUSHER_PONG_FRAME,
  buildSubscribeFrame,
  parsePusherFrame,
  toKickChatMessage,
} from './pusherProtocol';
import {
  toMatrixForwardedMessage,
  toNormalizedKickChatMessage,
  type NormalizedKickChatMessage,
} from './chatBridge';
import { log } from '../../telemetry/logger';

/**
 * Kick chat ingress (Phase 1 / Track A). Connects to Pusher's public
 * Kick chatrooms WS, subscribes to a chatroom, and forwards each chat
 * message via a caller-supplied handler. Mirrors the Twitch ingress
 * shape — same WS abstraction, same socket-factory injection point for
 * tests, same backoff lifecycle.
 *
 * Auth: NONE for read-only public chat. Kick exposes its chatroom WS
 * without per-user auth; the chatroom_id is the only "credential". A
 * future commit will add the bridge persistence + scheduler that walks
 * every active bridge.
 */

const KICK_PUSHER_KEY = 'eb1d5f283081a78b932c'; // gitleaks:allow — public Pusher app key, see Kick web client + @retconned/kick-js
const KICK_PUSHER_CLUSTER = 'us2';
const KICK_PUSHER_URL =
  `wss://ws-${KICK_PUSHER_CLUSTER}.pusher.com/app/${KICK_PUSHER_KEY}` +
  `?protocol=7&client=blackout&version=1.0&flash=false`;

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_CAP_MS = 30_000;
const MAX_RECONNECTS = 6;

// ----------------------------- WebSocket abstraction -----------------------------

export interface KickSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open', listener: () => void): void;
  addEventListener(
    type: 'message',
    listener: (event: { data: string | ArrayBuffer | Buffer }) => void,
  ): void;
  addEventListener(
    type: 'close',
    listener: (event: { code: number; reason: string }) => void,
  ): void;
  addEventListener(type: 'error', listener: (event: unknown) => void): void;
}

export type KickSocketFactory = (url: string) => KickSocket;

const defaultSocketFactory: KickSocketFactory = (url) =>
  new (globalThis as { WebSocket: new (url: string) => KickSocket }).WebSocket(url);

// ----------------------------- session bookkeeping -----------------------------

export interface KickIngressOptions {
  /** Blackout user that owns this bridge. */
  blackoutUserId: string;
  /** Numeric Kick chatroom id (not the channel name). */
  chatroomId: string;
  /** Called for each chat message (after normalization). */
  onMessage: (msg: NormalizedKickChatMessage) => void;
  /** Override: factory for the underlying WebSocket. */
  socketFactory?: KickSocketFactory;
  /** Override: WSS endpoint (tests). */
  url?: string;
  /** Override: max reconnect attempts before giving up. */
  maxReconnects?: number;
}

export interface KickSessionHandle {
  blackoutUserId: string;
  chatroomId: string;
  messagesForwarded(): number;
  reconnectAttempts(): number;
  state(): 'connecting' | 'subscribed' | 'closing' | 'closed';
  stop(): void;
}

interface InternalSession {
  options: KickIngressOptions;
  socket: KickSocket | null;
  state: 'connecting' | 'subscribed' | 'closing' | 'closed';
  reconnectAttempts: number;
  messagesForwarded: number;
  reconnectTimer?: ReturnType<typeof setTimeout>;
}

const sessions = new Map<string, InternalSession>();

const sessionKey = (userId: string, chatroomId: string): string =>
  `${userId}:${chatroomId}`;

const computeBackoffMs = (attempt: number): number => {
  const exp = Math.min(RECONNECT_CAP_MS, RECONNECT_BASE_MS * 2 ** attempt);
  return Math.round(Math.random() * exp);
};

// ----------------------------- handler -----------------------------

const handleFrame = (session: InternalSession, raw: string): void => {
  const frame = parsePusherFrame(raw);
  if (!frame) return;

  // Pusher keepalive ping → respond with pong.
  if (frame.event === 'pusher:ping' && session.socket) {
    session.socket.send(PUSHER_PONG_FRAME);
    return;
  }

  // Connection established → subscribe to the chatroom.
  if (frame.event === 'pusher:connection_established' && session.socket) {
    session.socket.send(buildSubscribeFrame(session.options.chatroomId));
    return;
  }

  // Subscription confirmation → mark session as subscribed.
  if (frame.event === 'pusher_internal:subscription_succeeded') {
    session.state = 'subscribed';
    session.reconnectAttempts = 0;
    return;
  }

  if (frame.event === 'App\\Events\\ChatMessageEvent') {
    const message = toKickChatMessage(frame);
    if (!message) return;
    try {
      session.options.onMessage(toNormalizedKickChatMessage(message));
      session.messagesForwarded += 1;
    } catch (err) {
      log.warn('kick_chat_ingress_handler_threw', {
        userId: session.options.blackoutUserId,
        chatroomId: session.options.chatroomId,
        error: String(err),
      });
    }
  }
};

const scheduleReconnect = (session: InternalSession): void => {
  const max = session.options.maxReconnects ?? MAX_RECONNECTS;
  if (session.reconnectAttempts >= max) {
    log.warn('kick_chat_ingress_giving_up', {
      userId: session.options.blackoutUserId,
      chatroomId: session.options.chatroomId,
      attempts: session.reconnectAttempts,
    });
    session.state = 'closed';
    return;
  }
  const delay = computeBackoffMs(session.reconnectAttempts);
  session.reconnectAttempts += 1;
  session.reconnectTimer = setTimeout(() => {
    session.reconnectTimer = undefined;
    connect(session);
  }, delay);
};

const connect = (session: InternalSession): void => {
  if (session.state === 'closing' || session.state === 'closed') return;
  session.state = 'connecting';

  const factory = session.options.socketFactory ?? defaultSocketFactory;
  let socket: KickSocket;
  try {
    socket = factory(session.options.url ?? KICK_PUSHER_URL);
  } catch (err) {
    log.warn('kick_chat_ingress_socket_open_failed', {
      userId: session.options.blackoutUserId,
      chatroomId: session.options.chatroomId,
      error: String(err),
    });
    scheduleReconnect(session);
    return;
  }
  session.socket = socket;

  socket.addEventListener('message', (event) => {
    const data =
      typeof event.data === 'string'
        ? event.data
        : Buffer.from(event.data as ArrayBuffer).toString('utf8');
    handleFrame(session, data);
  });
  socket.addEventListener('close', () => {
    if (session.state === 'closing') {
      session.state = 'closed';
      session.socket = null;
      return;
    }
    session.socket = null;
    scheduleReconnect(session);
  });
  socket.addEventListener('error', (event) => {
    log.warn('kick_chat_ingress_socket_error', {
      userId: session.options.blackoutUserId,
      chatroomId: session.options.chatroomId,
      error: String(event),
    });
  });
};

export const startKickChatIngress = (
  options: KickIngressOptions,
): KickSessionHandle => {
  const key = sessionKey(options.blackoutUserId, options.chatroomId);
  const existing = sessions.get(key);
  if (existing) return toHandle(existing);

  const session: InternalSession = {
    options,
    socket: null,
    state: 'connecting',
    reconnectAttempts: 0,
    messagesForwarded: 0,
  };
  sessions.set(key, session);
  connect(session);
  return toHandle(session);
};

const toHandle = (session: InternalSession): KickSessionHandle => ({
  blackoutUserId: session.options.blackoutUserId,
  chatroomId: session.options.chatroomId,
  messagesForwarded: () => session.messagesForwarded,
  reconnectAttempts: () => session.reconnectAttempts,
  state: () => session.state,
  stop: () => {
    session.state = 'closing';
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = undefined;
    }
    if (session.socket) {
      try {
        session.socket.close(1000, 'shutdown');
      } catch {
        /* ignore */
      }
    }
    session.state = 'closed';
    session.socket = null;
    sessions.delete(sessionKey(session.options.blackoutUserId, session.options.chatroomId));
  },
});

export const stopAllKickChatIngress = (): void => {
  for (const session of sessions.values()) {
    if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
    if (session.socket) {
      try {
        session.socket.close(1000, 'shutdown');
      } catch {
        /* ignore */
      }
    }
    session.state = 'closed';
    session.socket = null;
  }
  sessions.clear();
};

export { toMatrixForwardedMessage };

export const __test__ = { sessions, computeBackoffMs };
