import { db } from '../db/store';
import { sendChatMessage } from '../integrations/twitch/chatIngress';
import { sendBridgeMessage } from './youtubeChatBridge';
import { log } from '../telemetry/logger';

/**
 * Single entry point for "this Matrix room produced a message; mirror
 * it to whatever platforms are bridged to this room". Designed as the
 * service-internal hook the future Matrix appservice listener will
 * call when an outgoing den message lands.
 *
 * Loop prevention is the CALLER's responsibility:
 * filter out messages tagged with `m.blackout.origin` so a message we
 * forwarded INTO Matrix from Twitch / YouTube doesn't immediately get
 * sent BACK to the source. The router itself is unconditional — it
 * forwards every call.
 *
 * Per-room dispatch:
 *   - matches the room id against twitch_chat_bridges → Twitch /say
 *   - matches the room id against youtube_chat_bridges → YouTube /say
 *   - both can match (a room could be bridged to multiple platforms);
 *     each is attempted, and per-target outcomes are aggregated.
 *
 * No DB writes. No reentrancy guard — callers that wire this to a
 * Matrix listener are responsible for not creating loops.
 */

export interface RouteResult {
  /** Per-target outcomes keyed by an opaque target id ("twitch:<channel>" / "youtube:<bridgeId>"). */
  targets: Array<{
    target: string;
    kind: string;
    detail?: string;
  }>;
  /** Count of targets that returned the OK status for their platform. */
  delivered: number;
}

export interface RouteOptions {
  /** Pluggable fetch passed through to the YouTube outbound (Twitch is in-process). */
  fetch?: typeof fetch;
}

export const routeOutboundMatrixMessage = async (
  matrixRoomId: string,
  body: string,
  options: RouteOptions = {},
): Promise<RouteResult> => {
  const result: RouteResult = { targets: [], delivered: 0 };

  // ---- Twitch chat bridges ----
  const twitchBridges = [...db.twitchChatBridges.values()].filter(
    (row) => row.isActive && row.matrixRoomId === matrixRoomId,
  );
  for (const bridge of twitchBridges) {
    const target = `twitch:${bridge.twitchChannel}`;
    try {
      const outcome = sendChatMessage(bridge.blackoutUserId, bridge.twitchChannel, body);
      result.targets.push({
        target,
        kind: outcome.kind,
        detail: 'state' in outcome ? outcome.state : undefined,
      });
      if (outcome.kind === 'ok') result.delivered += 1;
      else
        log.info('outbound_router_twitch_skipped', {
          target,
          kind: outcome.kind,
        });
    } catch (err) {
      log.warn('outbound_router_twitch_threw', { target, error: String(err) });
      result.targets.push({ target, kind: 'threw', detail: String(err) });
    }
  }

  // ---- YouTube chat bridges ----
  const youtubeBridges = [...db.youtubeChatBridges.values()].filter(
    (row) => row.isActive && row.matrixRoomId === matrixRoomId,
  );
  for (const bridge of youtubeBridges) {
    const target = `youtube:${bridge.youtubeChannelId}`;
    try {
      const outcome = await sendBridgeMessage(bridge, body, { fetch: options.fetch });
      result.targets.push({
        target,
        kind: outcome.kind,
      });
      if (outcome.kind === 'ok') result.delivered += 1;
      else
        log.info('outbound_router_youtube_skipped', {
          target,
          kind: outcome.kind,
        });
    } catch (err) {
      log.warn('outbound_router_youtube_threw', { target, error: String(err) });
      result.targets.push({ target, kind: 'threw', detail: String(err) });
    }
  }

  return result;
};

/**
 * Caller-owned guard. Inspect a Matrix event content blob and return
 * true if it should be forwarded outbound. Excludes anything we
 * forwarded INTO Matrix ourselves (loop prevention).
 */
export const shouldRouteOutbound = (eventContent: Record<string, unknown>): boolean => {
  // Anything tagged with our origin marker came FROM a source platform
  // and must NOT be re-sent. Future origins should land here too.
  if (eventContent['m.blackout.origin']) return false;
  // Only route m.text / m.notice (skip reactions, redactions, encrypted-only events).
  const msgtype = (eventContent.msgtype ?? '') as string;
  return msgtype === 'm.text' || msgtype === 'm.notice';
};
