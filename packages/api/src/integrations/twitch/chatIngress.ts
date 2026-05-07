import { ensureFreshAccessToken } from '../../services/oauthProviders';
import { decryptLinkedAccount } from '../../services/linkedAccounts';
import { parseIrcFrame, toPrivmsg } from './ircParser';
import { toMatrixForwardedMessage, toNormalizedMessage, type NormalizedChatMessage } from './chatBridge';
import { log } from '../../telemetry/logger';

/**
 * Twitch IRC chat ingress (Phase 1 / Track A).
 *
 * Opens a WSS connection to irc-ws.chat.twitch.tv per (blackoutUser,
 * twitchChannel) pair, authenticates with the linked OAuth token, joins the
 * channel, and forwards PRIVMSGs as a normalized event back to a caller-
 * supplied handler (which is what wires this to Matrix in the den room).
 *
 * The WebSocket layer is dependency-injected via {@link IrcSocketFactory} so
 * the connection manager is testable end-to-end without standing up a real
 * Twitch socket. Production use omits the factory and gets a Node-built-in
 * WebSocket via the default factory.
 *
 * The forwarding handler is also caller-supplied: this module deliberately
 * does NOT depend on the Matrix client. Phase 1 wiring constructs a
 * ChatIngressManager with a handler that calls matrixClient.sendEvent(...)
 * with the result of `toMatrixForwardedMessage()`.
 */

const TWITCH_IRC_WSS = 'wss://irc-ws.chat.twitch.tv:443';
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_CAP_MS = 30_000;
const MAX_RECONNECTS = 6;
const REQUIRED_CAPS = ['twitch.tv/tags', 'twitch.tv/commands', 'twitch.tv/membership'] as const;

// ----------------------------- WebSocket abstraction -----------------------------

/**
 * Minimal WebSocket surface area we need. Mirrors a subset of the standard
 * WebSocket API so Node's built-in (Node 22+) and the `ws` package are both
 * compatible without adapter shims.
 */
export interface IrcSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open', listener: () => void): void;
  addEventListener(type: 'message', listener: (event: { data: string | ArrayBuffer | Buffer }) => void): void;
  addEventListener(type: 'close', listener: (event: { code: number; reason: string }) => void): void;
  addEventListener(type: 'error', listener: (event: unknown) => void): void;
}

export type IrcSocketFactory = (url: string) => IrcSocket;

const defaultSocketFactory: IrcSocketFactory = (url) => {
  // Node 22+ has a global WebSocket. We cast through `unknown` because the
  // `WebSocket` global type is structural-equivalent to our IrcSocket
  // interface for the methods we use, but TS still wants the formal cast.
  return new (globalThis as { WebSocket: new (url: string) => IrcSocket }).WebSocket(url);
};

// ----------------------------- session bookkeeping -----------------------------

export interface ChatIngressOptions {
  /** Blackout user whose linked Twitch account we authenticate with. */
  blackoutUserId: string;
  /** Twitch channel login (without the `#`). Lowercased internally. */
  twitchChannel: string;
  /** Called for each PRIVMSG. Should return promptly; long handlers must queue work. */
  onMessage: (msg: NormalizedChatMessage) => void;
  /** Override: factory for the underlying WebSocket. Used in tests. */
  socketFactory?: IrcSocketFactory;
  /** Override: WSS endpoint. Used in tests. */
  url?: string;
  /** Override: max reconnect attempts before giving up. */
  maxReconnects?: number;
  /** Optional clock injection so tests can advance time deterministically. */
  now?: () => number;
}

export interface SessionHandle {
  blackoutUserId: string;
  twitchChannel: string;
  /** Total number of PRIVMSGs forwarded since start. */
  messagesForwarded(): number;
  /** Number of reconnect attempts made (resets to 0 on a successful JOIN). */
  reconnectAttempts(): number;
  /** Last message we received, ms-since-epoch. */
  lastEventAt(): number | undefined;
  state(): 'connecting' | 'connected' | 'closing' | 'closed';
  stop(): void;
}

