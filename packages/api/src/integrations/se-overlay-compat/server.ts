import type { Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server as SocketIoServer, type Socket } from 'socket.io';

import { subscribe as subscribeWidgetBus } from '../../services/widgetBus';
import {
  recordWidgetDelivery,
  verifyWidgetAlertSecret,
} from '../../services/widgetAlertTokens';
import { widgetEventToSeFrame } from '../widgets/seOverlayShape';
import { log } from '../../telemetry/logger';

/**
 * StreamElements OverlayWS-compatible socket.io shim.
 *
 * Off-the-shelf StreamElements browser-source overlay HTML connects to
 * `wss://realtime.streamelements.com` with engine.io 4 / socket.io 4
 * and authenticates by emitting:
 *
 *   socket.emit('authenticate', { method: 'jwt' | 'apikey' | 'overlayToken', token })
 *
 * On success the SE realtime endpoint emits `authenticated` once; from
 * then on every alert lands as a single `event` frame
 * (`socket.emit('event', { type, provider, data, _id, createdAt })`).
 *
 * This shim mirrors that protocol exactly so an existing SE overlay
 * works unmodified once its endpoint URL is repointed at
 * `ws://blackout-api/se-overlay/`. Auth is done against our existing
 * widgetAlertTokens table (the same secrets that gate the SSE feed at
 * `routes/widgetAlerts.ts`); the `method` field is accepted in any of
 * the three forms SE supports — we only validate `token`.
 *
 * Like every other shim in `integrations/*-compat`, this attaches to
 * the existing http.Server in `noServer`-equivalent mode so it
 * coexists with `/obs-ws/*` and `/twitch-irc` upgrade listeners.
 * `transports: ['websocket']` (no HTTP polling fallback) keeps us off
 * the `request` event listener path and avoids stepping on Hono's own
 * handler.
 */

const SE_OVERLAY_PATH = '/se-overlay/';

interface SeSession {
  id: string;
  socket: Socket;
  blackoutUserId: string;
  connectedAt: number;
  authenticatedAt: number;
  unsubscribe: () => void;
}

const sessions = new Set<SeSession>();

export interface SeSessionSnapshot {
  id: string;
  connectedAt: number;
  authenticatedAt: number;
}

export const listSessionsForUser = (
  blackoutUserId: string,
): SeSessionSnapshot[] => {
  const out: SeSessionSnapshot[] = [];
  for (const s of sessions) {
    if (s.blackoutUserId !== blackoutUserId) continue;
    out.push({
      id: s.id,
      connectedAt: s.connectedAt,
      authenticatedAt: s.authenticatedAt,
    });
  }
  return out;
};

export interface AttachOptions {
  /** Override the socket.io path. Default: `/se-overlay/`. */
  path?: string;
}

interface AuthenticatePayload {
  method?: string;
  token?: string;
}

const isAuthenticatePayload = (v: unknown): v is AuthenticatePayload =>
  typeof v === 'object' && v !== null && 'token' in (v as Record<string, unknown>);

export const attachSeOverlayShim = (
  server: HttpServer,
  options: AttachOptions = {},
): (() => void) => {
  const path = options.path ?? SE_OVERLAY_PATH;
  const io = new SocketIoServer(server, {
    path,
    transports: ['websocket'],
    // Permissive CORS — overlay HTML often runs in an OBS browser
    // source whose `Origin` header is `https://absolute` (a CEF
    // quirk). Token auth is what gates access, not Origin.
    cors: { origin: '*' },
    serveClient: false,
  });

  io.on('connection', (socket: Socket) => {
    const connectedAt = Date.now();
    let session: SeSession | null = null;
    const authTimer = setTimeout(() => {
      // Disconnect anyone who hasn't authenticated within 10 seconds.
      // SE overlays send `authenticate` immediately on connect; a long
      // idle is either a misconfigured overlay or a port scanner.
      if (!session) {
        try {
          socket.emit('unauthorized', { code: 'auth_timeout' });
        } catch {
          // socket already gone
        }
        socket.disconnect(true);
      }
    }, 10_000);

    socket.on('authenticate', (payload: unknown) => {
      if (session) return; // ignore duplicate authenticate
      if (!isAuthenticatePayload(payload)) {
        socket.emit('unauthorized', { code: 'malformed_payload' });
        socket.disconnect(true);
        return;
      }
      const verified = verifyWidgetAlertSecret(payload.token ?? '');
      if (!verified) {
        socket.emit('unauthorized', { code: 'invalid_token' });
        socket.disconnect(true);
        return;
      }

      const id = randomUUID();
      const unsubscribe = subscribeWidgetBus(verified.blackoutUserId, (evt) => {
        const frame = widgetEventToSeFrame(evt);
        if (!frame) return;
        try {
          socket.emit('event', frame);
          recordWidgetDelivery(verified);
        } catch (err) {
          log.warn('se_overlay_emit_failed', {
            sessionId: id,
            error: String(err),
          });
        }
      });

      session = {
        id,
        socket,
        blackoutUserId: verified.blackoutUserId,
        connectedAt,
        authenticatedAt: Date.now(),
        unsubscribe,
      };
      sessions.add(session);
      clearTimeout(authTimer);

      // The SE wire is `authenticated` (past-tense). Most overlays
      // listen for this exact name; drift here breaks them silently.
      socket.emit('authenticated', {
        clientId: id,
        channelId: verified.blackoutUserId,
        scopes: verified.scopes,
      });
    });

    socket.on('disconnect', () => {
      clearTimeout(authTimer);
      if (session) {
        session.unsubscribe();
        sessions.delete(session);
      }
    });
  });

  return () => {
    clearTimeout(undefined as unknown as NodeJS.Timeout); // no-op: per-session
    for (const s of [...sessions]) {
      try {
        s.unsubscribe();
        s.socket.disconnect(true);
      } catch {
        // socket already gone
      }
      sessions.delete(s);
    }
    void io.close();
  };
};

export const __test__ = { sessions };
