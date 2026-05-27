/**
 * One-shot bootstrap: ensure the standing contributor rooms exist on the
 * homeserver AND are provisioned as proper "dens" — each one classified, homed
 * under a single "Contributors" canopy (a Matrix space), and open for any
 * member to invite.
 *
 * Idempotent: the canopy and each room are resolved by alias first and only
 * created when missing. The den structure (classification, space parent/child
 * link, invite power level) is (re)stamped on every run, so re-running safely
 * UPGRADES rooms that were created bare — e.g. a `#bugs` room auto-created by
 * the bug-report self-heal — into proper dens without recreating them.
 *
 * Requires MATRIX_HOMESERVER(_URL) + MATRIX_BOT_TOKEN (with Synapse admin /
 * room-create powers). The bot becomes the creator/admin of anything it makes.
 *
 * Run with:  pnpm --filter @blackout/api provision:rooms
 * Override the room set with CONTRIBUTOR_ROOMS="dev,bugs,governance" (bare
 * alias localparts, comma-separated).
 */

import { DEN_CLASSIFICATION_STATE_EVENT_TYPE, type DenType } from '@blackout/core';
import { matrixClient } from '../integrations/matrix-client';
import { log } from '../telemetry/logger';

/**
 * The slice of the Matrix bot client this script needs. Declared as an
 * interface (rather than reaching for `matrixClient` directly) so the
 * orchestration is unit-testable against a fake without a homeserver.
 */
export interface ProvisioningClient {
  botUserId(): Promise<string | undefined>;
  resolveRoomAlias(alias: string): Promise<{ ok: boolean; roomId?: string; reason?: string }>;
  createRoom(input: {
    aliasLocalpart?: string;
    name?: string;
    topic?: string;
    visibility?: 'public' | 'private';
    preset?: 'public_chat' | 'private_chat' | 'trusted_private_chat';
    creationContent?: Record<string, unknown>;
    powerLevelOverride?: Record<string, unknown>;
  }): Promise<{ ok: boolean; roomId?: string; reason?: string; status?: number }>;
  getStateEvent(
    roomId: string,
    eventType: string,
    stateKey?: string,
  ): Promise<{ ok: boolean; content?: Record<string, unknown>; status?: number; reason?: string }>;
  sendStateEvent(
    roomId: string,
    eventType: string,
    content: Record<string, unknown>,
    stateKey?: string,
  ): Promise<{ ok: boolean; status?: number; eventId?: string; reason?: string }>;
}

interface ContributorRoom {
  localpart: string;
  name: string;
  topic: string;
  denType: DenType;
}

/** The canopy (Matrix space) every standing contributor room is parented under. */
const CANOPY = {
  localpart: 'contributors',
  name: 'Contributors',
  topic: 'Standing rooms for Blackout contributors and operators.',
} as const;

const DEFAULT_ROOMS: ContributorRoom[] = [
  { localpart: 'welcome', name: 'Welcome', topic: 'Start here — orientation and introductions for new contributors.', denType: 'public' },
  { localpart: 'blackout-dev', name: 'Blackout Dev', topic: 'Core client and platform development.', denType: 'public' },
  { localpart: 'bugs', name: 'Bugs', topic: 'Bug reports from the in-app reporter land here.', denType: 'public' },
  { localpart: 'governance', name: 'Governance', topic: 'Proposals, voting, and coalition governance.', denType: 'public' },
  { localpart: 'design', name: 'Design', topic: 'Product design, UX, and branding discussion.', denType: 'public' },
  { localpart: 'coalition-dev', name: 'Coalition Dev', topic: 'Coalition features and integrations.', denType: 'public' },
];

const SPACE_PARENT_EVENT = 'm.space.parent';
const SPACE_CHILD_EVENT = 'm.space.child';
const POWER_LEVELS_EVENT = 'm.room.power_levels';

/**
 * The homeserver's real server name, taken from the bot's own MXID
 * (`@bot:server`). This avoids the `MATRIX_HOMESERVER_DOMAIN` default
 * (`blackout.local`) silently producing aliases that never resolve.
 */
const deriveDomain = async (client: ProvisioningClient): Promise<string | null> => {
  const botId = await client.botUserId();
  const domain = botId?.split(':')[1];
  if (domain) return domain;
  const envDomain = process.env.MATRIX_HOMESERVER_DOMAIN?.replace(/^@+/, '').trim();
  return envDomain || null;
};

const resolveRoomSet = (): ContributorRoom[] => {
  const override = process.env.CONTRIBUTOR_ROOMS?.trim();
  if (!override) return DEFAULT_ROOMS;
  const wanted = override.split(',').map((s) => s.trim()).filter(Boolean);
  const byLocalpart = new Map(DEFAULT_ROOMS.map((room) => [room.localpart, room]));
  return wanted.map(
    (localpart) =>
      byLocalpart.get(localpart) ?? { localpart, name: localpart, topic: '', denType: 'public' as DenType },
  );
};

/**
 * (Re)stamp the den structure on an existing room: classification, the
 * space parent↔child link with the canopy, and an open (`invite: 0`) power
 * level. Returns false if any step fails (so the caller can count it).
 */
