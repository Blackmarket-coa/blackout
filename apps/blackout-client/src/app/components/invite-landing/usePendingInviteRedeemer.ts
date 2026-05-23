import type React from 'react';
import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { authStateAtom, matrixClientAtom } from '../../state/auth';
import { roomToParentsAtom } from '../../state/room/roomToParents';
import { redeemInvitation } from '../../features/invitations/invitationsClient';
import { ensureBlackoutApiToken } from '../../../client/blackoutApiSession';
import { resolvePostAcceptancePath } from './postAcceptanceRoute';
import { PENDING_INVITE_STORAGE_KEY } from './InviteLandingPage';

/**
 * After a user signs up via the standard Matrix UIA flow or signs in to
 * an existing account, the landing page has already stashed the invite
 * token into sessionStorage. This effect picks it up exactly once,
 * redeems it against `POST /v1/invitations/redeem`, and clears the slot
 * so a refresh doesn't re-fire the call.
 *
 * Failures are intentionally silent at the UI level — the recipient
 * already saw the inviter on the landing page, and surfacing a global
 * banner here would interrupt the post-login flow. The redemption row
 * is still created in the backend, and the inviter can see the result
 * in the manager modal.
 */
export const usePendingInviteRedeemer = (): void => {
    const authState = useAtomValue(authStateAtom);
    const mx = useAtomValue(matrixClientAtom);
    const roomToParents = useAtomValue(roomToParentsAtom);

    useEffect(() => {
        if (authState !== 'logged_in') return;
        let token: string | null;
        try {
            token = window.sessionStorage.getItem(PENDING_INVITE_STORAGE_KEY);
        } catch {
            return;
        }
        if (!token) return;

        // Clear before firing so a network failure mid-request doesn't trap
        // the user in a retry loop on every reload. The inviter still sees
        // a fresh link to share if this attempt fails.
        try {
            window.sessionStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
        } catch {
            // Storage may be locked down; the redeem call below is still
            // worth attempting.
        }

        const presentedToken = token;
        void (async () => {
            // Wait for the Blackout API JWT so the redeem isn't sent
            // unauthenticated (it races the fire-and-forget token exchange).
            const apiToken = await ensureBlackoutApiToken();
            const data = await redeemInvitation(presentedToken, apiToken);
            if (!data.ok) return;

            // Brand-new users land here straight after sign-up: join the
            // invited room, then route through full-page onboarding (or into
            // the room if onboarding was already completed for that space).
            // This hook lives outside the router, so navigate via location.
            if (data.matrixRoomId && mx) {
                try {
                    await mx.joinRoom(data.matrixRoomId);
                } catch {
                    // already-joined / transient; the server invite stands.
                }
                const dest = resolvePostAcceptancePath(mx, roomToParents, data.matrixRoomId, {
                    canopyId: data.canopyId,
                });
                window.location.assign(dest);
            }
        })().catch(() => {
            // Swallow: see docblock. The backend logs the failure if needed.
        });
    }, [authState, mx, roomToParents]);
};

/**
 * Side-effect-only component. Mount once near the router root so a
 * freshly-logged-in user redeems their stashed token automatically.
 */
export const PendingInviteRedeemer: React.FC = () => {
    usePendingInviteRedeemer();
    return null;
};
