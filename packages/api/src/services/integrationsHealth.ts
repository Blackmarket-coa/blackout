import { db } from '../db/store';
import type { LinkedAccountProvider } from '../db/types';
import { getSessionStatus } from '../integrations/twitch/chatIngress';
import { isStreamlabsSchedulerRunning } from './streamlabsDonationScheduler';
import { isYoutubeChatSchedulerRunning } from './youtubeChatBridgeScheduler';

/**
 * Single-shot snapshot of every integration's runtime + persisted state
 * for ONE creator. Powers the Settings → "Integrations health" panel
 * so a creator can self-diagnose ("is my Twitch chat actually flowing?
 * are my widget tokens being delivered to? is my Patreon webhook
 * configured on the server?") without raising a ticket.
 *
 * Pure read: does no I/O, throws never. Snapshot fields prefer
 * timestamps over deltas so the UI can format them however it wants
 * (relative "2 min ago" vs absolute).
 */

export interface LinkedAccountHealth {
  provider: LinkedAccountProvider;
  providerUsername?: string;
  scopes: string[];
  expiresAt?: string;
  isExpired: boolean;
  expiresInSeconds?: number;
  hasRefreshToken: boolean;
}

export interface TwitchChatBridgeHealth {
  id: string;
  twitchChannel: string;
  matrixRoomId: string;
  isActive: boolean;
  /** In-process WSS state. Undefined when no live session exists. */
  ingressState?: 'connecting' | 'connected' | 'closing' | 'closed';
  /** Cumulative count since the session was started (resets on reconnect-loss). */
  messagesForwarded?: number;
  reconnectAttempts?: number;
  lastEventAt?: string;
  lastStoppedAt?: string;
  lastStoppedReason?: string;
}

export interface YoutubeChatBridgeHealth {
  id: string;
  youtubeChannelId: string;
  matrixRoomId: string;
  isActive: boolean;
  updatedAt: string;
  lastStoppedAt?: string;
  lastStoppedReason?: string;
}

export interface TwitchEventSubscriptionHealth {
  type: string;
  status: string;
  twitchUserId: string;
  helixSubscriptionId: string;
}

export interface WidgetAlertTokenHealth {
  id: string;
  label?: string;
  scopes: string[];
  createdAt: string;
  revokedAt?: string;
  lastDeliveredAt?: string;
}

export interface IntegrationsHealthSnapshot {
  generatedAtMs: number;
  linkedAccounts: LinkedAccountHealth[];
  twitchChatBridges: TwitchChatBridgeHealth[];
  youtubeChatBridges: YoutubeChatBridgeHealth[];
  twitchEventSubscriptions: TwitchEventSubscriptionHealth[];
  widgetAlertTokens: WidgetAlertTokenHealth[];
  patreon: {
    /** Whether the operator has set PATREON_WEBHOOK_SECRET. Reveals nothing about the secret itself. */
    webhookSecretConfigured: boolean;
    linked: boolean;
  };
  streamlabs: {
    linked: boolean;
    /** Whether the periodic donation poller is running on this process. */
    autosyncRunning: boolean;
    /** Largest persisted donation_id this user has been synced past. */
    syncCursor?: string;
  };
  schedulers: {
    youtubeChatRunning: boolean;
    streamlabsDonationsRunning: boolean;
  };
}

const isExpired = (
  expiresAt: string | undefined,
  nowMs: number,
): { expired: boolean; remainingSeconds?: number } => {
  if (!expiresAt) return { expired: false };
  const expMs = Date.parse(expiresAt);
  if (!Number.isFinite(expMs)) return { expired: false };
  const remaining = Math.floor((expMs - nowMs) / 1000);
  return { expired: remaining <= 0, remainingSeconds: Math.max(0, remaining) };
};

export interface BuildSnapshotOptions {
  /** Override clock for tests. */
  now?: () => number;
}