interface InternalSession {
  options: ChatIngressOptions;
  socket: IrcSocket | null;
  state: 'connecting' | 'connected' | 'closing' | 'closed';
  reconnectAttempts: number;
  messagesForwarded: number;
  lastEventAt?: number;
  /** True after we've sent PASS+NICK+JOIN in the current connection. */
  joined: boolean;
  reconnectTimer?: ReturnType<typeof setTimeout>;
}

const sessions = new Map<string, InternalSession>();

const sessionKey = (userId: string, channel: string): string =>
  `${userId}:${channel.toLowerCase()}`;

const computeBackoffMs = (attempt: number): number => {
  const exp = Math.min(RECONNECT_CAP_MS, RECONNECT_BASE_MS * 2 ** attempt);
  // Full-jitter so a fleet of reconnecting sessions doesn't synchronize.
  return Math.round(Math.random() * exp);
};

// ----------------------------- connection lifecycle -----------------------------

const sendIrc = (sock: IrcSocket, line: string): void => {
  sock.send(line.endsWith('\r\n') ? line : `${line}\r\n`);
};

interface AuthHeaders {
  oauthToken: string;
  nick: string;
}

/**
 * Resolve the auth credentials for a given linked Twitch account: a fresh
 * access token (refreshed if necessary) and the linked user's login.
 */
const resolveAuthHeaders = async (userId: string): Promise<AuthHeaders | { error: string }> => {
  const fresh = await ensureFreshAccessToken(userId, 'twitch');
  if (fresh.kind !== 'ok') {
    return { error: `ensureFreshAccessToken: ${fresh.kind}` };
  }
  const decrypted = decryptLinkedAccount(userId, 'twitch');
  if (!decrypted) return { error: 'no_linked_account_after_refresh' };
  // Twitch IRC NICK must be the lowercased login. Our `providerUsername` may
  // be the display name (mixed case); the login is normally available as the
  // lowercased display-name on Twitch but we play safe and lowercase.
  const nick = (decrypted.record.providerUsername ?? decrypted.record.providerUserId).toLowerCase();
  return { oauthToken: fresh.accessToken, nick };
};

const handleFrame = (session: InternalSession, frame: string): void => {
  const lines = parseIrcFrame(frame);
  for (const line of lines) {
    if (session.options.now) session.lastEventAt = session.options.now();
    else session.lastEventAt = Date.now();

    if (line.command === 'PING' && session.socket) {
      // Twitch keepalive — respond to whatever they sent us as the trailing.
      const pongTarget = line.trailing ?? 'tmi.twitch.tv';
      sendIrc(session.socket, `PONG :${pongTarget}`);
      continue;
    }
    if (line.command === '001') {
      // RPL_WELCOME. Ready to JOIN.
      if (!session.joined && session.socket) {
        const ch = `#${session.options.twitchChannel.toLowerCase()}`;
        sendIrc(session.socket, `JOIN ${ch}`);
      }
      continue;
    }
    if (line.command === 'JOIN') {
      session.joined = true;
      session.state = 'connected';
      session.reconnectAttempts = 0;
      continue;
    }
    if (line.command === 'PRIVMSG') {
      const event = toPrivmsg(line);
      if (!event) continue;
      try {
        session.options.onMessage(toNormalizedMessage(event));
        session.messagesForwarded += 1;
      } catch (err) {
        log.warn('twitch_chat_ingress_handler_threw', {
          userId: session.options.blackoutUserId,
          channel: session.options.twitchChannel,
          error: String(err),
        });
      }
      continue;
    }
    // Other commands (NOTICE, USERSTATE, ROOMSTATE, CLEARCHAT, ...) are
    // recognized for future expansion but ignored in this MVP.
  }
};

