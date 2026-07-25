import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - ws has no bundled types
import { WebSocketServer } from 'ws';

import { randomUUID } from 'node:crypto';
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
    type DispatchResult,
    type Frame,
    type MuteCommands,
    type StreamCommands,
} from './protocol';
import { db } from '../../db/store';
import { decryptPasswordFor, noteUsed } from '../../services/obsWsPasswords';
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
    blackoutUserId: string;
    challenge: string;
    salt: string;
    /** Set after Identify validates against the expected response. */
    identified: boolean;
    commands: StreamCommands;
    muteCommands?: MuteCommands;
    /** ms-since-epoch of the WebSocket upgrade. */
    connectedAt: number;
    /** Set when {@link identified} flips true. Useful for surfacing "live since". */
    identifiedAt?: number;
    /** ms-since-epoch of the most recent inbound frame from the surface. */
    lastActivityAt: number;
}

const sessions = new Set<ObsSession>();

const OBS_WS_PATH_PREFIX = '/obs-ws/';

/** Public projection — never leaks the WebSocket internals or challenge/salt. */
export interface ObsSessionSnapshot {
    /** Match this to a row in obs_ws_passwords to get the human label. */
    passwordId: string;
    connectedAt: number;
    identifiedAt: number;
    lastActivityAt: number;
}

export const listSessionsForUser = (blackoutUserId: string): ObsSessionSnapshot[] => {
    const out: ObsSessionSnapshot[] = [];
    for (const s of sessions) {
        if (!s.identified) continue;
        if (s.blackoutUserId !== blackoutUserId) continue;
        out.push({
            passwordId: s.passwordId,
            connectedAt: s.connectedAt,
            identifiedAt: s.identifiedAt ?? s.connectedAt,
            lastActivityAt: s.lastActivityAt,
        });
    }
    return out;
};

/**
 * Push an OBS-WS Event (op 5) to every identified session belonging to
 * a creator. Wire shape mirrors OBS-WS:
 *   { op: 5, d: { eventType, eventIntent, eventData } }
 *
 * Reference Companion / Stream Deck plugins re-render their button
 * tiles on receipt — so a stream that just went live via the Blackout
 * UI lights up the Companion "Stream live" indicator without the user
 * pressing anything.
 */
export const notifyStreamStarted = (blackoutUserId: string): void => {
    broadcastEvent(blackoutUserId, 'StreamStateChanged', {
        outputActive: true,
        outputState: 'OBS_WEBSOCKET_OUTPUT_STARTED',
    });
};

export const notifyStreamEnded = (blackoutUserId: string): void => {
    broadcastEvent(blackoutUserId, 'StreamStateChanged', {
        outputActive: false,
        outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPED',
    });
};

/**
 * Push a custom Blackout-namespaced Event to every identified session
 * for a creator. We use the `blackout.<event-type>` namespace so OBS-WS
 * surfaces can opt into Blackout-specific tiles (Companion presets:
 * "blink the deck on a new tip") without colliding with OBS's own
 * event vocabulary. Called from services/outboundEventWebhooks.dispatchEvent
 * so every event source that already fires through the outbound webhook
 * pipeline ALSO reaches surfaces.
 */
export const notifyBlackoutEvent = (
    blackoutUserId: string,
    blackoutEventType: string,
    eventData: Record<string, unknown>
): void => {
    broadcastEvent(blackoutUserId, `blackout.${blackoutEventType}`, eventData);
};

