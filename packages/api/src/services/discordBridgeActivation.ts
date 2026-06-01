import { randomUUID } from 'node:crypto';
import { db } from '../db/store';
import type { DiscordBridgeActivationRecord, DiscordBridgeMode } from '../db/types';
import {
  mautrixProvisioner,
  type BridgeProvisioner,
  type ProvisionResult,
} from '../integrations/discord/mautrixProvisioning';
import { log } from '../telemetry/logger';

/**
 * Migration Hub bridge-activation service. Wraps the mautrix-discord
 * provisioning API (ADR-0003) with a product-level, per-den toggle:
 *
 *   - create  → ask the bridge to link a den ↔ Discord channel, persist 'active'
 *   - setMode → change direction (one-way / two-way / read-only), re-provision
 *   - delete  → ask the bridge to unlink, then drop the row
 *
 * Loop prevention for one-way / read-only relies on the existing
 * `m.blackout.origin` convention honored by services/outboundMessageRouter.ts;
 * the mode is persisted here so that router can consult it.
 */

export const BRIDGE_MODES: readonly DiscordBridgeMode[] = ['one-way', 'two-way', 'read-only'];

const MATRIX_ROOM_RE = /^[!#][^:\s]+:[^:\s]+$/;
const SNOWFLAKE_RE = /^[0-9]{5,20}$/;

export const isBridgeMode = (value: unknown): value is DiscordBridgeMode =>
  typeof value === 'string' && (BRIDGE_MODES as readonly string[]).includes(value);

export interface BridgeActivationDeps {
  provisioner?: BridgeProvisioner;
}

export interface CreateActivationInput {
  blackoutUserId: string;
  matrixRoomId: string;
  discordGuildId: string;
  discordChannelId: string;
  mode: DiscordBridgeMode;
}

const validate = (input: CreateActivationInput): { ok: true } | { ok: false; reason: string } => {
  if (!input.blackoutUserId) return { ok: false, reason: 'blackoutUserId is required' };
  if (!MATRIX_ROOM_RE.test(input.matrixRoomId?.trim() ?? '')) {
    return { ok: false, reason: 'matrixRoomId must look like "!opaque:server" or "#alias:server"' };
  }
  if (!SNOWFLAKE_RE.test(input.discordGuildId?.trim() ?? '')) {
    return { ok: false, reason: 'discordGuildId must be a Discord snowflake' };
  }
  if (!SNOWFLAKE_RE.test(input.discordChannelId?.trim() ?? '')) {
    return { ok: false, reason: 'discordChannelId must be a Discord snowflake' };
  }
  if (!isBridgeMode(input.mode)) {
    return { ok: false, reason: `mode must be one of ${BRIDGE_MODES.join(', ')}` };
  }
  return { ok: true };
};

const provisionError = (result: Exclude<ProvisionResult, { ok: true }>): string =>
  result.reason === 'not_configured'
    ? 'The Discord bridge is not configured on this server.'
    : result.reason === 'provision_failed'
      ? `The bridge rejected the request (status ${result.status}).`
      : 'Could not reach the Discord bridge.';

export type CreateActivationOutcome =
  | { kind: 'ok'; record: DiscordBridgeActivationRecord }
  | { kind: 'already_bridged'; record: DiscordBridgeActivationRecord }
  | { kind: 'invalid_input'; reason: string }
  | { kind: 'bridge_unavailable'; reason: string };

export const createActivation = async (
  input: CreateActivationInput,
  deps: BridgeActivationDeps = {},
): Promise<CreateActivationOutcome> => {
  const valid = validate(input);
  if (!valid.ok) return { kind: 'invalid_input', reason: valid.reason };

  const matrixRoomId = input.matrixRoomId.trim();
  const discordChannelId = input.discordChannelId.trim();
  const existing = db.findDiscordBridgeActivation(matrixRoomId, discordChannelId);
  if (existing && existing.isActive) return { kind: 'already_bridged', record: existing };

  const provisioner = deps.provisioner ?? mautrixProvisioner;
  const result = await provisioner.bridgeRoom({
    matrixRoomId,
    discordGuildId: input.discordGuildId.trim(),
    discordChannelId,
    mode: input.mode,
  });
  if (!result.ok) {
    return { kind: 'bridge_unavailable', reason: provisionError(result) };
  }

  if (existing) {
    const reactivated = db.updateDiscordBridgeActivation(existing.id, {
      mode: input.mode,
      status: 'active',
      isActive: true,
      lastError: undefined,
      lastSyncedAt: new Date().toISOString(),
    });
    return { kind: 'ok', record: reactivated ?? existing };
  }

  const record = db.createDiscordBridgeActivation({
    id: randomUUID(),
    blackoutUserId: input.blackoutUserId,
    matrixRoomId,
    discordGuildId: input.discordGuildId.trim(),
    discordChannelId,
    mode: input.mode,
    status: 'active',
    lastSyncedAt: new Date().toISOString(),
    isActive: true,
  });
  return { kind: 'ok', record };
};

export const listActivationsForUser = (userId: string): DiscordBridgeActivationRecord[] =>
  db.listDiscordBridgeActivationsForUser(userId);

export type SetModeOutcome =
  | { kind: 'ok'; record: DiscordBridgeActivationRecord }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'invalid_input'; reason: string }
  | { kind: 'bridge_unavailable'; reason: string };

export const setMode = async (
  blackoutUserId: string,
  id: string,
  mode: DiscordBridgeMode,
  deps: BridgeActivationDeps = {},
): Promise<SetModeOutcome> => {
  if (!isBridgeMode(mode)) {
    return { kind: 'invalid_input', reason: `mode must be one of ${BRIDGE_MODES.join(', ')}` };
  }
  const existing = db.getDiscordBridgeActivation(id);
  if (!existing) return { kind: 'not_found' };
  if (existing.blackoutUserId !== blackoutUserId) return { kind: 'forbidden' };

  const provisioner = deps.provisioner ?? mautrixProvisioner;
  const result = await provisioner.bridgeRoom({
    matrixRoomId: existing.matrixRoomId,
    discordGuildId: existing.discordGuildId,
    discordChannelId: existing.discordChannelId,
    mode,
  });
  if (!result.ok) return { kind: 'bridge_unavailable', reason: provisionError(result) };

  const updated = db.updateDiscordBridgeActivation(id, {
    mode,
    status: 'active',
    isActive: true,
    lastError: undefined,
    lastSyncedAt: new Date().toISOString(),
  });
  return { kind: 'ok', record: updated ?? existing };
};

export type DeleteActivationOutcome =
  | { kind: 'ok'; unbridged: boolean }
  | { kind: 'not_found' }
  | { kind: 'forbidden' };

export const deleteActivation = async (
  blackoutUserId: string,
  id: string,
  deps: BridgeActivationDeps = {},
): Promise<DeleteActivationOutcome> => {
  const existing = db.getDiscordBridgeActivation(id);
  if (!existing) return { kind: 'not_found' };
  if (existing.blackoutUserId !== blackoutUserId) return { kind: 'forbidden' };

  const provisioner = deps.provisioner ?? mautrixProvisioner;
  const result = await provisioner.unbridgeRoom({
    matrixRoomId: existing.matrixRoomId,
    discordChannelId: existing.discordChannelId,
  });
  if (!result.ok) {
    // Tear down our record regardless, but surface that the bridge may still
    // hold the link so an operator can reconcile.
    log.warn('discord_bridge_unprovision_failed', {
      activationId: id,
      reason: result.reason,
    });
  }
  db.deleteDiscordBridgeActivation(id);
  return { kind: 'ok', unbridged: result.ok };
};
