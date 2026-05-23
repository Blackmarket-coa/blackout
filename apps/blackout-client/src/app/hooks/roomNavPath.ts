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

    let canopyId: string | null = null;
    if (openSpaceTimeline) {
        canopyId = roomId;
    } else {
        const orphanParents = getOrphanParents(roomToParents, roomId);
        if (orphanParents.length > 0) {
            canopyId =
                spaceSelectedId && orphanParents.includes(spaceSelectedId)
                    ? spaceSelectedId
                    : guessPerfectParent(mx, roomId, orphanParents) ?? orphanParents[0];
        }
    }

    return withEvent(buildCommunitiesPath(canopyId, roomId), eventId);
};
