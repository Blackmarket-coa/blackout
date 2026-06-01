import { db } from '../db/store';
import { listGuilds } from './discordServerImport';
import type { DiscordReadDeps } from '../integrations/discord/guildImport';

/**
 * Migration Hub adoption dashboard. A read-only, single-shot snapshot of how a
 * Discord community's migration to Blackout is progressing, sourced from data
 * we actually have:
 *
 *   - discordMembers       ← guild approximate member count (Discord)
 *   - importedDens         ← 'den' rows from this user's server import
 *   - bridgedChannels      ← active discord_bridge_activations for the guild
 *   - blackoutAccounts     ← platform user count (platform_total)
 *   - marketplaceParticipants ← distinct users with marketplace entitlements
 *   - activeBridgedUsers   ← not yet tracked → null/'unavailable' (no fabrication)
 *
 * Each metric carries an explicit `source` so the UI can label platform-wide
 * vs guild-scoped figures and show "—" for what isn't measurable yet.
 */

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
  /** True when Discord-side figures couldn't be read (OAuth-only / not in list). */
  degraded: boolean;
  generatedAt: string;
}

export type DashboardOutcome =
  | { kind: 'ok'; dashboard: MigrationDashboard }
  | { kind: 'not_linked' }
  | { kind: 'insufficient_scope' }
  | { kind: 'discord_error'; status: number; detail: string };

const countMarketplaceParticipants = (): number => {
  const users = new Set<string>();
  for (const entitlement of db.marketplaceEntitlements.values()) users.add(entitlement.userId);
  return users.size;
};

const countImportedDens = (userId: string, guildId: string): number => {
  const importRecord = db.findDiscordServerImport(userId, guildId);
  if (!importRecord) return 0;
  return db
    .listDiscordImportMappings(importRecord.id)
    .filter((m) => m.blackoutTargetType === 'den').length;
};

const countBridgedChannels = (userId: string, guildId: string): number =>
  db
    .listDiscordBridgeActivationsForUser(userId)
    .filter((a) => a.discordGuildId === guildId && a.isActive).length;

export const buildDashboard = async (
  userId: string,
  guildId: string,
  deps: DiscordReadDeps = {},
): Promise<DashboardOutcome> => {
  const guilds = await listGuilds(userId, deps);
  if (guilds.kind === 'not_linked') return { kind: 'not_linked' };
  if (guilds.kind === 'insufficient_scope') return { kind: 'insufficient_scope' };
  if (guilds.kind === 'discord_error') {
    return { kind: 'discord_error', status: guilds.status, detail: guilds.detail };
  }

  const guild = guilds.guilds.find((g) => g.id === guildId);
  const importRecord = db.findDiscordServerImport(userId, guildId);
  const discordMembers: Metric =
    guild && typeof guild.approximateMemberCount === 'number'
      ? { value: guild.approximateMemberCount, source: 'discord_guild' }
      : { value: null, source: 'unavailable' };

  const dashboard: MigrationDashboard = {
    guildId,
    guildName: guild?.name ?? importRecord?.guildName,
    discordMembers,
    blackoutAccounts: { value: db.users.size, source: 'platform_total' },
    activeBridgedUsers: { value: null, source: 'unavailable' },
    marketplaceParticipants: { value: countMarketplaceParticipants(), source: 'platform_total' },
    importedDens: { value: countImportedDens(userId, guildId), source: 'server_import' },
    bridgedChannels: { value: countBridgedChannels(userId, guildId), source: 'bridge_activations' },
    degraded: discordMembers.value === null,
    generatedAt: new Date().toISOString(),
  };
  return { kind: 'ok', dashboard };
};
