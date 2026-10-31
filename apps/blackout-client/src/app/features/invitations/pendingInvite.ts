/**
 * The invitation token the invite landing page keeps for the sign-up or
 * sign-in that follows it, in sessionStorage, so it lasts as long as the tab.
 * Account-number sign-up sends it as `inviteToken`, which an invite-only
 * server (`REQUIRE_INVITE_TOKEN=1`) requires; after sign-in
 * `usePendingInviteRedeemer` redeems it and clears the slot. Sign-up only
 * reads it, so a refused sign-up leaves it in place.
 */
export const PENDING_INVITE_STORAGE_KEY = 'blackout:pendingInviteToken';

/** The stashed token, or null when there is none or storage is unavailable. */
export const readPendingInviteToken = (): string | null => {
    try {
        return window.sessionStorage.getItem(PENDING_INVITE_STORAGE_KEY);
    } catch {
        return null;
    }
};
