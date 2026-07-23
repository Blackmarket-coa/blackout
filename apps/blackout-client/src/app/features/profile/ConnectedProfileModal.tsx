import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useFriends } from '../friends/useFriends';
import { sendFriendRequest } from '../friends/friendActions';
import { followUser } from './profileClient';
import { ProfileModal } from './ProfileModal';
import { useProfileActions } from './useProfileActions';
import type { MemberProfile } from './profileTypes';

/**
 * `ProfileModal` wired to live Message / Block / Add-friend actions. Mount this
 * **only when a profile is open** (`{target ? <ConnectedProfileModal … /> : null}`)
 * — it calls `useProfileActions` (router context) and `useFriends` (account
 * data). Mounting it lazily keeps router-agnostic hosts (e.g. the bare-rendered
 * `RoomTimeline` in unit tests) free of those dependencies until a card opens.
 */
export const ConnectedProfileModal = ({
    profile,
    onClose,
}: {
    profile: MemberProfile;
    onClose: () => void;
}) => {
    const mx = useMatrixClient();
    const { startDm, block } = useProfileActions(onClose);
    const { isFriend, isOutgoing } = useFriends();

    return (
        <ProfileModal
            open
            profile={{ ...profile, isFriend: isFriend(profile.userId) }}
            onClose={onClose}
            onStartDm={startDm}
            onBlock={block}
            onAddFriend={(userId) => {
                void sendFriendRequest(mx, userId);
                // The Matrix friend request is the source of truth for
                // friendship; the follow edge feeds status/wall activity into
                // the FOLLOWING feed and is best-effort — a follow failure
                // (e.g. a Matrix-only session with no Blackout token) must
                // never block or roll back the request.
                void followUser(userId).catch(() => {});
            }}
            requestPending={isOutgoing(profile.userId)}
        />
    );
};

export default ConnectedProfileModal;