const scheduleReconnect = (session: InternalSession): void => {
  const max = session.options.maxReconnects ?? MAX_RECONNECTS;
  if (session.reconnectAttempts >= max) {
    log.warn('twitch_chat_ingress_giving_up', {
      userId: session.options.blackoutUserId,
      channel: session.options.twitchChannel,
      attempts: session.reconnectAttempts,
    });
    session.state = 'closed';
    return;
  }
  const delay = computeBackoffMs(session.reconnectAttempts);
  session.reconnectAttempts += 1;
  session.reconnectTimer = setTimeout(() => {
    session.reconnectTimer = undefined;
    void connect(session);
  }, delay);
};

const connect = async (session: InternalSession): Promise<void> => {
  if (session.state === 'closing' || session.state === 'closed') return;
  session.state = 'connecting';
  session.joined = false;

  const auth = await resolveAuthHeaders(session.options.blackoutUserId);
  if ('error' in auth) {
    log.warn('twitch_chat_ingress_auth_failed', {
      userId: session.options.blackoutUserId,
      channel: session.options.twitchChannel,
      reason: auth.error,
    });
    scheduleReconnect(session);
    return;
  }

  const factory = session.options.socketFactory ?? defaultSocketFactory;
  let socket: IrcSocket;
  try {
    socket = factory(session.options.url ?? TWITCH_IRC_WSS);
  } catch (err) {
    log.warn('twitch_chat_ingress_socket_open_failed', {
      userId: session.options.blackoutUserId,
      channel: session.options.twitchChannel,
      error: String(err),
    });
    scheduleReconnect(session);
    return;
  }
  session.socket = socket;

  socket.addEventListener('open', () => {
    sendIrc(socket, `CAP REQ :${REQUIRED_CAPS.join(' ')}`);
    sendIrc(socket, `PASS oauth:${auth.oauthToken}`);
    sendIrc(socket, `NICK ${auth.nick}`);
  });
  socket.addEventListener('message', (event) => {
    const data =
      typeof event.data === 'string' ? event.data : Buffer.from(event.data as ArrayBuffer).toString('utf8');
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
    log.warn('twitch_chat_ingress_socket_error', {
      userId: session.options.blackoutUserId,
      channel: session.options.twitchChannel,
      error: String(event),
    });
  });
};

/**
 * Start (or restart) a chat-ingress session. Idempotent for the same
 * (userId, channel) pair: if a session already exists, the existing handle
 * is returned and no new socket is opened.
 */
export const startChatIngress = async (
  options: ChatIngressOptions,
): Promise<SessionHandle> => {
  const key = sessionKey(options.blackoutUserId, options.twitchChannel);
  const existing = sessions.get(key);
  if (existing) return toHandle(existing);

  const session: InternalSession = {
    options,
    socket: null,
    state: 'connecting',
    reconnectAttempts: 0,
    messagesForwarded: 0,
    joined: false,
  };
  sessions.set(key, session);
  await connect(session);
  return toHandle(session);
};

const toHandle = (session: InternalSession): SessionHandle => ({
  blackoutUserId: session.options.blackoutUserId,
  twitchChannel: session.options.twitchChannel.toLowerCase(),
  messagesForwarded: () => session.messagesForwarded,
  reconnectAttempts: () => session.reconnectAttempts,
  lastEventAt: () => session.lastEventAt,
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
    sessions.delete(sessionKey(session.options.blackoutUserId, session.options.twitchChannel));
  },
});

