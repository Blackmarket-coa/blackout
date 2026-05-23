import type { MatrixClient } from 'matrix-js-sdk';
import type { RoomToParents } from '../../../types/matrix/room';
import { getCanonicalAliasOrRoomId } from '../../utils/matrix';
import { getOrphanParents, guessPerfectParent } from '../../utils/room';
import {
    getDirectRoomPath,
    getHomeRoomPath,
    getOnboardingPath,
    getSpaceRoomPath,
} from '../../pages/pathUtils';
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
 * Resolve the parent space (canopy) for an invited room. If the room is itself
 * a space, that's the space; otherwise walk the space hierarchy the same way
 * `useRoomNavigate` does (orphan parents → best guess). Returns `undefined`
 * when no space can be determined (e.g. an orphan room).
 */
const resolveSpaceId = (
    mx: MatrixClient,
    roomToParents: RoomToParents,
    matrixRoomId: string,
): string | undefined => {
    if (mx.getRoom(matrixRoomId)?.isSpaceRoom()) return matrixRoomId;
    const orphanParents = getOrphanParents(roomToParents, matrixRoomId);
    if (orphanParents.length === 0) return undefined;
    return guessPerfectParent(mx, matrixRoomId, orphanParents) ?? orphanParents[0];
};

/** Build the in-app URL that opens an invited room (mirrors useRoomNavigate). */
export const buildRoomPath = (
    mx: MatrixClient,
    roomToParents: RoomToParents,
    mDirects: Set<string>,
    matrixRoomId: string,
): string => {
    const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, matrixRoomId);
    const orphanParents = getOrphanParents(roomToParents, matrixRoomId);
    if (orphanParents.length > 0) {
        const parentSpace = guessPerfectParent(mx, matrixRoomId, orphanParents) ?? orphanParents[0];
        return getSpaceRoomPath(getCanonicalAliasOrRoomId(mx, parentSpace), roomIdOrAlias);
    }
    if (mDirects.has(matrixRoomId)) return getDirectRoomPath(roomIdOrAlias);
    return getHomeRoomPath(roomIdOrAlias);
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
    mDirects: Set<string>,
    matrixRoomId: string | undefined,
    options: { skipOnboarding?: boolean } = {},
): string => {
    if (!matrixRoomId) return '/';

    if (!options.skipOnboarding) {
        const spaceId = resolveSpaceId(mx, roomToParents, matrixRoomId);
        if (spaceId && !isOnboardingComplete(mx, spaceId)) {
            return `${getOnboardingPath(spaceId)}?room=${encodeURIComponent(matrixRoomId)}`;
        }
    }

    return buildRoomPath(mx, roomToParents, mDirects, matrixRoomId);
};
