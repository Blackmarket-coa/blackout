import { ensureFreshAccessToken } from '../../services/oauthProviders';
import { withTimeout } from '../http';

/**
 * Read-only Discord REST client for the Migration Hub server-import flow.
 *
 * Two privilege tiers, deliberately honest about Discord's limits:
 *
 *  - **Guild list** uses the *user's* linked OAuth token (`guilds` scope) —
 *    `GET /users/@me/guilds`. This is all an OAuth-only link can read.
 *  - **Channels + roles** require a **bot token in the guild**
 *    (`MIGRATION_DISCORD_BOT_TOKEN`). Without it — or if the bot isn't a member
 *    of the guild — the snapshot is returned `degraded` (preview mode), exactly
 *    the "you need server-owner consent" boundary from the migration plan.
 *
 * We never write to Discord and never act on the user's behalf there.
 */

const DISCORD_API = 'https://discord.com/api/v10';

// Discord permission bitfield flags (subset we care about for import gating).
const PERM_ADMINISTRATOR = 0x8n; // 1 << 3
const PERM_MANAGE_GUILD = 0x20n; // 1 << 5

// Channel types we materialize as Dens (Matrix rooms). 0=text, 5=announcement,
// 15=forum. Categories (4) are groupings; voice (2)/stage (13) are skipped.
export const IMPORTABLE_CHANNEL_TYPES = new Set<number>([0, 5, 15]);
export const CATEGORY_CHANNEL_TYPE = 4;

export interface DiscordGuildSummary {
  id: string;
  name: string;
  icon?: string;
  owner: boolean;
  /** True if the user can import this guild (owner / administrator / manage-guild). */
  manageable: boolean;
  approximateMemberCount?: number;
}

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  parentId?: string;
  position: number;
}

export interface DiscordRole {
  id: string;
  name: string;
  permissions: string;
  position: number;
  color?: number;
}

export interface DiscordGuildSnapshot {
  guild: DiscordGuildSummary;
  categories: DiscordChannel[];
  channels: DiscordChannel[];
  roles: DiscordRole[];
  /** True when channels/roles couldn't be read (no bot token / bot not in guild). */
  degraded: boolean;
  /** Machine-readable degraded/preview reason: 'no_bot_token' | 'bot_cannot_read_guild'. */
  reason?: string;
}

export interface DiscordReadDeps {
  fetch?: typeof fetch;
}

const botToken = (): string | undefined => process.env.MIGRATION_DISCORD_BOT_TOKEN?.trim() || undefined;

const safeBigInt = (value: unknown): bigint => {
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
};

const isManageable = (owner: boolean, permissions: unknown): boolean => {
  if (owner) return true;
  const perms = safeBigInt(permissions);
  return (perms & PERM_ADMINISTRATOR) !== 0n || (perms & PERM_MANAGE_GUILD) !== 0n;
};

const normalizeGuild = (raw: Record<string, unknown>): DiscordGuildSummary => ({
  id: String(raw.id),
  name: String(raw.name ?? 'Unnamed server'),
  icon: typeof raw.icon === 'string' ? raw.icon : undefined,
  owner: raw.owner === true,
  manageable: isManageable(raw.owner === true, raw.permissions),
  approximateMemberCount:
    typeof raw.approximate_member_count === 'number' ? raw.approximate_member_count : undefined,
});

const normalizeChannel = (raw: Record<string, unknown>): DiscordChannel => ({
  id: String(raw.id),
  name: String(raw.name ?? ''),
  type: typeof raw.type === 'number' ? raw.type : -1,
  parentId: typeof raw.parent_id === 'string' ? raw.parent_id : undefined,
  position: typeof raw.position === 'number' ? raw.position : 0,
});

const normalizeRole = (raw: Record<string, unknown>): DiscordRole => ({
  id: String(raw.id),
  name: String(raw.name ?? ''),
  permissions: typeof raw.permissions === 'string' ? raw.permissions : '0',
  position: typeof raw.position === 'number' ? raw.position : 0,
  color: typeof raw.color === 'number' ? raw.color : undefined,
});