/** Used by tests + graceful-shutdown hooks. */
export const stopAllChatIngress = (): void => {
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

// ----------------------------- idle-session health check -----------------------------

/**
 * Twitch sends a PING every ~5 minutes; an active connection should see at
 * minimum that frequency of inbound traffic. If we haven't heard ANY frame
 * for this many ms we treat the socket as half-open and force a close,
 * which the close handler observes and turns into a reconnect (with a
 * fresh OAuth token via ensureFreshAccessToken).
 *
 * The threshold is generous — twice Twitch's PING interval, plus headroom
 * — to avoid kicking healthy connections during legitimate quiet periods.
 */
export const HEALTH_IDLE_THRESHOLD_MS = 11 * 60 * 1000;
export const HEALTH_CHECK_INTERVAL_MS = 60 * 1000;

export interface RunHealthCheckOptions {
  /** Override clock for tests. */
  now?: () => number;
  /** Override the idle threshold (ms) for tests. */
  idleThresholdMs?: number;
}

export interface HealthCheckResult {
  inspected: number;
  reconnectsForced: number;
}

/**
 * Walk every active session and force-close any that have gone silent
 * past {@link HEALTH_IDLE_THRESHOLD_MS}. The close handler installed in
 * `connect` schedules a reconnect, which on its way through resolves a
 * fresh OAuth token — so this is also the path that recovers a session
 * whose access token has aged past the refresh window.
 */
export const runHealthCheck = (
  options: RunHealthCheckOptions = {},
): HealthCheckResult => {
  const now = options.now ? options.now() : Date.now();
  const threshold = options.idleThresholdMs ?? HEALTH_IDLE_THRESHOLD_MS;
  let inspected = 0;
  let reconnectsForced = 0;
  for (const session of sessions.values()) {
    if (session.state === 'closing' || session.state === 'closed') continue;
    inspected += 1;
    // No `lastEventAt` yet means the session was just opened and hasn't
    // received its first frame; don't kick it.
    const last = session.lastEventAt;
    if (typeof last !== 'number') continue;
    if (now - last < threshold) continue;
    // Force the socket closed; the close handler reconnects.
    if (session.socket) {
      try {
        session.socket.close(1006, 'idle_timeout');
      } catch {
        /* ignore */
      }
    }
    reconnectsForced += 1;
  }
  return { inspected, reconnectsForced };
};

let healthCheckTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Run {@link runHealthCheck} on a recurring interval. Call once at API
 * startup; idempotent (subsequent calls are no-ops). The returned
 * `stop()` function clears the interval — used by tests + graceful
 * shutdown.
 */
export const startHealthCheckLoop = (
  intervalMs: number = HEALTH_CHECK_INTERVAL_MS,
): { stop: () => void } => {
  if (healthCheckTimer) return { stop: stopHealthCheckLoop };
  healthCheckTimer = setInterval(() => {
    try {
      runHealthCheck();
    } catch (err) {
      log.warn('twitch_chat_ingress_health_check_threw', { error: String(err) });
    }
  }, intervalMs);
  // Don't keep the Node process alive purely for the health check.
  if (typeof healthCheckTimer.unref === 'function') healthCheckTimer.unref();
  return { stop: stopHealthCheckLoop };
};

export const stopHealthCheckLoop = (): void => {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
};

// ----------------------------- runtime introspection -----------------------------

export interface IngressSessionStatus {
  state: 'connecting' | 'connected' | 'closing' | 'closed';
  messagesForwarded: number;
  reconnectAttempts: number;
  lastEventAtMs?: number;
}

/**
 * Public read of one session's in-process state. Returns undefined when
 * no session exists for the (user, channel) pair — the bridge row may
 * still be persisted but the WSS hasn't been started (e.g. the API
 * restarted and resumeAllBridges hasn't run yet).
 */
export const getSessionStatus = (
  blackoutUserId: string,
  twitchChannel: string,
): IngressSessionStatus | undefined => {
  const session = sessions.get(sessionKey(blackoutUserId, twitchChannel));
  if (!session) return undefined;
  return {
    state: session.state,
    messagesForwarded: session.messagesForwarded,
    reconnectAttempts: session.reconnectAttempts,
    lastEventAtMs: session.lastEventAt,
  };
};

/** Re-exposed for downstream wiring (e.g., the Matrix forwarding handler). */
export { toMatrixForwardedMessage };

export const __test__ = { sessions, computeBackoffMs };
