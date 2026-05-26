import { randomUUID } from 'node:crypto';
import { db } from '../db/store';
import type { TwitchChatBridgeRecord } from '../db/types';
import { getLinkedAccount } from './linkedAccounts';
import {
  startChatIngress,
  toMatrixForwardedMessage,
  type IrcSocketFactory,
  type SessionHandle,
} from '../integrations/twitch/chatIngress';
import type { NormalizedChatMessage } from '../integrations/twitch/chatBridge';
import { matrixClient as defaultMatrixClient } from '../integrations/matrix-client';
import {
  subscribeToBridgeEvents,
  unsubscribeBridgeEvents,
} from './twitchEventSubManager';
import { dispatchEvent as dispatchOutboundEvent } from './outboundEventWebhooks';
import { publishChatMessage } from './chatMessageHub';
import type { HelixDeps } from '../integrations/twitch/helix';
import { log } from '../telemetry/logger';

/**
 * Phase 1 / Track A wiring: turns a (creator, twitch channel, matrix
 * room) declaration into a live WSS-→-Matrix bridge.
 *
 * Persistence lives in `twitch_chat_bridges`. The in-process WS lifecycle
 * is owned by `integrations/twitch/chatIngress.ts`. This service is the
 * thin layer that:
 *   1. validates the creator has actually linked Twitch,
 *   2. persists the bridge declaration,
 *   3. starts the ingress with an `onMessage` that forwards each
 *      normalized message into the chosen Matrix room as a
 *      `m.room.message` carrying `m.blackout.origin = "twitch"` and
 *      origin metadata under `m.blackout.*`.
 *
 * The Matrix client and the IRC socket factory are dependency-injected so
 * the orchestrator is testable end-to-end. Production callers omit both
 * to get the real Synapse client + Node WebSocket.
 */

/** Minimal subset of matrixClient that the bridge actually needs. */
export interface MatrixSendEventClient {
  sendEvent: (
    roomId: string,
    // Any JSON-serializable event content; typed message objects are accepted.
    content: object,
    options?: { eventType?: string; txnId?: string },
  ) => Promise<{ ok: boolean; status?: number; reason?: 'matrix_not_configured' }>;
}

export interface BridgeServiceOptions {
  matrixClient?: MatrixSendEventClient;
  socketFactory?: IrcSocketFactory;
  /**
   * Pluggable helix deps (fetch + clock). Used to inject stubs in tests so
   * createBridge / deleteBridge can drive the EventSub subscription
   * lifecycle without hitting real Twitch.
   */
  helix?: HelixDeps;
  /**
   * If true, skip the Helix EventSub subscribe/unsubscribe round-trip.
   * Used by `resumeAllBridges` (subscriptions persist on Twitch's side
   * across restarts) and by tests that want to focus on chat ingress.
   */
  skipEventSub?: boolean;
}

export interface CreateBridgeInput {
  blackoutUserId: string;
  twitchChannel: string;
  matrixRoomId: string;
}

export type CreateBridgeOutcome =
  | { kind: 'ok'; record: TwitchChatBridgeRecord }
  | { kind: 'twitch_not_linked' }
  | { kind: 'already_bridged'; record: TwitchChatBridgeRecord }
  | { kind: 'invalid_input'; reason: string };

