import { useCallback } from 'react';
import { type MatrixClient, Preset, Visibility } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { useIgnoredUsers } from '../../hooks/useIgnoredUsers';
import { addRoomIdToMDirect, getDMRoomFor } from '../../utils/matrix';
import { createRoomEncryptionState } from '../../components/create-room';

type NavigateRoom = (roomId: string) => void;

/**
 * Open (or create) a direct message with `userId` and navigate to it. Mirrors
 * the `/startdm` command (`hooks/useCommands.ts`): reuse an existing DM when one
 * exists, otherwise create an encrypted `is_direct` room and record it in
 * `m.direct`. No-op for an empty id or the current user.
 */
export const startDirectMessage = async (
    mx: MatrixClient,
    navigateRoom: NavigateRoom,
    userId: string
): Promise<void> => {
    if (!userId || userId === mx.getSafeUserId()) return;

    const existing = getDMRoomFor(mx, userId);
    if (existing) {
        navigateRoom(existing.roomId);
        return;
    }

    const result = await mx.createRoom({
        is_direct: true,
        invite: [userId],
        visibility: Visibility.Private,
        preset: Preset.TrustedPrivateChat,
        initial_state: [createRoomEncryptionState()],
    });
    await addRoomIdToMDirect(mx, result.room_id, userId);
    navigateRoom(result.room_id);
};

/**
 * Block `userId` by adding them to the `m.ignored_user_list` account data.
 * No-op for an empty id, the current user, or an already-ignored user.
 */
export const blockUser = async (
    mx: MatrixClient,
    ignored: string[],
    userId: string
): Promise<void> => {
    if (!userId || userId === mx.getSafeUserId() || ignored.includes(userId)) return;
    await mx.setIgnoredUsers([...ignored, userId]);
};

/**
 * Profile-card action handlers for `ProfileModal`. Returns `startDm`/`block`
 * bound to the live client and ignored-user list; `onDone` runs after each
 * action so the opener can close the modal. (Add-friend is intentionally absent
 * — there is no friend system to back it.)
 */
export const useProfileActions = (onDone?: () => void) => {
    const mx = useMatrixClient();
    const { navigateRoom } = useRoomNavigate();
    const ignored = useIgnoredUsers();

    const startDm = useCallback(
        async (userId: string) => {
            await startDirectMessage(mx, navigateRoom, userId);
            onDone?.();
        },
        [mx, navigateRoom, onDone]
    );

    const block = useCallback(
        async (userId: string) => {
            await blockUser(mx, ignored, userId);
            onDone?.();
        },
        [mx, ignored, onDone]
    );

    return { startDm, block };
};
