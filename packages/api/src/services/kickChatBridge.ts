import { randomUUID } from 'node:crypto';
import { db } from '../db/store';
import type { KickChatBridgeRecord } from '../db/types';
import {
  startKickChatIngress,
  toMatrixForwardedMessage,
  type KickSocketFactory,
  type KickSessionHandle,
} from '../integrations/kick/chatIngress';
import type { NormalizedKickChatMessage } from '../integrations/kick/chatBridge';
import { matrixClient as defaultMatrixClient } from '../integrations/matrix-client';
import type { MatrixSendEventClient } from './twitchChatBridge';
import { log } from '../telemetry/logger';

/**
 * Kick chat bridge service. Per (creator, Kick chatroom id), declares a
 * bridge into a Matrix den room. Calls into chatIngress.startKickChatIngress
 * with an onMessage handler that forwards each Pusher chat-message event
 * through the Matrix client.
 *
 * Parallel to twitchChatBridge.ts. Kick has no per-user OAuth — the chat
 * WS is public — so there's no `kick_not_linked` precondition. The
 * chatroom_id stands in as the only "credential".
 */

export interface BridgeServiceOptions {
  matrixClient?: MatrixSendEventClient;
  socketFactory?: KickSocketFactory;
}

export interface CreateBridgeInput {
  blackoutUserId: string;
  /** Numeric Kick chatroom id (NOT the channel slug). */
  kickChatroomId: string;
  matrixRoomId: string;
}

export type CreateBridgeOutcome =
  | { kind: 'ok'; record: KickChatBridgeRecord }
  | { kind: 'already_bridged'; record: KickChatBridgeRecord }
  | { kind: 'invalid_input'; reason: string };

const MATRIX_ROOM_RE = /^[!#][^:\s]+:[^:\s]+$/;
// Kick chatroom ids are positive integers; we accept up to 18 digits
// (signed 64-bit max is ~19) and store as a string anyway.
const KICK_CHATROOM_RE = /^[1-9][0-9]{0,17}$/;

const validateInput = (input: CreateBridgeInput): { ok: true } | { ok: false; reason: string } => {
  if (!input.blackoutUserId) return { ok: false, reason: 'blackoutUserId is required' };
  const ch = input.kickChatroomId?.trim();
  if (!ch) return { ok: false, reason: 'kickChatroomId is required' };
  if (!KICK_CHATROOM_RE.test(ch)) {
    return { ok: false, reason: 'kickChatroomId must be a positive integer (no leading zeros)' };
  }
  if (!input.matrixRoomId?.trim()) return { ok: false, reason: 'matrixRoomId is required' };
  if (!MATRIX_ROOM_RE.test(input.matrixRoomId.trim())) {
    return { ok: false, reason: 'matrixRoomId must look like "!opaque:server" or "#alias:server"' };
  }
  return { ok: true };
};

const liveSessions = new Map<string, KickSessionHandle>();

const buildOnMessage =
  (record: KickChatBridgeRecord, matrix: MatrixSendEventClient) =>
  (msg: NormalizedKickChatMessage): void => {
    const content = toMatrixForwardedMessage(msg);
    // Use the Pusher message id as the Matrix txn id so the same Kick
    // message never double-delivers across reconnects.
    const txnId = `kick-${msg.platformMessageId}`;
    void matrix
      .sendEvent(record.matrixRoomId, content, { txnId })
      .then((result) => {
        if (!result.ok) {
          log.warn('kick_chat_bridge_matrix_send_failed', {
            bridgeId: record.id,
            roomId: record.matrixRoomId,
            status: result.status,
            reason: result.reason,
          });
        }
      })
      .catch((err) => {
        log.warn('kick_chat_bridge_matrix_send_threw', {
          bridgeId: record.id,
          error: String(err),
        });
      });
  };

export const startBridge = (
  record: KickChatBridgeRecord,
  options: BridgeServiceOptions = {},
): KickSessionHandle => {
  const matrix = options.matrixClient ?? defaultMatrixClient;
  const handle = startKickChatIngress({
    blackoutUserId: record.blackoutUserId,
    chatroomId: record.kickChatroomId,
    onMessage: buildOnMessage(record, matrix),
    socketFactory: options.socketFactory,
  });
  liveSessions.set(record.id, handle);
  return handle;
};

export const createBridge = (
  input: CreateBridgeInput,
  options: BridgeServiceOptions = {},
): CreateBridgeOutcome => {
  const valid = validateInput(input);
  if (!valid.ok) return { kind: 'invalid_input', reason: valid.reason };
  const matrixRoomId = input.matrixRoomId.trim();
  const chatroomId = input.kickChatroomId.trim();

  const existing = db.findKickChatBridge(input.blackoutUserId, chatroomId);
  if (existing) {
    if (existing.matrixRoomId !== matrixRoomId) {
      return { kind: 'already_bridged', record: existing };
    }
    if (!existing.isActive) {
      const reactivated = db.updateKickChatBridge(existing.id, {
        isActive: true,
        lastStoppedAt: undefined,
        lastStoppedReason: undefined,
      });
      if (reactivated) startBridge(reactivated, options);
      return { kind: 'ok', record: reactivated ?? existing };
    }
    if (!liveSessions.has(existing.id)) startBridge(existing, options);
    return { kind: 'ok', record: existing };
  }

  const record = db.createKickChatBridge({
    id: randomUUID(),
    blackoutUserId: input.blackoutUserId,
    kickChatroomId: chatroomId,
    matrixRoomId,
    isActive: true,
  });
  startBridge(record, options);
  return { kind: 'ok', record };
};

export const listBridgesForUser = (userId: string): KickChatBridgeRecord[] =>
  db.listKickChatBridgesForUser(userId);

export type DeleteBridgeOutcome =
  | { kind: 'ok' }
  | { kind: 'not_found' }
  | { kind: 'forbidden' };

export const deleteBridge = (
  blackoutUserId: string,
  bridgeId: string,
  reason = 'user_deleted',
): DeleteBridgeOutcome => {
  const existing = db.getKickChatBridge(bridgeId);
  if (!existing) return { kind: 'not_found' };
  if (existing.blackoutUserId !== blackoutUserId) return { kind: 'forbidden' };

  const handle = liveSessions.get(bridgeId);
  if (handle) {
    try {
      handle.stop();
    } catch (err) {
      log.warn('kick_chat_bridge_stop_threw', { bridgeId, error: String(err) });
    }
    liveSessions.delete(bridgeId);
  }

  db.updateKickChatBridge(bridgeId, {
    isActive: false,
    lastStoppedAt: new Date().toISOString(),
    lastStoppedReason: reason,
  });
  db.deleteKickChatBridge(bridgeId);
  return { kind: 'ok' };
};

/** Boot-time hook: re-establish a live session for every active bridge. */
export const resumeAllBridges = (
  options: BridgeServiceOptions = {},
): { resumed: number } => {
  let resumed = 0;
  for (const record of db.listActiveKickChatBridges()) {
    try {
      startBridge(record, options);
      resumed += 1;
    } catch (err) {
      log.warn('kick_chat_bridge_resume_failed', { bridgeId: record.id, error: String(err) });
    }
  }
  return { resumed };
};

export const __test__ = { liveSessions };
