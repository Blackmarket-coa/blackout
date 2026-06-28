import { ProfileModal } from './ProfileModal';
import { useProfileActions } from './useProfileActions';
import type { MemberProfile } from './profileTypes';

/**
 * `ProfileModal` wired to live Message/Block actions. Mount this **only when a
 * profile is open** (`{target ? <ConnectedProfileModal … /> : null}`) — it calls
 * `useProfileActions`, which uses `useRoomNavigate` (router context). Mounting it
 * lazily keeps router-agnostic hosts (e.g. the bare-rendered `RoomTimeline` in
 * unit tests) free of that dependency until a card is actually opened.
 */
export const ConnectedProfileModal = ({
    profile,
    onClose,
}: {
    profile: MemberProfile;
    onClose: () => void;
}) => {
    const { startDm, block } = useProfileActions(onClose);
    return (
        <ProfileModal
            open
            profile={profile}
            onClose={onClose}
            onStartDm={startDm}
            onBlock={block}
        />
    );
};

export default ConnectedProfileModal;
