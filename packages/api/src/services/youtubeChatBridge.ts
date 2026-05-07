import { randomUUID } from 'node:crypto';
import { db } from '../db/store';
import type { YoutubeChatBridgeRecord } from '../db/types';
import { ensureFreshAccessToken } from './oauthProviders';
import { getLinkedAccount } from './linkedAccounts';
import {
  findActiveLiveBroadcast,
  listLiveChatMessages,
} from '../integrations/youtube/api';
import {
  toMatrixForwardedMessage,
  toNormalizedYoutubeChatMessage,
} from '../integrations/youtube/chatBridge';
import { matrixClient as defaultMatrixClient } from '../integrations/matrix-client';
import type { MatrixSendEventClient } from './twitchChatBridge';
import { log } from '../telemetry/logger';

/**
 * YouTube Live chat bridge service.
 *
 * Per (creator, YouTube channel id), declares a bridge into a Matrix
 * den room. The poller resolves the active broadcast's liveChatId on
 * each tick (broadcasts come and go independently of the bridge), then
 * polls /liveChat/messages with the bridge's persisted page-token
 * cursor (linked_accounts.sync_cursor) and forwards each new message
 * into the bridged Matrix room.
 *
 * Parallel to twitchChatBridge.ts. The scheduler in
 * youtubeChatBridgeScheduler.ts walks every active row on a cadence
 * that respects YouTube's `pollingIntervalMillis`.
 */

export interface BridgeServiceOptions {
  matrixClient?: MatrixSendEventClient;
  fetch?: typeof fetch;
}

export interface CreateBridgeInput {
  blackoutUserId: string;
  /** YouTube channel id (UCxxxx...). */
  youtubeChannelId: string;
  matrixRoomId: string;
}

export type CreateBridgeOutcome =
  | { kind: 'ok'; record: YoutubeChatBridgeRecord }
  | { kind: 'youtube_not_linked' }
  | { kind: 'already_bridged'; record: YoutubeChatBridgeRecord }
  | { kind: 'invalid_input'; reason: string };

