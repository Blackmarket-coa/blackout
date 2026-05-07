import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
// `ws` ships its own JS but no bundled types in 8.x and we don't pull
// in `@types/ws` here. The shape we need is intentionally narrow
// (constructor, handleUpgrade, on(message|close|error), send, close).
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - ws has no bundled types
import { WebSocketServer } from 'ws';

import {
  buildAuthFailedAndClose,
  buildJoinBurst,
  buildJoinDenied,
  buildOutgoingPrivmsg,
  buildWelcomeBurst,
  handleInboundLine,
  initConnectionState,
  type ConnectionState,
  type ServerEvent,
} from './ircServerProtocol';
import { noteUsed, verifyBearer } from '../../services/twitchIrcBotTokens';
import { db } from '../../db/store';
import {
  subscribeChatMessages,
  type HubChatMessage,
} from '../../services/chatMessageHub';
import { matrixClient as defaultMatrixClient } from '../matrix-client';
import type { MatrixSendEventClient } from '../../services/twitchChatBridge';
import { log } from '../../telemetry/logger';

/**
 * Twitch-IRC-compatible WS server. External Twitch chat bots connect to
 * `wss://<api-host>/twitch-irc` (HTTP upgrade), authenticate with the
 * `oauth:<bearer>` minted via /v1/integrations/twitch-compat/bot-tokens,
 * JOIN a `#channel` that maps to one of the creator's existing Twitch
 * chat bridges, and from then on:
 *
 *   - Inbound chat from the real Twitch (via twitchChatBridge → hub →
 *     this) is shipped to the bot as a Twitch-shape PRIVMSG.
 *   - The bot's outbound PRIVMSG is forwarded into the bridge's Matrix
 *     room with `m.blackout.origin = 'twitch_irc_compat_bot'`.
 *
 * Read-only on Twitch's side: we do NOT relay the bot's PRIVMSG back
 * out to Twitch IRC. The bridge is for plumbing bot events into
 * Blackout, not for piping bot output back to Twitch — the creator's
 * Twitch account already serves that purpose.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WsClient = any;

interface BotSession {
  ws: WsClient;
  state: ConnectionState;
  /** Set after successful PASS+NICK verification. */
  blackoutUserId?: string;
  tokenId?: string;
  /** Active per-channel hub disposers, keyed by channel slug (lowercased, with `#`). */
  subscriptions: Map<string, () => void>;
}

const sessions = new Set<BotSession>();

const send = (session: BotSession, lines: string[]): void => {
  if (lines.length === 0) return;
  if (session.ws.readyState !== 1 /* OPEN */) return;
  for (const line of lines) {
    try {
      session.ws.send(line);
    } catch (err) {
      log.warn('twitch_irc_shim_send_failed', { error: String(err) });
    }
  }
};

const closeSession = (session: BotSession, reason?: string): void => {
  for (const dispose of session.subscriptions.values()) {
    try {
      dispose();
    } catch {
      // ignore
    }
  }
  session.subscriptions.clear();
  sessions.delete(session);
  try {
    session.ws.close(1000, reason ?? 'bye');
  } catch {
    // already closed
  }
};

/**
 * Resolve a bot's `JOIN #channel` to one of the creator's chat bridges.
 *
 * Channel-name conventions (lowercased — IRC channel names are
 * case-insensitive):
 *   `#<login>`             — Twitch chat bridge (twitch_chat_bridges.twitchChannel)
 *   `#yt:<channelId>`      — YouTube chat bridge (youtube_chat_bridges.youtubeChannelId)
 *   `#kick:<chatroomId>`   — Kick chat bridge (kick_chat_bridges.kickChatroomId)
 *
 * Bots author one connection across every platform the creator's
 * bridged. PRIVMSG into any of these always lands in the bridge's
 * Matrix room (we don't try to relay back out to YouTube / Kick).
 */
const findBridgeForJoin = (
  blackoutUserId: string,
  channel: string,
): { matrixRoomId: string; source: 'twitch' | 'youtube' | 'kick' } | null => {
  if (!channel.startsWith('#')) return null;
  const slug = channel.slice(1);

  if (slug.startsWith('yt:')) {
    const channelId = slug.slice(3);
    if (!channelId) return null;
    const bridges = db.listYoutubeChatBridgesForUser(blackoutUserId);
    const match = bridges.find(
      (b) => b.isActive && b.youtubeChannelId.toLowerCase() === channelId,
    );
    return match ? { matrixRoomId: match.matrixRoomId, source: 'youtube' } : null;
  }

  if (slug.startsWith('kick:')) {
    const chatroomId = slug.slice(5);
    if (!chatroomId) return null;
    const bridges = db.listKickChatBridgesForUser(blackoutUserId);
    const match = bridges.find((b) => b.isActive && b.kickChatroomId === chatroomId);
    return match ? { matrixRoomId: match.matrixRoomId, source: 'kick' } : null;
  }

  // Default: Twitch chat bridge keyed by login slug.
  const bridges = db.listTwitchChatBridgesForUser(blackoutUserId);
  const match = bridges.find(
    (b) => b.isActive && b.twitchChannel.toLowerCase() === slug,
  );
  return match ? { matrixRoomId: match.matrixRoomId, source: 'twitch' } : null;
};

interface AttachOptions {
  matrixClient?: MatrixSendEventClient;
  /** Override the path the WS server listens on. Default: '/twitch-irc'. */
  path?: string;
}

