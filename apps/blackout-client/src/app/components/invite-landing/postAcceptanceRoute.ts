import type { MatrixClient } from 'matrix-js-sdk';
import type { RoomToParents } from '../../../types/matrix/room';
import { getOrphanParents, guessPerfectParent } from '../../utils/room';
import { getOnboardingPath } from '../../pages/pathUtils';
import { buildCommunitiesPath } from '../../pages/paths';
import { ONBOARDING_ACCOUNT_DATA_KEY } from '../../features/welcome/useWelcome';

/**
 * Read the per-space onboarding-completion flag the wizard writes
 * (`useOnboardingCompletion` in features/welcome/useWelcome.ts). Done off the
 * client directly rather than via the hook because the space id is only known
 * after the room join, and hooks can't take a runtime argument here.
 */
export const isOnboardingComplete = (mx: MatrixClient, spaceId: string): boolean => {
    // The completion key is a custom (`co.bmc.*`) account-data type not in the
    // SDK's typed union; cast as `useOnboardingCompletion` does.
    const accountDataClient = mx as unknown as {
        getAccountData: (type: string) => { getContent: () => unknown } | undefined;
    };
    const content = accountDataClient.getAccountData(ONBOARDING_ACCOUNT_DATA_KEY)?.getContent() as
        | { spaces?: Record<string, boolean> }
        | undefined;
    return content?.spaces?.[spaceId] === true;
};

/**
 * Resolve the parent space (canopy) of a non-space room using the same
 * approach as `useRoomNavigate`: orphan parents → best guess. Returns
 * `undefined` when none can be determined (orphan room / direct message).
 */
const resolveParentSpace = (
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
 * room. Brand-new users (no onboarding-completion flag for the invited room's
 * space) are sent to the full-page onboarding, carrying the room as `?room=` so
 * onboarding can drop them into it on completion. Returning users — and account
 * -only invites with no room — go straight to the room (or home).
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

    // Prefer the server-resolved canopy (from the redeem response): a
    // brand-new user's local `roomToParents` isn't synced yet, so local
    // resolution would miss the canopy and skip onboarding.
    const isSpace = mx.getRoom(matrixRoomId)?.isSpaceRoom() === true;
    const spaceId =
        options.canopyId ??
        (isSpace ? matrixRoomId : resolveParentSpace(mx, roomToParents, matrixRoomId));

    if (!options.skipOnboarding && spaceId && !isOnboardingComplete(mx, spaceId)) {
        return `${getOnboardingPath(spaceId)}?room=${encodeURIComponent(matrixRoomId)}`;
    }

    return buildRoomPath(mx, roomToParents, matrixRoomId);
};
