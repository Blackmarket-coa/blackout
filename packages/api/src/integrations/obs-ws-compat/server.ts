import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - ws has no bundled types
import { WebSocketServer } from 'ws';

import {
  Op,
  buildHello,
  buildIdentified,
  buildRequestResponse,
  computeClientAuth,
  dispatchRequest,
  parseFrame,
  randomBase64,
  REQ_STATUS,
  type Frame,
} from './protocol';
import { db } from '../../db/store';
import {
  decryptPasswordFor,
  noteUsed,
} from '../../services/obsWsPasswords';
import { log } from '../../telemetry/logger';

/**
 * OBS-WebSocket v5 server shim. External control surfaces (Bitfocus
 * Companion, Stream Deck, Touch Portal) connect to
 * `wss://<api>/obs-ws/<password-id>`, complete the standard OBS-WS
 * Hello / Identify auth dance, and from then on issue OBS-WS Requests
 * which we dispatch via the protocol layer's request matrix.
 *
 * Auth model: per-row password (services/obsWsPasswords.ts), AES-GCM-
 * encrypted at rest. Connection URL embeds the password row id; this is
 * what lets us pick the right password to challenge against without the
 * client first identifying.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WsClient = any;

interface ObsSession {
  ws: WsClient;
  passwordId: string;
  challenge: string;
  salt: string;
  /** Set after Identify validates against the expected response. */
  identified: boolean;
}

const sessions = new Set<ObsSession>();

const OBS_WS_PATH_PREFIX = '/obs-ws/';

const send = (ws: WsClient, frame: Frame): void => {
  if (ws.readyState !== 1 /* OPEN */) return;
  try {
    ws.send(JSON.stringify(frame));
  } catch (err) {
    log.warn('obs_ws_send_failed', { error: String(err) });
  }
};

const closeSession = (session: ObsSession, reason?: string, code = 1000): void => {
  sessions.delete(session);
  try {
    session.ws.close(code, reason ?? 'bye');
  } catch {
    // already closed
  }
};

interface AttachOptions {
  /** Override the path prefix. Default: '/obs-ws/'. The id is appended. */
  pathPrefix?: string;
}

/**
 * Attach an OBS-WS-compatible WS server to an http.Server. Returns a
 * disposer that closes all active sessions and removes the upgrade
 * listener. Mirrors the IRC shim pattern.
 */
export const attachObsWsShim = (
  server: HttpServer,
  options: AttachOptions = {},
): (() => void) => {
  const prefix = options.pathPrefix ?? OBS_WS_PATH_PREFIX;
  const wss = new WebSocketServer({ noServer: true });

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!req.url) return;
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith(prefix)) return;
    const passwordId = url.pathname.slice(prefix.length).split('/')[0];
    if (!passwordId) {
      socket.destroy();
      return;
    }
    const passwordRow = db.getActiveObsWsPassword(passwordId);
    if (!passwordRow) {
      // 404 the upgrade. Companion shows a friendly "couldn't connect"
      // rather than a misleading auth error.
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws: WsClient) => {
      registerConnection(ws, passwordRow.id);
    });
  };
  server.on('upgrade', onUpgrade);

  return () => {
    server.off('upgrade', onUpgrade);
    for (const session of [...sessions]) closeSession(session, 'shutdown');
    wss.close();
  };
};

const registerConnection = (ws: WsClient, passwordId: string): ObsSession => {
  const session: ObsSession = {
    ws,
    passwordId,
    challenge: randomBase64(32),
    salt: randomBase64(32),
    identified: false,
  };
  sessions.add(session);

  // Open the dance with Hello + auth params. Even though we COULD send
  // an unauth Hello (no `authentication` field) for sessions that don't
  // need a password, we always require auth — the URL row exists, we
  // know there's a password to verify against.
  send(
    ws,
    buildHello({ challenge: session.challenge, salt: session.salt }),
  );

  // Identify must arrive within a few seconds. Stream Deck plugins
  // sometimes hang on bad networks; the OBS reference uses a 4s window.
  const identifyTimer = setTimeout(() => {
    if (!session.identified) closeSession(session, 'identify_timeout', 4008);
  }, 4_000);

  ws.on('message', (data: Buffer | string) => {
    const text = typeof data === 'string' ? data : data.toString('utf8');
    handleInbound(session, text);
  });
  ws.on('close', () => {
    clearTimeout(identifyTimer);
    sessions.delete(session);
  });
  ws.on('error', () => {
    clearTimeout(identifyTimer);
    closeSession(session);
  });

  return session;
};

