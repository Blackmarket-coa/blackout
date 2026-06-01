import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

/**
 * Migration Hub API client. Thin typed wrappers over the
 * /v1/integrations/discord/* + /v1/linked-accounts endpoints, mirroring the
 * invitationsClient / profileClient pattern: resolve the bearer lazily via
 * readBlackoutApiToken() and route through createAuthorizedApiClient (auto
 * refresh on 401).
 */

const call = <T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    token: string | null = readBlackoutApiToken(),
): Promise<T> => createAuthorizedApiClient(token)({ method, path, body }) as Promise<T>;

// ---- connect accounts ----

export interface LinkedAccountSummary {
    id: string;
    provider: string;
    providerUserId: string;
    providerUsername?: string;
    scopes: string[];
}

export const listLinkedAccounts = (): Promise<{
    providers: string[];
    accounts: LinkedAccountSummary[];
}> => call('GET', '/v1/linked-accounts');

export const connectDiscord = (): Promise<{ authorizeUrl: string; state: string }> =>
    call('POST', '/v1/linked-accounts/discord/connect');

// ---- server import ----

export interface DiscordGuildSummary {
    id: string;
    name: string;
    owner: boolean;
    manageable: boolean;
    approximateMemberCount?: number;
}

export interface ServerImportRecord {
    id: string;
    discordGuildId: string;
    guildName: string;
    status: string;
    mode: string;
    degraded: boolean;
    reason?: string;
    summary?: Record<string, unknown>;
}

export interface GuildSnapshot {
    guild: DiscordGuildSummary;
    categories: unknown[];
    channels: unknown[];
    roles: unknown[];
    degraded: boolean;
    reason?: string;
}

export interface ImportSummary {
    spaceId: string;
    densCreated: number;
    rolesMapped: number;
    degraded: boolean;
    reason?: string;
}

export const listImportableGuilds = (): Promise<{ guilds: DiscordGuildSummary[] }> =>
    call('GET', '/v1/integrations/discord/import/guilds');

export const startImport = (
    guildId: string,
): Promise<{ import: ServerImportRecord; snapshot: GuildSnapshot }> =>
    call('POST', '/v1/integrations/discord/import/imports', { guildId });

export const applyImport = (
    importId: string,
): Promise<{ import: ServerImportRecord; summary: ImportSummary }> =>
    call('POST', `/v1/integrations/discord/import/imports/${encodeURIComponent(importId)}/apply`);

// ---- bridge activation ----

export type BridgeMode = 'one-way' | 'two-way' | 'read-only';

export interface BridgeActivation {
    id: string;
    matrixRoomId: string;
    discordGuildId: string;
    discordChannelId: string;
    mode: BridgeMode;
    status: string;
    isActive: boolean;
}

export const listBridges = (): Promise<{ activations: BridgeActivation[]; modes: BridgeMode[] }> =>
    call('GET', '/v1/integrations/discord/bridges');

export const createBridge = (input: {
    matrixRoomId: string;
    discordGuildId: string;
    discordChannelId: string;
    mode: BridgeMode;
}): Promise<{ activation: BridgeActivation }> =>
    call('POST', '/v1/integrations/discord/bridges', input);

export const setBridgeMode = (
    id: string,
    mode: BridgeMode,
): Promise<{ activation: BridgeActivation }> =>
    call('PATCH', `/v1/integrations/discord/bridges/${encodeURIComponent(id)}`, { mode });

export const deleteBridge = (id: string): Promise<{ ok: boolean }> =>
    call('DELETE', `/v1/integrations/discord/bridges/${encodeURIComponent(id)}`);

// ---- dashboard ----

export interface Metric {
    value: number | null;
    source: string;
}

export interface MigrationDashboard {
    guildId: string;
    guildName?: string;
    discordMembers: Metric;
    blackoutAccounts: Metric;
    activeBridgedUsers: Metric;
    marketplaceParticipants: Metric;
    importedDens: Metric;
    bridgedChannels: Metric;
    degraded: boolean;
    generatedAt: string;
}

export const fetchDashboard = (guildId: string): Promise<MigrationDashboard> =>
    call('GET', `/v1/integrations/discord/migration/dashboard?guildId=${encodeURIComponent(guildId)}`);