const broadcastEvent = (
    blackoutUserId: string,
    eventType: string,
    eventData: Record<string, unknown>
): void => {
    // High-bit-mask intent field per OBS-WS spec; we don't filter by
    // bitmask yet (every identified session gets every event we emit) so
    // we send `0` to mean "general".
    const frame = {
        op: Op.Event,
        d: { eventType, eventIntent: 0, eventData },
    };
    for (const s of sessions) {
        if (!s.identified) continue;
        if (s.blackoutUserId !== blackoutUserId) continue;
        try {
            send(s.ws, frame);
        } catch (err) {
            log.warn('obs_ws_event_broadcast_failed', {
                passwordId: s.passwordId,
                eventType,
                error: String(err),
            });
        }
    }
};

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
    /** Inject stream commands. Tests override; production uses the db-backed default. */
    streamCommands?: StreamCommands;
    /**
     * Inject mute commands. Production wires through to
     * `services/livekitAdmin.ts`; tests inject a stub so the
     * livekit-server-sdk never makes a real network call. When
     * undefined, SetInputMute / GetInputMute / ToggleInputMute return
     * NotImplemented (204).
     */
    muteCommands?: MuteCommands;
}

/**
 * Default {@link StreamCommands} implementation backed by the db store.
 * "Active session" = the most recent session row whose `endedAt` is null.
 * "Default stream" = the creator's most-recently-updated StreamRecord;
 *   if they don't have one yet, StartStream returns NotReady.
 */
const defaultStreamCommands = (): StreamCommands => ({
    getStreamStatus: (blackoutUserId) => {
        const streams = db.listStreamsByCreator(blackoutUserId);
        if (streams.length === 0) {
            return { outputActive: false, outputDuration: 0 };
        }
        // Across all of the creator's streams, find the most recently
        // started session that hasn't ended yet.
        let active: { streamId: string; sessionId: string; startedAtMs: number } | undefined;
        for (const stream of streams) {
            const sessions = db.listStreamSessions(stream.id);
            for (const sess of sessions) {
                if (sess.endedAt) continue;
                const startedAtMs = Date.parse(sess.startedAt);
                if (!active || startedAtMs > active.startedAtMs) {
                    active = { streamId: stream.id, sessionId: sess.id, startedAtMs };
                }
            }
        }
        if (active) {
            return {
                outputActive: true,
                outputDuration: Math.max(0, Date.now() - active.startedAtMs),
                sessionId: active.sessionId,
                streamId: active.streamId,
            };
        }
        return {
            outputActive: false,
            outputDuration: 0,
            streamId: streams[0]?.id,
        };
    },
    startStream: (blackoutUserId) => {
        const streams = db.listStreamsByCreator(blackoutUserId);
        if (streams.length === 0) {
            return {
                ok: false,
                reason: 'No stream record yet — create a stream in the Blackout UI before starting from a control surface.',
            };
        }
        // Idempotent: return the existing active session if one is open.
        const stream = streams[0];
        const open = db.listStreamSessions(stream.id).find((s) => !s.endedAt);
        if (open) return { ok: true, sessionId: open.id };
        const session = db.createStreamSession({
            id: randomUUID(),
            streamId: stream.id,
            startedAt: new Date().toISOString(),
        });
        return { ok: true, sessionId: session.id };
    },
    stopStream: (blackoutUserId) => {
        const streams = db.listStreamsByCreator(blackoutUserId);
        let ended = false;
        for (const stream of streams) {
            for (const sess of db.listStreamSessions(stream.id)) {
                if (!sess.endedAt) {
                    db.endStreamSession(sess.id);
                    ended = true;
                }
            }
        }
        return { ok: true, ended };
    },
});

/**
 * Attach an OBS-WS-compatible WS server to an http.Server. Returns a
 * disposer that closes all active sessions and removes the upgrade
 * listener. Mirrors the IRC shim pattern.
 */
/**
 * Default mute commands wired through to LiveKit. Lazily imported to
 * keep the livekit-server-sdk out of test bundles that don't exercise
 * the mute path.
 */
const defaultMuteCommands = (): MuteCommands => ({
    async setInputMute(userId, inputName, muted) {
        const m = await import('../../services/livekitAdmin');
        return m.setInputMute(userId, inputName, muted);
    },
    async getInputMute(userId, inputName) {
        const m = await import('../../services/livekitAdmin');
        return m.getInputMute(userId, inputName);
    },
    async toggleInputMute(userId, inputName) {
        const m = await import('../../services/livekitAdmin');
        return m.toggleInputMute(userId, inputName);
    },
});

