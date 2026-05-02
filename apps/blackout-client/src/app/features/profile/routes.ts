import { createElement, useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useParams } from 'react-router-dom';
import type { FeatureRoute } from '../../core/features/types';
import ProfilePage from './ProfilePage';
import ProfileEditor from './ProfileEditor';
import { myProfileAtom, viewedProfileAtom } from './profileAtoms';
import { fetchProfile } from './profileClient';
import type { MemberProfile } from './profileTypes';

const MyProfileRoutePage = () => {
    const profile = useAtomValue(myProfileAtom);
    return createElement(ProfilePage, { profile, viewerId: profile.userId, viewerIsFriend: true });
};

const MyProfileEditorRoutePage = () => createElement(ProfileEditor);

/**
 * Route handler for `/profile/:userId`.
 *
 * Resolves the URL param into a MemberProfile by checking, in order:
 *   1. The currently viewed profile atom (populated by member panel clicks).
 *   2. The viewer's own profile, when the URL matches the signed-in user.
 *   3. A minimal fallback profile so the page still renders for unknown users
 *      rather than showing an empty shell.
 *
 * The fallback path is what unblocks deep links from `TopFriendsGrid`, where
 * the viewer may navigate to a friend's profile that hasn't been hydrated
 * into the atom yet.
 */
const UserProfileRoutePage = () => {
    const { userId } = useParams();
    const ownProfile = useAtomValue(myProfileAtom);
    const viewedProfile = useAtomValue(viewedProfileAtom);
    const [hydrated, setHydrated] = useState<MemberProfile | null>(null);

    const decodedUserId = userId ? decodeURIComponent(userId) : undefined;

    useEffect(() => {
        if (!decodedUserId) return;
        if (ownProfile.userId === decodedUserId) return;
        if (viewedProfile?.userId === decodedUserId) return;

        let cancelled = false;
        fetchProfile(decodedUserId)
            .then((profile) => {
                if (!cancelled) setHydrated(profile);
            })
            .catch(() => {
                if (!cancelled) setHydrated(null);
            });
        return () => {
            cancelled = true;
        };
    }, [decodedUserId, ownProfile.userId, viewedProfile?.userId]);

    if (decodedUserId && ownProfile.userId === decodedUserId) {
        return createElement(ProfilePage, {
            profile: ownProfile,
            viewerId: ownProfile.userId,
            viewerIsFriend: true,
        });
    }

    if (viewedProfile && (!decodedUserId || viewedProfile.userId === decodedUserId)) {
        return createElement(ProfilePage, {
            profile: viewedProfile,
            viewerId: ownProfile.userId,
            viewerIsFriend: viewedProfile.isFriend,
        });
    }

    if (hydrated && (!decodedUserId || hydrated.userId === decodedUserId)) {
        return createElement(ProfilePage, {
            profile: hydrated,
            viewerId: ownProfile.userId,
            viewerIsFriend: hydrated.isFriend,
        });
    }

    const fallbackProfile = decodedUserId
        ? {
              ...ownProfile,
              userId: decodedUserId,
              displayName: decodedUserId,
              isFriend: false,
              profile: {
                  ...ownProfile.profile,
                  bio: undefined,
                  status: undefined,
                  topFriends: undefined,
                  pinnedMedia: undefined,
                  connections: undefined,
                  customTheme: undefined,
              },
          }
        : ownProfile;

    return createElement(ProfilePage, {
        profile: fallbackProfile,
        viewerId: ownProfile.userId,
        viewerIsFriend: false,
    });
};

export const profileRoutes: FeatureRoute[] = [
    { path: '/profile/me', component: MyProfileRoutePage },
    { path: '/profile/me/edit', component: MyProfileEditorRoutePage },
    { path: '/profile/:userId', component: UserProfileRoutePage },
];
