import { type MatrixClient, Preset, Visibility } from 'matrix-js-sdk';
import { addRoomIdToMDirect, getDMRoomFor } from '../../utils/matrix';
import { createRoomEncryptionState } from '../../components/create-room';

/**
 * Open (or create) the encrypted 1:1 DM room shared with `userId` and return
 * its id. Reuses an existing DM when one exists; otherwise creates an
 * `is_direct` room with Megolm enabled at creation and records it in
 * `m.direct`.
 *
 * Lived in the friends feature until Coalitions replaced it; the quick
 * switcher, profile actions and the coalition roster all message people
 * through this one path so DM creation cannot drift (unencrypted rooms and
 * duplicate DMs were the two historical drifts).
 */
export const ensureDmRoom = async (client: MatrixClient, userId: string): Promise<string> => {
    const existing = getDMRoomFor(client, userId);
    if (existing) return existing.roomId;
    const result = await client.createRoom({
        is_direct: true,
        invite: [userId],
        visibility: Visibility.Private,
        preset: Preset.TrustedPrivateChat,
        initial_state: [createRoomEncryptionState()],
    });
    await addRoomIdToMDirect(client, result.room_id, userId);
    return result.room_id;
};