const ensureDenStructure = async (
  client: ProvisioningClient,
  roomId: string,
  canopyId: string | null,
  denType: DenType,
  via: string[],
): Promise<boolean> => {
  let ok = true;

  const classified = await client.sendStateEvent(roomId, DEN_CLASSIFICATION_STATE_EVENT_TYPE, { denType }, '');
  if (!classified.ok) {
    ok = false;
    log.warn('provision_rooms.classify_failed', { roomId, status: classified.status });
  }

  if (canopyId) {
    const parent = await client.sendStateEvent(roomId, SPACE_PARENT_EVENT, { canonical: true, via }, canopyId);
    const child = await client.sendStateEvent(canopyId, SPACE_CHILD_EVENT, { suggested: false, via }, roomId);
    if (!parent.ok || !child.ok) {
      ok = false;
      log.warn('provision_rooms.link_failed', { roomId, canopyId, parent: parent.status, child: child.status });
    }
  }

  // Open invites to all members. We must read the existing power-levels event
  // and merge — writing a partial event would drop the creator's PL100 and
  // strand the room. If it can't be read, skip rather than clobber.
  const power = await client.getStateEvent(roomId, POWER_LEVELS_EVENT, '');
  if (power.ok && power.content) {
    if (power.content.invite !== 0) {
      const put = await client.sendStateEvent(roomId, POWER_LEVELS_EVENT, { ...power.content, invite: 0 }, '');
      if (put.ok) {
        log.info('provision_rooms.invite_opened', { roomId });
      } else {
        ok = false;
        log.warn('provision_rooms.invite_power_failed', { roomId, status: put.status });
      }
    }
  } else {
    ok = false;
    log.warn('provision_rooms.power_levels_unavailable', { roomId, status: power.status });
  }

  return ok;
};

export const provisionContributorRooms = async (
  client: ProvisioningClient = matrixClient,
): Promise<number> => {
  const domain = await deriveDomain(client);
  if (!domain) {
    log.warn('provision_rooms.not_configured', { reason: 'no_homeserver_domain' });
    return 1;
  }
  const via = [domain];
  let failures = 0;

  // 1) Ensure the Contributors canopy (a Matrix space) exists.
  const canopyAlias = `#${CANOPY.localpart}:${domain}`;
  const canopyResolved = await client.resolveRoomAlias(canopyAlias);
  if (!canopyResolved.ok && canopyResolved.reason === 'matrix_not_configured') {
    log.warn('provision_rooms.not_configured', { alias: canopyAlias });
    return 1;
  }
  let canopyId = canopyResolved.ok ? canopyResolved.roomId ?? null : null;
  if (canopyId) {
    log.info('provision_rooms.canopy_exists', { alias: canopyAlias, roomId: canopyId });
  } else {
    const created = await client.createRoom({
      aliasLocalpart: CANOPY.localpart,
      name: CANOPY.name,
      topic: CANOPY.topic,
      visibility: 'public',
      preset: 'public_chat',
      creationContent: { type: 'm.space' },
      powerLevelOverride: { events_default: 50 },
    });
    if (created.ok && created.roomId) {
      canopyId = created.roomId;
      log.info('provision_rooms.canopy_created', { alias: canopyAlias, roomId: canopyId });
    } else {
      // Non-fatal: dens are still classified + opened, just not parented.
      failures += 1;
      log.warn('provision_rooms.canopy_failed', {
        alias: canopyAlias,
        reason: created.reason,
        status: created.status,
      });
    }
  }

  // 2) Ensure each standing room exists, then (re)stamp its den structure.
  for (const room of resolveRoomSet()) {
    const alias = `#${room.localpart}:${domain}`;
    const resolved = await client.resolveRoomAlias(alias);
    let roomId = resolved.ok ? resolved.roomId ?? null : null;
    if (roomId) {
      log.info('provision_rooms.exists', { alias, roomId });
    } else {
      const created = await client.createRoom({
        aliasLocalpart: room.localpart,
        name: room.name,
        topic: room.topic,
        visibility: 'public',
        preset: 'public_chat',
      });
      if (created.ok && created.roomId) {
        roomId = created.roomId;
        log.info('provision_rooms.created', { alias, roomId });
      } else {
        failures += 1;
        log.warn('provision_rooms.create_failed', { alias, reason: created.reason, status: created.status });
        continue;
      }
    }

    const structured = await ensureDenStructure(client, roomId, canopyId, room.denType, via);
    if (!structured) failures += 1;
  }

  return failures;
};

const isMain = (() => {
  try {
    return (
      import.meta.url === `file://${process.argv[1]}` ||
      Boolean(process.argv[1]?.endsWith('provisionContributorRooms.ts'))
    );
  } catch {
    return false;
  }
})();

// Run directly (tsx). Exit non-zero if any room failed so CI/deploy surfaces it.
if (isMain) {
  provisionContributorRooms()
    .then((failures) => {
      if (failures > 0) process.exitCode = 1;
    })
    .catch((err) => {
      log.warn('provision_rooms.fatal', { error: String(err) });
      process.exitCode = 1;
    });
}
