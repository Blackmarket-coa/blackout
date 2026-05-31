import { withTimeout } from '../http';
import type { DiscordBridgeMode } from '../../db/types';

/**
 * Thin client for the mautrix-discord appservice provisioning API.
 *
 * Per ADR-0003, Discord chat bridging is delegated to the mautrix-discord
 * appservice rather than a bespoke bridge. This module is the product-side
 * caller that asks the running bridge to link / unlink a Matrix room with a
 * Discord channel. The bridge is configured out-of-band (see the RUNBOOK at
 * deploy/docker/blackout-backend/integrations/mautrix-discord/) and reached via:
 *
 *   MAUTRIX_DISCORD_PROVISIONING_URL           — bridge provisioning base URL
 *   MAUTRIX_DISCORD_PROVISIONING_SHARED_SECRET  — bearer secret (from the runbook)
 *
 * The exact provisioning route differs across mautrix versions, so the path is
 * overridable via MAUTRIX_DISCORD_PROVISIONING_PATH (default below). When the
 * env is unset the client reports `not_configured` and callers degrade
 * gracefully — useful in dev / tests where no bridge is running.
 */

const DEFAULT_PROVISION_PATH = '/_matrix/provision/v1/bridge';

export type ProvisionResult =
  | { ok: true }
  | { ok: false; reason: 'not_configured' }
  | { ok: false; reason: 'provision_failed'; status: number; detail: string }
  | { ok: false; reason: 'network_error'; detail: string };

export interface ProvisionDeps {
  fetch?: typeof fetch;
}

export interface BridgeProvisioner {
  bridgeRoom(input: {
    matrixRoomId: string;
    discordGuildId: string;
    discordChannelId: string;
    mode: DiscordBridgeMode;
  }): Promise<ProvisionResult>;
  unbridgeRoom(input: { matrixRoomId: string; discordChannelId: string }): Promise<ProvisionResult>;
}

interface ProvisionConfig {
  baseUrl: string;
  secret: string;
  path: string;
}

const readConfig = (): ProvisionConfig | null => {
  const baseUrl = process.env.MAUTRIX_DISCORD_PROVISIONING_URL?.trim();
  const secret = process.env.MAUTRIX_DISCORD_PROVISIONING_SHARED_SECRET?.trim();
  if (!baseUrl || !secret) return null;
  const path = process.env.MAUTRIX_DISCORD_PROVISIONING_PATH?.trim() || DEFAULT_PROVISION_PATH;
  return { baseUrl: baseUrl.replace(/\/$/, ''), secret, path };
};

const call = async (
  config: ProvisionConfig,
  method: 'PUT' | 'DELETE',
  body: Record<string, unknown>,
  deps: ProvisionDeps,
): Promise<ProvisionResult> => {
  const fetchFn = withTimeout(deps.fetch ?? fetch);
  let res: Response;
  try {
    res = await fetchFn(`${config.baseUrl}${config.path}`, {
      method,
      headers: {
        authorization: `Bearer ${config.secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, reason: 'network_error', detail: String(err) };
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return { ok: false, reason: 'provision_failed', status: res.status, detail };
  }
  return { ok: true };
};

/** Default provisioner backed by the configured mautrix-discord bridge. */
export const mautrixProvisioner: BridgeProvisioner = {
  async bridgeRoom(input, deps: ProvisionDeps = {}) {
    const config = readConfig();
    if (!config) return { ok: false, reason: 'not_configured' };
    return call(
      config,
      'PUT',
      {
        room_id: input.matrixRoomId,
        guild_id: input.discordGuildId,
        channel_id: input.discordChannelId,
        mode: input.mode,
      },
      deps,
    );
  },
  async unbridgeRoom(input, deps: ProvisionDeps = {}) {
    const config = readConfig();
    if (!config) return { ok: false, reason: 'not_configured' };
    return call(
      config,
      'DELETE',
      { room_id: input.matrixRoomId, channel_id: input.discordChannelId },
      deps,
    );
  },
};

export const __test__ = { readConfig };