const handleInbound = (session: ObsSession, raw: string): void => {
  const parsed = parseFrame(raw);
  if (!parsed.ok) {
    log.info('obs_ws_invalid_frame', { reason: parsed.reason });
    return;
  }
  const { frame } = parsed;

  if (!session.identified) {
    if (frame.op !== Op.Identify) {
      // OBS-WS spec: pre-identify, only Identify is allowed.
      closeSession(session, 'pre_identify_protocol_error', 4002);
      return;
    }
    handleIdentify(session, frame);
    return;
  }

  switch (frame.op) {
    case Op.Request:
      handleRequest(session, frame);
      return;
    case Op.Reidentify:
      // Treat as a no-op identified-ack; Companion sends this if it wants
      // to update its event subscriptions.
      send(session.ws, buildIdentified());
      return;
    case Op.RequestBatch:
      // Future: implement batch dispatch. For now, surface the batch as
      // a not-implemented response per request inside it. Companion
      // doesn't typically use batches for the surfaces we care about.
      handleRequestBatch(session, frame);
      return;
    default:
      log.info('obs_ws_unhandled_op', { op: frame.op });
      return;
  }
};

const handleIdentify = (session: ObsSession, frame: Frame): void => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = (frame.d ?? {}) as any;
  const presented: string | undefined = d.authentication;
  if (typeof presented !== 'string' || !presented) {
    closeSession(session, 'authentication_missing', 4009);
    return;
  }
  const passwordRow = db.getActiveObsWsPassword(session.passwordId);
  if (!passwordRow) {
    closeSession(session, 'password_revoked', 4009);
    return;
  }
  let plaintext: string;
  try {
    plaintext = decryptPasswordFor(passwordRow);
  } catch (err) {
    log.warn('obs_ws_decrypt_failed', { passwordId: session.passwordId, error: String(err) });
    closeSession(session, 'auth_unavailable', 1011);
    return;
  }
  const expected = computeClientAuth(plaintext, session.salt, session.challenge);
  if (presented !== expected) {
    closeSession(session, 'authentication_failed', 4009);
    return;
  }
  session.identified = true;
  noteUsed(session.passwordId);
  send(session.ws, buildIdentified());
};

const handleRequest = (session: ObsSession, frame: Frame): void => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = (frame.d ?? {}) as any;
  const requestType: string = typeof d.requestType === 'string' ? d.requestType : '';
  const requestId: string = typeof d.requestId === 'string' ? d.requestId : '';
  if (!requestType || !requestId) {
    send(
      session.ws,
      buildRequestResponse(requestType || '?', requestId || '?', {
        result: false,
        code: REQ_STATUS.MissingRequestField,
        comment: 'requestType and requestId are required',
      }),
    );
    return;
  }
  const out = dispatchRequest(requestType, d.requestData);
  send(
    session.ws,
    buildRequestResponse(requestType, requestId, out.status, out.responseData),
  );
};

interface BatchedRequestEntry {
  requestType?: string;
  requestId?: string;
  requestData?: Record<string, unknown>;
}

const handleRequestBatch = (session: ObsSession, frame: Frame): void => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = (frame.d ?? {}) as any;
  const requestId: string = typeof d.requestId === 'string' ? d.requestId : '';
  const requests: BatchedRequestEntry[] = Array.isArray(d.requests) ? d.requests : [];
  const results = requests.map((entry) => {
    const rt = entry?.requestType ?? '?';
    const rid = entry?.requestId ?? '?';
    const out = dispatchRequest(rt, entry?.requestData);
    return {
      requestType: rt,
      requestId: rid,
      requestStatus: out.status,
      ...(out.responseData !== undefined ? { responseData: out.responseData } : {}),
    };
  });
  send(session.ws, {
    op: Op.RequestBatchResponse,
    d: { requestId, results },
  });
};

export const __test__ = { sessions };
