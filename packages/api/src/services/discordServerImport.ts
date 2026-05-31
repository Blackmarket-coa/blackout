import { randomUUID } from 'node:crypto';
import { db } from '../db/store';
import type { DiscordServerImportRecord, DiscordImportMappingRecord } from '../db/types';
import {
  fetchGuildSnapshot,
  listImportableGuilds,
  type DiscordGuildSnapshot,
  type DiscordGuildSummary,
  type DiscordReadDeps,
  type GuildListOutcome,
  type SnapshotOutcome,
} from '../integrations/discord/guildImport';
import { matrixClient as defaultMatrixClient } from '../integrations/matrix-client';
import { log } from '../telemetry/logger';

/**
 * Migration Hub server-import orchestration.
 *
 * `startImport` captures a guild snapshot and records a pending import job;
 * `applyImport` materializes the snapshot into Blackout primitives:
 *   - guild  → a Matrix **space** (the Coalition root)
 *   - text/forum/announcement channel → a **den** (Matrix room)
 *   - role   → a **role-intent** mapping (a Matrix power level derived from the
 *              Discord permission bitfield, applied to governance later)
 *
 * Every created object is recorded in `discord_import_mappings`, keyed by the
 * Discord object id, so re-running `applyImport` is idempotent — already-mapped
 * objects are skipped rather than duplicated.
 *
 * The Matrix client is injectable (`ApplyDeps.matrixClient`) so tests run
 * without a homeserver.
 */

// Discord permission flags → Matrix power level. Only the role's own perms are
// considered (member assignment is a follow-up once members migrate).
const PERM_ADMINISTRATOR = 0x8n;
const PERM_KICK = 0x2n;
const PERM_BAN = 0x4n;
const PERM_MANAGE_CHANNELS = 0x10n;
const PERM_MANAGE_GUILD = 0x20n;
const PERM_MANAGE_MESSAGES = 0x2000n;
const PERM_MANAGE_ROLES = 0x10000000n;

const powerLevelForPermissions = (permissions: string): number => {
  let perms = 0n;
  if (/^[0-9]+$/.test(permissions)) {
    try {
      perms = BigInt(permissions);
    } catch {
      perms = 0n;
    }
  }
  if ((perms & PERM_ADMINISTRATOR) !== 0n) return 100;
  if ((perms & (PERM_MANAGE_GUILD | PERM_MANAGE_ROLES | PERM_MANAGE_CHANNELS)) !== 0n) return 50;
  if ((perms & (PERM_BAN | PERM_KICK | PERM_MANAGE_MESSAGES)) !== 0n) return 25;
  return 0;
};

export interface MatrixRoomCreator {
  createRoom(input: {
    name?: string;
    topic?: string;
    visibility?: 'public' | 'private';
    preset?: 'public_chat' | 'private_chat' | 'trusted_private_chat';
    creationContent?: Record<string, unknown>;
    powerLevelOverride?: Record<string, unknown>;
  }): Promise<
    | { ok: true; status?: number; roomId: string }
    | { ok: false; status?: number; reason?: string; detail?: string }
  >;
}

const mapSnapshotError = (
  outcome: Exclude<SnapshotOutcome, { kind: 'ok' }>,
):
  | { kind: 'not_linked' }
  | { kind: 'insufficient_scope' }
  | { kind: 'guild_not_found' }
  | { kind: 'not_manageable' }
  | { kind: 'discord_error'; status: number; detail: string } => outcome;

export type ListGuildsOutcome = GuildListOutcome;

export const listGuilds = (userId: string, deps: DiscordReadDeps = {}): Promise<ListGuildsOutcome> =>
  listImportableGuilds(userId, deps);

export type StartImportOutcome =
  | { kind: 'ok'; record: DiscordServerImportRecord; snapshot: DiscordGuildSnapshot }
  | { kind: 'not_linked' }
  | { kind: 'insufficient_scope' }
  | { kind: 'guild_not_found' }
  | { kind: 'not_manageable' }
  | { kind: 'discord_error'; status: number; detail: string };

/** Capture a guild snapshot and upsert a pending import job for (user, guild). */
export const startImport = async (
  userId: string,
  guildId: string,
  deps: DiscordReadDeps = {},
): Promise<StartImportOutcome> => {
  const snap = await fetchGuildSnapshot(userId, guildId, deps);
  if (snap.kind !== 'ok') return mapSnapshotError(snap);
  const { snapshot } = snap;
  const mode = snapshot.degraded ? 'preview' : 'full';

  const existing = db.findDiscordServerImport(userId, guildId);
  const record = existing
    ? db.updateDiscordServerImport(existing.id, {
        guildName: snapshot.guild.name,
        mode,
        degraded: snapshot.degraded,
        reason: snapshot.reason,
      })!
    : db.createDiscordServerImport({
        id: randomUUID(),
        blackoutUserId: userId,
        discordGuildId: guildId,
        guildName: snapshot.guild.name,
        status: 'pending',
        mode,
        degraded: snapshot.degraded,
        reason: snapshot.reason,
      });

  return { kind: 'ok', record, snapshot };
};