const MATRIX_ROOM_RE = /^[!#][^:\s]+:[^:\s]+$/;

const validateInput = (input: CreateBridgeInput): { ok: true } | { ok: false; reason: string } => {
  if (!input.blackoutUserId) return { ok: false, reason: 'blackoutUserId is required' };
  const ch = input.twitchChannel?.trim();
  if (!ch) return { ok: false, reason: 'twitchChannel is required' };
  if (!/^[a-zA-Z0-9_]{1,25}$/.test(ch)) return { ok: false, reason: 'twitchChannel must be a Twitch login (1-25 chars, [A-Za-z0-9_])' };
  if (!input.matrixRoomId?.trim()) return { ok: false, reason: 'matrixRoomId is required' };
  if (!MATRIX_ROOM_RE.test(input.matrixRoomId.trim())) {
    return { ok: false, reason: 'matrixRoomId must look like "!roomid:server" or "#alias:server"' };
  }
  return { ok: true };
};

// In-process registry of live ingress sessions, keyed by bridge id. Lets
// `deleteBridge` find and stop the right session even when multiple bridges
// share a creator.
const liveSessions = new Map<string, SessionHandle>();

const buildOnMessage =
  (record: TwitchChatBridgeRecord, matrix: MatrixSendEventClient) =>
  (msg: NormalizedChatMessage): void => {
    const content = toMatrixForwardedMessage(msg);
    // Use the platform-message-id as the Matrix txn id when present so the
    // same Twitch message never double-delivers if Twitch retransmits or
    // we reconnect mid-PRIVMSG flush.
    const txnId = msg.platformMessageId ? `twitch-${msg.platformMessageId}` : undefined;
    // Fan out to the in-process chatMessageHub so the Twitch IRC bot
    // shim (and future OBS-WS / Discord-compat gateway) can deliver the
    // same firehose to bots that JOIN'd this channel. Channel key uses
    // the `#login` shape so a bot's `JOIN #foo` literally subscribes to
    // the same key the bridge publishes against.
    publishChatMessage(
      { blackoutUserId: record.blackoutUserId, channelKey: `#${record.twitchChannel.toLowerCase()}` },
      {
        source: 'twitch',
        authorLogin: msg.authorLogin,
        authorDisplayName: msg.authorDisplayName,
        body: msg.body,
        platformMessageId: msg.platformMessageId,
        tags: {
          ...(msg.authorDisplayName ? { 'display-name': msg.authorDisplayName } : {}),
          ...(msg.authorColor ? { color: msg.authorColor } : {}),
          ...(msg.platformMessageId ? { id: msg.platformMessageId } : {}),
          ...(msg.bits ? { bits: String(msg.bits) } : {}),
          'tmi-sent-ts': String(msg.sentAtMs),
        },
      },
    );
    // Chat is high-volume; dispatch only fires on outbound subscriptions
    // that explicitly opted into chat.message.received. The eventType
    // filter in services/outboundEventWebhooks.matchesEventType protects
    // creators who only want tips/follows from being firehosed.
    void dispatchOutboundEvent({
      type: 'chat.message.received',
      blackoutUserId: record.blackoutUserId,
      data: {
        source: 'twitch',
        twitchChannel: record.twitchChannel,
        authorLogin: msg.authorLogin,
        authorDisplayName: msg.authorDisplayName,
        body: msg.body,
        platformMessageId: msg.platformMessageId,
        bits: msg.bits,
      },
    }).catch(() => {});
    void matrix
      .sendEvent(record.matrixRoomId, content, { txnId })
      .then((result) => {
        if (!result.ok) {
          log.warn('twitch_chat_bridge_matrix_send_failed', {
            bridgeId: record.id,
            roomId: record.matrixRoomId,
            status: result.status,
            reason: result.reason,
          });
        }
      })
      .catch((err) => {
        log.warn('twitch_chat_bridge_matrix_send_threw', {
          bridgeId: record.id,
          roomId: record.matrixRoomId,
          error: String(err),
        });
      });
  };

/**
 * Start (or restart) the ingress for an existing bridge record. Used by
 * createBridge and by resumeAllBridges() at boot.
 */
export const startBridge = async (
  record: TwitchChatBridgeRecord,
  options: BridgeServiceOptions = {},
): Promise<SessionHandle> => {
  const matrix = options.matrixClient ?? defaultMatrixClient;
  const handle = await startChatIngress({
    blackoutUserId: record.blackoutUserId,
    twitchChannel: record.twitchChannel,
    onMessage: buildOnMessage(record, matrix),
    socketFactory: options.socketFactory,
  });
  liveSessions.set(record.id, handle);
  return handle;
};

export const createBridge = async (
  input: CreateBridgeInput,
  options: BridgeServiceOptions = {},
): Promise<CreateBridgeOutcome> => {
  const valid = validateInput(input);
  if (!valid.ok) return { kind: 'invalid_input', reason: valid.reason };

  const channel = input.twitchChannel.toLowerCase();
  const matrixRoomId = input.matrixRoomId.trim();

  // Require a linked Twitch account before declaring a bridge — chatIngress
  // would fail to connect otherwise, and we want to surface that early.
  const link = getLinkedAccount(input.blackoutUserId, 'twitch');
  if (!link) return { kind: 'twitch_not_linked' };

  const existing = db.findTwitchChatBridge(input.blackoutUserId, channel);
  if (existing) {
    // If the existing bridge points at a different room, fail — the caller
    // should explicitly delete + recreate. If it's the same room, treat as
    // idempotent (return the existing record).
    if (existing.matrixRoomId !== matrixRoomId) {
      return { kind: 'already_bridged', record: existing };
    }
    if (!existing.isActive) {
      const reactivated = db.updateTwitchChatBridge(existing.id, {
        isActive: true,
        lastStoppedAt: undefined,
        lastStoppedReason: undefined,
      });
      if (reactivated) {
        await startBridge(reactivated, options);
        return { kind: 'ok', record: reactivated };
      }
    } else if (!liveSessions.has(existing.id)) {
      // Active in DB but no live session (e.g. after a restart): start it.
      await startBridge(existing, options);
    }
    return { kind: 'ok', record: existing };
  }

  const record = db.createTwitchChatBridge({
    id: randomUUID(),
    blackoutUserId: input.blackoutUserId,
    twitchChannel: channel,
    matrixRoomId,
    isActive: true,
  });
  await startBridge(record, options);

  // Active EventSub subscriptions (follow/sub/cheer/raid) are best-effort
  // alongside chat ingress. A failure here does NOT roll the bridge back
  // — the creator can still see chat; alerts simply won't fire. The
  // failure surfaces in logs and the returned record so the UI can
  // surface "alerts not subscribed; please re-link Twitch" if it cares.
  if (!options.skipEventSub) {
    try {
      const sub = await subscribeToBridgeEvents(record, options.helix);
      if (sub.failures.length > 0) {
        log.warn('twitch_chat_bridge_eventsub_partial_failure', {
          bridgeId: record.id,
          failures: sub.failures.map((f) => ({ type: f.type, kind: f.outcome.kind })),
        });
      }
    } catch (err) {
      log.warn('twitch_chat_bridge_eventsub_threw', {
        bridgeId: record.id,
        error: String(err),
      });
    }
  }
  return { kind: 'ok', record };
};

export const listBridgesForUser = (userId: string): TwitchChatBridgeRecord[] =>
  db.listTwitchChatBridgesForUser(userId);

export type DeleteBridgeOutcome =
  | { kind: 'ok' }
  | { kind: 'not_found' }
  | { kind: 'forbidden' };

export const deleteBridge = async (
  blackoutUserId: string,
  bridgeId: string,
  reason = 'user_deleted',
  options: BridgeServiceOptions = {},
): Promise<DeleteBridgeOutcome> => {
  const existing = db.getTwitchChatBridge(bridgeId);
  if (!existing) return { kind: 'not_found' };
  if (existing.blackoutUserId !== blackoutUserId) return { kind: 'forbidden' };

  const handle = liveSessions.get(bridgeId);
  if (handle) {
    try {
      handle.stop();
    } catch (err) {
      log.warn('twitch_chat_bridge_stop_threw', { bridgeId, error: String(err) });
    }
    liveSessions.delete(bridgeId);
  }

  // Tear down the EventSub subscriptions before marking the row inactive
  // so the manager can still resolve the linked Twitch user id.
  if (!options.skipEventSub) {
    try {
      const out = await unsubscribeBridgeEvents(existing, options.helix);
      if (out.failed.length > 0) {
        log.warn('twitch_chat_bridge_eventsub_unsubscribe_partial', {
          bridgeId,
          failed: out.failed,
        });
      }
    } catch (err) {
      log.warn('twitch_chat_bridge_eventsub_unsubscribe_threw', {
        bridgeId,
        error: String(err),
      });
    }
  }

  db.updateTwitchChatBridge(bridgeId, {
    isActive: false,
    lastStoppedAt: new Date().toISOString(),
    lastStoppedReason: reason,
  });
  db.deleteTwitchChatBridge(bridgeId);
  return { kind: 'ok' };
};

/**
 * Walk every active bridge in the DB and start an ingress session for it.
 * Intended to be invoked at API startup so creators don't need to manually
 * re-create bridges after a deploy. Not auto-called — the caller (typically
 * `index.ts`) decides when to invoke this so tests aren't disturbed.
 */
export const resumeAllBridges = async (
  options: BridgeServiceOptions = {},
): Promise<{ resumed: number; skipped: number }> => {
  let resumed = 0;
  let skipped = 0;
  for (const record of db.listActiveTwitchChatBridges()) {
    const link = getLinkedAccount(record.blackoutUserId, 'twitch');
    if (!link) {
      skipped += 1;
      log.warn('twitch_chat_bridge_resume_skipped_no_link', {
        bridgeId: record.id,
        userId: record.blackoutUserId,
      });
      continue;
    }
    try {
      await startBridge(record, options);
      resumed += 1;
    } catch (err) {
      skipped += 1;
      log.warn('twitch_chat_bridge_resume_failed', { bridgeId: record.id, error: String(err) });
    }
  }
  return { resumed, skipped };
};

export const __test__ = { liveSessions, buildOnMessage };