export const buildIntegrationsHealthSnapshot = (
  blackoutUserId: string,
  options: BuildSnapshotOptions = {},
): IntegrationsHealthSnapshot => {
  const now = options.now ? options.now() : Date.now();

  const linkedAccountsRaw = db.listLinkedAccountsForUser(blackoutUserId);
  const linkedAccounts: LinkedAccountHealth[] = linkedAccountsRaw.map((row) => {
    const expiry = isExpired(row.expiresAt, now);
    return {
      provider: row.provider,
      providerUsername: row.providerUsername,
      scopes: row.scopes,
      expiresAt: row.expiresAt,
      isExpired: expiry.expired,
      expiresInSeconds: expiry.remainingSeconds,
      hasRefreshToken: Boolean(row.refreshTokenCiphertext),
    };
  });

  const twitchChatBridges: TwitchChatBridgeHealth[] = db
    .listTwitchChatBridgesForUser(blackoutUserId)
    .map((bridge) => {
      const status = getSessionStatus(bridge.blackoutUserId, bridge.twitchChannel);
      return {
        id: bridge.id,
        twitchChannel: bridge.twitchChannel,
        matrixRoomId: bridge.matrixRoomId,
        isActive: bridge.isActive,
        ingressState: status?.state,
        messagesForwarded: status?.messagesForwarded,
        reconnectAttempts: status?.reconnectAttempts,
        lastEventAt:
          status?.lastEventAtMs !== undefined
            ? new Date(status.lastEventAtMs).toISOString()
            : undefined,
        lastStoppedAt: bridge.lastStoppedAt,
        lastStoppedReason: bridge.lastStoppedReason,
      };
    });

  const youtubeChatBridges: YoutubeChatBridgeHealth[] = db
    .listYoutubeChatBridgesForUser(blackoutUserId)
    .map((bridge) => ({
      id: bridge.id,
      youtubeChannelId: bridge.youtubeChannelId,
      matrixRoomId: bridge.matrixRoomId,
      isActive: bridge.isActive,
      updatedAt: bridge.updatedAt,
      lastStoppedAt: bridge.lastStoppedAt,
      lastStoppedReason: bridge.lastStoppedReason,
    }));

  // EventSub subscriptions live per-(user, twitch user id). We surface
  // every row the creator owns (across any of their linked Twitch ids).
  const twitchEventSubscriptions: TwitchEventSubscriptionHealth[] = [
    ...db.twitchEventSubscriptions.values(),
  ]
    .filter((row) => row.blackoutUserId === blackoutUserId)
    .map((row) => ({
      type: row.subscriptionType,
      status: row.status,
      twitchUserId: row.twitchUserId,
      helixSubscriptionId: row.helixSubscriptionId,
    }));

  const widgetAlertTokens: WidgetAlertTokenHealth[] = db
    .listWidgetAlertTokensForUser(blackoutUserId)
    .map((row) => ({
      id: row.id,
      label: row.label,
      scopes: row.scopes,
      createdAt: row.createdAt,
      revokedAt: row.revokedAt,
      lastDeliveredAt: row.lastDeliveredAt,
    }));

  const patreonLink = db.getLinkedAccount(blackoutUserId, 'patreon');
  const streamlabsLink = db.getLinkedAccount(blackoutUserId, 'streamlabs');

  return {
    generatedAtMs: now,
    linkedAccounts,
    twitchChatBridges,
    youtubeChatBridges,
    twitchEventSubscriptions,
    widgetAlertTokens,
    patreon: {
      webhookSecretConfigured: Boolean(process.env.PATREON_WEBHOOK_SECRET?.trim()),
      linked: Boolean(patreonLink),
    },
    streamlabs: {
      linked: Boolean(streamlabsLink),
      autosyncRunning: isStreamlabsSchedulerRunning(),
      syncCursor: streamlabsLink?.syncCursor,
    },
    schedulers: {
      youtubeChatRunning: isYoutubeChatSchedulerRunning(),
      streamlabsDonationsRunning: isStreamlabsSchedulerRunning(),
    },
  };
};