export interface ApplyDeps extends DiscordReadDeps {
  matrixClient?: MatrixRoomCreator;
}

export interface ImportSummary {
  spaceId: string;
  densCreated: number;
  rolesMapped: number;
  degraded: boolean;
  reason?: string;
}

export type ApplyImportOutcome =
  | { kind: 'ok'; record: DiscordServerImportRecord; summary: ImportSummary }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'not_linked' }
  | { kind: 'insufficient_scope' }
  | { kind: 'guild_not_found' }
  | { kind: 'not_manageable' }
  | { kind: 'matrix_failed'; reason?: string }
  | { kind: 'discord_error'; status: number; detail: string };

/** Idempotently materialize a captured import into a space + dens + role intents. */
export const applyImport = async (
  userId: string,
  importId: string,
  deps: ApplyDeps = {},
): Promise<ApplyImportOutcome> => {
  const record = db.getDiscordServerImport(importId);
  if (!record) return { kind: 'not_found' };
  if (record.blackoutUserId !== userId) return { kind: 'forbidden' };

  const snap = await fetchGuildSnapshot(userId, record.discordGuildId, deps);
  if (snap.kind !== 'ok') return mapSnapshotError(snap);
  const { snapshot } = snap;
  const matrix = deps.matrixClient ?? (defaultMatrixClient as MatrixRoomCreator);

  // guild → space (idempotent)
  const guildMapping = db.findDiscordImportMapping(importId, snapshot.guild.id);
  let spaceId: string;
  if (guildMapping) {
    spaceId = guildMapping.blackoutTargetId;
  } else {
    const res = await matrix.createRoom({
      name: snapshot.guild.name,
      preset: 'private_chat',
      visibility: 'private',
      creationContent: { type: 'm.space' },
    });
    if (!res.ok) {
      db.updateDiscordServerImport(importId, { status: 'failed', reason: res.reason ?? 'matrix_failed' });
      return { kind: 'matrix_failed', reason: res.reason };
    }
    spaceId = res.roomId;
    db.createDiscordImportMapping({
      id: randomUUID(),
      importId,
      discordObjectType: 'guild',
      discordObjectId: snapshot.guild.id,
      discordName: snapshot.guild.name,
      blackoutTargetType: 'space',
      blackoutTargetId: spaceId,
    });
  }

  // channels → dens (idempotent, skipping already-mapped channels)
  let densCreated = 0;
  for (const channel of snapshot.channels) {
    if (db.findDiscordImportMapping(importId, channel.id)) continue;
    const res = await matrix.createRoom({
      name: channel.name,
      preset: 'private_chat',
      visibility: 'private',
    });
    if (!res.ok) {
      log.warn('discord_import_den_create_failed', {
        importId,
        channelId: channel.id,
        reason: res.reason,
      });
      continue;
    }
    db.createDiscordImportMapping({
      id: randomUUID(),
      importId,
      discordObjectType: 'channel',
      discordObjectId: channel.id,
      discordName: channel.name,
      blackoutTargetType: 'den',
      blackoutTargetId: res.roomId,
    });
    densCreated += 1;
  }

  // roles → role intents (idempotent). @everyone is the implicit base role.
  let rolesMapped = 0;
  for (const role of snapshot.roles) {
    if (role.name === '@everyone') continue;
    if (db.findDiscordImportMapping(importId, role.id)) continue;
    db.createDiscordImportMapping({
      id: randomUUID(),
      importId,
      discordObjectType: 'role',
      discordObjectId: role.id,
      discordName: role.name,
      blackoutTargetType: 'role-intent',
      blackoutTargetId: '',
      powerLevel: powerLevelForPermissions(role.permissions),
    });
    rolesMapped += 1;
  }

  const summary: ImportSummary = {
    spaceId,
    densCreated,
    rolesMapped,
    degraded: snapshot.degraded,
    ...(snapshot.reason ? { reason: snapshot.reason } : {}),
  };
  const updated = db.updateDiscordServerImport(importId, {
    status: 'applied',
    degraded: snapshot.degraded,
    reason: snapshot.reason,
    summary: summary as unknown as Record<string, unknown>,
  })!;
  return { kind: 'ok', record: updated, summary };
};

export const getImport = (
  userId: string,
  importId: string,
): { record: DiscordServerImportRecord; mappings: DiscordImportMappingRecord[] } | null => {
  const record = db.getDiscordServerImport(importId);
  if (!record || record.blackoutUserId !== userId) return null;
  return { record, mappings: db.listDiscordImportMappings(importId) };
};

export const listImportsForUser = (userId: string): DiscordServerImportRecord[] =>
  db.listDiscordServerImportsForUser(userId);

export const __test__ = { powerLevelForPermissions };

export type { DiscordGuildSummary };