/**
 * Attach a Twitch-IRC-compatible WS server to an existing http.Server.
 * Idempotent if called twice with the same path; the second call replaces
 * the listener. Returns a disposer that closes all active sessions and
 * removes the upgrade handler.
 */
export const attachTwitchIrcShim = (
  server: HttpServer,
  options: AttachOptions = {},
): (() => void) => {
  const matrix = options.matrixClient ?? defaultMatrixClient;
  const path = options.path ?? '/twitch-irc';
  const wss = new WebSocketServer({ noServer: true });

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!req.url) return;
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== path) return;
    wss.handleUpgrade(req, socket, head, (ws: WsClient) => {
      registerConnection(ws, matrix);
    });
  };
  server.on('upgrade', onUpgrade);

  return () => {
    server.off('upgrade', onUpgrade);
    for (const session of [...sessions]) closeSession(session, 'shutdown');
    wss.close();
  };
};

const registerConnection = (ws: WsClient, matrix: MatrixSendEventClient): BotSession => {
  const session: BotSession = {
    ws,
    state: initConnectionState(),
    subscriptions: new Map(),
  };
  sessions.add(session);

  ws.on('message', (data: Buffer | string) => {
    const buf = typeof data === 'string' ? data : data.toString('utf8');
    // IRC is line-delimited; multiple lines may arrive in one frame.
    for (const raw of buf.split(/\r?\n/)) {
      if (!raw) continue;
      const events = handleInboundLine(session.state, raw);
      for (const evt of events) handleEvent(session, evt, matrix);
    }
  });

  ws.on('close', () => closeSession(session));
  ws.on('error', () => closeSession(session));

  return session;
};

const handleEvent = (
  session: BotSession,
  evt: ServerEvent,
  matrix: MatrixSendEventClient,
): void => {
  switch (evt.kind) {
    case 'send':
      send(session, evt.lines);
      return;
    case 'auth_attempt': {
      const record = verifyBearer(evt.presentedBearer);
      if (!record) {
        send(session, buildAuthFailedAndClose());
        closeSession(session, 'auth_failed');
        return;
      }
      session.blackoutUserId = record.blackoutUserId;
      session.tokenId = record.id;
      session.state.authenticated = true;
      session.state.registered = true;
      noteUsed(record.id);
      send(session, buildWelcomeBurst(session.state.nick ?? 'bot'));
      return;
    }
    case 'join_request': {
      if (!session.blackoutUserId) {
        send(session, buildJoinDenied(session.state.nick ?? '*', evt.channel));
        return;
      }
      const bridge = findBridgeForJoin(session.blackoutUserId, evt.channel);
      if (!bridge) {
        // The bot tried to JOIN a channel the creator hasn't bridged.
        send(session, buildJoinDenied(session.state.nick ?? '*', evt.channel));
        return;
      }
      session.state.joinedChannels.add(evt.channel);
      // Subscribe to the in-process hub so chat from whatever platform
      // the channel resolves to (Twitch / YouTube / Kick — see
      // findBridgeForJoin) reaches the bot as a Twitch-shape PRIVMSG.
      const dispose = subscribeChatMessages({
        key: { blackoutUserId: session.blackoutUserId, channelKey: evt.channel },
        listener: (msg: HubChatMessage) =>
          send(session, [
            buildOutgoingPrivmsg({
              channel: evt.channel,
              authorLogin: msg.authorLogin,
              body: msg.body,
              tags: msg.tags,
            }),
          ]),
      });
      session.subscriptions.set(evt.channel, dispose);
      send(session, buildJoinBurst(session.state.nick ?? 'bot', evt.channel));
      return;
    }
    case 'part_request': {
      const dispose = session.subscriptions.get(evt.channel);
      if (dispose) {
        dispose();
        session.subscriptions.delete(evt.channel);
      }
      return;
    }
    case 'privmsg': {
      if (!session.blackoutUserId) return;
      const bridge = findBridgeForJoin(session.blackoutUserId, evt.channel);
      if (!bridge) return;
      // Forward into the bridge's Matrix room. `m.blackout.origin` lets
      // downstream consumers (and the bridge's own re-entry guard) see
      // these were authored by an external IRC bot, not by chat bridge
      // ingress.
      const content = {
        msgtype: 'm.text',
        body: evt.body,
        'm.blackout.origin': 'twitch_irc_compat_bot',
        'm.blackout.origin_sender_username': session.state.nick,
        ...(session.tokenId ? { 'm.blackout.origin_token_id': session.tokenId } : {}),
      };
      const txnId = `twitch-irc-bot-${session.tokenId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      void matrix
        .sendEvent(bridge.matrixRoomId, content, { txnId })
        .then((res) => {
          if (!res.ok) {
            log.warn('twitch_irc_shim_matrix_send_failed', {
              tokenId: session.tokenId,
              channel: evt.channel,
              status: res.status,
            });
          }
        })
        .catch((err) =>
          log.warn('twitch_irc_shim_matrix_send_threw', {
            tokenId: session.tokenId,
            error: String(err),
          }),
        );
      return;
    }
    case 'ping':
      // PING is auto-handled by the protocol layer (PONG line emitted via
      // a `send` event); nothing extra to do here.
      return;
    case 'quit':
      closeSession(session, evt.reason);
      return;
    case 'unknown':
      log.info('twitch_irc_shim_unknown_command', {
        command: evt.command,
        params: evt.params,
      });
      return;
  }
};

export const __test__ = { sessions, registerConnection, handleEvent };
