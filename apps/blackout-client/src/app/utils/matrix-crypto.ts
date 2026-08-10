import { CryptoApi } from 'matrix-js-sdk/lib/crypto-api';
import { StateEvent } from '../../types/matrix/room';

/**
 * The only Megolm algorithm Matrix defines for room encryption. This module has
 * no component imports, so both the create-room helpers and the feature modules
 * that provision rooms can share it — the string was previously duplicated
 * across `components/create-room/utils.ts` and the room-settings toggle, which
 * is how a third caller could quietly disagree with the other two.
 */
export const MEGOLM_ALGORITHM = 'm.megolm.v1.aes-sha2';

/**
 * The `initial_state` entry that makes a room encrypted at creation. Always set
 * encryption this way rather than with a follow-up `sendStateEvent`: a
 * post-creation call leaves a window in which the room exists in plaintext, and
 * if it fails the room stays readable while members assume otherwise.
 */
export const createRoomEncryptionState = () => ({
    type: StateEvent.RoomEncryption as string,
    state_key: '',
    content: {
        algorithm: MEGOLM_ALGORITHM,
    },
});

export const verifiedDevice = async (
    api: CryptoApi,
    userId: string,
    deviceId: string
): Promise<boolean | null> => {
    const status = await api.getDeviceVerificationStatus(userId, deviceId);

    if (!status) return null;

    const verified = status.crossSigningVerified;
    return verified;
};
