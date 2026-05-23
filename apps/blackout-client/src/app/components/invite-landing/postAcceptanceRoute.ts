import type { MatrixClient } from 'matrix-js-sdk';
import type { RoomToParents } from '../../../types/matrix/room';
import { getOrphanParents, guessPerfectParent } from '../../utils/room';
import { buildCommunitiesPath } from '../../pages/paths';
import { HOME_TOUR_ACCOUNT_DATA_KEY } from '../../features/onboarding/homeTourState';

/** Query params on `/` that tell HomeFeed to run the tour, then open this den. */
export const INVITE_DEN_PARAM = 'invite_den';
export const INVITE_CANOPY_PARAM = 'invite_canopy';

/**
 * Whether the user has already been through (or dismissed) the Home tour —
 * read straight off `co.bmc.onboarding.home_tour.v1` account data. Returning
 * users skip the tour and go straight into the den.
 */
export const isHomeTourComplete = (mx: MatrixClient): boolean => {
    const accountDataClient = mx as unknown as {
        getAccountData: (type: string) => { getContent: () => unknown } | undefined;
    };
    const content = accountDataClient
        .getAccountData(HOME_TOUR_ACCOUNT_DATA_KEY)
        ?.getContent() as { status?: string } | undefined;
    return content?.status === 'completed' || content?.status === 'dismissed';
};

/**
 * Resolve the parent space (canopy) of a non-space room using the same
 * approach as `useRoomNavigate`: orphan parents → best guess. Returns
 * `undefined` when none can be determined (orphan room / direct message).
 */
export const resolveParentSpace = (
    mx: MatrixClient,
    roomToParents: RoomToParents,
    roomId: string,
): string | undefined => {
    const orphanParents = getOrphanParents(roomToParents, roomId);
    if (orphanParents.length === 0) return undefined;
    return guessPerfectParent(mx, roomId, orphanParents) ?? orphanParents[0];
};

/**
 * Build the in-app URL that opens an invited room. Uses the canonical
 * `/communities/:canopyId/dens/:denId` shell route (`buildCommunitiesPath`),
 * NOT the legacy `/home/:roomId` helpers — those aren't registered in the
 * AppShell and 404. A space opens its canopy overview; a den opens under its
 * parent canopy, or under the `-` no-canopy sentinel when it has none.
 */
export const buildRoomPath = (
    mx: MatrixClient,
    roomToParents: RoomToParents,
    matrixRoomId: string,
): string => {
    if (mx.getRoom(matrixRoomId)?.isSpaceRoom()) {
        return buildCommunitiesPath(matrixRoomId, null);
    }
    const parentSpace = resolveParentSpace(mx, roomToParents, matrixRoomId);
    return buildCommunitiesPath(parentSpace ?? null, matrixRoomId);
};

/**
 * Decide where to send a user right after they accept an invite and join the
 * room. Brand-new users (who haven't completed the Home tour) are sent to Home
 * (`/`) carrying the invited den + canopy as query params, so HomeFeed can run
 * the tour and then drop them into the den. Returning users — and account-only
 * invites with no room — go straight to the room (or home).
 *
 * Pure + navigation-agnostic so it works both inside the router
 * (InviteLandingPage) and outside it (the post-login PendingInviteRedeemer),
 * which navigate via `window.location.assign`.
 */
export const resolvePostAcceptancePath = (
    mx: MatrixClient,
    roomToParents: RoomToParents,
    matrixRoomId: string | undefined,
    options: { skipOnboarding?: boolean; canopyId?: string } = {},
): string => {
    if (!matrixRoomId) return '/';

    // Brand-new users go through the Home tour first, then into the den. We
    // hand the den (and the server-resolved canopy) to HomeFeed via query
    // params; it navigates onward once the tour ends.
    if (!options.skipOnboarding && !isHomeTourComplete(mx)) {
        const params = new URLSearchParams();
        params.set(INVITE_DEN_PARAM, matrixRoomId);
        if (options.canopyId) params.set(INVITE_CANOPY_PARAM, options.canopyId);
        return `/?${params.toString()}`;
    }

    return buildRoomPath(mx, roomToParents, matrixRoomId);
};