export const attachObsWsShim = (server: HttpServer, options: AttachOptions = {}): (() => void) => {
    const prefix = options.pathPrefix ?? OBS_WS_PATH_PREFIX;
    const commands = options.streamCommands ?? defaultStreamCommands();
    const muteCommands = options.muteCommands ?? defaultMuteCommands();
    // Cap frame size well below the `ws` 100 MiB default: OBS-WS control
    // messages are small JSON, and this shim is attached outside the Hono
    // middleware chain, so an unauthenticated peer must not be able to amplify
    // memory via oversized frames pre-auth.
    const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });

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
            registerConnection(
                ws,
                passwordRow.id,
                passwordRow.blackoutUserId,
                commands,
                muteCommands
            );
        });
    };
    server.on('upgrade', onUpgrade);

    return () => {
        server.off('upgrade', onUpgrade);
        for (const session of [...sessions]) closeSession(session, 'shutdown');
        wss.close();
    };
};

const registerConnection = (
    ws: WsClient,
    passwordId: string,
    blackoutUserId: string,
    commands: StreamCommands,
    muteCommands?: MuteCommands
): ObsSession => {
    const now = Date.now();
    const session: ObsSession = {
        ws,
        passwordId,
        blackoutUserId,
        challenge: randomBase64(32),
        salt: randomBase64(32),
        identified: false,
        commands,
        muteCommands,
        connectedAt: now,
        lastActivityAt: now,
    };
    sessions.add(session);

    // Open the dance with Hello + auth params. Even though we COULD send
    // an unauth Hello (no `authentication` field) for sessions that don't
    // need a password, we always require auth — the URL row exists, we
    // know there's a password to verify against.
    send(ws, buildHello({ challenge: session.challenge, salt: session.salt }));

    // Identify must arrive within a few seconds. Stream Deck plugins
    // sometimes hang on bad networks; the OBS reference uses a 4s window.
    const identifyTimer = setTimeout(() => {
        if (!session.identified) closeSession(session, 'identify_timeout', 4008);
    }, 4_000);

    ws.on('message', (data: Buffer | string) => {
        const text = typeof data === 'string' ? data : data.toString('utf8');
        session.lastActivityAt = Date.now();
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
    session.identifiedAt = Date.now();
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
            })
        );
        return;
    }
    const dispatched = dispatchRequest(requestType, d.requestData, {
        blackoutUserId: session.blackoutUserId,
        commands: session.commands,
        muteCommands: session.muteCommands,
    });
    void Promise.resolve(dispatched)
        .then((out: DispatchResult) => {
            send(
                session.ws,
                buildRequestResponse(requestType, requestId, out.status, out.responseData)
            );
        })
        .catch((err) => {
            log.warn('obs_ws_dispatch_failed', { requestType, error: String(err) });
            send(
                session.ws,
                buildRequestResponse(requestType, requestId, {
                    result: false,
                    // OBS-WS spec: 700 = RequestProcessingFailed.
                    code: 700,
                    comment: 'dispatch threw',
                })
            );
        });
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
    const ctx = {
        blackoutUserId: session.blackoutUserId,
        commands: session.commands,
        muteCommands: session.muteCommands,
    };
    void Promise.all(
        requests.map(async (entry) => {
            const rt = entry?.requestType ?? '?';
            const rid = entry?.requestId ?? '?';
            const out = await Promise.resolve(dispatchRequest(rt, entry?.requestData, ctx));
            return {
                requestType: rt,
                requestId: rid,
                requestStatus: out.status,
                ...(out.responseData !== undefined ? { responseData: out.responseData } : {}),
            };
        })
    ).then((results) => {
        send(session.ws, {
            op: Op.RequestBatchResponse,
            d: { requestId, results },
        });
    });
};

export const __test__ = { sessions };
