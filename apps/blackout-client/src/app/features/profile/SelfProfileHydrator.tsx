import { useEffect } from 'react';
import { useStore } from 'jotai';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { mxcUrlToHttp } from '../../utils/matrix';
import { myProfileAtom } from './profileAtoms';
import type { MemberProfile } from './profileTypes';

/**
 * Boot-time self-profile hydration. Mounted only once the viewer is logged in
 * (so `mx.getUserId()` is available), this reconciles the stored self-profile
 * identity to the authenticated Matrix id and FILLS the display name + avatar
 * from the Matrix account — but only when the user hasn't already set their own.
 *
 * "Fill only when empty" keeps the Blackout profile as the source of truth once
 * edited: a saved display name/avatar is never overwritten by the Matrix account.
 * The seed (`profileAtoms.ts`) ships empty, so on a fresh install this is what
 * turns a blank profile into the logged-in user's real name + picture.
 */
export const SelfProfileHydrator = (): null => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const store = useStore();
    const userId = mx.getUserId();

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;

        // Reconcile identity eagerly so saves target the right id even if the
        // profile-info fetch below is slow or fails.
        const stored = store.get(myProfileAtom);
        if (stored.userId !== userId) {
            store.set(myProfileAtom, { ...stored, userId });
        }

        void mx
            .getProfileInfo(userId)
            .then((info) => {
                if (cancelled) return;
                const current = store.get(myProfileAtom);
                const patch: Partial<MemberProfile> = {};

                if (current.userId !== userId) {
                    patch.userId = userId;
                }
                if (!current.displayName?.trim() && info.displayname) {
                    patch.displayName = info.displayname;
                }
                if (!current.avatarUrl && info.avatar_url) {
                    const http = mxcUrlToHttp(
                        mx,
                        info.avatar_url,
                        useAuthentication,
                        160,
                        160,
                        'crop'
                    );
                    if (http) patch.avatarUrl = http;
                }

                if (Object.keys(patch).length > 0) {
                    store.set(myProfileAtom, { ...current, ...patch });
                }
            })
            .catch(() => {
                // A failed profile fetch is non-fatal: identity is already
                // reconciled above, so the user can still edit and save.
            });

        return () => {
            cancelled = true;
        };
    }, [mx, userId, useAuthentication, store]);

    return null;
};

export default SelfProfileHydrator;
