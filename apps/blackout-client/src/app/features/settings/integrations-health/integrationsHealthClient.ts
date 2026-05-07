import { createAuthorizedApiClient } from '../../../sdk/client';
import { readBlackoutApiToken } from '../../monetization/marketplace/useMarketplaceAuth';
import type { LinkedAccountProvider } from '../linked-accounts/linkedAccountsClient';

/**
 * Frontend wrapper for /v1/integrations/health. Mirrors
 * packages/api/src/services/integrationsHealth.ts — keep the shapes in
 * sync when the server contract moves.
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
    ingressState?: 'connecting' | 'connected' | 'closing' | 'closed';
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
        webhookSecretConfigured: boolean;
        linked: boolean;
    };
    streamlabs: {
        linked: boolean;
        autosyncRunning: boolean;
        syncCursor?: string;
    };
    schedulers: {
        youtubeChatRunning: boolean;
        streamlabsDonationsRunning: boolean;
    };
}

export interface ApiCallOptions {
    token?: string | null;
    apiClient?: ReturnType<typeof createAuthorizedApiClient>;
}

const client = (options?: ApiCallOptions) =>
    options?.apiClient ?? createAuthorizedApiClient(options?.token ?? readBlackoutApiToken());

const HEALTH_PATH = '/v1/integrations/health';

export const fetchIntegrationsHealth = (
    options?: ApiCallOptions,
): Promise<IntegrationsHealthSnapshot> =>
    client(options)({ method: 'GET', path: HEALTH_PATH }) as Promise<IntegrationsHealthSnapshot>;