export type GuildListOutcome =
  | { kind: 'ok'; guilds: DiscordGuildSummary[] }
  | { kind: 'not_linked' }
  | { kind: 'insufficient_scope' }
  | { kind: 'discord_error'; status: number; detail: string };

/** List the guilds the linked user can import (owner / admin / manage-guild). */
export const listImportableGuilds = async (
  userId: string,
  deps: DiscordReadDeps = {},
): Promise<GuildListOutcome> => {
  const fresh = await ensureFreshAccessToken(userId, 'discord', { fetch: deps.fetch });
  if (fresh.kind === 'no_link' || fresh.kind === 'provider_not_implemented') {
    return { kind: 'not_linked' };
  }
  const token = 'accessToken' in fresh ? fresh.accessToken : undefined;
  if (!token) return { kind: 'insufficient_scope' };

  const fetchFn = withTimeout(deps.fetch ?? fetch);
  const res = await fetchFn(`${DISCORD_API}/users/@me/guilds?with_counts=true`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) return { kind: 'insufficient_scope' };
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return { kind: 'discord_error', status: res.status, detail };
  }
  const raw = (await res.json()) as Array<Record<string, unknown>>;
  return { kind: 'ok', guilds: raw.map(normalizeGuild) };
};

export type SnapshotOutcome =
  | { kind: 'ok'; snapshot: DiscordGuildSnapshot }
  | { kind: 'not_linked' }
  | { kind: 'insufficient_scope' }
  | { kind: 'guild_not_found' }
  | { kind: 'not_manageable' }
  | { kind: 'discord_error'; status: number; detail: string };

/**
 * Capture a guild's importable structure. Falls back to a `degraded` preview
 * (guild summary only) when no bot token is configured or the bot can't read
 * the guild.
 */
export const fetchGuildSnapshot = async (
  userId: string,
  guildId: string,
  deps: DiscordReadDeps = {},
): Promise<SnapshotOutcome> => {
  const list = await listImportableGuilds(userId, deps);
  if (list.kind !== 'ok') return list;

  const guild = list.guilds.find((g) => g.id === guildId);
  if (!guild) return { kind: 'guild_not_found' };
  if (!guild.manageable) return { kind: 'not_manageable' };

  const token = botToken();
  if (!token) {
    return {
      kind: 'ok',
      snapshot: { guild, categories: [], channels: [], roles: [], degraded: true, reason: 'no_bot_token' },
    };
  }

  const fetchFn = withTimeout(deps.fetch ?? fetch);
  const [chRes, roleRes] = await Promise.all([
    fetchFn(`${DISCORD_API}/guilds/${guildId}/channels`, { headers: { authorization: `Bot ${token}` } }),
    fetchFn(`${DISCORD_API}/guilds/${guildId}/roles`, { headers: { authorization: `Bot ${token}` } }),
  ]);
  if (!chRes.ok || !roleRes.ok) {
    return {
      kind: 'ok',
      snapshot: {
        guild,
        categories: [],
        channels: [],
        roles: [],
        degraded: true,
        reason: 'bot_cannot_read_guild',
      },
    };
  }

  const rawChannels = (await chRes.json()) as Array<Record<string, unknown>>;
  const rawRoles = (await roleRes.json()) as Array<Record<string, unknown>>;
  const channels = rawChannels.map(normalizeChannel);
  return {
    kind: 'ok',
    snapshot: {
      guild,
      categories: channels.filter((c) => c.type === CATEGORY_CHANNEL_TYPE),
      channels: channels.filter((c) => IMPORTABLE_CHANNEL_TYPES.has(c.type)),
      roles: rawRoles.map(normalizeRole),
      degraded: false,
    },
  };
};

export const __test__ = { isManageable, normalizeGuild, safeBigInt };
