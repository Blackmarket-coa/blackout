import type { MatrixClient } from 'matrix-js-sdk';
import type { RoomToParents } from '../../types/matrix/room';
import { buildCommunitiesPath } from '../pages/paths';
import { getOrphanParents, guessPerfectParent } from '../utils/room';

/** Append `?event=<id>` so the den timeline can jump to a specific event. */
const withEvent = (path: string, eventId?: string): string =>
    eventId ? `${path}?event=${encodeURIComponent(eventId)}` : path;

export type RoomNavArgs = {
    mx: MatrixClient;
    roomToParents: RoomToParents;
    /** Currently-selected canopy, if any (preferred parent when ambiguous). */
    spaceSelectedId: string | null;
    /** Dev-tools "view a space's own timeline" mode. */
    developerTools: boolean;
    roomId: string;
    eventId?: string;
};

/**
 * Resolve a den's parent canopy id from the space hierarchy. Returns `null`
 * for orphan dens / direct messages (no parent canopy). Prefers the currently
 * selected canopy when the den is reachable under it, otherwise picks the
 * best-guess parent. Pure — no router/jotai context required, so it can drive
 * both URL building (`roomNavPath`) and direct atom selection.
 */
export const resolveParentCanopyId = ({
    mx,
    roomToParents,
    spaceSelectedId,
    roomId,
}: {
    mx: MatrixClient;
    roomToParents: RoomToParents;
    spaceSelectedId: string | null;
    roomId: string;
}): string | null => {
    const orphanParents = getOrphanParents(roomToParents, roomId);
    if (orphanParents.length === 0) return null;
    if (spaceSelectedId && orphanParents.includes(spaceSelectedId)) return spaceSelectedId;
    return guessPerfectParent(mx, roomId, orphanParents) ?? orphanParents[0];
};

/**
 * Build the canonical `/communities/:canopyId/dens/:denId` URL for opening a
 * room (den). The parent canopy is resolved from the space hierarchy; rooms
 * with no parent (orphans, direct messages) use the `-` no-canopy sentinel.
 * Pure so it can be unit-tested without a router/jotai context. Replaces the
 * legacy `/home/:roomId` / `/:space/:roomId` URLs that 404 in the AppShell.
 */
export const roomNavPath = ({
    mx,
    roomToParents,
    spaceSelectedId,
    developerTools,
    roomId,
    eventId,
}: RoomNavArgs): string => {
    const openSpaceTimeline = developerTools && spaceSelectedId === roomId;
    const canopyId = openSpaceTimeline
        ? roomId
        : resolveParentCanopyId({ mx, roomToParents, spaceSelectedId, roomId });

    return withEvent(buildCommunitiesPath(canopyId, roomId), eventId);
};
