/**
 * One-shot bootstrap: ensure the standing contributor rooms exist on the
 * homeserver. Idempotent — each room is resolved by alias first and only
 * created when missing, so it's safe to re-run after a deploy.
 *
 * Requires MATRIX_HOMESERVER(_URL) + MATRIX_BOT_TOKEN (with room-create
 * powers). The bot becomes the creator/admin of any room it makes.
 *
 * Run with:  pnpm --filter @blackout/api provision:rooms
 * Override the room set with CONTRIBUTOR_ROOMS="dev,bugs,governance" (bare
 * alias localparts, comma-separated).
 */

import { matrixClient } from '../integrations/matrix-client';
import { log } from '../telemetry/logger';

interface ContributorRoom {
  localpart: string;
  name: string;
  topic: string;
}

const DEFAULT_ROOMS: ContributorRoom[] = [
  { localpart: 'welcome', name: 'Welcome', topic: 'Start here — orientation and introductions for new contributors.' },
  { localpart: 'blackout-dev', name: 'Blackout Dev', topic: 'Core client and platform development.' },
  { localpart: 'bugs', name: 'Bugs', topic: 'Bug reports from the in-app reporter land here.' },
  { localpart: 'governance', name: 'Governance', topic: 'Proposals, voting, and coalition governance.' },
  { localpart: 'design', name: 'Design', topic: 'Product design, UX, and branding discussion.' },
  { localpart: 'coalition-dev', name: 'Coalition Dev', topic: 'Coalition features and integrations.' },
];

const homeserverDomain = (): string =>
  (process.env.MATRIX_HOMESERVER_DOMAIN ?? 'blackout.local').replace(/^@+/, '');

const resolveRoomSet = (): ContributorRoom[] => {
  const override = process.env.CONTRIBUTOR_ROOMS?.trim();
  if (!override) return DEFAULT_ROOMS;
  const wanted = new Set(
    override
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const byLocalpart = new Map(DEFAULT_ROOMS.map((room) => [room.localpart, room]));
  return [...wanted].map(
    (localpart) =>
      byLocalpart.get(localpart) ?? {
        localpart,
        name: localpart,
        topic: '',
      }
  );
};

export const provisionContributorRooms = async (): Promise<number> => {
  const domain = homeserverDomain();
  const rooms = resolveRoomSet();
  let failures = 0;

  for (const room of rooms) {
    const alias = `#${room.localpart}:${domain}`;
    const existing = await matrixClient.resolveRoomAlias(alias);
    if (existing.ok && existing.roomId) {
      log.info('provision_rooms.exists', { alias, roomId: existing.roomId });
      continue;
    }
    if (!existing.ok && existing.reason === 'matrix_not_configured') {
      log.warn('provision_rooms.not_configured', { alias });
      return 1;
    }

    const created = await matrixClient.createRoom({
      aliasLocalpart: room.localpart,
      name: room.name,
      topic: room.topic,
      visibility: 'public',
      preset: 'public_chat',
    });
    if (created.ok) {
      log.info('provision_rooms.created', { alias, roomId: created.roomId });
    } else {
      failures += 1;
      log.warn('provision_rooms.create_failed', {
        alias,
        reason: 'reason' in created ? created.reason : undefined,
        status: 'status' in created ? created.status : undefined,
        detail: 'detail' in created ? created.detail : undefined,
      });
    }
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