const MATRIX_ROOM_RE = /^[!#][^:\s]+:[^:\s]+$/;
const YOUTUBE_CHANNEL_RE = /^UC[A-Za-z0-9_-]{20,40}$/;

const validateInput = (input: CreateBridgeInput): { ok: true } | { ok: false; reason: string } => {
  if (!input.blackoutUserId) return { ok: false, reason: 'blackoutUserId is required' };
  const ch = input.youtubeChannelId?.trim();
  if (!ch) return { ok: false, reason: 'youtubeChannelId is required' };
  if (!YOUTUBE_CHANNEL_RE.test(ch)) {
    return { ok: false, reason: 'youtubeChannelId must look like "UCxxxxxxxxxxxxxxxxxxxxxx" (UC + 22-42 chars)' };
  }
  if (!input.matrixRoomId?.trim()) return { ok: false, reason: 'matrixRoomId is required' };
  if (!MATRIX_ROOM_RE.test(input.matrixRoomId.trim())) {
    return { ok: false, reason: 'matrixRoomId must look like "!opaque:server" or "#alias:server"' };
  }
  return { ok: true };
};

export const createBridge = (input: CreateBridgeInput): CreateBridgeOutcome => {
  const valid = validateInput(input);
  if (!valid.ok) return { kind: 'invalid_input', reason: valid.reason };

  const matrixRoomId = input.matrixRoomId.trim();
  const link = getLinkedAccount(input.blackoutUserId, 'youtube');
  if (!link) return { kind: 'youtube_not_linked' };

  const existing = db.findYoutubeChatBridge(input.blackoutUserId, input.youtubeChannelId);
  if (existing) {
    if (existing.matrixRoomId !== matrixRoomId) {
      return { kind: 'already_bridged', record: existing };
    }
    if (!existing.isActive) {
      const reactivated = db.updateYoutubeChatBridge(existing.id, {
        isActive: true,
        lastStoppedAt: undefined,
        lastStoppedReason: undefined,
      });
      if (reactivated) return { kind: 'ok', record: reactivated };
    }
    return { kind: 'ok', record: existing };
  }

  const record = db.createYoutubeChatBridge({
    id: randomUUID(),
    blackoutUserId: input.blackoutUserId,
    youtubeChannelId: input.youtubeChannelId,
    matrixRoomId,
    isActive: true,
  });
  return { kind: 'ok', record };
};

export const listBridgesForUser = (userId: string): YoutubeChatBridgeRecord[] =>
  db.listYoutubeChatBridgesForUser(userId);

export type DeleteBridgeOutcome =
  | { kind: 'ok' }
  | { kind: 'not_found' }
  | { kind: 'forbidden' };

export const deleteBridge = (
  blackoutUserId: string,
  bridgeId: string,
  reason = 'user_deleted',
): DeleteBridgeOutcome => {
  const existing = db.getYoutubeChatBridge(bridgeId);
  if (!existing) return { kind: 'not_found' };
  if (existing.blackoutUserId !== blackoutUserId) return { kind: 'forbidden' };
  db.updateYoutubeChatBridge(bridgeId, {
    isActive: false,
    lastStoppedAt: new Date().toISOString(),
    lastStoppedReason: reason,
  });
  db.deleteYoutubeChatBridge(bridgeId);
  return { kind: 'ok' };
};

// ----------------------------- per-bridge sync -----------------------------

export type BridgeSyncOutcome =
  | {
      kind: 'ok';
      messages: number;
      delivered: number;
      pollingIntervalMillis?: number;
      nextPageToken?: string;
    }
  | { kind: 'no_link' }
  | { kind: 'token_unavailable'; reason: string }
  | { kind: 'no_active_broadcast' }
  | { kind: 'rate_limited'; retryAfterSeconds?: number }
  | { kind: 'failed'; status: number; detail: string };

/**
 * Pull new chat messages for one bridge and forward them into Matrix.
 * Uses linked_accounts.sync_cursor as the YouTube page-token cursor so
 * we never re-process a message across restarts.
 */
export const syncBridge = async (
  bridge: YoutubeChatBridgeRecord,
  options: BridgeServiceOptions = {},
): Promise<BridgeSyncOutcome> => {
  const matrix = options.matrixClient ?? defaultMatrixClient;

  const fresh = await ensureFreshAccessToken(bridge.blackoutUserId, 'youtube', {
    fetch: options.fetch,
  });
  if (fresh.kind === 'no_link' || fresh.kind === 'provider_not_implemented') {
    return { kind: 'no_link' };
  }
  if (fresh.kind === 'refresh_failed') {
    return { kind: 'token_unavailable', reason: `refresh_failed:${fresh.status}` };
  }
  const accessToken = fresh.accessToken;
  if (!accessToken) return { kind: 'token_unavailable', reason: 'empty_token' };

  // Each tick re-resolves the active broadcast; broadcasts come and go
  // independently of the bridge declaration.
  const broadcastOutcome = await findActiveLiveBroadcast(accessToken, { fetch: options.fetch });
  if (broadcastOutcome.kind === 'unauthorized') {
    return { kind: 'token_unavailable', reason: 'unauthorized' };
  }
  if (broadcastOutcome.kind === 'rate_limited') {
    return { kind: 'rate_limited', retryAfterSeconds: broadcastOutcome.retryAfterSeconds };
  }
  if (broadcastOutcome.kind === 'failed') {
    return { kind: 'failed', status: broadcastOutcome.status, detail: broadcastOutcome.detail };
  }
  const broadcast = broadcastOutcome.broadcast;
  if (!broadcast?.snippet?.liveChatId) {
    return { kind: 'no_active_broadcast' };
  }
  const liveChatId = broadcast.snippet.liveChatId;

  // Resume from the persisted page-token cursor.
  const persistedCursor = db.getLinkedAccount(bridge.blackoutUserId, 'youtube')?.syncCursor;

  const pageOutcome = await listLiveChatMessages(accessToken, {
    liveChatId,
    pageToken: persistedCursor,
    fetch: options.fetch,
  });
  if (pageOutcome.kind === 'unauthorized') {
    return { kind: 'token_unavailable', reason: 'unauthorized' };
  }
  if (pageOutcome.kind === 'rate_limited') {
    return { kind: 'rate_limited', retryAfterSeconds: pageOutcome.retryAfterSeconds };
  }
  if (pageOutcome.kind === 'failed') {
    return { kind: 'failed', status: pageOutcome.status, detail: pageOutcome.detail };
  }

  let delivered = 0;
  for (const raw of pageOutcome.page.items) {
    const normalized = toNormalizedYoutubeChatMessage(raw, bridge.youtubeChannelId);
    const content = toMatrixForwardedMessage(normalized);
    const txnId = `youtube-${normalized.platformMessageId}`;
    try {
      const result = await matrix.sendEvent(bridge.matrixRoomId, content, { txnId });
      if (result.ok) delivered += 1;
      else
        log.warn('youtube_chat_bridge_matrix_send_failed', {
          bridgeId: bridge.id,
          status: result.status,
          reason: result.reason,
        });
    } catch (err) {
      log.warn('youtube_chat_bridge_matrix_send_threw', {
        bridgeId: bridge.id,
        error: String(err),
      });
    }
  }

  // Always advance the cursor to the page's nextPageToken (even when the
  // page was empty — YouTube returns a fresh token each call).
  const nextPageToken = pageOutcome.page.nextPageToken;
  if (nextPageToken && nextPageToken !== persistedCursor) {
    db.setLinkedAccountSyncCursor(bridge.blackoutUserId, 'youtube', nextPageToken);
  }

  return {
    kind: 'ok',
    messages: pageOutcome.page.items.length,
    delivered,
    pollingIntervalMillis: pageOutcome.page.pollingIntervalMillis,
    nextPageToken,
  };
};
